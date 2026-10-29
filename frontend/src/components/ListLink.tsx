import { Link, useNavigate, type LinkProps } from 'react-router-dom'
import type { Position } from '../utils/listReturn'

// Capture at activation, including keyboard activation, rather than at render time.
export function ListLink({ capture, row, ...props }: LinkProps & { capture: (id?: string) => Position; row: string }) {
  const navigate = useNavigate()
  return <Link {...props} onClick={event => {
    if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    navigate(props.to, { state: { listOrigin: capture(row) } })
  }} />
}
