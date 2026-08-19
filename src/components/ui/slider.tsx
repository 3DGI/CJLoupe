import { Slider as SliderPrimitive } from '@base-ui/react/slider'

import { cn } from '@/lib/utils'

function Slider({
  className,
  value,
  ...props
}: SliderPrimitive.Root.Props) {
  const values = Array.isArray(value) ? value : value == null ? [] : [value]

  return (
    <SliderPrimitive.Root
      data-slot="slider"
      className={cn(className)}
      value={value}
      thumbAlignment="edge"
      {...props}
    >
      <SliderPrimitive.Control className="relative flex w-full touch-none select-none items-center data-disabled:opacity-50">
        <SliderPrimitive.Track
          data-slot="slider-track"
          className="relative h-2 w-full grow overflow-hidden rounded-sm bg-input"
        >
          <SliderPrimitive.Indicator
            data-slot="slider-range"
            className="absolute h-full bg-accent"
          />
        </SliderPrimitive.Track>
        {values.map((_, index) => (
          <SliderPrimitive.Thumb
            key={index}
            data-slot="slider-thumb"
            className="block size-4 rounded-sm border border-primary/50 bg-background shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring/60 data-disabled:pointer-events-none data-disabled:opacity-50"
          />
        ))}
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  )
}

export {
  Slider,
}
