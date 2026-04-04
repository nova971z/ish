import { useContext } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { UIContext } from '../../store/UIContext'
import { useCart } from '../../hooks/useCart'

const dockItems = [
  {
    to: '/',
    label: 'Accueil',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    to: '/catalogue',
    label: 'Catalogue',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
      </svg>
    ),
  },
  {
    to: '#cart',
    label: 'Panier',
    isCart: true,
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
      </svg>
    ),
  },
  {
    to: '/contact',
    label: 'Contact',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    to: '/compte',
    label: 'Compte',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
  },
]

export function Dock() {
  const location = useLocation()
  const { openCart } = useContext(UIContext)
  const { totalItems } = useCart()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 lg:hidden" style={{ paddingBottom: 'var(--safe-bottom)' }}>
      <div className="glass flex items-center justify-around py-2 mx-2 mb-2" style={{ borderRadius: '16px' }}>
        {dockItems.map((item) => {
          const isActive = !item.isCart && location.pathname === item.to
          const handleClick = item.isCart
            ? (e: React.MouseEvent) => { e.preventDefault(); openCart() }
            : undefined

          const content = (
            <div className="flex flex-col items-center gap-0.5 relative">
              <div className={`transition-colors ${isActive ? 'text-[#667EEA]' : 'text-white/40'}`}>
                {item.icon}
              </div>
              <span className={`text-[10px] font-medium transition-colors ${isActive ? 'text-[#667EEA]' : 'text-white/40'}`}>
                {item.label}
              </span>
              {item.isCart && totalItems > 0 && (
                <motion.span
                  key={totalItems}
                  initial={{ scale: 0.5 }}
                  animate={{ scale: 1 }}
                  className="absolute -top-1 -right-2 bg-gradient-to-r from-[#667EEA] to-[#9F7AEA] text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center"
                >
                  {totalItems}
                </motion.span>
              )}
            </div>
          )

          if (item.isCart) {
            return (
              <button key={item.to} onClick={handleClick} className="p-2">
                {content}
              </button>
            )
          }

          return (
            <Link key={item.to} to={item.to} className="p-2">
              {content}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
