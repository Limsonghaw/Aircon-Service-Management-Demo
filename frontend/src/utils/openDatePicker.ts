export function openDatePicker(event: { currentTarget: HTMLInputElement }) {
  const input = event.currentTarget

  if (input.disabled || input.readOnly) return

  try {
    input.showPicker()
  } catch {
    // Browsers without programmatic picker support keep their native date-input behavior.
  }
}
