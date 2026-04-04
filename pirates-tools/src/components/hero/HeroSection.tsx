import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { ParticleBackground } from './ParticleBackground'

export function HeroSection() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Animated gradient bg */}
      <div className="absolute inset-0 animated-gradient-bg" />
      {/* Particles */}
      <ParticleBackground />
      {/* Radial glow */}
      <div className="absolute inset-0 bg-radial-[ellipse_at_center] from-purple-900/20 via-transparent to-transparent" />

      <div className="relative z-10 max-w-4xl mx-auto px-4 text-center">
        {/* Logo / Title with blur reveal */}
        <motion.h1
          className="text-5xl sm:text-6xl md:text-8xl font-bold mb-6"
          initial={{ opacity: 0, scale: 0.8, filter: 'blur(20px)' }}
          animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
          transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
        >
          <span className="gradient-text">Pirates</span>
          <br />
          <span className="text-white">Tools</span>
        </motion.h1>

        <motion.p
          className="text-lg sm:text-xl text-white/60 mb-8 max-w-xl mx-auto"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3 }}
        >
          Outillage professionnel pour les Antilles.
          <br />
          DeWALT &middot; Milwaukee &middot; Makita &middot; Festool &middot; Facom
        </motion.p>

        <motion.div
          className="flex flex-col sm:flex-row items-center justify-center gap-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.5 }}
        >
          <Link
            to="/catalogue"
            className="px-8 py-4 rounded-xl font-semibold text-sm bg-gradient-to-r from-[#667EEA] to-[#9F7AEA] text-white hover:shadow-lg hover:shadow-purple-500/25 transition-all"
          >
            Voir le catalogue
          </Link>
          <a
            href="https://wa.me/33774230195"
            target="_blank"
            rel="noopener noreferrer"
            className="px-8 py-4 rounded-xl font-semibold text-sm border border-white/10 text-white/80 hover:bg-white/5 hover:border-white/25 transition-all"
          >
            Nous contacter
          </a>
        </motion.div>

        {/* Scroll hint */}
        <motion.div
          className="absolute bottom-8 left-1/2 -translate-x-1/2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, y: [0, 8, 0] }}
          transition={{ opacity: { delay: 1.5 }, y: { duration: 2, repeat: Infinity } }}
        >
          <svg className="w-6 h-6 text-white/20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        </motion.div>
      </div>
    </section>
  )
}
