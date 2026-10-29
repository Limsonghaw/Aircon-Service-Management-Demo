import { quoteStatusLabels, type QuoteStatus } from '../services/quotesApi'
import { StatusDropdown } from './StatusDropdown'

export function QuoteStatusDropdown(props: {
  value: QuoteStatus; label: string; disabled: boolean; onChange: (status: QuoteStatus) => void; busy?: boolean
}) {
  return <StatusDropdown {...props} options={quoteStatusLabels} />
}
