import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'

import { ThemeContext, type Theme } from '@/components/theme-context'

const STORAGE_KEY = 'cjvis-theme'
const MEDIA_QUERY = '(prefers-color-scheme: dark)'

function getStoredTheme(): Theme | null {
  const stored = localStorage.getItem(STORAGE_KEY)
  return stored === 'light' || stored === 'dark' ? stored : null
}

function getSystemTheme(): Theme {
  return window.matchMedia(MEDIA_QUERY).matches ? 'dark' : 'light'
}

function getInitialTheme(): Theme {
  return getStoredTheme() ?? getSystemTheme()
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  document.documentElement.style.colorScheme = theme
}

function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(getInitialTheme)
  const [hasStoredPreference, setHasStoredPreference] = useState(() => getStoredTheme() != null)

  useEffect(() => {
    applyTheme(theme)
    if (hasStoredPreference) {
      localStorage.setItem(STORAGE_KEY, theme)
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  }, [hasStoredPreference, theme])

  useEffect(() => {
    if (hasStoredPreference) {
      return
    }

    const mediaQuery = window.matchMedia(MEDIA_QUERY)
    const handleChange = () => setTheme(getSystemTheme())
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [hasStoredPreference])

  const toggleTheme = useCallback(() => {
    setHasStoredPreference(true)
    setTheme((current) => {
      return current === 'dark' ? 'light' : 'dark'
    })
  }, [])

  const value = useMemo(
    () => ({
      theme,
      setTheme,
      toggleTheme,
    }),
    [theme, toggleTheme],
  )

  return (
    <ThemeContext value={value}>
      {children}
    </ThemeContext>
  )
}

export { ThemeProvider }
