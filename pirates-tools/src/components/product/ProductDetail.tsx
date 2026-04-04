import { useContext } from 'react'
import { motion } from 'framer-motion'
import type { Product } from '../../config/products'
import { brandMap } from '../../config/brands'
import { formatPrice } from '../../utils/formatPrice'
import { useCart } from '../../hooks/useCart'
import { UIContext } from '../../store/UIContext'

interface ProductDetailProps {
  product: Product
}

export function ProductDetail({ product }: ProductDetailProps) {
  const { addItem } = useCart()
  const { addToast, openCart } = useContext(UIContext)
  const brand = brandMap[product.brand]

  function handleAdd() {
    addItem(product)
    addToast(`${product.name} ajouté au panier`)
    openCart()
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Image */}
        <motion.div
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          className="glass overflow-hidden aspect-square flex items-center justify-center"
          style={{
            background: `linear-gradient(135deg, ${brand?.color || '#667EEA'}15, ${brand?.color || '#667EEA'}05)`,
          }}
        >
          <img
            src={product.image}
            alt={product.name}
            className="w-full h-full object-cover"
            onError={(e) => {
              const target = e.target as HTMLImageElement
              target.style.display = 'none'
            }}
          />
        </motion.div>

        {/* Info */}
        <motion.div
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex flex-col gap-4"
        >
          {brand && (
            <span
              className="self-start px-3 py-1 rounded-lg text-xs font-bold"
              style={{ backgroundColor: brand.color, color: '#000' }}
            >
              {brand.name}
            </span>
          )}
          <span className="text-xs text-white/40 uppercase tracking-wider">{product.category}</span>
          <h1 className="text-2xl md:text-3xl font-bold text-white leading-tight">{product.name}</h1>
          <p className="text-sm text-white/60 leading-relaxed">{product.description}</p>

          <div className="flex items-end gap-3 mt-2">
            <span className="text-3xl font-bold text-white">{formatPrice(product.price)}</span>
            {product.oldPrice && (
              <span className="text-lg text-white/40 line-through">{formatPrice(product.oldPrice)}</span>
            )}
          </div>

          <div className={`text-sm font-medium ${product.inStock ? 'text-green-400' : 'text-red-400'}`}>
            {product.inStock ? 'En stock' : 'Rupture de stock'}
          </div>

          <motion.button
            onClick={handleAdd}
            disabled={!product.inStock}
            className={`mt-2 py-4 rounded-xl font-semibold text-sm transition-all ${
              product.inStock
                ? 'bg-gradient-to-r from-[#667EEA] to-[#9F7AEA] text-white hover:shadow-lg hover:shadow-purple-500/25'
                : 'bg-white/5 text-white/30 cursor-not-allowed'
            }`}
            whileTap={product.inStock ? { scale: 0.97 } : undefined}
          >
            {product.inStock ? 'Ajouter au panier' : 'Indisponible'}
          </motion.button>

          <a
            href={`https://wa.me/33774230195?text=${encodeURIComponent(`Bonjour, je suis intéressé par : ${product.name} (${formatPrice(product.price)})`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="py-3 rounded-xl font-semibold text-sm text-center border border-green-400/30 text-green-400 hover:bg-green-400/10 transition-colors"
          >
            Demander un devis via WhatsApp
          </a>

          {/* Specs */}
          {Object.keys(product.specs).length > 0 && (
            <div className="mt-4 glass p-5">
              <h3 className="text-sm font-semibold text-white/80 mb-3">Caractéristiques</h3>
              <div className="grid grid-cols-1 gap-2">
                {Object.entries(product.specs).map(([key, value]) => (
                  <div key={key} className="flex justify-between text-sm py-1.5 border-b border-white/5 last:border-0">
                    <span className="text-white/50">{key}</span>
                    <span className="text-white/80 font-medium">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  )
}
