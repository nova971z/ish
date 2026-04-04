import { cn } from '../../utils/cn'

interface BadgeProps {
  children: React.ReactNode
  color?: string
  className?: string
}

export function Badge({ children, color, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold',
        className
      )}
      style={color ? { backgroundColor: color, color: '#000' } : undefined}
    >
      {children}
    </span>
  )
}
