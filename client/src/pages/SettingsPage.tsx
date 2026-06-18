import { useState, useEffect } from 'react'
import { Users, BarChart3, Settings, User, Star, Plus, Trash2, Eye, EyeOff, Mail, CheckCircle, XCircle, Loader2, KeyRound } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useT } from '../i18n/translations'
import { useAuth } from '../contexts/AuthContext'
import api from '../lib/api'
import toast from 'react-hot-toast'
import ConfirmModal from '../components/ui/ConfirmModal'

type Tab = 'stats' | 'users' | 'ai' | 'profile' | 'ratings'

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>('stats')
  const [stats, setStats] = useState<any>(null)
  const [users, setUsers] = useState<any[]>([])
  const [aiSettings, setAiSettings] = useState<any>({ system_prompt: '', temperature: 0.7, model: 'gemini-2.5-flash', api_key: '' })
  const [showApiKey, setShowApiKey] = useState(false)
  const [apiKeyChanged, setApiKeyChanged] = useState(false)
  const [testingApi, setTestingApi] = useState(false)
  const [apiTestResult, setApiTestResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [ratings, setRatings] = useState<any[]>([])
  const [deleteUserTarget, setDeleteUserTarget] = useState<any>(null)
  const [showAddUser, setShowAddUser] = useState(false)
  const [showInvite, setShowInvite] = useState(false)
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '' })
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteLink, setInviteLink] = useState('')
  const [profile, setProfile] = useState({ name: '', email: '', currentPassword: '', newPassword: '' })
  const [showPw, setShowPw] = useState(false)
  const { lang, theme, toggleTheme, toggleLang } = useTheme()
  const tr = useT(lang)
  const { user, logout } = useAuth()

  useEffect(() => { fetchData() }, [tab])
  useEffect(() => {
    if (user) setProfile(p => ({ ...p, name: user.name, email: user.email }))
  }, [user])

  const fetchData = async () => {
    try {
      if (tab === 'stats') { const r = await api.get('/admin/stats'); setStats(r.data) }
      if (tab === 'users') { const r = await api.get('/admin/users'); setUsers(r.data) }
      if (tab === 'ai') { const r = await api.get('/admin/settings'); setAiSettings(r.data) }
      if (tab === 'ratings') { const r = await api.get('/admin/ratings'); setRatings(r.data) }
    } catch {}
  }

  const deleteUser = async () => {
    if (!deleteUserTarget) return
    try {
      await api.delete(`/admin/users/${deleteUserTarget.id}`)
      setDeleteUserTarget(null); fetchData()
      toast.success('تم حذف المستخدم')
    } catch (err: any) { toast.error(err.response?.data?.error || 'فشل الحذف') }
  }

  const addUser = async () => {
    try {
      await api.post('/admin/users', newUser)
      setShowAddUser(false); setNewUser({ name: '', email: '', password: '' })
      fetchData(); toast.success('تم إضافة الموظف')
    } catch (err: any) { toast.error(err.response?.data?.error || 'فشل الإضافة') }
  }

  const sendInvite = async () => {
    try {
      const r = await api.post('/admin/users/invite', { email: inviteEmail })
      setInviteLink(window.location.origin + r.data.inviteLink)
      toast.success('تم إنشاء رابط الدعوة')
    } catch { toast.error('فشل الإرسال') }
  }

  const saveAI = async () => {
    try {
      await api.patch('/admin/settings', aiSettings)
      setApiKeyChanged(false)
      toast.success('تم الحفظ')
    } catch { toast.error('فشل الحفظ') }
  }

  const testApiKey = async () => {
    setTestingApi(true)
    setApiTestResult(null)
    try {
      const r = await api.post('/admin/settings/test-api', { api_key: aiSettings.api_key })
      setApiTestResult({ ok: true, msg: r.data.message })
    } catch (err: any) {
      setApiTestResult({ ok: false, msg: err.response?.data?.error || 'فشل التحقق' })
    } finally {
      setTestingApi(false)
    }
  }

  const saveProfile = async () => {
    try {
      const r = await api.patch('/admin/profile', profile)
      toast.success('تم حفظ التغييرات')
    } catch (err: any) { toast.error(err.response?.data?.error || 'فشل الحفظ') }
  }

  const tabs: { id: Tab; icon: any; label: string }[] = [
    { id: 'stats', icon: BarChart3, label: tr('statistics') },
    { id: 'users', icon: Users, label: tr('users') },
    { id: 'ai', icon: Settings, label: tr('aiSettings') },
    { id: 'profile', icon: User, label: tr('profile') },
    { id: 'ratings', icon: Star, label: 'التقييمات' },
  ]

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto font-cairo">
      <h1 className="text-xl font-bold text-[var(--text)] mb-6">{tr('settings')}</h1>

      <div className="flex gap-1 mb-6 bg-[var(--surface)] p-1 rounded-xl overflow-x-auto border border-[var(--border)]">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap flex-1 justify-center
              ${tab === t.id ? 'bg-primary-600 text-white' : 'text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--bg)]'}`}>
            <t.icon size={16} />
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {tab === 'stats' && stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { icon: '👥', val: stats.activeUsers, label: tr('activeUsers'), color: 'bg-blue-500' },
            { icon: '🗂️', val: stats.totalProjects, label: tr('totalProjects'), color: 'bg-purple-500' },
            { icon: '📊', val: stats.generatedFiles, label: tr('generatedFilesCount'), color: 'bg-green-500' },
            { icon: '💬', val: stats.totalMessages, label: tr('totalMessages'), color: 'bg-orange-500' },
          ].map((s, i) => (
            <div key={i} className="card p-5">
              <div className={`w-10 h-10 rounded-xl ${s.color} flex items-center justify-center text-xl mb-3`}>{s.icon}</div>
              <p className="text-2xl font-bold text-[var(--text)]">{s.val?.toLocaleString()}</p>
              <p className="text-sm text-[var(--muted)]">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {tab === 'users' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-[var(--text)]">{tr('users')} ({users.length})</h2>
            <div className="flex gap-2">
              <button onClick={() => setShowInvite(true)} className="btn-ghost text-sm flex items-center gap-2"><Mail size={16} /> {tr('inviteByEmail')}</button>
              <button onClick={() => setShowAddUser(true)} className="btn-primary text-sm flex items-center gap-2"><Plus size={16} /> {tr('createDirectly')}</button>
            </div>
          </div>
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-[var(--border)]">
                <th className="text-start px-4 py-3 text-[var(--muted)] font-semibold">الاسم</th>
                <th className="text-start px-4 py-3 text-[var(--muted)] font-semibold hidden sm:table-cell">البريد</th>
                <th className="text-start px-4 py-3 text-[var(--muted)] font-semibold">الدور</th>
                <th className="px-4 py-3" />
              </tr></thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg)] transition-colors">
                    <td className="px-4 py-3 font-medium text-[var(--text)]">{u.name}</td>
                    <td className="px-4 py-3 text-[var(--muted)] hidden sm:table-cell">{u.email}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${u.role === 'admin' ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'}`}>
                        {u.role === 'admin' ? tr('admin') : tr('employee')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-end">
                      {u.role !== 'admin' && (
                        <button onClick={() => setDeleteUserTarget(u)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-[var(--muted)] hover:text-red-600 transition-colors">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {showAddUser && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowAddUser(false)}>
              <div className="card p-6 w-full max-w-md animate-fade-in" onClick={e => e.stopPropagation()}>
                <h3 className="font-bold text-lg text-[var(--text)] mb-4">إضافة موظف جديد</h3>
                <div className="space-y-3">
                  <input className="input-field" placeholder="الاسم الكامل" value={newUser.name} onChange={e => setNewUser(p => ({ ...p, name: e.target.value }))} />
                  <input className="input-field" type="email" placeholder="البريد الإلكتروني" value={newUser.email} onChange={e => setNewUser(p => ({ ...p, email: e.target.value }))} />
                  <input className="input-field" type="password" placeholder="كلمة مرور مبدئية" value={newUser.password} onChange={e => setNewUser(p => ({ ...p, password: e.target.value }))} />
                </div>
                <div className="flex gap-3 mt-4 justify-end">
                  <button onClick={() => setShowAddUser(false)} className="btn-ghost">{tr('cancel')}</button>
                  <button onClick={addUser} className="btn-primary">إضافة</button>
                </div>
              </div>
            </div>
          )}

          {showInvite && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => { setShowInvite(false); setInviteLink('') }}>
              <div className="card p-6 w-full max-w-md animate-fade-in" onClick={e => e.stopPropagation()}>
                <h3 className="font-bold text-lg text-[var(--text)] mb-4">دعوة موظف بالبريد</h3>
                {!inviteLink ? (
                  <>
                    <input className="input-field mb-4" type="email" placeholder="email@company.com" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} />
                    <div className="flex gap-3 justify-end">
                      <button onClick={() => setShowInvite(false)} className="btn-ghost">{tr('cancel')}</button>
                      <button onClick={sendInvite} className="btn-primary">إرسال رابط الدعوة</button>
                    </div>
                  </>
                ) : (
                  <div>
                    <p className="text-sm text-[var(--muted)] mb-2">رابط الدعوة (صالح 48 ساعة):</p>
                    <div className="bg-[var(--bg)] rounded-lg p-3 text-xs font-mono text-primary-600 break-all mb-4">{inviteLink}</div>
                    <button onClick={() => { navigator.clipboard.writeText(inviteLink); toast.success('تم النسخ!') }} className="btn-primary w-full">نسخ الرابط</button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'ai' && (
        <div className="card p-6 space-y-5">
          <h2 className="font-semibold text-[var(--text)]">{tr('aiSettings')}</h2>

          {/* API Key */}
          <div className="border border-[var(--border)] rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <KeyRound size={16} className="text-primary-600" />
              <label className="text-sm font-semibold text-[var(--text)]">مفتاح Gemini API</label>
              {aiSettings.has_api_key && !apiKeyChanged && (
                <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-full">محفوظ</span>
              )}
            </div>
            <div className="relative">
              <input
                className="input-field pe-20 font-mono text-sm"
                type={showApiKey ? 'text' : 'password'}
                placeholder="AIzaSy..."
                value={aiSettings.api_key}
                onChange={e => {
                  setAiSettings((p: any) => ({ ...p, api_key: e.target.value }))
                  setApiKeyChanged(true)
                  setApiTestResult(null)
                }}
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute end-3 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--text)] transition-colors"
              >
                {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={testApiKey}
                disabled={testingApi || !aiSettings.api_key}
                className="btn-ghost text-sm flex items-center gap-2 disabled:opacity-50"
              >
                {testingApi
                  ? <><Loader2 size={14} className="animate-spin" /> جاري التحقق...</>
                  : 'اختبار المفتاح'}
              </button>
              {apiTestResult && (
                <div className={`flex items-center gap-1.5 text-sm font-medium ${apiTestResult.ok ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  {apiTestResult.ok
                    ? <CheckCircle size={15} />
                    : <XCircle size={15} />}
                  {apiTestResult.msg}
                </div>
              )}
            </div>
            <p className="text-xs text-[var(--muted)]">
              احصل على مفتاحك من{' '}
              <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-primary-600 underline">Google AI Studio</a>.
              إذا تُرك فارغاً سيُستخدم المفتاح المضبوط في البيئة.
            </p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-[var(--text)] mb-2">نموذج Gemini</label>
            <select className="input-field" value={aiSettings.model} onChange={e => setAiSettings((p: any) => ({ ...p, model: e.target.value }))}>
              <option value="gemini-2.5-flash">Gemini 2.5 Flash (موصى به)</option>
              <option value="gemini-2.5-pro">Gemini 2.5 Pro (أعلى دقة)</option>
              <option value="gemini-flash-latest">Gemini Flash Latest</option>
              <option value="gemini-2.5-flash-lite">Gemini 2.5 Flash Lite (اقتصادي)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-[var(--text)] mb-2">{tr('systemPrompt')}</label>
            <textarea className="input-field" rows={5} value={aiSettings.system_prompt}
              onChange={e => setAiSettings((p: any) => ({ ...p, system_prompt: e.target.value }))}
              placeholder="أنت مساعد ذكي متخصص في تحليل البيانات..." />
          </div>
          <div>
            <label className="block text-sm font-semibold text-[var(--text)] mb-2">
              {tr('temperature')}: {aiSettings.temperature}
            </label>
            <input type="range" min="0" max="1" step="0.1" value={aiSettings.temperature}
              onChange={e => setAiSettings((p: any) => ({ ...p, temperature: parseFloat(e.target.value) }))}
              className="w-full accent-primary-600" />
            <div className="flex justify-between text-xs text-[var(--muted)] mt-1">
              <span>دقيق (0)</span><span>متوازن (0.5)</span><span>إبداعي (1)</span>
            </div>
          </div>
          <button onClick={saveAI} className="btn-primary">{tr('save')}</button>
        </div>
      )}

      {tab === 'profile' && (
        <div className="max-w-lg">
          <div className="card p-6 space-y-4 mb-4">
            <h2 className="font-semibold text-[var(--text)]">{tr('profile')}</h2>
            <div>
              <label className="block text-sm font-semibold text-[var(--text)] mb-1">الاسم</label>
              <input className="input-field" value={profile.name} onChange={e => setProfile(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-semibold text-[var(--text)] mb-1">البريد الإلكتروني</label>
              <input className="input-field" type="email" value={profile.email} onChange={e => setProfile(p => ({ ...p, email: e.target.value }))} />
            </div>
            <div className="border-t border-[var(--border)] pt-4">
              <h3 className="font-semibold text-sm text-[var(--text)] mb-3">تغيير كلمة المرور (اختياري)</h3>
              <div className="space-y-3">
                <input className="input-field" type="password" placeholder="كلمة المرور الحالية" value={profile.currentPassword} onChange={e => setProfile(p => ({ ...p, currentPassword: e.target.value }))} />
                <div className="relative">
                  <input className="input-field pe-10" type={showPw ? 'text' : 'password'} placeholder="كلمة المرور الجديدة" value={profile.newPassword} onChange={e => setProfile(p => ({ ...p, newPassword: e.target.value }))} />
                  <button type="button" onClick={() => setShowPw(!showPw)} className="absolute end-3 top-1/2 -translate-y-1/2 text-[var(--muted)]">
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            </div>
            <button onClick={saveProfile} className="btn-primary">{tr('save')}</button>
          </div>
          <div className="card p-6">
            <h3 className="font-semibold text-[var(--text)] mb-2">المظهر واللغة</h3>
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-[var(--text)]">{tr('language')}</span>
                <button onClick={toggleLang} className="btn-ghost text-sm px-4">{lang === 'ar' ? 'English' : 'العربية'}</button>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-[var(--text)]">{theme === 'dark' ? tr('lightMode') : tr('darkMode')}</span>
                <button onClick={toggleTheme} className="btn-ghost text-sm px-4">{theme === 'dark' ? '☀️ نهاري' : '🌙 ليلي'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'ratings' && (
        <div>
          <h2 className="font-semibold text-[var(--text)] mb-4">تقييمات ردود الذكاء الاصطناعي</h2>
          {ratings.length === 0 ? (
            <div className="card p-12 text-center">
              <p className="text-[var(--muted)]">لا توجد تقييمات بعد</p>
            </div>
          ) : ratings.map(r => (
            <div key={r.id} className="card p-4 mb-3">
              <div className="flex items-center justify-between mb-2">
                <span className={`text-lg ${r.rating === 1 ? '👍' : '👎'}`}>{r.rating === 1 ? '👍' : '👎'}</span>
                <div className="text-xs text-[var(--muted)]">{r.user_name} — {r.project_name}</div>
              </div>
              <p className="text-sm text-[var(--text)] line-clamp-3">{r.content}</p>
              {r.rating_comment && <p className="text-xs text-[var(--muted)] mt-2 bg-[var(--bg)] rounded-lg px-3 py-2">{r.rating_comment}</p>}
            </div>
          ))}
        </div>
      )}

      <ConfirmModal
        open={!!deleteUserTarget}
        title="حذف المستخدم"
        icon="👤"
        danger
        description={`هل تريد حذف المستخدم "${deleteUserTarget?.name}"؟\nسيتم حذف جميع مشاريعه ومحادثاته.`}
        confirmLabel="حذف نهائي"
        onCancel={() => setDeleteUserTarget(null)}
        onConfirm={deleteUser}
      />
    </div>
  )
}
