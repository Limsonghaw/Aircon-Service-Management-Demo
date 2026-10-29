// Mobile browsers can blur the input with relatedTarget=null before an option click.
// Dismiss only on a positively identified outside interaction, never on blur alone.
export function watchCustomerPicker(root: HTMLElement, dismiss: () => void) {
  const document = root.ownerDocument
  const outside = (event: Event) => {
    if (event.target && !root.contains(event.target as Node)) dismiss()
  }
  const escape = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    root.querySelector<HTMLInputElement>('[role="combobox"]')?.focus({ preventScroll: true })
    dismiss()
  }
  document.addEventListener('pointerdown', outside, { capture: true })
  document.addEventListener('focusin', outside, { capture: true })
  root.addEventListener('keydown', escape)
  return () => {
    document.removeEventListener('pointerdown', outside, { capture: true })
    document.removeEventListener('focusin', outside, { capture: true })
    root.removeEventListener('keydown', escape)
  }
}
