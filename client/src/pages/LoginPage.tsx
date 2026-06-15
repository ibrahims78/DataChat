import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Database, Eye, EyeOff } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { useT } from '../i18n/translations'
import api from '../lib/api'
import toast from 'react-hot-toast'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(false)
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [showForgot, setShowForgot] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotSent, setForgotSent] = useState(false)
  const navigate = useNavigate()
  const { login, user } = useAuth()
  const { lang, theme, toggleTheme, toggleLang } = useTheme()
  const tr = useT(lang)

  useEffect(() => {
    if (user) navigate('/')
    api.get('/auth/setup-required').then(r => { if (r.data.required) navigate('/setup') })
  }, [user])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await login(email, password, remember)
      toast.success(tr('loginSuccess'))
      navigate('/')
    } catch {
      toast.error(tr('loginError'))
    } finally {
      setLoading(false)
    }
  }

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await api.post('/auth/forgot-password', { email: forgotEmail })
      setForgotSent(true)
    } catch {
      toast.error('حدث خطأ')
    }
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center p-4 font-cairo">
      <div className="absolute top-4 end-4 flex gap-2">
        <button onClick={toggleLang} className="btn-ghost text-sm">{lang === 'ar' ? 'EN' : 'ع'}</button>
        <button onClick={toggleTheme} className="btn-ghost text-sm">{theme === 'dark' ? '☀️' : '🌙'}</button>
      </div>

      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-xl bg-primary-600 flex items-center justify-center">
              <Database size={24} className="text-white" />
            </div>
            <span className="text-2xl font-bold text-[var(--text)]">{tr('appName')}</span>
          </div>
          <p className="text-[var(--muted)] text-sm">{tr('appTagline')}</p>
        </div>

        <div className="card p-6">
          {!showForgot ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-[var(--text)] mb-1">{tr('email')}</label>
                <input className="input-field" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" required autoFocus />
              </div>
              <div>
                <label className="block text-sm font-semibold text-[var(--text)] mb-1">{tr('password')}</label>
                <div className="relative">
                  <input className="input-field pe-10" type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required />
                  <button type="button" onClick={() => setShowPw(!showPw)} className="absolute end-3 top-1/2 -translate-y-1/2 text-[var(--muted)]">
                    {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm text-[var(--text)] cursor-pointer">
                  <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} className="rounded" />
                  {tr('rememberMe')}
                </label>
                <button type="button" onClick={() => setShowForgot(true)} className="text-sm text-primary-600 hover:underline">{tr('forgotPassword')}</button>
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full py-3">
                {loading ? <span className="inline-block w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : tr('login')}
              </button>
            </form>
          ) : forgotSent ? (
            <div className="text-center py-4">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3"><span className="text-2xl">✅</span></div>
              <p className="font-semibold text-[var(--text)]">تم الإرسال</p>
              <p className="text-sm text-[var(--muted)] mt-1">راجع بريدك الإلكتروني — الرابط صالح لمدة ساعة</p>
              <button onClick={() => { setShowForgot(false); setForgotSent(false) }} className="btn-ghost mt-4 text-sm">{tr('back')}</button>
            </div>
          ) : (
            <form onSubmit={handleForgot} className="space-y-4">
              <h3 className="font-semibold text-[var(--text)]">استرداد كلمة المرور</h3>
              <p className="text-sm text-[var(--muted)]">أدخل بريدك لإرسال رابط الاسترداد</p>
              <input className="input-field" type="email" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} placeholder="you@company.com" required />
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowForgot(false)} className="btn-ghost flex-1">{tr('cancel')}</button>
                <button type="submit" className="btn-primary flex-1">إرسال الرابط</button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
