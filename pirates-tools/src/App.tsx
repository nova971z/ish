import { Routes, Route, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Topbar } from './components/layout/Topbar'
import { Dock } from './components/layout/Dock'
import { Sidebar } from './components/layout/Sidebar'
import { Footer } from './components/layout/Footer'
import { CartDrawer } from './components/cart/CartDrawer'
import { ToastContainer } from './components/ui/Toast'
import { Home } from './pages/Home'
import { Catalogue } from './pages/Catalogue'
import { ProductPage } from './pages/ProductPage'
import { Contact } from './pages/Contact'
import { Account } from './pages/Account'

const pageVariants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -12 },
}

function AnimatedPage({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{ duration: 0.3 }}
    >
      {children}
    </motion.div>
  )
}

export function App() {
  const location = useLocation()

  return (
    <div className="min-h-screen animated-gradient-bg">
      <Topbar />
      <Sidebar />
      <CartDrawer />
      <ToastContainer />

      <main>
        <AnimatePresence mode="wait">
          <Routes location={location} key={location.pathname}>
            <Route path="/" element={<AnimatedPage><Home /></AnimatedPage>} />
            <Route path="/catalogue" element={<AnimatedPage><Catalogue /></AnimatedPage>} />
            <Route path="/produit/:slug" element={<AnimatedPage><ProductPage /></AnimatedPage>} />
            <Route path="/contact" element={<AnimatedPage><Contact /></AnimatedPage>} />
            <Route path="/compte" element={<AnimatedPage><Account /></AnimatedPage>} />
          </Routes>
        </AnimatePresence>
      </main>

      <Footer />
      <Dock />
    </div>
  )
}
