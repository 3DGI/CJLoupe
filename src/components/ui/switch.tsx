import * as React from 'react'

import { cn } from '@/lib/utils'

type SwitchProps = {
  checked?: boolean
  disabled?: boolean
  onCheckedChange?: (checked: boolean) => void
} & Omit<React.ComponentProps<'button'>, 'onChange'>

function Switch({
  checked = false,
  disabled = false,
  onCheckedChange,
  className,
  onClick,
  type,
  ...props
}: SwitchProps) {
  return (
    <button
      type={type ?? 'button'}
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      data-state={checked ? 'checked' : 'unchecked'}
      className={cn(
        'peer inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-white/12 bg-white/8 p-0.5 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:pointer-events-none disabled:opacity-50 data-[state=checked]:border-cyan-300/30 data-[state=checked]:bg-cyan-400/20',
        className,
      )}
      onClick={(event) => {
        onClick?.(event)
        if (!event.defaultPrevented) {
          onCheckedChange?.(!checked)
        }
      }}
      {...props}
    >
      <span
        className={cn(
          'block size-4 rounded-full bg-white shadow-sm transition-transform',
          checked ? 'translate-x-5 bg-cyan-100' : 'translate-x-0',
        )}
      />
    </button>
  )
}

export { Switch }
