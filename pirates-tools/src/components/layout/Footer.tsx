import { Link } from 'react-router-dom'

export function Footer() {
  return (
    <footer className="border-t border-white/10 mt-20 pb-24 lg:pb-8">
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Brand */}
          <div>
            <h3 className="text-lg font-bold gradient-text mb-3">Pirates Tools</h3>
            <p className="text-sm text-white/50 leading-relaxed">
              Outillage professionnel pour les Antilles fran&ccedil;aises. Guadeloupe, Martinique, Guyane.
            </p>
          </div>
          {/* Links */}
          <div>
            <h4 className="text-sm font-semibold text-white/80 mb-3">Navigation</h4>
            <div className="flex flex-col gap-2">
              <Link to="/" className="text-sm text-white/50 hover:text-white/80 transition-colors">Accueil</Link>
              <Link to="/catalogue" className="text-sm text-white/50 hover:text-white/80 transition-colors">Catalogue</Link>
              <Link to="/contact" className="text-sm text-white/50 hover:text-white/80 transition-colors">Contact</Link>
            </div>
          </div>
          {/* Marques */}
          <div>
            <h4 className="text-sm font-semibold text-white/80 mb-3">Nos Marques</h4>
            <div className="flex flex-wrap gap-2">
              {['DeWALT', 'Milwaukee', 'Makita', 'Festool', 'Facom', 'Wera'].map((b) => (
                <span key={b} className="text-xs text-white/40">{b}</span>
              ))}
            </div>
          </div>
          {/* Contact */}
          <div>
            <h4 className="text-sm font-semibold text-white/80 mb-3">Contact</h4>
            <div className="flex flex-col gap-2">
              <a href="tel:0774230195" className="text-sm text-white/50 hover:text-white/80 transition-colors">
                07 74 23 01 95
              </a>
              <a
                href="https://wa.me/33774230195"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-green-400/80 hover:text-green-400 transition-colors"
              >
                WhatsApp
              </a>
            </div>
          </div>
        </div>
        <div className="mt-10 pt-6 border-t border-white/5 text-center">
          <p className="text-xs text-white/30">&copy; {new Date().getFullYear()} Pirates Tools. Tous droits r&eacute;serv&eacute;s.</p>
        </div>
      </div>
    </footer>
  )
}
