import test from 'node:test'
import assert from 'node:assert/strict'
import { pdfItemCandidates } from '../src/utils/pdfItems.ts'
const words = lines => lines.flatMap((line, index) => line.map(([text, x]) => ({ text, x, y: 800 - index * 20, page: 1 })))
test('legacy multiline quote: preserve descriptions, leave unstated quantity and price empty', () => {
  const rows = pdfItemCandidates(words([
    [['We are pleased to quote you the following:', 20]],
    [['1. To supply one unit 5.0hp air-cond', 20]],
    [['Model: Example', 30], ['RM 8,850.00', 400]],
    [['2. Pipe insulation and service', 20], ['RM 1,100.00', 400]],
    [['with wiring work', 30]], [['TOTAL: RM 9,950.00', 300]], [['Term: 14 days', 20]],
  ]))
  assert.equal(rows.length, 2)
  assert.equal(rows[0].quantity, '1'); assert.equal(rows[0].unitPrice, '8850')
  assert.match(rows[0].description, /Model: Example/)
  assert.equal(rows[1].quantity, ''); assert.equal(rows[1].unitPrice, '')
  assert.equal(rows[1].originalAmount, '1100'); assert.match(rows[1].description, /with wiring/)
  assert.doesNotMatch(rows[1].description, /TOTAL|Term/)
})
test('existing system invoice columns keep quantity, price, total and multiline text separate', () => {
  const rows = pdfItemCandidates(words([
    [['No.', 20], ['Description', 50], ['Quantity', 300], ['Unit Price RM', 380], ['Amount RM', 470]],
    [['1', 20], ['Cleaning', 50], ['4', 320], ['120.00', 400], ['480.00', 490]],
    [['including filters', 50]],
    [['2', 20], ['Replacement', 50], ['1', 320], ['80.00', 400], ['80.00', 490]],
    [['TOTAL RM 560.00', 450]],
  ]))
  assert.equal(rows.length, 2); assert.equal(rows[0].description, 'Cleaning including filters')
  assert.equal(rows[0].quantity, '4'); assert.equal(rows[0].unitPrice, '120')
  assert.equal(rows[1].unitPrice, '80')
})
test('scans, conflicting amounts and malformed numbers never invent values', () => {
  assert.deepEqual(pdfItemCandidates([]), [])
  const rows = pdfItemCandidates(words([[['1. Supply one unit', 20], ['RM 100.00', 400]], [['RM 200.00', 400]]]))
  assert.equal(rows[0].quantity, ''); assert.equal(rows[0].unitPrice, '')
  assert.match(rows[0].warning, /多个金额/)
  const malformed = pdfItemCandidates(words([[['1. Supply one unit', 20], ['RM 1,00.00', 400]]]))
  assert.equal(malformed[0].unitPrice, '')
})
