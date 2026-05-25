import { useEffect, useRef } from 'react'

interface ShortcutHandlers {
  onNewChat: () => void
  onFocusModelPicker: () => void
  onFocusInput: () => void
  onToggleSidebar: () => void
}

export function useKeyboardShortcuts(handlers: ShortcutHandlers) {
  const handlersRef = useRef(handlers)
  useEffect(() => {
    handlersRef.current = handlers
  })

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey
      if (!ctrl) return

      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase()
      const inInput = tag === 'input' || tag === 'textarea'

      if (e.key === 'n' && !inInput) {
        e.preventDefault()
        handlersRef.current.onNewChat()
        return
      }
      if (e.key === 'k' && !inInput) {
        e.preventDefault()
        handlersRef.current.onFocusModelPicker()
        return
      }
      if (e.key === '/') {
        e.preventDefault()
        handlersRef.current.onFocusInput()
        return
      }
      if (e.key === 'b') {
        e.preventDefault()
        handlersRef.current.onToggleSidebar()
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])
}
