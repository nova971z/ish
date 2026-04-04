import { motion } from 'framer-motion'
import { cn } from '../../utils/cn'
import type { ReactNode, ButtonHTMLAttributes } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'brand'
  brandColor?: string
  children: ReactNode
  fullWidth?: boolean
}

export function Button({
  variant = 'primary',
  brandColor,
  children,
  className,
  fullWidth,
  ...props
}: ButtonProps) {
  const base = 'inline-flex items-center justify-center gap-2 font-semibold transition-all duration-200 rounded-xl px-5 py-3 text-sm'

  const variants = {
    primary: 'bg-gradient-to-r from-[#667EEA] to-[#9F7AEA] text-white hover:shadow-lg hover:shadow-purple-500/25',
    ghost: 'bg-transparent border border-white/10 text-white/80 hover:bg-white/5 hover:border-white/25',
    brand: '',
  }

  const style = variant === 'brand' && brandColor
    ? { background: brandColor, color: '#000' }
    : undefined

  return (
    <motion.button
      className={cn(base, variants[variant], fullWidth && 'w-full', className)}
      style={style}
      whileTap={{ scale: 0.97 }}
      {...(props as Record<string, unknown>)}
    >
      {children}
    </motion.button>
  )
}
