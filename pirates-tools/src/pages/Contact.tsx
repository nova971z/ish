import { useState } from 'react'
import { motion } from 'framer-motion'
import { GlassCard } from '../components/ui/GlassCard'
import { Button } from '../components/ui/Button'

export function Contact() {
  const [form, setForm] = useState({ name: '', email: '', message: '' })
  const [sent, setSent] = useState(false)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    // Build WhatsApp message from form
    const msg = `Nouveau message de ${form.name} (${form.email}):\n\n${form.message}`
    window.open(`https://wa.me/33774230195?text=${encodeURIComponent(msg)}`, '_blank')
    setSent(true)
  }

  return (
    <div className="max-w-4xl mx-auto px-4 pt-24 pb-32">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-bold mb-2">Contact</h1>
        <p className="text-white/50 text-sm mb-10">Contactez-nous pour tout renseignement ou demande de devis.</p>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Info cards */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
          className="space-y-4"
        >
          <GlassCard className="p-6" hover={false}>
            <h3 className="font-semibold mb-2">Téléphone</h3>
            <a href="tel:0774230195" className="text-sm text-white/60 hover:text-white transition-colors">
              07 74 23 01 95
            </a>
          </GlassCard>
          <GlassCard className="p-6" hover={false}>
            <h3 className="font-semibold mb-2">WhatsApp</h3>
            <a
              href="https://wa.me/33774230195"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-green-400 hover:text-green-300 transition-colors"
            >
              Envoyer un message
            </a>
          </GlassCard>
          <GlassCard className="p-6" hover={false}>
            <h3 className="font-semibold mb-2">Zone de livraison</h3>
            <p className="text-sm text-white/60">Guadeloupe, Martinique, Guyane et métropole</p>
          </GlassCard>

          {/* Map placeholder */}
          <GlassCard className="aspect-video flex items-center justify-center" hover={false}>
            <div className="text-center">
              <svg className="w-10 h-10 mx-auto text-white/10 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <p className="text-xs text-white/20">Antilles françaises</p>
            </div>
          </GlassCard>
        </motion.div>

        {/* Form */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
        >
          {sent ? (
            <GlassCard className="p-8 text-center" hover={false}>
              <h3 className="text-xl font-bold mb-3">Message envoyé !</h3>
              <p className="text-sm text-white/50 mb-4">Vous allez être redirigé vers WhatsApp.</p>
              <Button variant="ghost" onClick={() => setSent(false)}>Envoyer un autre message</Button>
            </GlassCard>
          ) : (
            <GlassCard className="p-6" hover={false}>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-white/50 mb-1.5">Nom</label>
                  <input
                    type="text"
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-white/25 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-white/50 mb-1.5">Email</label>
                  <input
                    type="email"
                    required
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-white/25 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-white/50 mb-1.5">Message</label>
                  <textarea
                    required
                    rows={5}
                    value={form.message}
                    onChange={(e) => setForm({ ...form, message: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-white/25 transition-colors resize-none"
                  />
                </div>
                <Button type="submit" fullWidth>Envoyer via WhatsApp</Button>
              </form>
            </GlassCard>
          )}
        </motion.div>
      </div>
    </div>
  )
}
