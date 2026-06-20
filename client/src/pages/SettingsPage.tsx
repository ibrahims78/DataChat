import { useState, useEffect } from 'react'
import { Users, BarChart3, Settings, User, Star, Plus, Trash2, Eye, EyeOff, Mail, CheckCircle, XCircle, Loader2, KeyRound, Pencil, ShieldCheck, UserCheck, UserX } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useT } from '../i18n/translations'
import { useAuth } from '../contexts/AuthContext'
import api from '../lib/api'
import toast from 'react-hot-toast'
import ConfirmModal from '../components/ui/ConfirmModal'

type Tab = 'stats' | 'users' | 'ai' | 'email' | 'profile' | 'ratings'

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>('stats')
  const [stats, setStats] = useState<any>(null)
  const [users, setUsers] = useState<any[]>([])
  const [aiSettings, setAiSettings] = useState<any>({ system_prompt: '', temperature: 0.7, model: 'gemini-2.5-flash', api_key: '', provider: 'gemini' })
  const [showApiKey, setShowApiKey] = useState(false)
  const [apiKeyChanged, setApiKeyChanged] = useState(false)
  const [testingApi, setTestingApi] = useState(false)
  const [apiTestResult, setApiTestResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [emailSettings, setEmailSettings] = useState({ smtp_user: '', smtp_pass: '', has_smtp: false })
  const [showSmtpPass, setShowSmtpPass] = useState(false)
  const [smtpPassChanged, setSmtpPassChanged] = useState(false)
  const [testingEmail, setTestingEmail] = useState(false)
  const [emailTestResult, setEmailTestResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [ratings, setRatings] = useState<any[]>([])
  const [deleteUserTarget, setDeleteUserTarget] = useState<any>(null)
  const [editUserTarget, setEditUserTarget] = useState<any>(null)
  const [editForm, setEditForm] = useState({ name: '', email: '', role: 'employee', is_active: true, newPassword: '', showNewPw: false })
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
      if (tab === 'email') { const r = await api.get('/admin/email-settings'); setEmailSettings(r.data); setSmtpPassChanged(false) }
      if (tab === 'ratings') { const r = await api.get('/admin/ratings'); setRatings(r.data) }
    } catch {}
  }

  const saveEmail = async () => {
    try {
      await api.patch('/admin/email-settings', emailSettings)
      setSmtpPassChanged(false)
      toast.success('تم حفظ إعدادات البريد')
      fetchData()
    } catch { toast.error('فشل الحفظ') }
  }

  const testEmail = async () => {
    setTestingEmail(true)
    setEmailTestResult(null)
    try {
      const r = await api.post('/admin/email-settings/test', emailSettings)
      setEmailTestResult({ ok: true, msg: r.data.message })
    } catch (err: any) {
      setEmailTestResult({ ok: false, msg: err.response?.data?.error || 'فشل الاتصال' })
    } finally { setTestingEmail(false) }
  }

  const openEditUser = (u: any) => {
    setEditUserTarget(u)
    setEditForm({ name: u.name, email: u.email, role: u.role, is_active: u.is_active ?? true, newPassword: '', showNewPw: false })
  }

  const saveEditUser = async () => {
    if (!editUserTarget) return
    if (!editForm.name.trim()) return toast.error('الاسم مطلوب')
    if (!editForm.email.trim()) return toast.error('البريد مطلوب')
    if (editForm.newPassword && editForm.newPassword.length < 8) return toast.error('كلمة المرور يجب أن تكون 8 أحرف على الأقل')
    try {
      await api.patch(`/admin/users/${editUserTarget.id}`, {
        name: editForm.name,
        email: editForm.email,
        role: editForm.role,
        is_active: editForm.is_active,
        newPassword: editForm.newPassword || undefined,
      })
      toast.success('تم تحديث بيانات المستخدم')
      setEditUserTarget(null)
      fetchData()
    } catch (err: any) { toast.error(err.response?.data?.error || 'فشل الحفظ') }
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
      if (r.data.inviteLink) {
        setInviteLink(r.data.inviteLink)
        toast.success('تم إنشاء رابط الدعوة')
      } else {
        toast.success(r.data.message || 'تم إرسال الدعوة')
        setShowInvite(false)
        setInviteEmail('')
      }
    } catch (err: any) { toast.error(err.response?.data?.error || 'فشل الإرسال') }
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
      const r = await api.post('/admin/settings/test-api', {
        api_key: aiSettings.api_key,
        provider: aiSettings.provider,
        model: aiSettings.model
      })
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
    { id: 'email', icon: Mail, label: 'البريد' },
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
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openEditUser(u)} className="p-1.5 rounded-lg hover:bg-primary-50 dark:hover:bg-primary-900/20 text-[var(--muted)] hover:text-primary-600 transition-colors" title="تعديل">
                          <Pencil size={14} />
                        </button>
                        {u.role !== 'admin' && (
                          <button onClick={() => setDeleteUserTarget(u)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-[var(--muted)] hover:text-red-600 transition-colors" title="حذف">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
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

          {editUserTarget && (
            <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4" onClick={() => setEditUserTarget(null)}>
              <div
                className="bg-[var(--surface)] border border-[var(--border)] rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-md animate-slide-in-up sm:animate-fade-in max-h-[92vh] overflow-y-auto"
                onClick={e => e.stopPropagation()}
              >
                {/* Header */}
                <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-[var(--border)] sticky top-0 bg-[var(--surface)] z-10">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-primary-600 font-bold text-base shrink-0">
                      {editForm.name.charAt(0) || '؟'}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-[var(--text)] text-sm sm:text-base">تعديل المستخدم</h3>
                      <p className="text-xs text-[var(--muted)] truncate">{editUserTarget.email}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setEditUserTarget(null)}
                    className="p-1.5 rounded-lg hover:bg-[var(--bg)] text-[var(--muted)] transition-colors shrink-0"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>

                <div className="px-5 py-4 space-y-4">
                  {/* Name */}
                  <div>
                    <label className="block text-sm font-semibold text-[var(--text)] mb-1.5">الاسم الكامل</label>
                    <input className="input-field" value={editForm.name} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} placeholder="اسم المستخدم" />
                  </div>

                  {/* Email */}
                  <div>
                    <label className="block text-sm font-semibold text-[var(--text)] mb-1.5">البريد الإلكتروني</label>
                    <input className="input-field" type="email" value={editForm.email} onChange={e => setEditForm(p => ({ ...p, email: e.target.value }))} placeholder="email@example.com" />
                  </div>

                  {/* Role + Status row — stacks on very small screens */}
                  <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-semibold text-[var(--text)] mb-1.5">الدور</label>
                      <select
                        className="input-field"
                        value={editForm.role}
                        onChange={e => setEditForm(p => ({ ...p, role: e.target.value }))}
                        disabled={editUserTarget.role === 'admin'}
                      >
                        <option value="employee">موظف</option>
                        <option value="admin">مدير</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-[var(--text)] mb-1.5">الحالة</label>
                      <button
                        type="button"
                        onClick={() => setEditForm(p => ({ ...p, is_active: !p.is_active }))}
                        className={`w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border-2 text-sm font-semibold transition-all ${
                          editForm.is_active
                            ? 'border-green-400 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                            : 'border-red-300 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'
                        }`}
                      >
                        {editForm.is_active
                          ? <><UserCheck size={14} /> مفعّل</>
                          : <><UserX size={14} /> موقوف</>}
                      </button>
                    </div>
                  </div>

                  {/* Password reset section */}
                  <div className="border-t border-[var(--border)] pt-4">
                    <label className="block text-sm font-semibold text-[var(--text)] mb-1.5">
                      تغيير كلمة المرور
                      <span className="font-normal text-[var(--muted)] text-xs me-1"> (اختياري)</span>
                    </label>
                    <div className="relative">
                      <input
                        className="input-field pe-10"
                        type={editForm.showNewPw ? 'text' : 'password'}
                        placeholder="اتركه فارغاً إن لم تريد التغيير"
                        value={editForm.newPassword}
                        onChange={e => setEditForm(p => ({ ...p, newPassword: e.target.value }))}
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        onClick={() => setEditForm(p => ({ ...p, showNewPw: !p.showNewPw }))}
                        className="absolute end-3 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--text)] transition-colors"
                      >
                        {editForm.showNewPw ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                    {editForm.newPassword && editForm.newPassword.length < 8 && (
                      <p className="text-xs text-red-500 mt-1">8 أحرف على الأقل</p>
                    )}
                  </div>
                </div>

                {/* Footer — sticky on mobile */}
                <div className="flex gap-3 px-5 pb-5 pt-2 justify-end border-t border-[var(--border)] sticky bottom-0 bg-[var(--surface)]">
                  <button onClick={() => setEditUserTarget(null)} className="btn-ghost flex-1 sm:flex-none">{tr('cancel')}</button>
                  <button onClick={saveEditUser} className="btn-primary flex items-center justify-center gap-2 flex-1 sm:flex-none">
                    <ShieldCheck size={15} /> حفظ التغييرات
                  </button>
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

          {/* Provider selector */}
          <div>
            <label className="block text-sm font-semibold text-[var(--text)] mb-2">مزوّد الذكاء الاصطناعي</label>
            <div className="grid grid-cols-3 gap-3">
              {[
                { id: 'gemini', label: 'Google Gemini', badge: 'خادم', icon: '🤖' },
                { id: 'openai', label: 'OpenAI', badge: 'خادم', icon: '🟢' },
                { id: 'agentrouter', label: 'AgentRouter', badge: 'متصفح مباشر', icon: '⚡' }
              ].map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => { setAiSettings((s: any) => ({ ...s, provider: p.id })); setApiTestResult(null) }}
                  className={`flex items-center gap-3 p-3 rounded-xl border-2 text-start transition-all ${
                    aiSettings.provider === p.id
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                      : 'border-[var(--border)] hover:border-primary-300'
                  }`}
                >
                  <span className="text-2xl">{p.icon}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[var(--text)]">{p.label}</p>
                    <p className="text-xs text-[var(--muted)]">{p.badge}</p>
                  </div>
                  {aiSettings.provider === p.id && (
                    <CheckCircle size={16} className="text-primary-600 shrink-0 ms-auto" />
                  )}
                </button>
              ))}
            </div>
            {aiSettings.provider === 'agentrouter' && (
              <div className="mt-2 flex items-start gap-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg px-3 py-2">
                <span className="mt-0.5 shrink-0">⚡</span>
                <p className="text-xs text-blue-700 dark:text-blue-300">
                  <strong>AgentRouter:</strong> يدعم نماذج متعددة (DeepSeek, Claude, GPT, Gemini…) — الطلبات تُرسل عبر الخادم باستخدام مفتاحك.
                </p>
              </div>
            )}
          </div>

          {/* API Key */}
          <div className="border border-[var(--border)] rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <KeyRound size={16} className="text-primary-600" />
              <label className="text-sm font-semibold text-[var(--text)]">
                {aiSettings.provider === 'agentrouter' ? 'مفتاح AgentRouter API' : aiSettings.provider === 'openai' ? 'مفتاح OpenAI API' : 'مفتاح Gemini API'}
              </label>
              {aiSettings.has_api_key && !apiKeyChanged && (
                <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-full">محفوظ</span>
              )}
            </div>
            <div className="relative">
              <input
                className="input-field pe-20 font-mono text-sm"
                type={showApiKey ? 'text' : 'password'}
                placeholder={aiSettings.provider === 'agentrouter' ? 'الصق مفتاح agentrouter.org هنا...' : aiSettings.provider === 'openai' ? 'sk-...' : 'AIzaSy...'}
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
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={testApiKey}
                disabled={testingApi || !aiSettings.api_key}
                className="btn-ghost text-sm flex items-center gap-2 disabled:opacity-50"
              >
                {testingApi
                  ? <><Loader2 size={14} className="animate-spin" /> جاري التحقق...</>
                  : 'اختبار المفتاح'}
              </button>
              {apiTestResult && !(apiTestResult as any).warn && (
                <div className={`flex items-center gap-1.5 text-sm font-medium ${apiTestResult.ok ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  {apiTestResult.ok ? <CheckCircle size={15} /> : <XCircle size={15} />}
                  {apiTestResult.msg}
                </div>
              )}
            </div>
            <p className="text-xs text-[var(--muted)]">
              {aiSettings.provider === 'agentrouter' ? (
                <>احصل على مفتاحك من{' '}
                  <a href="https://agentrouter.org/console/token" target="_blank" rel="noopener noreferrer" className="text-primary-600 underline">agentrouter.org/console/token</a>.
                  المفتاح يُحفظ بشكل آمن على الخادم ويُستخدم للاتصال بـ agentrouter.org.</>
              ) : aiSettings.provider === 'openai' ? (
                <>احصل على مفتاحك من{' '}
                  <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-primary-600 underline">platform.openai.com/api-keys</a>.
                  المفتاح يبدأ بـ sk- ويُحفظ بشكل آمن على الخادم.</>
              ) : (
                <>احصل على مفتاحك من{' '}
                  <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-primary-600 underline">Google AI Studio</a>.
                  إذا تُرك فارغاً سيُستخدم المفتاح المضبوط في البيئة.</>
              )}
            </p>
          </div>

          {/* Model selector */}
          <div>
            <label className="block text-sm font-semibold text-[var(--text)] mb-2">
              {aiSettings.provider === 'agentrouter' ? 'نموذج AgentRouter' : aiSettings.provider === 'openai' ? 'نموذج OpenAI' : 'نموذج Gemini'}
            </label>
            {aiSettings.provider === 'openai' ? (
              <select className="input-field" value={aiSettings.model} onChange={e => setAiSettings((p: any) => ({ ...p, model: e.target.value }))}>
                <option value="gpt-4o-mini">GPT-4o Mini (موصى به — سريع واقتصادي)</option>
                <option value="gpt-4o">GPT-4o (الأقوى)</option>
                <option value="gpt-4-turbo">GPT-4 Turbo</option>
                <option value="gpt-3.5-turbo">GPT-3.5 Turbo (اقتصادي)</option>
                <option value="o1-mini">o1 Mini (تفكير)</option>
              </select>
            ) : aiSettings.provider === 'agentrouter' ? (
              <div className="space-y-2">
                <select
                  className="input-field"
                  value={aiSettings.model}
                  onChange={e => setAiSettings((p: any) => ({ ...p, model: e.target.value === '__custom__' ? '' : e.target.value }))}>
                  <optgroup label="DeepSeek">
                    <option value="deepseek/deepseek-chat-v3-0324">DeepSeek V3 (موصى به)</option>
                    <option value="deepseek/deepseek-r1">DeepSeek R1 (تفكير)</option>
                    <option value="deepseek/deepseek-chat">DeepSeek Chat</option>
                  </optgroup>
                  <optgroup label="Google Gemini">
                    <option value="google/gemini-2.5-flash">Gemini 2.5 Flash</option>
                    <option value="google/gemini-2.5-pro">Gemini 2.5 Pro</option>
                  </optgroup>
                  <optgroup label="Anthropic Claude">
                    <option value="anthropic/claude-sonnet-4-5">Claude Sonnet 4.5</option>
                    <option value="anthropic/claude-haiku-3-5">Claude Haiku 3.5</option>
                  </optgroup>
                  <optgroup label="OpenAI">
                    <option value="openai/gpt-4o">GPT-4o</option>
                    <option value="openai/gpt-4o-mini">GPT-4o Mini</option>
                  </optgroup>
                  <optgroup label="Zhipu GLM (مجاني)">
                    <option value="glm-4-flash">GLM-4 Flash (مجاني)</option>
                    <option value="glm4.5">GLM-4.5</option>
                    <option value="glm-4.6">GLM-4.6</option>
                  </optgroup>
                  <optgroup label="Qwen">
                    <option value="qwen/qwen-2.5-72b-instruct">Qwen 2.5 72B</option>
                    <option value="qwen/qwen-plus">Qwen Plus</option>
                  </optgroup>
                  <option value="__custom__">نموذج مخصص (اكتبه يدوياً)</option>
                </select>
                <input
                  className="input-field font-mono text-sm"
                  placeholder="مثال: deepseek/deepseek-chat-v3-0324"
                  value={aiSettings.model}
                  onChange={e => setAiSettings((p: any) => ({ ...p, model: e.target.value }))}
                />
                <p className="text-xs text-[var(--muted)]">يمكنك الاختيار من القائمة أو كتابة معرّف النموذج يدوياً.</p>
              </div>
            ) : (
              <select className="input-field" value={aiSettings.model} onChange={e => setAiSettings((p: any) => ({ ...p, model: e.target.value }))}>
                <option value="gemini-2.5-flash">Gemini 2.5 Flash (موصى به)</option>
                <option value="gemini-2.5-pro">Gemini 2.5 Pro (أعلى دقة)</option>
                <option value="gemini-flash-latest">Gemini Flash Latest</option>
                <option value="gemini-2.5-flash-lite">Gemini 2.5 Flash Lite (اقتصادي)</option>
              </select>
            )}
          </div>

          <div>
            <label className="block text-sm font-semibold text-[var(--text)] mb-2">{tr('systemPrompt')}</label>
            <textarea className="input-field" rows={7} value={aiSettings.system_prompt}
              onChange={e => setAiSettings((p: any) => ({ ...p, system_prompt: e.target.value }))}
              placeholder="أنت مساعد ذكي متخصص في تحليل البيانات..." />
            <div className="mt-2 flex items-start gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
              <span className="mt-0.5 shrink-0">⚙️</span>
              <p className="text-xs text-amber-700 dark:text-amber-300">
                <strong>ملاحظة:</strong> بروتوكول إنشاء الملفات (Excel / PDF) يُضاف تلقائياً من النظام بعد هذا النص، ولا تحتاج لكتابته يدوياً. أي تعديل تحفظه هنا يُطبَّق فوراً على كل المحادثات.
              </p>
            </div>
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

      {tab === 'email' && (
        <div className="card p-6 space-y-5 max-w-lg">
          <div>
            <h2 className="font-semibold text-[var(--text)] flex items-center gap-2">
              <Mail size={18} className="text-primary-600" />
              إعدادات البريد الإلكتروني (Gmail)
            </h2>
            <p className="text-xs text-[var(--muted)] mt-1">
              تُستخدم هذه البيانات لإرسال دعوات الانضمام تلقائياً عبر بريدك.
            </p>
          </div>

          {/* SMTP User */}
          <div>
            <label className="block text-sm font-semibold text-[var(--text)] mb-2">
              عنوان Gmail <span className="text-red-500">*</span>
            </label>
            <input
              className="input-field"
              type="email"
              placeholder="yourapp@gmail.com"
              value={emailSettings.smtp_user}
              onChange={e => { setEmailSettings(p => ({ ...p, smtp_user: e.target.value })); setEmailTestResult(null) }}
            />
          </div>

          {/* SMTP Pass */}
          <div>
            <label className="block text-sm font-semibold text-[var(--text)] mb-2 flex items-center gap-2">
              كلمة مرور التطبيق (App Password)
              {emailSettings.has_smtp && !smtpPassChanged && (
                <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-full font-normal">محفوظة</span>
              )}
            </label>
            <div className="relative">
              <input
                className="input-field pe-10 font-mono text-sm"
                type={showSmtpPass ? 'text' : 'password'}
                placeholder="xxxx xxxx xxxx xxxx"
                value={emailSettings.smtp_pass}
                onChange={e => { setEmailSettings(p => ({ ...p, smtp_pass: e.target.value })); setSmtpPassChanged(true); setEmailTestResult(null) }}
              />
              <button type="button" onClick={() => setShowSmtpPass(!showSmtpPass)}
                className="absolute end-3 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--text)] transition-colors">
                {showSmtpPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Help box */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 space-y-2">
            <p className="text-sm font-semibold text-blue-700 dark:text-blue-300">🔑 كيف تحصل على App Password؟</p>
            <ol className="text-xs text-blue-600 dark:text-blue-400 space-y-1 list-decimal list-inside">
              <li>افتح <a href="https://myaccount.google.com/security" target="_blank" rel="noopener noreferrer" className="underline font-medium">إعدادات أمان Google</a></li>
              <li>فعّل التحقق بخطوتين (إذا لم يكن مفعّلاً)</li>
              <li>ابحث عن <strong>"كلمات مرور التطبيقات"</strong> واضغط عليها</li>
              <li>اختر "بريد" ثم "Windows Computer" وانسخ الكلمة المولّدة</li>
            </ol>
            <p className="text-xs text-blue-500 dark:text-blue-500">⚠️ لا تستخدم كلمة مرور Gmail العادية — لن تعمل.</p>
          </div>

          {/* Test result */}
          {emailTestResult && (
            <div className={`flex items-center gap-2 text-sm font-medium px-4 py-3 rounded-xl border ${
              emailTestResult.ok
                ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400'
                : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400'
            }`}>
              {emailTestResult.ok ? <CheckCircle size={16} /> : <XCircle size={16} />}
              {emailTestResult.msg}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-1">
            <button onClick={saveEmail} className="btn-primary">
              حفظ الإعدادات
            </button>
            <button
              onClick={testEmail}
              disabled={testingEmail || !emailSettings.smtp_user}
              className="btn-ghost text-sm flex items-center gap-2 disabled:opacity-50"
            >
              {testingEmail
                ? <><Loader2 size={14} className="animate-spin" /> جاري الاختبار...</>
                : <><CheckCircle size={14} /> اختبار الاتصال</>}
            </button>
          </div>
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
