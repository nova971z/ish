import { useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { products, categories } from '../config/products'
import { ProductGrid } from '../components/product/ProductGrid'
import { BrandFilter } from '../components/product/BrandFilter'
import { SearchBar } from '../components/ui/SearchBar'
import { cn } from '../utils/cn'

export function Catalogue() {
  const [searchParams] = useSearchParams()
  const initialBrand = searchParams.get('brand')
  const [search, setSearch] = useState('')
  const [selectedBrands, setSelectedBrands] = useState<string[]>(initialBrand ? [initialBrand] : [])
  const [selectedCategory, setSelectedCategory] = useState<string>('')

  const filtered = useMemo(() => {
    return products.filter((p) => {
      if (selectedBrands.length > 0 && !selectedBrands.includes(p.brand)) return false
      if (selectedCategory && p.category !== selectedCategory) return false
      if (search) {
        const q = search.toLowerCase()
        return (
          p.name.toLowerCase().includes(q) ||
          p.brand.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [search, selectedBrands, selectedCategory])

  return (
    <div className="max-w-7xl mx-auto px-4 pt-24 pb-32">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="text-3xl font-bold mb-2">Catalogue</h1>
        <p className="text-white/50 text-sm">{filtered.length} produit{filtered.length > 1 ? 's' : ''}</p>
      </motion.div>

      {/* Filters */}
      <div className="space-y-4 mb-8">
        <SearchBar value={search} onChange={setSearch} placeholder="Rechercher un outil, une marque..." />
        <BrandFilter selected={selectedBrands} onChange={setSelectedBrands} />
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedCategory('')}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-medium transition-all border',
              !selectedCategory
                ? 'bg-white/10 border-white/25 text-white'
                : 'border-white/10 text-white/50 hover:border-white/20'
            )}
          >
            Toutes catégories
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(selectedCategory === cat ? '' : cat)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-all border',
                selectedCategory === cat
                  ? 'bg-white/10 border-white/25 text-white'
                  : 'border-white/10 text-white/50 hover:border-white/20'
              )}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <ProductGrid products={filtered} />
    </div>
  )
}
