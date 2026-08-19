import { Switch as SwitchPrimitive } from '@base-ui/react/switch'

import { cn } from '@/lib/utils'

function Switch({
  className,
  ...props
}: SwitchPrimitive.Root.Props) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        'peer group/switch inline-flex h-6 w-11 shrink-0 items-center rounded-sm border p-0.5 shadow-[inset_0_0_0_1px_rgb(255_255_255_/_0.04)] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/60 data-unchecked:border-foreground/20 data-unchecked:bg-input data-checked:border-primary/40 data-checked:bg-primary/22 data-disabled:cursor-not-allowed data-disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block size-4 rounded-sm border shadow-sm transition-transform data-checked:translate-x-5 data-checked:border-primary/55 data-checked:bg-primary-foreground data-unchecked:translate-x-0 data-unchecked:border-foreground/30 data-unchecked:bg-foreground data-disabled:opacity-70"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
