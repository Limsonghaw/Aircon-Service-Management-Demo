import test from 'node:test'
import assert from 'node:assert/strict'
import { archiveMetadata } from '../src/utils/archiveMetadata.ts'
test('explicit metadata is suggested, never payment state or amounts', () => {
  assert.deepEqual(archiveMetadata('Invoice No: INV-2024-018\nInvoice Date: 2024/8/12\nPAID 100.00', 'invoice'), { number: 'INV-2024-018', date: '2024-08-12' })
})
test('ambiguous dates, impossible dates, missing text and competing numbers are not guessed', () => {
  for (const text of ['', 'Date: 03/04/2024', 'Invoice Date: 2024-02-30', 'Due Date: 2024-08-12', 'Invoice No: A-1\nInvoice No: B-2'])
    assert.deepEqual(archiveMetadata(text, 'invoice'), { number: '', date: '' })
})
test('kind and Chinese labels are respected', () => {
  assert.deepEqual(archiveMetadata('报价编号：QT-024\n报价日期：2024-08-12', 'quote'), { number: 'QT-024', date: '2024-08-12' })
  assert.equal(archiveMetadata('Quotation No: QT-1', 'invoice').number, '')
})
