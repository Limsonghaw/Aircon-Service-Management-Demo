import test from 'node:test'
import assert from 'node:assert/strict'
import { stableListSort, dateSort, serverOrder } from '../src/utils/listSort.ts'
test('equal values use ID order even when API order changes', () => {
 const rows=[{id:'safe-12',amount:10},{id:'safe-2',amount:10},{id:'safe-1',amount:20}]
 const compare=(a,b)=>b.amount-a.amount
 assert.deepEqual(stableListSort(rows,compare).map(x=>x.id),['safe-1','safe-2','safe-12'])
 assert.deepEqual(stableListSort([...rows].reverse(),compare),stableListSort(rows,compare))
})
test('default API order is preserved when no comparator exists', () => {
 const rows=[{id:'b'},{id:'a'}]
 assert.deepEqual(stableListSort(rows),rows)
 assert.notEqual(stableListSort(rows),rows)
})
test('sorting does not mutate cached resource and puts missing dates first',()=>{
 const rows=[{id:'a',date:'2027-01-01'},{id:'b',date:'2026-12-31'},{id:'c',date:''}]
 assert.deepEqual(stableListSort(rows,(a,b)=>dateSort(a.date,b.date)).map(x=>x.id),['c','b','a'])
 assert.equal(rows[0].id,'a')
})

test('default customer ordering keeps API collation while equal names use stable IDs',()=>{
 const rows=[{id:'z',name:'Z'},{id:'b',name:'a'},{id:'a',name:'a'}]
 assert.deepEqual(stableListSort(rows,serverOrder(rows,x=>x.name)).map(x=>x.id),['z','a','b'])
})
