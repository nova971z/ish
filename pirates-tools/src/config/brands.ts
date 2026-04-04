export interface Brand {
  id: string
  name: string
  color: string
  tagline: string
}

export const brands: Brand[] = [
  { id: 'dewalt', name: 'DeWALT', color: '#FFCC00', tagline: 'Guaranteed Tough' },
  { id: 'milwaukee', name: 'Milwaukee', color: '#DB0032', tagline: 'Nothing But Heavy Duty' },
  { id: 'makita', name: 'Makita', color: '#00A7E1', tagline: 'Rule the Outdoors' },
  { id: 'festool', name: 'Festool', color: '#14532d', tagline: 'Pensé pour ceux qui créent' },
  { id: 'facom', name: 'Facom', color: '#E63946', tagline: 'L\'outil des pros depuis 1918' },
  { id: 'stanley', name: 'Stanley', color: '#FFC107', tagline: 'Make Something Great' },
  { id: 'wera', name: 'Wera', color: '#78BE20', tagline: 'A Tool Rebel' },
  { id: 'stabila', name: 'Stabila', color: '#FFD700', tagline: 'Precision Made in Germany' },
  { id: 'flex', name: 'FLEX', color: '#FF6600', tagline: 'Power Tools Since 1922' },
]

export const brandMap = Object.fromEntries(brands.map((b) => [b.id, b]))
