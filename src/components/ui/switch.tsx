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
        'peer inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-input bg-muted p-0.5 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:cursor-not-allowed disabled:border-border disabled:bg-muted/80 disabled:opacity-100 data-[state=checked]:border-primary/30 data-[state=checked]:bg-primary/20 disabled:data-[state=checked]:border-primary/20 disabled:data-[state=checked]:bg-primary/12',
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
          'block size-4 rounded-full border border-border bg-background shadow-sm transition-transform',
          checked
            ? 'translate-x-5 border-primary/35 bg-primary'
            : 'translate-x-0 bg-background',
          disabled && checked && 'border-primary/30 bg-primary/75',
          disabled && !checked && 'border-foreground/20 bg-background/95',
        )}
      />
    </button>
  )
}

export { Switch }
