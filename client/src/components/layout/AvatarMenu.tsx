import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogOut, User, Sun, Moon, Globe } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'
import { useT } from '../../i18n/translations'

export default function AvatarMenu() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const { user, logout } = useAuth()
  const { theme, lang, toggleTheme, toggleLang } = useTheme()
  const tr = useT(lang)
  const navigate = useNavigate()

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleLogout = () => { logout(); navigate('/login') }

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)}
        className="w-9 h-9 rounded-full bg-primary-600 flex items-center justify-center text-white font-semibold text-sm hover:bg-primary-700 transition-colors">
        {user?.name?.charAt(0)?.toUpperCase() || 'U'}
      </button>

      {open && (
        <div className={`absolute ${lang === 'ar' ? 'right-0' : 'left-0'} bottom-12 w-56 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-lg py-2 z-50 animate-fade-in`}>
          <div className="px-4 py-2 border-b border-[var(--border)]">
            <p className="font-semibold text-sm text-[var(--text)]">{user?.name}</p>
            <p className="text-xs text-[var(--muted)]">{user?.email}</p>
          </div>

          {user?.role === 'admin' && (
            <button onClick={() => { navigate('/settings'); setOpen(false) }}
              className="w-full flex items-center gap-3 px-4 py-2 text-sm text-[var(--text)] hover:bg-[var(--bg)] transition-colors">
              <User size={16} />
              <span>{tr('profile')}</span>
            </button>
          )}

          <div className="border-t border-[var(--border)] mt-1 pt-1">
            <button onClick={toggleLang}
              className="w-full flex items-center gap-3 px-4 py-2 text-sm text-[var(--text)] hover:bg-[var(--bg)] transition-colors">
              <Globe size={16} />
              <span>{lang === 'ar' ? 'English' : 'العربية'}</span>
            </button>
            <button onClick={toggleTheme}
              className="w-full flex items-center gap-3 px-4 py-2 text-sm text-[var(--text)] hover:bg-[var(--bg)] transition-colors">
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
              <span>{theme === 'dark' ? tr('lightMode') : tr('darkMode')}</span>
            </button>
          </div>

          <div className="border-t border-[var(--border)] mt-1 pt-1">
            <button onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
              <LogOut size={16} />
              <span>{tr('logout')}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
