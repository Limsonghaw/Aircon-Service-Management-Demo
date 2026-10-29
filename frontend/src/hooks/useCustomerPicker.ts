import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react'
import { watchCustomerPicker } from '../utils/customerPickerEvents'

export function useCustomerPicker(open: boolean, setOpen: Dispatch<SetStateAction<boolean>>) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open || !ref.current) return
    return watchCustomerPicker(ref.current, () => setOpen(false))
  }, [open, setOpen])
  return ref
}
