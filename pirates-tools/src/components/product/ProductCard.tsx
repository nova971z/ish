import { useRef, useCallback, useContext } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import type { Product } from '../../config/products'
import { brandMap } from '../../config/brands'
import { formatPrice } from '../../utils/formatPrice'
import { slugify } from '../../utils/slugify'
import { useCart } from '../../hooks/useCart'
import { UIContext } from '../../store/UIContext'

interface ProductCardProps {
  product: Product
  index?: number
}

export function ProductCard({ product, index = 0 }: ProductCardProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const { addItem } = useCart()
  const { addToast, openCart } = useContext(UIContext)
  const brand = brandMap[product.brand]

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const card = cardRef.current
    if (!card) return
    const rect = card.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width - 0.5
    const y = (e.clientY - rect.top) / rect.height - 0.5
    card.style.transform = `perspective(1000px) rotateY(${x * 10}deg) rotateX(${-y * 10}deg) scale(1.02)`
  }, [])

  const handleMouseLeave = useCallback(() => {
    const card = cardRef.current
    if (!card) return
    card.style.transform = 'perspective(1000px) rotateY(0deg) rotateX(0deg) scale(1)'
  }, [])

  function handleAddToCart(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    addItem(product)
    addToast(`${product.name} ajouté au panier`)
    openCart()
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05 }}
    >
      <div
        ref={cardRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className="glass glass-hover transition-all duration-300 overflow-hidden flex flex-col h-full"
        style={{ willChange: 'transform' }}
      >
        <Link to={`/produit/${slugify(product.name)}-${product.id}`} className="flex flex-col h-full">
          {/* Image */}
          <div className="relative aspect-square overflow-hidden">
            <div
              className="w-full h-full flex items-center justify-center text-4xl font-bold"
              style={{
                background: `linear-gradient(135deg, ${brand?.color || '#667EEA'}20, ${brand?.color || '#667EEA'}05)`,
              }}
            >
              <img
                src={product.image}
                alt={product.name}
                className="w-full h-full object-cover"
                loading="lazy"
                onError={(e) => {
                  const target = e.target as HTMLImageElement
                  target.style.display = 'none'
                }}
              />
            </div>
            {/* Brand badge */}
            {brand && (
              <span
                className="absolute top-3 left-3 px-2 py-1 rounded-lg text-[10px] font-bold"
                style={{ backgroundColor: brand.color, color: '#000' }}
              >
                {brand.name}
              </span>
            )}
            {!product.inStock && (
              <span className="absolute top-3 right-3 px-2 py-1 rounded-lg text-[10px] font-bold bg-red-500/80 text-white">
                Rupture
              </span>
            )}
          </div>
          {/* Info */}
          <div className="flex flex-col flex-1 p-4 gap-2">
            <span className="text-[11px] text-white/40 uppercase tracking-wider">{product.category}</span>
            <h3 className="text-sm font-semibold text-white/90 leading-tight line-clamp-2">{product.name}</h3>
            <div className="mt-auto pt-2 flex items-end justify-between">
              <div>
                <span className="text-lg font-bold text-white">{formatPrice(product.price)}</span>
                {product.oldPrice && (
                  <span className="ml-2 text-xs text-white/40 line-through">{formatPrice(product.oldPrice)}</span>
                )}
              </div>
            </div>
            <motion.button
              onClick={handleAddToCart}
              disabled={!product.inStock}
              className={`mt-2 w-full py-2.5 rounded-xl text-xs font-semibold transition-all ${
                product.inStock
                  ? 'bg-gradient-to-r from-[#667EEA] to-[#9F7AEA] text-white hover:shadow-lg hover:shadow-purple-500/25'
                  : 'bg-white/5 text-white/30 cursor-not-allowed'
              }`}
              whileTap={product.inStock ? { scale: 0.95 } : undefined}
            >
              {product.inStock ? 'Ajouter au panier' : 'Indisponible'}
            </motion.button>
          </div>
        </Link>
      </div>
    </motion.div>
  )
}
