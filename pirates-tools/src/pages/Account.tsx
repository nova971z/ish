import { useState, useContext } from 'react'
import { motion } from 'framer-motion'
import { AuthContext } from '../store/AuthContext'
import { GlassCard } from '../components/ui/GlassCard'
import { Button } from '../components/ui/Button'

export function Account() {
  const { user, login, logout, isLoggedIn } = useContext(AuthContext)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')

  function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    if (name.trim() && email.trim()) {
      login(name.trim(), email.trim())
    }
  }

  return (
    <div className="max-w-lg mx-auto px-4 pt-24 pb-32">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-bold mb-2">Mon Compte</h1>
        <p className="text-white/50 text-sm mb-10">
          {isLoggedIn ? `Bienvenue, ${user!.name}` : 'Connectez-vous pour une expérience personnalisée'}
        </p>
      </motion.div>

      {isLoggedIn ? (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <GlassCard className="p-6 space-y-4" hover={false}>
            <div>
              <label className="text-xs text-white/40">Nom</label>
              <p className="text-sm font-medium">{user!.name}</p>
            </div>
            <div>
              <label className="text-xs text-white/40">Email</label>
              <p className="text-sm font-medium">{user!.email}</p>
            </div>
            <Button variant="ghost" onClick={logout} fullWidth>Se déconnecter</Button>
          </GlassCard>
        </motion.div>
      ) : (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <GlassCard className="p-6" hover={false}>
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-white/50 mb-1.5">Nom</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-white/25 transition-colors"
                  placeholder="Votre nom"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-white/50 mb-1.5">Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-white/25 transition-colors"
                  placeholder="votre@email.com"
                />
              </div>
              <Button type="submit" fullWidth>Se connecter</Button>
            </form>
          </GlassCard>
        </motion.div>
      )}
    </div>
  )
}
