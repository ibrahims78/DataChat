import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Eye, EyeOff, Loader2, CheckCircle, XCircle, KeyRound } from 'lucide-react'
import api from '../lib/api'
import toast from 'react-hot-toast'

const strengthColor: Record<number, string> = { 1: 'bg-red-400', 2: 'bg-yellow-400', 3: 'bg-green-500' }
const strengthLabel: Record<number, string> = { 0: '', 1: 'ضعيفة', 2: 'متوسطة', 3: 'قوية' }

export default function ResetPasswordPage() {
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const navigate = useNavigate()

  const [tokenStatus, setTokenStatus] = useState<'loading' | 'valid' | 'invalid'>('loading')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  const strength = password.length === 0 ? 0 : password.length < 6 ? 1 : password.length < 10 ? 2 : 3

  useEffect(() => {
    if (!token) {
      setTokenStatus('invalid')
      return
    }
    api.post('/auth/verify-reset-token', { token })
      .then(() => setTokenStatus('valid'))
      .catch(() => setTokenStatus('invalid'))
  }, [token])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < 8) return toast.error('كلمة المرور يجب أن تكون 8 أحرف على الأقل')
    if (password !== confirm) return toast.error('كلمتا المرور غير متطابقتين')
    setSubmitting(true)
    try {
      await api.post('/auth/reset-password', { token, password })
      setDone(true)
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'حدث خطأ، يرجى طلب رابط جديد')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg)] font-cairo px-4" dir="rtl">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-2">
            <div className="w-10 h-10 bg-primary-600 rounded-xl flex items-center justify-center text-white">
              <KeyRound size={20} />
            </div>
            <span className="text-2xl font-bold text-[var(--text)]">DataChat</span>
          </div>
          <p className="text-[var(--muted)] text-sm">إعادة تعيين كلمة المرور</p>
        </div>

        <div className="card p-8">
          {tokenStatus === 'loading' && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 size={32} className="animate-spin text-primary-600" />
              <p className="text-[var(--muted)]">جاري التحقق من الرابط...</p>
            </div>
          )}

          {tokenStatus === 'invalid' && (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <div className="w-14 h-14 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
                <XCircle size={28} className="text-red-500" />
              </div>
              <div>
                <h2 className="font-bold text-[var(--text)] mb-1">رابط غير صالح أو منتهي</h2>
                <p className="text-sm text-[var(--muted)]">هذا الرابط غير صالح أو انتهت صلاحيته (ساعة واحدة)</p>
              </div>
              <button onClick={() => navigate('/login')} className="btn-primary mt-2">
                طلب رابط جديد
              </button>
            </div>
          )}

          {tokenStatus === 'valid' && !done && (
            <>
              <div className="flex items-center gap-2 mb-6">
                <div className="w-8 h-8 bg-primary-100 dark:bg-primary-900/30 rounded-full flex items-center justify-center">
                  <KeyRound size={16} className="text-primary-600" />
                </div>
                <div>
                  <h1 className="font-bold text-[var(--text)] text-lg">كلمة مرور جديدة</h1>
                  <p className="text-xs text-[var(--muted)]">اختر كلمة مرور قوية لحسابك</p>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-[var(--text)] mb-1">
                    كلمة المرور الجديدة <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      className="input-field pe-10"
                      type={showPw ? 'text' : 'password'}
                      placeholder="8 أحرف على الأقل"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw(!showPw)}
                      className="absolute end-3 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--text)] transition-colors"
                    >
                      {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {password && (
                    <div className="mt-2">
                      <div className="flex gap-1 mb-1">
                        {[1, 2, 3].map(i => (
                          <div key={i} className={`h-1.5 flex-1 rounded-full ${i <= strength ? strengthColor[strength] : 'bg-gray-200 dark:bg-gray-700'}`} />
                        ))}
                      </div>
                      <p className="text-xs text-[var(--muted)]">قوة كلمة المرور: {strengthLabel[strength]}</p>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-[var(--text)] mb-1">
                    تأكيد كلمة المرور <span className="text-red-500">*</span>
                  </label>
                  <input
                    className="input-field"
                    type="password"
                    placeholder="أعد كتابة كلمة المرور"
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                  />
                  {confirm && confirm !== password && (
                    <p className="text-xs text-red-500 mt-1">كلمتا المرور غير متطابقتين</p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="btn-primary w-full py-3 text-base mt-2 flex items-center justify-center gap-2"
                >
                  {submitting
                    ? <><Loader2 size={16} className="animate-spin" /> جاري الحفظ...</>
                    : <><KeyRound size={16} /> تعيين كلمة المرور</>
                  }
                </button>
              </form>
            </>
          )}

          {done && (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <div className="w-14 h-14 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                <CheckCircle size={28} className="text-green-600 dark:text-green-400" />
              </div>
              <div>
                <h2 className="font-bold text-[var(--text)] mb-1">تم تعيين كلمة المرور</h2>
                <p className="text-sm text-[var(--muted)]">يمكنك الآن تسجيل الدخول بكلمة المرور الجديدة</p>
              </div>
              <button onClick={() => navigate('/login')} className="btn-primary mt-2">
                تسجيل الدخول
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
