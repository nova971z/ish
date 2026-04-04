import { useContext } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { UIContext } from '../../store/UIContext'

const links = [
  { to: '/', label: 'Accueil' },
  { to: '/catalogue', label: 'Catalogue' },
  { to: '/contact', label: 'Contact' },
  { to: '/compte', label: 'Mon Compte' },
]

export function Sidebar() {
  const { sidebarOpen, closeSidebar } = useContext(UIContext)
  const location = useLocation()

  return (
    <AnimatePresence>
      {sidebarOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeSidebar}
          />
          {/* Panel */}
          <motion.aside
            className="fixed top-0 left-0 bottom-0 w-72 z-50 glass flex flex-col"
            style={{ borderRadius: '0 20px 20px 0' }}
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-white/10">
              <span className="text-lg font-bold gradient-text">Pirates Tools</span>
              <button onClick={closeSidebar} className="p-1 text-white/50 hover:text-white transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {/* Links */}
            <nav className="flex-1 p-4 flex flex-col gap-1">
              {links.map((link) => {
                const isActive = location.pathname === link.to
                return (
                  <Link
                    key={link.to}
                    to={link.to}
                    onClick={closeSidebar}
                    className={`px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                      isActive
                        ? 'bg-white/10 text-white'
                        : 'text-white/60 hover:bg-white/5 hover:text-white/90'
                    }`}
                  >
                    {link.label}
                  </Link>
                )
              })}
            </nav>
            {/* Footer */}
            <div className="p-5 border-t border-white/10 space-y-3">
              <a
                href="https://wa.me/33774230195"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 text-sm text-green-400 hover:text-green-300 transition-colors"
              >
                <span>WhatsApp</span>
                <span className="text-white/40">07 74 23 01 95</span>
              </a>
              <a
                href="tel:0774230195"
                className="flex items-center gap-3 text-sm text-white/60 hover:text-white transition-colors"
              >
                Appeler
              </a>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}
