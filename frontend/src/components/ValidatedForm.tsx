import { translate as t, useLanguage } from '../i18n'
import { useEffect, useLayoutEffect, useId, useRef, useState, type FormEvent, type ComponentProps } from 'react'
import { createPortal } from 'react-dom'

type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
export function ValidatedForm({ onSubmit, children, ...props }: Omit<ComponentProps<'form'>, 'onSubmit'> & { onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void> }) {
  useLanguage()
  const form = useRef<HTMLFormElement>(null)
  const id = useId()
  const shouldFocus = useRef(false)
  const [errors, setErrors] = useState<{ field: Field; message: string; id: string }[]>([])
  const busy = props['aria-busy'] === true
  useLayoutEffect(() => {
    if (!busy && errors.length && shouldFocus.current) {
      errors[0].field.focus(); errors[0].field.scrollIntoView({ block: 'center', behavior: 'smooth' })
      shouldFocus.current = false
    }
  }, [errors, busy])
  useEffect(() => {
    const element = form.current!
    const show = (event: Event) => {
      const fields = (event as CustomEvent<Record<string, string[]>>).detail
      const controls = Array.from(element.querySelectorAll<Field>('input,select,textarea'))
      const normalize = (value: string) => value.replaceAll('[', '').replaceAll(']', '').replaceAll('.', '').toLowerCase()
      const next = Object.entries(fields).flatMap(([name, messages]) => {
        const field = controls.find(control => normalize(control.name) === normalize(name))
        if (!field) return []
        const errorId = `${id}-${name}`
        field.setAttribute('aria-invalid', 'true'); field.setAttribute('aria-errormessage', errorId)
        return [{ field, id: errorId, message: messages.join(' ') }]
      }).sort((a, b) => controls.indexOf(a.field) - controls.indexOf(b.field))
      shouldFocus.current = true; setErrors(next)
    }
    element.addEventListener('api-validation', show)
    return () => element.removeEventListener('api-validation', show)
  }, [id])
  function validate() {
    const fields = Array.from(form.current!.querySelectorAll<Field>('input, select, textarea')).filter(field => !field.matches(':disabled'))
    const invalid = fields.filter(field => !field.validity.valid || (field.required && !field.value.trim()) || field.dataset.selectionValid === 'false')
    fields.forEach(field => { field.removeAttribute('aria-invalid'); field.removeAttribute('aria-errormessage') })
    const next = invalid.map((field, index) => {
      const errorId = `${id}-${index}`
      field.setAttribute('aria-invalid', 'true'); field.setAttribute('aria-errormessage', errorId)
      return { field, id: errorId, message: field.dataset.selectionValid === 'false' ? '请从搜索结果中选择客户。' : field.validity.valueMissing || !field.value.trim() ? '请填写此项。' : field.validity.typeMismatch ? '请输入有效的格式。' : field.validity.rangeUnderflow || field.validity.rangeOverflow ? `请输入 ${field.getAttribute('min') || '允许的最小值'} 至 ${field.getAttribute('max') || '允许的最大值'} 范围内的数字。` : '请检查此项的格式或数值。' }
    })
    shouldFocus.current = true; setErrors(next)
    return !next.length
  }
  return <form {...props} ref={form} noValidate onSubmit={event => { event.preventDefault(); if (validate()) void onSubmit(event) }} onInputCapture={event => {
    const field = event.target as Field
    field.removeAttribute('aria-invalid'); field.removeAttribute('aria-errormessage')
    setErrors(current => current.filter(error => error.field !== field))
  }}>
    <fieldset className="interaction-form-fields" disabled={busy}>{children}</fieldset>
    {errors.map(error => <FieldError key={error.id} {...error} />)}
  </form>
}

// Portal puts each message immediately after its input, including dynamic line items.
function FieldError({ field, message, id }: { field: Field; message: string; id: string }) {
  useLanguage()
  return field.parentElement ? createPortal(<small id={id} className="field-error" role="alert">{t(message)}</small>, field.parentElement) : null
}
