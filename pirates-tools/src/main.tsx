import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { CartProvider } from './store/CartContext'
import { UIProvider } from './store/UIContext'
import { AuthProvider } from './store/AuthContext'
import { App } from './App'
import './styles/globals.css'

// Register service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // SW registration failed, not critical
    })
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <AuthProvider>
        <UIProvider>
          <CartProvider>
            <App />
          </CartProvider>
        </UIProvider>
      </AuthProvider>
    </HashRouter>
  </StrictMode>
)
