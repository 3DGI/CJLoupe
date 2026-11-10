const ERROR_PALETTE = [
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#14b8a6', // teal
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#84cc16', // lime
  '#a855f7', // purple
  '#f43f5e', // rose
  '#6366f1', // indigo
]

export function errorColor(code: number): string {
  return ERROR_PALETTE[code % ERROR_PALETTE.length]
}
