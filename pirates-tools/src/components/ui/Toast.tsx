import { useContext } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { UIContext } from '../../store/UIContext'

export function ToastContainer() {
  const { toasts, removeToast } = useContext(UIContext)

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: -40, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -40, scale: 0.95 }}
            className="pointer-events-auto glass px-4 py-3 flex items-center gap-3 min-w-[250px]"
            onClick={() => removeToast(toast.id)}
            style={{ cursor: 'pointer' }}
          >
            <span className="text-lg">
              {toast.type === 'success' && '\u2705'}
              {toast.type === 'error' && '\u274C'}
              {toast.type === 'info' && '\u2139\uFE0F'}
            </span>
            <span className="text-sm text-white/90">{toast.message}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
