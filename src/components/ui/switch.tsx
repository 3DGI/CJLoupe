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
        'peer inline-flex h-6 w-11 shrink-0 items-center rounded-sm border p-0.5 shadow-[inset_0_0_0_1px_rgb(255_255_255_/_0.04)] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:cursor-not-allowed disabled:opacity-100 data-[state=unchecked]:border-foreground/20 data-[state=unchecked]:bg-background/85 data-[state=checked]:border-primary/40 data-[state=checked]:bg-primary/22 disabled:data-[state=unchecked]:border-foreground/25 disabled:data-[state=unchecked]:bg-foreground/8 disabled:data-[state=checked]:border-primary/25 disabled:data-[state=checked]:bg-primary/14',
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
          'block size-4 rounded-sm border shadow-sm transition-transform',
          checked
            ? 'translate-x-5 border-primary/55 bg-primary'
            : 'translate-x-0 border-foreground/30 bg-foreground/92 dark:bg-background',
          disabled && checked && 'border-primary/35 bg-primary/80',
          disabled && !checked && 'border-foreground/30 bg-foreground/45 dark:bg-foreground/30',
        )}
      />
    </button>
  )
}

export { Switch }
