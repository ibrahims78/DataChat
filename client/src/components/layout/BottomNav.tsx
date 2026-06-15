import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Settings } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'
import { useT } from '../../i18n/translations'

export default function BottomNav() {
  const { user } = useAuth()
  const { lang } = useTheme()
  const tr = useT(lang)

  return (
    <nav className="md:hidden fixed bottom-0 start-0 end-0 bg-[var(--surface)] border-t border-[var(--border)] flex justify-around py-2 z-20">
      <NavLink to="/" end className={({ isActive }) => `flex flex-col items-center gap-1 px-6 py-1 rounded-lg text-xs transition-colors ${isActive ? 'text-primary-600' : 'text-[var(--muted)]'}`}>
        <LayoutDashboard size={22} />
        <span>{tr('dashboard')}</span>
      </NavLink>
      {user?.role === 'admin' && (
        <NavLink to="/settings" className={({ isActive }) => `flex flex-col items-center gap-1 px-6 py-1 rounded-lg text-xs transition-colors ${isActive ? 'text-primary-600' : 'text-[var(--muted)]'}`}>
          <Settings size={22} />
          <span>{tr('settings')}</span>
        </NavLink>
      )}
    </nav>
  )
}
