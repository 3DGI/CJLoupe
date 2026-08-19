import { Popover as PopoverPrimitive } from '@base-ui/react/popover'

import { cn } from '@/lib/utils'

function Popover({
  ...props
}: PopoverPrimitive.Root.Props) {
  return <PopoverPrimitive.Root {...props} />
}

function PopoverTrigger({
  ...props
}: PopoverPrimitive.Trigger.Props) {
  return <PopoverPrimitive.Trigger {...props} />
}

function PopoverContent({
  className,
  align = 'center',
  alignOffset = 0,
  side = 'bottom',
  sideOffset = 6,
  ...props
}: PopoverPrimitive.Popup.Props &
  Pick<
    PopoverPrimitive.Positioner.Props,
    'align' | 'alignOffset' | 'side' | 'sideOffset'
  >) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        className="isolate z-50"
      >
        <PopoverPrimitive.Popup
          className={cn(
            'z-50 rounded-sm border border-border bg-popover p-2 text-popover-foreground shadow-lg outline-none',
            className,
          )}
          {...props}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  )
}

export {
  Popover,
  PopoverContent,
  PopoverTrigger,
}
