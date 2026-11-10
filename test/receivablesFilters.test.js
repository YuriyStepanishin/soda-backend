import test from 'node:test';
import assert from 'node:assert/strict';
import { receivablesFilters } from '../src/modules/receivables/receivables.filters.js';
import { createReceivablesRepository } from '../src/modules/receivables/receivables.repository.js';

test('checkbox filters accept multiple paired representatives and statuses, including no selected statuses', () => {
  const representatives = [{agent:'Агент А',route:'ПТТ-1'},{agent:'Агент Б',route:'ПТТ-2'}];
  const parsed = receivablesFilters.parse({representatives:JSON.stringify(representatives),statuses:'["overdue","penalty"]'});
  assert.deepEqual(parsed.representatives,representatives);
  assert.deepEqual(parsed.statuses,['overdue','penalty']);
  assert.deepEqual(receivablesFilters.parse({statuses:'[]'}).statuses,[]);
  for (const invalid of [{statuses:'bad'},{statuses:'["unknown"]'},{representatives:'[{"agent":"А","route":[]}]'},{representatives:'[]',tenant:'olgatorg'}]) {
    assert.equal(receivablesFilters.safeParse(invalid).success,false);
  }
});

test('paired selections and checkbox statuses retain mandatory agent scope and bound parameters', async () => {
  const calls=[];
  const client={query:async(sql,params=[])=>{calls.push({sql,params}); return {rows:sql.includes('AS count')?[{count:0}]:[]};},release(){}};
  const repository=createReceivablesRepository({query:client.query,connect:async()=>client});
  const selected=[{agent:'Інший агент',route:'ПТТ-2'}];
  await repository.read({role:'agent',representative:'Мій агент'}, {representatives:selected,statuses:['overdue','penalty'],search:'Крамниця'});
  const list=calls.find(call=>call.sql.includes('source_row AS id'));
  assert.match(list.sql,/WHERE agent = \$1 AND EXISTS/);
  assert.match(list.sql,/agent IS NOT DISTINCT FROM selected.agent AND laska_receivables.route = selected.route/);
  assert.match(list.sql,/ANY\(\$4::text\[\]\)/);
  assert.deepEqual(list.params,['Мій агент',JSON.stringify(selected),'%Крамниця%',['overdue','penalty'],0]);
  calls.length=0;
  await repository.read({role:'supervisor',departments:[]},{statuses:[]});
  const empty=calls.find(call=>call.sql.includes('source_row AS id'));
  assert.deepEqual(empty.params,[[],[],0]);
  assert.match(empty.sql,/department = ANY\(\$1::text\[\]\)/);
});
