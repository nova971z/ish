import { useContext } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { UIContext } from '../../store/UIContext'
import { useCart } from '../../hooks/useCart'
import { CartItemRow } from './CartItem'
import { CartSummary } from './CartSummary'

export function CartDrawer() {
  const { cartOpen, closeCart } = useContext(UIContext)
  const { items } = useCart()

  return (
    <AnimatePresence>
      {cartOpen && (
        <>
          <motion.div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeCart}
          />
          <motion.aside
            className="fixed top-0 right-0 bottom-0 w-full max-w-md z-50 glass flex flex-col"
            style={{ borderRadius: '20px 0 0 20px' }}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-white/10">
              <h2 className="text-lg font-bold">
                Panier
                {items.length > 0 && (
                  <span className="ml-2 text-sm text-white/50">({items.length})</span>
                )}
              </h2>
              <button onClick={closeCart} className="p-1 text-white/50 hover:text-white transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Items */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <AnimatePresence mode="popLayout">
                {items.length === 0 ? (
                  <motion.div
                    key="empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-center py-16"
                  >
                    <svg className="w-16 h-16 mx-auto text-white/10 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
                    </svg>
                    <p className="text-white/30 text-sm">Votre panier est vide</p>
                  </motion.div>
                ) : (
                  items.map((item) => (
                    <CartItemRow key={item.product.id} item={item} />
                  ))
                )}
              </AnimatePresence>
            </div>

            {/* Summary */}
            {items.length > 0 && (
              <div className="p-4">
                <CartSummary />
              </div>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}
