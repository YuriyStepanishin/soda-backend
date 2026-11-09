import test from 'node:test';
import assert from 'node:assert/strict';
import { parseReceivables, assignOwners, statusFor, buildScope, requireReceivablesAccess, money } from '../src/modules/receivables/receivables.domain.js';
const document = (overrides = {}) => {
  const row = ['Реализация товаров и услуг X',null,null,'Агент',null,'23.10.2026 9:00:00',null,null,14,null,'X',100,50];
  for (const [column, value] of Object.entries(overrides)) row[Number(column)] = value;
  return { row, rowNumber: 15 };
};
const rows = (last = document()) => [{row:['Управлінська організація',null,null,null,null,null,null,null,null,null,null,null,50],rowNumber:12},
  {row:['ПТТ 04 @А0016'],rowNumber:13},{row:['Тестова ТТ'],rowNumber:14},last];
test('macro thresholds, networks and negative balances', () => {
  assert.equal(statusFor(13,50,false),'current');
  assert.equal(statusFor(14,50,false),'overdue');
  assert.equal(statusFor(20,50,false),'overdue');
  assert.equal(statusFor(21,50,false),'penalty');
  assert.equal(statusFor(99,50,true),'current');
  assert.equal(statusFor(99,-50,true),'prepayment');
  assert.equal(statusFor(99,0,false),'current');
  assert.equal(money('1 234,56'),123456);
});
test('1C hierarchy, returns, zero-day blank, missing amount and controls', async () => {
  const {documents,controlBalanceCents} = await parseReceivables(rows(document({0:'Возврат товаров от клиента X',8:null,11:null,12:-50})));
  assert.equal(controlBalanceCents,5000);
  assert.deepEqual(documents.map(({route,store,days,type,amountCents,balanceCents}) => ({route,store,days,type,amountCents,balanceCents})),
    [{route:'ПТТ 04 @А0016',store:'Тестова ТТ',days:0,type:'return',amountCents:null,balanceCents:-5000}]);
});
test('invalid or empty exports fail before replacement', async () => {
  await assert.rejects(parseReceivables([]),/не містить/);
  await assert.rejects(parseReceivables(rows(document({12:'bad'}))),/сума/);
  await assert.rejects(parseReceivables(rows(document({5:'31.02.2026'}))),/дата/);
});
test('owners require dictionary match and route majority; duplicate route numbers never fan out', () => {
  const docs = [{route:'ПТТ 04 @А0016',sourceAgent:'Агент'}, {route:'ПТТ 04 @А0016',sourceAgent:'Агент'}, {route:'ПТТ 04 @А0016',sourceAgent:'Каса'}];
  const agents = [{ta:'Агент',department:'Область',route:'ПТТ-4'},{ta:'Інший',department:'Філія',route:'ПТТ-4'}];
  assert.ok(assignOwners(docs,agents).every(row => row.agent==='Агент' && row.department==='Область'));
  assert.equal(assignOwners([{route:'ПТТ 04',sourceAgent:'Невідомий'}],agents)[0].agent,null);
});
test('agents and supervisors cannot broaden database scope', () => {
  assert.deepEqual(buildScope({role:'agent',representative:'Агент'}),{sql:'agent = $1',params:['Агент']});
  assert.deepEqual(buildScope({role:'supervisor',departments:[]}),{sql:'department = ANY($1::text[])',params:[[]]});
  for(const user of [{role:'agent',tenant:'olgatorg'},{role:'brand_manager',tenant:'laska'}]) {
    let code; let nextCalled=false;
    requireReceivablesAccess({user,headers:{'x-tenant-id':'laska'}},{status(value){code=value;return this;},json(){}},()=>{nextCalled=true;});
    assert.equal(code,403);assert.equal(nextCalled,false);
  }
});
