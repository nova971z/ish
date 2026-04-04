import { useCart } from '../../hooks/useCart'
import { formatPrice } from '../../utils/formatPrice'

export function CartSummary() {
  const { items, totalPrice, clearCart } = useCart()

  const whatsappText = items
    .map((i) => `- ${i.product.name} x${i.quantity} : ${formatPrice(i.product.price * i.quantity)}`)
    .join('\n')
  const whatsappMessage = `Bonjour, je souhaite un devis pour :\n\n${whatsappText}\n\nTotal : ${formatPrice(totalPrice)}`

  return (
    <div className="border-t border-white/10 pt-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-white/60">Total</span>
        <span className="text-xl font-bold text-white">{formatPrice(totalPrice)}</span>
      </div>
      <a
        href={`https://wa.me/33774230195?text=${encodeURIComponent(whatsappMessage)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="block w-full py-3 rounded-xl font-semibold text-sm text-center bg-green-500 text-white hover:bg-green-400 transition-colors"
      >
        Demander un devis WhatsApp
      </a>
      <button
        onClick={clearCart}
        className="w-full py-2.5 rounded-xl text-xs font-medium text-white/40 hover:text-white/70 border border-white/10 hover:border-white/20 transition-all"
      >
        Vider le panier
      </button>
    </div>
  )
}
