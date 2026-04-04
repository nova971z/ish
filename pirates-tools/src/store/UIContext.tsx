import { createContext, useState, useCallback, type ReactNode } from 'react'

interface Toast {
  id: string
  message: string
  type: 'success' | 'error' | 'info'
}

interface UIContextType {
  sidebarOpen: boolean
  cartOpen: boolean
  openSidebar: () => void
  closeSidebar: () => void
  openCart: () => void
  closeCart: () => void
  toasts: Toast[]
  addToast: (message: string, type?: Toast['type']) => void
  removeToast: (id: string) => void
}

export const UIContext = createContext<UIContextType>({
  sidebarOpen: false,
  cartOpen: false,
  openSidebar: () => {},
  closeSidebar: () => {},
  openCart: () => {},
  closeCart: () => {},
  toasts: [],
  addToast: () => {},
  removeToast: () => {},
})

export function UIProvider({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [cartOpen, setCartOpen] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])

  const openSidebar = useCallback(() => {
    setCartOpen(false)
    setSidebarOpen(true)
  }, [])
  const closeSidebar = useCallback(() => setSidebarOpen(false), [])

  const openCart = useCallback(() => {
    setSidebarOpen(false)
    setCartOpen(true)
  }, [])
  const closeCart = useCallback(() => setCartOpen(false), [])

  const addToast = useCallback((message: string, type: Toast['type'] = 'success') => {
    const id = Date.now().toString()
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 3000)
  }, [])

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return (
    <UIContext.Provider
      value={{
        sidebarOpen, cartOpen,
        openSidebar, closeSidebar,
        openCart, closeCart,
        toasts, addToast, removeToast,
      }}
    >
      {children}
    </UIContext.Provider>
  )
}
