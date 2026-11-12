import { useCallback, useEffect, useState } from 'react'

// Off-canvas sidebar state shared by the student, coordinator and admin portals.
//  • closed by default on every screen size (phone, tablet, desktop)
//  • Escape closes it, and the page behind does not scroll while it is open
export function useDrawer() {
  const [open, setOpen] = useState(false)

  const close = useCallback(() => setOpen(false), [])
  const toggle = useCallback(() => setOpen((value) => !value), [])

  useEffect(() => {
    if (!open) return undefined

    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }

    const previousOverflow = document.body.style.overflow

    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return { open, close, toggle }
}
