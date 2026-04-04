import { motion } from 'framer-motion'
import type { CartItem as CartItemType } from '../../store/CartContext'
import { brandMap } from '../../config/brands'
import { formatPrice } from '../../utils/formatPrice'
import { useCart } from '../../hooks/useCart'

interface CartItemProps {
  item: CartItemType
}

export function CartItemRow({ item }: CartItemProps) {
  const { updateQuantity, removeItem } = useCart()
  const brand = brandMap[item.product.brand]

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="flex gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/5"
    >
      {/* Thumbnail */}
      <div
        className="w-16 h-16 rounded-lg flex-shrink-0 flex items-center justify-center overflow-hidden"
        style={{
          background: `linear-gradient(135deg, ${brand?.color || '#667EEA'}20, transparent)`,
        }}
      >
        <img
          src={item.product.image}
          alt={item.product.name}
          className="w-full h-full object-cover"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
        />
      </div>
      {/* Details */}
      <div className="flex-1 min-w-0">
        <h4 className="text-xs font-semibold text-white/90 truncate">{item.product.name}</h4>
        {brand && (
          <span className="text-[10px] font-bold" style={{ color: brand.color }}>{brand.name}</span>
        )}
        <div className="flex items-center gap-2 mt-1.5">
          <button
            onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
            className="w-6 h-6 rounded-md bg-white/5 text-white/60 hover:bg-white/10 flex items-center justify-center text-sm"
          >
            -
          </button>
          <span className="text-xs font-medium w-5 text-center">{item.quantity}</span>
          <button
            onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
            className="w-6 h-6 rounded-md bg-white/5 text-white/60 hover:bg-white/10 flex items-center justify-center text-sm"
          >
            +
          </button>
          <button
            onClick={() => removeItem(item.product.id)}
            className="ml-auto text-white/30 hover:text-red-400 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
      {/* Price */}
      <div className="text-right flex-shrink-0">
        <span className="text-sm font-bold text-white">{formatPrice(item.product.price * item.quantity)}</span>
      </div>
    </motion.div>
  )
}
