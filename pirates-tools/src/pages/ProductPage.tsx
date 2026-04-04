import { useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { products } from '../config/products'
import { ProductDetail } from '../components/product/ProductDetail'
import { ProductGrid } from '../components/product/ProductGrid'

export function ProductPage() {
  const { slug } = useParams<{ slug: string }>()

  const product = useMemo(() => {
    if (!slug) return null
    // Extract ID from end of slug (format: name-slug-ID)
    const parts = slug.split('-')
    const id = parts[parts.length - 1]
    return products.find((p) => p.id === id) || null
  }, [slug])

  const related = useMemo(() => {
    if (!product) return []
    return products
      .filter((p) => p.id !== product.id && (p.brand === product.brand || p.category === product.category))
      .slice(0, 4)
  }, [product])

  if (!product) {
    return (
      <div className="max-w-7xl mx-auto px-4 pt-24 pb-32 text-center">
        <h1 className="text-2xl font-bold mb-4">Produit non trouvé</h1>
        <Link to="/catalogue" className="text-sm text-[#667EEA] hover:underline">
          Retour au catalogue
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 pt-24 pb-32">
      {/* Breadcrumb */}
      <motion.nav
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex items-center gap-2 text-xs text-white/40 mb-8"
      >
        <Link to="/" className="hover:text-white/60 transition-colors">Accueil</Link>
        <span>/</span>
        <Link to="/catalogue" className="hover:text-white/60 transition-colors">Catalogue</Link>
        <span>/</span>
        <span className="text-white/60">{product.name}</span>
      </motion.nav>

      <ProductDetail product={product} />

      {/* Related */}
      {related.length > 0 && (
        <section className="mt-20">
          <h2 className="text-2xl font-bold mb-8">Produits similaires</h2>
          <ProductGrid products={related} />
        </section>
      )}
    </div>
  )
}
