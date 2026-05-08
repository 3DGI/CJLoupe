import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function viewerObjectKey(featureId: string, objectId: string) {
  return `${featureId}::${objectId}`
}
