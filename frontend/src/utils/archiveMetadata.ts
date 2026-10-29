// Conservative suggestions only: explicit labels and unambiguous ISO/year-first dates.
// PDF text is untrusted content, never instructions or proof of payment.
export function archiveMetadata(text: string, kind: 'quote' | 'invoice') {
  const numberLabel = kind === 'quote' ? '(?:quotation|quote|报价)(?:\\s*(?:no\\.?|number|编号))' : '(?:invoice|发票)(?:\\s*(?:no\\.?|number|编号))'
  const numbers = [...text.matchAll(new RegExp(numberLabel + '\\s*[:：#]?\\s*([A-Z0-9][A-Z0-9_/-]{0,49})(?=\\s|$)', 'gi'))].map(x => x[1])
  const dateTokens = [...text.matchAll(/(?:invoice date|quotation date|quote date|issue date|单据日期|开票日期|报价日期|发票日期|^date)\s*[:：]?\s*(\d{4}[-/]\d{1,2}[-/]\d{1,2})(?=\s|$)/gim)].map(x => x[1])
  const dates = dateTokens.flatMap(token => {
    const [year, month, day] = token.split(/[-/]/).map(Number)
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const date = new Date(`${iso}T00:00:00Z`)
    return year >= 1000 && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === iso ? [iso] : []
  })
  const uniqueNumbers = [...new Set(numbers)]
  const uniqueDates = [...new Set(dates)]
  return { number: uniqueNumbers.length === 1 ? uniqueNumbers[0] : '', date: uniqueDates.length === 1 ? uniqueDates[0] : '' }
}
