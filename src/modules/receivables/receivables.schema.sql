CREATE TABLE IF NOT EXISTS laska_receivables (
  source_row integer PRIMARY KEY, route text NOT NULL, store_name text NOT NULL,
  agent text, department text, source_agent text NOT NULL,
  document_date date NOT NULL, document_number text NOT NULL, document_type text NOT NULL,
  shipped_days integer NOT NULL, source_overdue numeric,
  document_amount numeric(18,2), balance numeric(18,2) NOT NULL,
  is_network boolean NOT NULL
);
CREATE TABLE IF NOT EXISTS laska_receivables_config (
  id integer PRIMARY KEY CHECK(id=1), drive_root_id text NOT NULL
);
CREATE INDEX IF NOT EXISTS laska_receivables_agent_idx ON laska_receivables(agent);
CREATE INDEX IF NOT EXISTS laska_receivables_department_idx ON laska_receivables(department);
CREATE TABLE IF NOT EXISTS laska_receivables_sync (
  id integer PRIMARY KEY CHECK(id=1), file_id text NOT NULL, file_name text NOT NULL,
  modified_time timestamptz NOT NULL, version text NOT NULL, report_date date NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now(), row_count integer NOT NULL,
  networks_modified_time timestamptz NOT NULL, unmatched_routes integer NOT NULL DEFAULT 0,
  control_balance numeric(18,2), control_difference numeric(18,2)
);
