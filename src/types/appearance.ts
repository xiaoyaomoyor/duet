/** Only portable visual choices. No text, participant IDs, URLs, CSS or asset references. */
export interface Appearance {
  theme: 'ink' | 'paper'
  palette: 'amber' | 'blue' | 'mono'
  typography: 'modern' | 'editorial'
  mediaLayout: 'wide' | 'sleeve'
  titleAlign: 'left' | 'center'
  texture: 'none' | 'subtle'
  showBrand: boolean
  showProjectTitle: boolean
}
export type AppearancePatch = Partial<Appearance>
export interface AppearancePreset {
  id: string
  name: string
  appearance: AppearancePatch
}
export const DEFAULT_APPEARANCE: Readonly<Appearance> = {
  theme: 'ink',
  palette: 'amber',
  typography: 'modern',
  mediaLayout: 'wide',
  titleAlign: 'left',
  texture: 'none',
  showBrand: true,
  showProjectTitle: true,
}
export const APPEARANCE_CHOICES = {
  theme: ['ink', 'paper'],
  palette: ['amber', 'blue', 'mono'],
  typography: ['modern', 'editorial'],
  mediaLayout: ['wide', 'sleeve'],
  titleAlign: ['left', 'center'],
  texture: ['none', 'subtle'],
} as const
export function validAppearance(value: unknown): value is AppearancePatch {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return Object.entries(value).every(([key, v]) => {
    if (key === 'showBrand' || key === 'showProjectTitle') return typeof v === 'boolean'
    const choices: readonly string[] | undefined =
      APPEARANCE_CHOICES[key as keyof typeof APPEARANCE_CHOICES]
    return Array.isArray(choices) && typeof v === 'string' && choices.includes(v)
  })
}
