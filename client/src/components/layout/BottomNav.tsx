import { useState, useRef, useEffect } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Settings, LogOut, Sun, Moon, Globe, User } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'
import { useT } from '../../i18n/translations'

export default function BottomNav() {
  const { user, logout } = useAuth()
  const { lang, theme, toggleTheme, toggleLang } = useTheme()
  const tr = useT(lang)
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleLogout = () => { logout(); navigate('/login') }

  return (
    <nav className="md:hidden fixed bottom-0 start-0 end-0 bg-[var(--surface)] border-t border-[var(--border)] flex justify-around py-2 z-20">
      <NavLink to="/" end className={({ isActive }) => `flex flex-col items-center gap-1 px-4 py-1 rounded-lg text-xs transition-colors ${isActive ? 'text-primary-600' : 'text-[var(--muted)]'}`}>
        <LayoutDashboard size={22} />
        <span>{tr('dashboard')}</span>
      </NavLink>

      {user?.role === 'admin' && (
        <NavLink to="/settings" className={({ isActive }) => `flex flex-col items-center gap-1 px-4 py-1 rounded-lg text-xs transition-colors ${isActive ? 'text-primary-600' : 'text-[var(--muted)]'}`}>
          <Settings size={22} />
          <span>{tr('settings')}</span>
        </NavLink>
      )}

      <div className="relative flex flex-col items-center" ref={ref}>
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="flex flex-col items-center gap-1 px-6 py-1 rounded-lg text-xs transition-colors text-[var(--muted)] hover:text-[var(--text)]"
        >
          <div className="w-6 h-6 rounded-full bg-primary-600 flex items-center justify-center text-white font-semibold text-xs">
            {user?.name?.charAt(0)?.toUpperCase() || 'U'}
          </div>
          <span>{user?.name?.split(' ')[0] || tr('profile')}</span>
        </button>

        {menuOpen && (
          <div className="absolute bottom-14 end-0 w-56 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-lg py-2 z-50">
            <div className="px-4 py-2 border-b border-[var(--border)]">
              <p className="font-semibold text-sm text-[var(--text)]">{user?.name}</p>
              <p className="text-xs text-[var(--muted)]">{user?.email}</p>
            </div>

            {user?.role === 'admin' && (
              <button onClick={() => { navigate('/settings'); setMenuOpen(false) }}
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
    </nav>
  )
}
