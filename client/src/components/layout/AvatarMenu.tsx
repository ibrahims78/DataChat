import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogOut, User, Sun, Moon, Globe, KeyRound, Eye, EyeOff, X } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'
import { useT } from '../../i18n/translations'
import api from '../../lib/api'
import toast from 'react-hot-toast'

export default function AvatarMenu() {
  const [open, setOpen] = useState(false)
  const [showChangePw, setShowChangePw] = useState(false)
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' })
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNext, setShowNext] = useState(false)
  const [saving, setSaving] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const { user, logout } = useAuth()
  const { theme, lang, toggleTheme, toggleLang } = useTheme()
  const tr = useT(lang)
  const navigate = useNavigate()

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleLogout = () => { logout(); navigate('/login') }

  const openChangePw = () => {
    setOpen(false)
    setPwForm({ current: '', next: '', confirm: '' })
    setShowChangePw(true)
  }

  const handleChangePw = async () => {
    if (!pwForm.current) return toast.error('أدخل كلمة المرور الحالية')
    if (pwForm.next.length < 8) return toast.error('كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل')
    if (pwForm.next !== pwForm.confirm) return toast.error('كلمتا المرور غير متطابقتين')
    setSaving(true)
    try {
      await api.post('/auth/change-password', { currentPassword: pwForm.current, newPassword: pwForm.next })
      toast.success('تم تغيير كلمة المرور بنجاح')
      setShowChangePw(false)
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'فشل تغيير كلمة المرور')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="relative" ref={ref}>
        <button
          onClick={() => setOpen(!open)}
          className="w-9 h-9 rounded-full bg-primary-600 flex items-center justify-center text-white font-semibold text-sm hover:bg-primary-700 transition-colors"
        >
          {user?.name?.charAt(0)?.toUpperCase() || 'U'}
        </button>

        {open && (
          <div className={`absolute ${lang === 'ar' ? 'right-0' : 'left-0'} bottom-12 w-56 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-lg py-2 z-50 animate-fade-in`}>
            <div className="px-4 py-2 border-b border-[var(--border)]">
              <p className="font-semibold text-sm text-[var(--text)]">{user?.name}</p>
              <p className="text-xs text-[var(--muted)]">{user?.email}</p>
              <span className="text-xs text-primary-600 dark:text-primary-400 font-medium">
                {user?.role === 'admin' ? 'مدير' : 'موظف'}
              </span>
            </div>

            {user?.role === 'admin' && (
              <button
                onClick={() => { navigate('/settings'); setOpen(false) }}
                className="w-full flex items-center gap-3 px-4 py-2 text-sm text-[var(--text)] hover:bg-[var(--bg)] transition-colors"
              >
                <User size={16} />
                <span>{tr('profile')}</span>
              </button>
            )}

            <button
              onClick={openChangePw}
              className="w-full flex items-center gap-3 px-4 py-2 text-sm text-[var(--text)] hover:bg-[var(--bg)] transition-colors"
            >
              <KeyRound size={16} />
              <span>تغيير كلمة المرور</span>
            </button>

            <div className="border-t border-[var(--border)] mt-1 pt-1">
              <button
                onClick={toggleLang}
                className="w-full flex items-center gap-3 px-4 py-2 text-sm text-[var(--text)] hover:bg-[var(--bg)] transition-colors"
              >
                <Globe size={16} />
                <span>{lang === 'ar' ? 'English' : 'العربية'}</span>
              </button>
              <button
                onClick={toggleTheme}
                className="w-full flex items-center gap-3 px-4 py-2 text-sm text-[var(--text)] hover:bg-[var(--bg)] transition-colors"
              >
                {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
                <span>{theme === 'dark' ? tr('lightMode') : tr('darkMode')}</span>
              </button>
            </div>

            <div className="border-t border-[var(--border)] mt-1 pt-1">
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                <LogOut size={16} />
                <span>{tr('logout')}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Change Password Modal ── */}
      {showChangePw && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowChangePw(false)}
        >
          <div
            className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-xl w-full max-w-sm animate-fade-in"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-[var(--border)]">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                  <KeyRound size={15} className="text-primary-600" />
                </div>
                <h2 className="font-bold text-[var(--text)]">تغيير كلمة المرور</h2>
              </div>
              <button
                onClick={() => setShowChangePw(false)}
                className="p-1.5 rounded-lg hover:bg-[var(--bg)] text-[var(--muted)] transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div className="px-5 py-4 space-y-4">
              {/* Current password */}
              <div>
                <label className="block text-sm font-semibold text-[var(--text)] mb-1.5">
                  كلمة المرور الحالية
                </label>
                <div className="relative">
                  <input
                    className="input-field pe-10"
                    type={showCurrent ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={pwForm.current}
                    onChange={e => setPwForm(p => ({ ...p, current: e.target.value }))}
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrent(!showCurrent)}
                    className="absolute end-3 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--text)] transition-colors"
                  >
                    {showCurrent ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              {/* New password */}
              <div>
                <label className="block text-sm font-semibold text-[var(--text)] mb-1.5">
                  كلمة المرور الجديدة
                </label>
                <div className="relative">
                  <input
                    className="input-field pe-10"
                    type={showNext ? 'text' : 'password'}
                    placeholder="8 أحرف على الأقل"
                    value={pwForm.next}
                    onChange={e => setPwForm(p => ({ ...p, next: e.target.value }))}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNext(!showNext)}
                    className="absolute end-3 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--text)] transition-colors"
                  >
                    {showNext ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                {pwForm.next && pwForm.next.length < 8 && (
                  <p className="text-xs text-red-500 mt-1">8 أحرف على الأقل</p>
                )}
              </div>

              {/* Confirm new password */}
              <div>
                <label className="block text-sm font-semibold text-[var(--text)] mb-1.5">
                  تأكيد كلمة المرور الجديدة
                </label>
                <input
                  className="input-field"
                  type="password"
                  placeholder="أعد كتابة كلمة المرور"
                  value={pwForm.confirm}
                  onChange={e => setPwForm(p => ({ ...p, confirm: e.target.value }))}
                  autoComplete="new-password"
                />
                {pwForm.confirm && pwForm.next !== pwForm.confirm && (
                  <p className="text-xs text-red-500 mt-1">كلمتا المرور غير متطابقتين</p>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex gap-3 px-5 pb-5 justify-end">
              <button
                onClick={() => setShowChangePw(false)}
                className="btn-ghost"
                disabled={saving}
              >
                إلغاء
              </button>
              <button
                onClick={handleChangePw}
                disabled={saving}
                className="btn-primary flex items-center gap-2 disabled:opacity-60"
              >
                {saving ? (
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <KeyRound size={14} />
                )}
                حفظ كلمة المرور
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
