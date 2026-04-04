import { motion } from 'framer-motion'
import { cn } from '../../utils/cn'
import type { ReactNode } from 'react'

interface GlassCardProps {
  children: ReactNode
  className?: string
  hover?: boolean
  onClick?: () => void
}

export function GlassCard({ children, className, hover = true, onClick }: GlassCardProps) {
  return (
    <motion.div
      className={cn('glass', hover && 'glass-hover', 'transition-all duration-300', className)}
      whileHover={hover ? { y: -4 } : undefined}
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : undefined }}
    >
      {children}
    </motion.div>
  )
}
