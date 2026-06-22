import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Database, Eye, EyeOff, Check, KeyRound, ChevronRight, Loader2, CheckCircle, XCircle, Sparkles } from 'lucide-react'
import api from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import toast from 'react-hot-toast'

export default function SetupPage() {
  // Step 1 — Admin account
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPw, setShowPw] = useState(false)

  // Step 2 — AI settings
  const [provider, setProvider] = useState<'gemini' | 'openai'>('gemini')
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [model, setModel] = useState('gemini-2.5-flash')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [savingAI, setSavingAI] = useState(false)

  const [step, setStep] = useState<1 | 2>(1)
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

  const handleStep1 = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirm) return toast.error('كلمتا المرور غير متطابقتين')
    if (password.length < 8) return toast.error('كلمة المرور يجب أن تكون 8 أحرف على الأقل')
    setLoading(true)
    try {
      await api.post('/auth/setup', { name, email, password })
      await login(email, password, false)
      toast.success('تم إنشاء حساب المدير بنجاح!')
      setStep(2)
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'حدث خطأ')
    } finally {
      setLoading(false)
    }
  }

  const testKey = async () => {
    if (!apiKey.trim()) return toast.error('أدخل المفتاح أولاً')
    setTesting(true)
    setTestResult(null)
    try {
      const r = await api.post('/admin/ai-settings/test', { api_key: apiKey.trim(), provider })
      setTestResult({ ok: true, msg: r.data.message || 'المفتاح صالح ✅' })
    } catch (err: any) {
      setTestResult({ ok: false, msg: err.response?.data?.error || 'مفتاح غير صالح' })
    } finally { setTesting(false) }
  }

  const handleStep2 = async () => {
    setSavingAI(true)
    try {
      await api.post('/admin/ai-settings', {
        provider,
        api_key: apiKey.trim() || undefined,
        model,
        temperature: 0.7,
        system_prompt: 'أنت مساعد ذكي متخصص في تحليل البيانات.',
      })
      toast.success('تم حفظ إعدادات AI')
      navigate('/settings')
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'فشل الحفظ')
    } finally { setSavingAI(false) }
  }

  const skipStep2 = () => {
    navigate('/')
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center p-4 font-cairo">
      <div className="w-full max-w-lg">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary-600 mb-4 shadow-lg">
            <Database size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-[var(--text)]">إعداد DataChat</h1>
          <p className="text-[var(--muted)] mt-1">
            {step === 1 ? 'أنشئ حساب المدير للبدء' : 'أضف مفتاح AI للبدء في استخدام المنصة'}
          </p>
        </div>

        {/* Steps indicator */}
        <div className="flex items-center justify-center gap-3 mb-8">
          {[
            { n: 1, label: 'حساب المدير' },
            { n: 2, label: 'إعدادات AI' },
          ].map((s, i) => (
            <div key={s.n} className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                  step > s.n ? 'bg-green-500 text-white' :
                  step === s.n ? 'bg-primary-600 text-white' :
                  'bg-[var(--border)] text-[var(--muted)]'
                }`}>
                  {step > s.n ? <Check size={14} /> : s.n}
                </div>
                <span className={`text-sm font-medium hidden sm:block ${step === s.n ? 'text-primary-600' : 'text-[var(--muted)]'}`}>{s.label}</span>
              </div>
              {i < 1 && <ChevronRight size={16} className="text-[var(--muted)]" />}
            </div>
          ))}
        </div>

        {/* ── Step 1: Admin Account ── */}
        {step === 1 && (
          <div className="card p-6">
            <form onSubmit={handleStep1} className="space-y-4">
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
              <button type="submit" disabled={loading} className="btn-primary w-full py-3 text-base mt-2 flex items-center justify-center gap-2">
                {loading ? <><Loader2 size={18} className="animate-spin" /> جاري الإنشاء...</> : <>إنشاء حساب المدير <ChevronRight size={16} /></>}
              </button>
            </form>
          </div>
        )}

        {/* ── Step 2: AI Settings ── */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="card p-6 space-y-5">

              {/* Info banner */}
              <div className="flex items-start gap-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3">
                <Sparkles size={18} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="text-sm text-amber-700 dark:text-amber-300">
                  <p className="font-semibold mb-0.5">مفتاح API مطلوب</p>
                  <p className="text-xs">لا يعمل DataChat بدون مفتاح API للذكاء الاصطناعي. يمكنك تغييره لاحقاً من الإعدادات.</p>
                </div>
              </div>

              {/* Provider */}
              <div>
                <label className="block text-sm font-semibold text-[var(--text)] mb-2">مزوّد الذكاء الاصطناعي</label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { id: 'gemini', label: 'Google Gemini', badge: 'مجاني ومُوصى به', icon: '🤖' },
                    { id: 'openai', label: 'OpenAI', badge: 'GPT-4o / o1', icon: '🟢' },
                  ].map(p => (
                    <button key={p.id} type="button"
                      onClick={() => { setProvider(p.id as any); setModel(p.id === 'gemini' ? 'gemini-2.5-flash' : 'gpt-4o-mini'); setTestResult(null) }}
                      className={`flex items-center gap-3 p-3 rounded-xl border-2 text-start transition-all ${provider === p.id ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'border-[var(--border)] hover:border-primary-300'}`}>
                      <span className="text-2xl">{p.icon}</span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[var(--text)]">{p.label}</p>
                        <p className="text-xs text-[var(--muted)]">{p.badge}</p>
                      </div>
                      {provider === p.id && <CheckCircle size={16} className="text-primary-600 shrink-0 ms-auto" />}
                    </button>
                  ))}
                </div>
              </div>

              {/* API Key */}
              <div>
                <label className="block text-sm font-semibold text-[var(--text)] mb-2 flex items-center gap-2">
                  <KeyRound size={15} className="text-primary-600" />
                  {provider === 'openai' ? 'مفتاح OpenAI API' : 'مفتاح Gemini API'}
                </label>
                <div className="relative">
                  <input
                    className="input-field pe-10 font-mono text-sm"
                    type={showKey ? 'text' : 'password'}
                    placeholder={provider === 'openai' ? 'sk-...' : 'AIzaSy...'}
                    value={apiKey}
                    onChange={e => { setApiKey(e.target.value); setTestResult(null) }}
                    dir="ltr"
                  />
                  <button type="button" onClick={() => setShowKey(!showKey)} className="absolute end-3 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--text)]">
                    {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <p className="text-xs text-[var(--muted)] mt-1.5">
                  {provider === 'openai'
                    ? <><a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer" className="text-primary-600 underline">platform.openai.com/api-keys</a> — المفتاح يبدأ بـ sk-</>
                    : <><a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="text-primary-600 underline">Google AI Studio</a> — مجاني للاستخدام الشخصي</>}
                </p>
              </div>

              {/* Model */}
              <div>
                <label className="block text-sm font-semibold text-[var(--text)] mb-2">
                  {provider === 'openai' ? 'نموذج OpenAI' : 'نموذج Gemini'}
                </label>
                {provider === 'openai' ? (
                  <select className="input-field" value={model} onChange={e => setModel(e.target.value)}>
                    <option value="gpt-4o-mini">GPT-4o Mini (موصى به — سريع واقتصادي)</option>
                    <option value="gpt-4o">GPT-4o (الأقوى)</option>
                    <option value="gpt-4-turbo">GPT-4 Turbo</option>
                    <option value="gpt-3.5-turbo">GPT-3.5 Turbo (اقتصادي)</option>
                  </select>
                ) : (
                  <select className="input-field" value={model} onChange={e => setModel(e.target.value)}>
                    <option value="gemini-2.5-flash">Gemini 2.5 Flash (موصى به)</option>
                    <option value="gemini-2.5-pro">Gemini 2.5 Pro (أعلى دقة)</option>
                    <option value="gemini-flash-latest">Gemini Flash Latest</option>
                    <option value="gemini-2.5-flash-lite">Gemini 2.5 Flash Lite (اقتصادي)</option>
                  </select>
                )}
              </div>

              {/* Test result */}
              {testResult && (
                <div className={`flex items-center gap-2 text-sm font-medium px-3 py-2 rounded-lg ${testResult.ok ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'}`}>
                  {testResult.ok ? <CheckCircle size={16} /> : <XCircle size={16} />}
                  {testResult.msg}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 flex-wrap">
                <button onClick={testKey} disabled={testing || !apiKey.trim()} className="btn-ghost flex items-center gap-2 text-sm disabled:opacity-50">
                  {testing ? <><Loader2 size={14} className="animate-spin" /> جاري الاختبار...</> : 'اختبار المفتاح'}
                </button>
                <button onClick={handleStep2} disabled={savingAI} className="btn-primary flex items-center gap-2 flex-1 justify-center disabled:opacity-50">
                  {savingAI ? <><Loader2 size={15} className="animate-spin" /> جاري الحفظ...</> : <>حفظ والمتابعة <ChevronRight size={15} /></>}
                </button>
              </div>
            </div>

            <button onClick={skipStep2} className="w-full text-center text-sm text-[var(--muted)] hover:text-[var(--text)] py-2 transition-colors">
              تخطي الآن — سأضيف المفتاح لاحقاً من الإعدادات
            </button>
          </div>
        )}

      </div>
    </div>
  )
}
