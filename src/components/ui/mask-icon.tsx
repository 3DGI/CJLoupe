import type { CSSProperties } from 'react'

import { cn } from '@/lib/utils'

type MaskIconProps = {
  src: string
  label?: string
  className?: string
}

export function MaskIcon({ src, label, className }: MaskIconProps) {
  const style = {
    WebkitMaskImage: `url("${src}")`,
    WebkitMaskPosition: 'center',
    WebkitMaskRepeat: 'no-repeat',
    WebkitMaskSize: 'contain',
    maskImage: `url("${src}")`,
    maskPosition: 'center',
    maskRepeat: 'no-repeat',
    maskSize: 'contain',
  } satisfies CSSProperties

  return (
    <span
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn('inline-block shrink-0 bg-current', className)}
      style={style}
    />
  )
}
