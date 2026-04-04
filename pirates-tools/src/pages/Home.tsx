import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { HeroSection } from '../components/hero/HeroSection'
import { ProductGrid } from '../components/product/ProductGrid'
import { GlassCard } from '../components/ui/GlassCard'
import { products } from '../config/products'
import { brands } from '../config/brands'

export function Home() {
  const featuredProducts = useMemo(() => products.filter((p) => p.featured).slice(0, 8), [])

  return (
    <div>
      <HeroSection />

      {/* Brands section */}
      <section className="max-w-7xl mx-auto px-4 py-20">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl font-bold mb-3">Nos Marques</h2>
          <p className="text-white/50 text-sm">Les plus grandes marques d'outillage professionnel</p>
        </motion.div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {brands.map((brand, i) => (
            <motion.div
              key={brand.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05 }}
            >
              <Link to={`/catalogue?brand=${brand.id}`}>
                <GlassCard className="p-5 text-center">
                  <div
                    className="w-12 h-12 rounded-xl mx-auto mb-3 flex items-center justify-center text-lg font-bold"
                    style={{ backgroundColor: `${brand.color}20`, color: brand.color }}
                  >
                    {brand.name.charAt(0)}
                  </div>
                  <h3 className="text-sm font-semibold" style={{ color: brand.color }}>{brand.name}</h3>
                  <p className="text-[11px] text-white/40 mt-1">{brand.tagline}</p>
                </GlassCard>
              </Link>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Featured products */}
      <section className="max-w-7xl mx-auto px-4 pb-20">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl font-bold mb-3">Produits Vedettes</h2>
          <p className="text-white/50 text-sm">Sélection de nos meilleurs outils professionnels</p>
        </motion.div>

        <ProductGrid products={featuredProducts} />

        <div className="text-center mt-10">
          <Link
            to="/catalogue"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold border border-white/10 text-white/70 hover:bg-white/5 hover:border-white/25 transition-all"
          >
            Voir tout le catalogue
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </Link>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-7xl mx-auto px-4 pb-20">
        <GlassCard className="p-10 text-center" hover={false}>
          <h2 className="text-2xl font-bold mb-3">Besoin d'un devis ?</h2>
          <p className="text-white/50 text-sm mb-6 max-w-md mx-auto">
            Contactez-nous directement par WhatsApp pour obtenir un devis personnalisé et une livraison aux Antilles.
          </p>
          <a
            href="https://wa.me/33774230195"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-xl font-semibold text-sm bg-green-500 text-white hover:bg-green-400 transition-colors"
          >
            Contacter via WhatsApp
          </a>
        </GlassCard>
      </section>
    </div>
  )
}
