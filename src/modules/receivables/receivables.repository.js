import { readFileSync } from 'node:fs';
import { buildScope } from './receivables.domain.js';
const schema = readFileSync(new URL('./receivables.schema.sql', import.meta.url), 'utf8');
export function createReceivablesRepository(pool) {
  let ready;
  const ensure = async () => {
    ready ||= pool.query(schema).catch(error => { ready = null; throw error; });
    await ready;
  };
  return {
    ensure,
    async folderId() { await ensure(); return (await pool.query('SELECT drive_root_id FROM laska_receivables_config WHERE id=1')).rows[0]?.drive_root_id; },
    async syncRecord() { await ensure(); return (await pool.query('SELECT * FROM laska_receivables_sync WHERE id=1')).rows[0] || null; },
    async replace(documents, networks, file, networksModifiedTime, controlBalanceCents = null) {
      await ensure();
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query("SELECT pg_advisory_xact_lock(74208119)");
        const current = (await client.query('SELECT modified_time FROM laska_receivables_sync WHERE id=1 FOR UPDATE')).rows[0];
        if (current && new Date(current.modified_time) > new Date(file.modifiedTime)) throw new Error('Новіші дані вже імпортовані');
        // DELETE + INSERT under one transaction: readers see either complete snapshot.
        await client.query('DELETE FROM laska_receivables');
        for (let start = 0; start < documents.length; start += 500) {
          const rows = documents.slice(start, start + 500).map(row => ({ ...row, network: networks.has(row.store.toLocaleLowerCase('uk-UA')) }));
          await client.query(`INSERT INTO laska_receivables
            SELECT x."sourceRow", x.route, x.store, x.agent, x.department, x."sourceAgent", x."documentDate"::date,
              x.number, x.type, x.days, x."sourceOverdue", x."amountCents" / 100.0, x."balanceCents" / 100.0, x.network
            FROM jsonb_to_recordset($1::jsonb) AS x("sourceRow" int,route text,store text,agent text,department text,
              "sourceAgent" text,"documentDate" text,number text,type text,days int,"sourceOverdue" numeric,
              "amountCents" numeric,"balanceCents" numeric,network boolean)`, [JSON.stringify(rows)]);
        }
        // Source days are authoritative, report date is inferred from date + shipped days.
        const dates = documents.map(row => new Date(new Date(row.documentDate).getTime() + row.days * 86400000).toISOString().slice(0, 10)).sort();
        const reportDate = dates[Math.floor(dates.length / 2)];
        const unmatched = new Set(documents.filter(row => !row.agent).map(row => row.route)).size;
        const difference = controlBalanceCents === null ? null : documents.reduce((sum, row) => sum + row.balanceCents, 0) - controlBalanceCents;
        await client.query(`INSERT INTO laska_receivables_sync(id,file_id,file_name,modified_time,version,report_date,row_count,networks_modified_time,unmatched_routes,control_balance,control_difference)
          VALUES(1,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(id) DO UPDATE SET file_id=$1,file_name=$2,modified_time=$3,version=$4,
          report_date=$5,row_count=$6,networks_modified_time=$7,unmatched_routes=$8,control_balance=$9,control_difference=$10,imported_at=now()`,
        [file.id, file.name, file.modifiedTime, String(file.version), reportDate, documents.length, networksModifiedTime, unmatched,
          controlBalanceCents === null ? null : controlBalanceCents / 100, difference === null ? null : difference / 100]);
        await client.query('COMMIT');
        return { inserted: documents.length, unmatchedRoutes: unmatched, reportDate, controlDifference: difference === null ? null : difference / 100 };
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    },
    async read(user, query) {
      await ensure();
      const scope = buildScope(user);
      const params = [...scope.params];
      const conditions = [scope.sql];
      const add = (sql, value) => { params.push(value); conditions.push(sql.replace('?', `$${params.length}`)); };
      if (query.agent) add('agent = ?', query.agent);
      if (query.route) add('route = ?', query.route);
      if (query.search) add("(store_name ILIKE ? OR document_number ILIKE ?)", `%${query.search}%`);
      // search uses the same bound value twice.
      const where = conditions.join(' AND ').replace(/\?/g, `$${params.length}`);
      const status = `CASE WHEN balance<0 THEN 'prepayment' WHEN balance>0 AND NOT is_network AND shipped_days>=21 THEN 'penalty'
        WHEN balance>0 AND NOT is_network AND shipped_days>=14 THEN 'overdue' ELSE 'current' END`;
      const client = await pool.connect();
      try {
        await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
        const metadata = (await client.query('SELECT file_name,modified_time,report_date::text,imported_at,row_count,unmatched_routes,control_balance::float8,control_difference::float8 FROM laska_receivables_sync WHERE id=1')).rows[0] || null;
        const options = (await client.query(`SELECT DISTINCT agent,route FROM laska_receivables WHERE ${scope.sql} ORDER BY agent,route`, scope.params)).rows;
        const totals = (await client.query(`SELECT COALESCE(SUM(balance),0)::float8 AS balance,
          COALESCE(SUM(balance) FILTER(WHERE balance>0),0)::float8 AS debt,
          COALESCE(SUM(balance) FILTER(WHERE balance<0),0)::float8 AS prepayment,
          COALESCE(SUM(balance) FILTER(WHERE balance>0 AND NOT is_network AND shipped_days>=14),0)::float8 AS overdue,
          COALESCE(SUM(balance) FILTER(WHERE balance>0 AND NOT is_network AND shipped_days>=21),0)::float8 AS penalty,
          ROUND(COALESCE(SUM(balance) FILTER(WHERE balance>0 AND NOT is_network AND shipped_days>=21),0) * 0.01, 2)::float8 AS "penaltyAmount",
          COUNT(DISTINCT (route,store_name))::int AS stores FROM laska_receivables WHERE ${where}`, params)).rows[0];
        const statusCondition = query.status ? ` AND (${status}) = $${params.length + 1}` : '';
        const filteredParams = query.status ? [...params, query.status] : params;
        const total = (await client.query(`SELECT COUNT(*)::int AS count FROM laska_receivables WHERE ${where}${statusCondition}`, filteredParams)).rows[0].count;
        const page = Number(query.page || 1), limit = 100;
        const rows = (await client.query(`SELECT source_row AS id,route,store_name AS store,agent,department,document_date::text AS date,
          document_number AS number,document_type AS type,shipped_days AS days,document_amount::float8 AS amount,balance::float8,
          is_network AS network,${status} AS status FROM laska_receivables WHERE ${where}${statusCondition}
          ORDER BY route,store_name,document_date,source_row LIMIT ${limit} OFFSET $${filteredParams.length + 1}`,
        [...filteredParams, (page - 1) * limit])).rows;
        await client.query('COMMIT');
        if (metadata && !['admin', 'manager'].includes(user.role)) {
          delete metadata.unmatched_routes; delete metadata.control_balance; delete metadata.control_difference; delete metadata.row_count;
        }
        return { metadata, options, totals, rows, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    },
  };
}
