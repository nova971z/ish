import { useContext } from 'react'
import { CartContext } from '../store/CartContext'

export function useCart() {
  return useContext(CartContext)
}
