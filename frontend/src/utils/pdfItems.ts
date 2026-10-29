export type PdfWord = { text: string; x: number; y: number; page: number }
export type PdfCandidate = { description: string; quantity: string; unitPrice: string; originalAmount: string; warning: string }
const amount = /^(?:RM\s*)?([\d,]+\.\d{2})$/i
const numeric = (value: string) => /^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?$/.test(value) ? Number(value.replaceAll(',', '')) : NaN

// Preserve page/line coordinates; joining the whole PDF loses column and item boundaries.
export function pdfItemCandidates(words: PdfWord[]): PdfCandidate[] {
  const lines: { page: number; y: number; words: PdfWord[] }[] = []
  for (const word of [...words].sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x)) {
    let line = lines.findLast(row => row.page === word.page && Math.abs(row.y - word.y) < 3)
    if (!line) { line = { page: word.page, y: word.y, words: [] }; lines.push(line) }
    line.words.push(word)
  }
  const result: PdfCandidate[] = []
  const ambiguous = new Set<PdfCandidate>()
  let current: PdfCandidate | undefined
  let columns: { quantity: number; price: number; total: number } | undefined
  let inBody = false
  for (const line of lines) {
    const cells = line.words.sort((a, b) => a.x - b.x)
    const text = cells.map(w => w.text).join(' ').trim()
    if (/Quantity/i.test(text) && /Unit Price/i.test(text) && /Amount/i.test(text)) {
      const q = cells.find(w => /Quantity/i.test(w.text))
      const p = cells.find(w => /Unit Price/i.test(w.text))
      const t = cells.find(w => /Amount/i.test(w.text))
      if (q && p && t) columns = { quantity: q.x - 12, price: p.x - 12, total: t.x - 12 }
      inBody = true; current = undefined; continue
    }
    if (/^(?:TOTAL|SUBTOTAL|DISCOUNT|Term\s*:|Remarks\s*:|Yours? faithfully|We hope|Service Man)/i.test(text)) { inBody = false; current = undefined; continue }
    if (/quote you the following|pleased to quote/i.test(text)) { inBody = true; continue }
    const numbered = text.match(/^\d{1,3}[.)]?\s+(.+)/)
    if (numbered && (inBody || /^\d{1,3}[.)]\s+/.test(text))) {
      current = { description: '', quantity: '', unitPrice: '', originalAmount: '', warning: '请对照原件核对项目、数量及单价。' }
      result.push(current); inBody = true
    }
    if (!inBody || !current || /^[\s_=-]+$/.test(text)) continue
    if (columns) {
      const c = columns
      const read = (from: number, to: number) => cells.filter(w => w.x >= from && w.x < to).map(w => w.text).join('').replace(/^RM/i, '').trim()
      const qty = read(c.quantity, c.price), price = read(c.price, c.total), total = read(c.total, Infinity)
      if (qty || price || total) {
        if (current.quantity || current.unitPrice || current.originalAmount) { current.warning = '项目跨行数值不明确，请人工核对。'; ambiguous.add(current) }
        else {
          current.quantity = Number.isFinite(numeric(qty)) ? String(numeric(qty)) : ''
          current.unitPrice = Number.isFinite(numeric(price)) ? String(numeric(price)) : ''
          current.originalAmount = Number.isFinite(numeric(total)) ? String(numeric(total)) : ''
        }
      }
      const description = cells.filter(w => w.x < c.quantity).map(w => w.text).join(' ')
      current.description += ' ' + (numbered ? description.replace(/^\d{1,3}[.)]?\s+/, '') : description)
    } else {
      // Legacy sample has line totals, not unit-price columns. Only explicit one unit supports a quantity suggestion.
      const money = text.match(/\bRM\s*([\d,]+\.\d{2})\s*$/i)
      if (money && amount.test('RM ' + money[1]) && Number.isFinite(numeric(money[1]))) {
        if (current.originalAmount) { current.warning = '同一项目有多个金额，请人工核对。'; ambiguous.add(current) }
        else current.originalAmount = String(numeric(money[1]))
      }
      current.description += ' ' + text.replace(/^\d{1,3}[.)]\s+/, '').replace(/\bRM\s*[\d,]+\.\d{2}\s*$/i, '')
      if (/\bone\s+unit\b/i.test(current.description)) {
        current.quantity = '1'; current.unitPrice = current.originalAmount
      }
    }
  }
  return result.map(row => ({ ...row, description: row.description.trim(),
    quantity: ambiguous.has(row) ? '' : row.quantity, unitPrice: ambiguous.has(row) ? '' : row.unitPrice,
    warning: ambiguous.has(row) ? row.warning : !row.quantity || !row.unitPrice
      ? '原件未明确数量或单价；金额仅供参考，请补填，不会自动按 1 项计算。'
      : row.originalAmount && Math.round(Number(row.quantity) * Number(row.unitPrice) * 100) !== Math.round(Number(row.originalAmount) * 100)
        ? '数量乘单价与原金额不一致，请核对。' : row.warning }))
}
