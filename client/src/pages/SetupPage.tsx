import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Database, Eye, EyeOff, Check } from 'lucide-react'
import api from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import toast from 'react-hot-toast'

export default function SetupPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const { login } = useAuth()

  useEffect(() => {
    api.get('/auth/setup-required').then(res => {
      if (!res.data.required) navigate('/')
    })
  }, [])

  const strength = password.length === 0 ? 0 : password.length < 6 ? 1 : password.length < 10 ? 2 : 3
  const strengthLabel = ['', 'ضعيفة', 'متوسطة', 'قوية']
  const strengthColor = ['', 'bg-red-500', 'bg-yellow-500', 'bg-green-500']

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirm) return toast.error('كلمتا المرور غير متطابقتين')
    if (password.length < 8) return toast.error('كلمة المرور يجب أن تكون 8 أحرف على الأقل')
    setLoading(true)
    try {
      await api.post('/auth/setup', { name, email, password })
      await login(email, password, false)
      toast.success('تم إنشاء الحساب بنجاح!')
      navigate('/')
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'حدث خطأ')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center p-4 font-cairo">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary-600 mb-4">
            <Database size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-[var(--text)]">إعداد DataChat</h1>
          <p className="text-[var(--muted)] mt-1">أنشئ حساب المدير للبدء</p>
        </div>

        <div className="card p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-[var(--text)] mb-1">الاسم الكامل</label>
              <input className="input-field" value={name} onChange={e => setName(e.target.value)} placeholder="أحمد محمد" required />
            </div>
            <div>
              <label className="block text-sm font-semibold text-[var(--text)] mb-1">البريد الإلكتروني</label>
              <input className="input-field" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="admin@company.com" required />
            </div>
            <div>
              <label className="block text-sm font-semibold text-[var(--text)] mb-1">كلمة المرور</label>
              <div className="relative">
                <input className="input-field pe-10" type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="8 أحرف على الأقل" required />
                <button type="button" onClick={() => setShowPw(!showPw)} className="absolute end-3 top-1/2 -translate-y-1/2 text-[var(--muted)]">
                  {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {password && (
                <div className="mt-2">
                  <div className="flex gap-1 mb-1">
                    {[1,2,3].map(i => <div key={i} className={`h-1.5 flex-1 rounded-full ${i <= strength ? strengthColor[strength] : 'bg-gray-200 dark:bg-gray-700'}`} />)}
                  </div>
                  <p className="text-xs text-[var(--muted)]">قوة كلمة المرور: {strengthLabel[strength]}</p>
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm font-semibold text-[var(--text)] mb-1">تأكيد كلمة المرور</label>
              <div className="relative">
                <input className="input-field pe-10" type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="أعد كتابة كلمة المرور" required />
                {confirm && (
                  <div className={`absolute end-3 top-1/2 -translate-y-1/2 ${confirm === password ? 'text-green-500' : 'text-red-500'}`}>
                    {confirm === password ? <Check size={18} /> : <span className="text-xs">✗</span>}
                  </div>
                )}
              </div>
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full py-3 text-base mt-2">
              {loading ? <span className="inline-block w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'إنشاء حساب المدير'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
