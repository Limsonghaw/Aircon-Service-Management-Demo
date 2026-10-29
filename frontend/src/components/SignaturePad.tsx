import { translate as t, useLanguage } from '../i18n'
import { useRef, type PointerEvent } from 'react'
import type { SignaturePoint } from '../services/documentsApi'

type Props = { strokes: SignaturePoint[][]; onChange: (strokes: SignaturePoint[][]) => void; disabled?: boolean }
export function SignaturePad({ strokes, onChange, disabled }: Props) {
  useLanguage()
  const drawing = useRef<SignaturePoint[] | null>(null)
  const pointer = useRef<number | null>(null)
  function point(event: PointerEvent<SVGSVGElement>): SignaturePoint {
    const bounds = event.currentTarget.getBoundingClientRect()
    return { x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)), y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)) }
  }
  function finish(event: PointerEvent<SVGSVGElement>) {
    if (pointer.current !== event.pointerId) return
    const stroke = drawing.current
    drawing.current = null
    pointer.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    if (stroke && stroke.length < 2) onChange(strokes.slice(0, -1))
  }
  return <div className="signature-pad-container">
    <p id="signature-pad-help">{t("用手指或鼠标在框内签名，也可载入常用签名。每份单据仍需确认后才会生成签名 PDF。")}</p>
    <svg className="signature-pad" viewBox="0 0 600 200" role="img" aria-label={t("老板手写签名画板")} aria-describedby="signature-pad-help"
      onPointerDown={(e) => {
        if (disabled || pointer.current !== null || strokes.length >= 100 || e.button !== 0) return
        e.preventDefault()
        pointer.current = e.pointerId
        drawing.current = [point(e)]
        e.currentTarget.setPointerCapture(e.pointerId)
        onChange([...strokes, drawing.current])
      }}
      onPointerMove={(e) => {
        if (disabled || pointer.current !== e.pointerId || !drawing.current || drawing.current.length >= 2000) return
        if (strokes.reduce((n, s) => n + s.length, 0) >= 10000) return
        const next = point(e)
        const last = drawing.current[drawing.current.length - 1]
        if (Math.hypot(next.x - last.x, next.y - last.y) < 0.0015) return
        drawing.current = [...drawing.current, next]
        onChange([...strokes.slice(0, -1), drawing.current])
      }} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={() => { drawing.current = null; pointer.current = null }}>
      {strokes.map((stroke, index) => <polyline key={index} points={stroke.map(p => `${p.x * 600},${p.y * 200}`).join(' ')} fill="none" stroke="#142c38" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />)}
    </svg>
    <button type="button" className="secondary-button" disabled={disabled} onClick={() => onChange([])}>{t("清除 / 重签")}</button>
  </div>
}
