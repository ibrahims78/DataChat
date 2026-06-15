import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'

type Theme = 'light' | 'dark'
type Lang = 'ar' | 'en'

interface ThemeContextType {
  theme: Theme
  lang: Lang
  toggleTheme: () => void
  toggleLang: () => void
  isRTL: boolean
}

const ThemeContext = createContext<ThemeContextType | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() =>
    (localStorage.getItem('theme') as Theme) || 'light'
  )
  const [lang, setLang] = useState<Lang>(() =>
    (localStorage.getItem('lang') as Lang) || 'ar'
  )

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'dark') root.classList.add('dark')
    else root.classList.remove('dark')
    localStorage.setItem('theme', theme)
  }, [theme])

  useEffect(() => {
    const root = document.documentElement
    root.setAttribute('lang', lang)
    root.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr')
    localStorage.setItem('lang', lang)
  }, [lang])

  const toggleTheme = () => setTheme(t => t === 'light' ? 'dark' : 'light')
  const toggleLang = () => setLang(l => l === 'ar' ? 'en' : 'ar')

  return (
    <ThemeContext.Provider value={{ theme, lang, toggleTheme, toggleLang, isRTL: lang === 'ar' }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
