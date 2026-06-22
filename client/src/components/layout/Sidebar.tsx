import { NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Settings, Database } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'
import { useT } from '../../i18n/translations'
import AvatarMenu from './AvatarMenu'

export default function Sidebar() {
  const { user, logout } = useAuth()
  const { lang } = useTheme()
  const tr = useT(lang)
  const navigate = useNavigate()

  const handleLogout = () => { logout(); navigate('/login') }

  return (
    <aside className="hidden md:flex flex-col w-16 bg-[var(--surface)] border-e border-[var(--border)] h-screen py-4 items-center gap-2 z-10">
      <div className="mb-4 flex flex-col items-center">
        <div className="w-10 h-10 rounded-xl bg-primary-600 flex items-center justify-center">
          <Database size={20} className="text-white" />
        </div>
      </div>

      <NavLink to="/" end title={tr('dashboard')}
        className={({ isActive }) => `p-3 rounded-xl transition-colors ${isActive ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400' : 'text-[var(--muted)] hover:bg-[var(--bg)] hover:text-[var(--text)]'}`}>
        <LayoutDashboard size={20} />
      </NavLink>

      <NavLink to="/settings" title={tr('settings')}
        className={({ isActive }) => `p-3 rounded-xl transition-colors ${isActive ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400' : 'text-[var(--muted)] hover:bg-[var(--bg)] hover:text-[var(--text)]'}`}>
        <Settings size={20} />
      </NavLink>

      <div className="mt-auto">
        <AvatarMenu />
      </div>
    </aside>
  )
}
