import test from 'node:test'
import assert from 'node:assert/strict'
import { fallbackRow, listUrl, readPanel, validOrigin, sameListConditions, rememberPosition, preferredPosition } from '../src/utils/listReturn.ts'
const row = (key, path='/jobs', y=900) => ({key,user:'one',path,url:path+'?q=work&page=2&pageSize=20',index:1,y,row:'job-3',rowIndex:2,top:300})
test('panel URLs keep all list conditions and support existing entry URLs', () => {
  assert.equal(listUrl('/jobs','?q=work&team=A&sort=earliest&page=2&pageSize=50&panel=photos&record=job-3'), '/jobs?q=work&team=A&sort=earliest&page=2&pageSize=50')
  assert.deepEqual(readPanel('?view=job-3'), {kind:'view',id:'job-3'})
  assert.deepEqual(readPanel('?create=1'), {kind:'create',id:''})
})
test('a current visit wins over a stale restore target on subsequent Back/Forward', () => {
  const current=row('current'), stale=row('old','/jobs',0)
  assert.equal(preferredPosition(current,stale,current.path,current.url),current)
  assert.equal(preferredPosition(current,stale,'/invoices','/invoices'),stale)
  assert.equal(preferredPosition(undefined,stale,'/jobs','/jobs',true),undefined)
  assert.equal(preferredPosition(current,stale,current.path,current.url,true),current)
})
test('updating an older entry moves it last, so rehydration keeps the latest visit for each list', () => {
  const positions=new Map()
  rememberPosition(positions,row('first'))
  rememberPosition(positions,row('second','/jobs',0))
  rememberPosition(positions,row('first','/jobs',900))
  assert.deepEqual([...positions.keys()],['second','first'])
  const latest=new Map(JSON.parse(JSON.stringify([...positions.values()])).map(p=>[p.path,p]))
  assert.equal(latest.get('/jobs').y,900)
})
test('removed records use the next ordinal, then the last row; empty results safely return none', () => {
  assert.equal(fallbackRow(['a','b','d'],2),'d')
  assert.equal(fallbackRow(['a','b'],20),'b')
  assert.equal(fallbackRow([],2),undefined)
})
test('only a page change permits range fallback; other filters and lists remain isolated', () => {
  assert.equal(sameListConditions('/jobs?q=work&page=4&pageSize=20','/jobs?pageSize=20&q=work&page=3'),true)
  for (const url of ['/jobs?q=other&page=3&pageSize=20','/jobs?q=work&page=3&pageSize=50','/invoices?q=work&page=3&pageSize=20']) assert.equal(sameListConditions('/jobs?q=work&page=4&pageSize=20',url),false)
})
test('origins are account-bound, canonical and restricted to supported lists', () => {
  assert.equal(validOrigin(row('a'),'one'),true)
  assert.equal(validOrigin(row('a'),'two'),false)
  assert.equal(validOrigin({...row('a'),url:'https://example.test/'},'one'),false)
  assert.equal(validOrigin({...row('a'),url:null},'one'),false)
  assert.equal(validOrigin(row('a','/users'),'one'),false)
})
