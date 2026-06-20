import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Eye, EyeOff, Loader2, CheckCircle, XCircle } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import api from '../lib/api'
import toast from 'react-hot-toast'

export default function RegisterPage() {
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const navigate = useNavigate()
  const { setSession } = useAuth()

  const [email, setEmail] = useState('')
  const [tokenStatus, setTokenStatus] = useState<'loading' | 'valid' | 'invalid'>('loading')
  const [tokenError, setTokenError] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!token) {
      setTokenStatus('invalid')
      setTokenError('رابط الدعوة مفقود أو غير صحيح')
      return
    }
    api.get(`/auth/invite/${token}`)
      .then(r => { setEmail(r.data.email); setTokenStatus('valid') })
      .catch(err => { setTokenStatus('invalid'); setTokenError(err.response?.data?.error || 'رابط غير صالح') })
  }, [token])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return toast.error('أدخل اسمك')
    if (password.length < 6) return toast.error('كلمة المرور يجب أن تكون 6 أحرف على الأقل')
    setSubmitting(true)
    try {
      const r = await api.post('/auth/register', { token, name, password })
      setSession(r.data.token, r.data.user)
      toast.success('مرحباً بك! تم إنشاء حسابك بنجاح')
      navigate('/')
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'حدث خطأ')
    } finally { setSubmitting(false) }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg)] font-cairo px-4" dir="rtl">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-2">
            <div className="w-10 h-10 bg-primary-600 rounded-xl flex items-center justify-center text-white text-lg">
              🗄️
            </div>
            <span className="text-2xl font-bold text-[var(--text)]">DataChat</span>
          </div>
          <p className="text-[var(--muted)] text-sm">المحلل الذكي للبيانات</p>
        </div>

        <div className="card p-8">
          {tokenStatus === 'loading' && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 size={32} className="animate-spin text-primary-600" />
              <p className="text-[var(--muted)]">جاري التحقق من رابط الدعوة...</p>
            </div>
          )}

          {tokenStatus === 'invalid' && (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <div className="w-14 h-14 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
                <XCircle size={28} className="text-red-500" />
              </div>
              <div>
                <h2 className="font-bold text-[var(--text)] mb-1">رابط الدعوة غير صالح</h2>
                <p className="text-sm text-[var(--muted)]">{tokenError}</p>
              </div>
              <button onClick={() => navigate('/login')} className="btn-ghost text-sm mt-2">
                العودة لتسجيل الدخول
              </button>
            </div>
          )}

          {tokenStatus === 'valid' && (
            <>
              <div className="flex items-center gap-2 mb-6">
                <div className="w-8 h-8 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                  <CheckCircle size={16} className="text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <h1 className="font-bold text-[var(--text)] text-lg">إنشاء حساب جديد</h1>
                  <p className="text-xs text-[var(--muted)]">دُعيت للانضمام إلى DataChat</p>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Email (readonly) */}
                <div>
                  <label className="block text-sm font-semibold text-[var(--text)] mb-1">
                    البريد الإلكتروني
                  </label>
                  <input
                    className="input-field bg-[var(--hover)] text-[var(--muted)] cursor-not-allowed"
                    type="email"
                    value={email}
                    readOnly
                  />
                </div>

                {/* Name */}
                <div>
                  <label className="block text-sm font-semibold text-[var(--text)] mb-1">
                    الاسم الكامل <span className="text-red-500">*</span>
                  </label>
                  <input
                    className="input-field"
                    type="text"
                    placeholder="أدخل اسمك"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    autoFocus
                  />
                </div>

                {/* Password */}
                <div>
                  <label className="block text-sm font-semibold text-[var(--text)] mb-1">
                    كلمة المرور <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      className="input-field pe-10"
                      type={showPw ? 'text' : 'password'}
                      placeholder="6 أحرف على الأقل"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw(!showPw)}
                      className="absolute end-3 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--text)] transition-colors"
                    >
                      {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="btn-primary w-full mt-2 flex items-center justify-center gap-2"
                >
                  {submitting
                    ? <><Loader2 size={16} className="animate-spin" /> جاري الإنشاء...</>
                    : 'إنشاء الحساب والدخول'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
