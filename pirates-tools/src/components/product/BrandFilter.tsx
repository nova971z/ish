import { brands } from '../../config/brands'
import { cn } from '../../utils/cn'

interface BrandFilterProps {
  selected: string[]
  onChange: (brands: string[]) => void
}

export function BrandFilter({ selected, onChange }: BrandFilterProps) {
  function toggle(brandId: string) {
    if (selected.includes(brandId)) {
      onChange(selected.filter((b) => b !== brandId))
    } else {
      onChange([...selected, brandId])
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => onChange([])}
        className={cn(
          'px-3 py-1.5 rounded-lg text-xs font-medium transition-all border',
          selected.length === 0
            ? 'bg-white/10 border-white/25 text-white'
            : 'border-white/10 text-white/50 hover:border-white/20'
        )}
      >
        Toutes
      </button>
      {brands.map((brand) => {
        const isActive = selected.includes(brand.id)
        return (
          <button
            key={brand.id}
            onClick={() => toggle(brand.id)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-bold transition-all border',
              isActive
                ? 'border-transparent text-black'
                : 'border-white/10 text-white/60 hover:border-white/20'
            )}
            style={isActive ? { backgroundColor: brand.color } : undefined}
          >
            {brand.name}
          </button>
        )
      })}
    </div>
  )
}
