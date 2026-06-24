import { Check } from 'lucide-react'
import * as React from 'react'

import { cn } from '@/lib/utils'

type CheckboxProps = {
  checked?: boolean
  disabled?: boolean
  onCheckedChange?: (checked: boolean) => void
} & Omit<React.ComponentProps<'button'>, 'onChange'>

function Checkbox({
  checked = false,
  disabled = false,
  onCheckedChange,
  className,
  onClick,
  type,
  ...props
}: CheckboxProps) {
  return (
    <button
      type={type ?? 'button'}
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      data-state={checked ? 'checked' : 'unchecked'}
      className={cn(
        'peer inline-flex size-4 shrink-0 items-center justify-center rounded-sm border border-primary/35 bg-background text-primary shadow-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=unchecked]:border-foreground/25 data-[state=unchecked]:text-transparent',
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
      <Check className="size-3" />
    </button>
  )
}

export { Checkbox }
