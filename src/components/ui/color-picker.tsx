import * as React from 'react'
import { HexColorPicker } from 'react-colorful'

import { cn } from '@/lib/utils'

type ColorPickerProps = React.ComponentProps<typeof HexColorPicker>

function ColorPicker({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('h-fit min-h-[200px] w-fit rounded-sm border border-border bg-background shadow-sm', className)}
      {...props}
    >
      {children}
    </div>
  )
}

function ColorPickerHex({
  className,
  ...props
}: ColorPickerProps) {
  return (
    <HexColorPicker
      className={cn('!h-[160px] !w-[200px] rounded-none !border-0', className)}
      {...props}
    />
  )
}

function ColorPickerInput({
  className,
  type = 'text',
  ...props
}: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      className={cn(
        'mt-0.5 flex h-fit w-[200px] bg-transparent px-2 py-1 font-mono text-sm uppercase text-foreground transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

export { ColorPicker, ColorPickerHex, ColorPickerInput }
