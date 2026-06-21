import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, Database, Pin, Edit2, Trash2, Download } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useT } from '../i18n/translations'
import { useAuth } from '../contexts/AuthContext'
import api from '../lib/api'
import toast from 'react-hot-toast'
import ConfirmModal from '../components/ui/ConfirmModal'
import OnboardingTour from '../components/ui/OnboardingTour'
import FileTypeIcon from '../components/ui/FileTypeIcon'
import { formatDistanceToNow } from 'date-fns'
import { ar } from 'date-fns/locale'

interface Project {
  id: number; name: string; pinned: boolean; user_name: string
  file_count: number; message_count: number; primary_type: string
  updated_at: string; created_at: string; user_id: number
}

function SkeletonCard() {
  return (
    <div className="card p-4 animate-pulse">
      <div className="flex items-start justify-between mb-3">
        <div className="skeleton w-10 h-10 rounded-xl" />
        <div className="skeleton w-6 h-6 rounded-lg" />
      </div>
      <div className="skeleton h-4 w-3/4 mb-2" />
      <div className="skeleton h-3 w-1/2 mb-1" />
      <div className="skeleton h-3 w-2/5 mt-1" />
    </div>
  )
}

export default function DashboardPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('updated_at')
  const [filterType, setFilterType] = useState('all')
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null)
  const [renameTarget, setRenameTarget] = useState<Project | null>(null)
  const [renameName, setRenameName] = useState('')
  const [loading, setLoading] = useState(true)
  const { lang } = useTheme()
  const tr = useT(lang)
  const { user } = useAuth()
  const navigate = useNavigate()

  const fetchProjects = async () => {
    try {
      const res = await api.get('/projects', { params: { sort, type: filterType } })
      setProjects(res.data)
    } catch { toast.error('فشل تحميل المشاريع') }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchProjects() }, [sort, filterType])

  const createProject = async () => {
    if (!newName.trim()) return
    try {
      const res = await api.post('/projects', { name: newName.trim() })
      setShowNew(false); setNewName('')
      navigate(`/project/${res.data.id}`)
    } catch { toast.error('فشل إنشاء المشروع') }
  }

  const togglePin = async (p: Project, e: React.MouseEvent) => {
    e.stopPropagation()
    await api.patch(`/projects/${p.id}`, { pinned: !p.pinned })
    fetchProjects()
  }

  const deleteProject = async () => {
    if (!deleteTarget) return
    try {
      await api.delete(`/projects/${deleteTarget.id}`)
      setDeleteTarget(null); fetchProjects()
      toast.success('تم حذف المشروع')
    } catch { toast.error('فشل الحذف') }
  }

  const renameProject = async () => {
    if (!renameTarget || !renameName.trim()) return
    try {
      await api.patch(`/projects/${renameTarget.id}`, { name: renameName.trim() })
      setRenameTarget(null); fetchProjects()
    } catch { toast.error('فشل إعادة التسمية') }
  }

  const filtered = projects.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  )
  const pinned = filtered.filter(p => p.pinned)
  const recent = filtered.filter(p => !p.pinned)

  const ProjectCard = ({ p }: { p: Project }) => (
    <div
      onClick={() => navigate(`/project/${p.id}`)}
      className="card p-4 cursor-pointer hover:border-primary-300 dark:hover:border-primary-700 hover:shadow-md transition-all duration-200 group relative animate-fade-in"
    >
      <div className="flex items-start justify-between mb-3">
        <FileTypeIcon type={p.primary_type || 'default'} size="lg" />
        <button
          onClick={(e) => togglePin(p, e)}
          className={`icon-btn ${p.pinned ? 'text-primary-600' : 'text-[var(--muted)]'}`}
          title={p.pinned ? 'إلغاء التثبيت' : 'تثبيت'}
        >
          <Pin size={15} fill={p.pinned ? 'currentColor' : 'none'} />
        </button>
      </div>

      <h3 className="font-semibold text-[var(--text)] truncate mb-1 text-sm">{p.name}</h3>
      <p className="text-xs text-[var(--muted)]">
        {p.file_count} {tr('files_count')} • {p.message_count} {tr('messages')}
      </p>
      <p className="text-xs text-[var(--muted)] mt-1">
        {formatDistanceToNow(new Date(p.updated_at), { addSuffix: true, locale: lang === 'ar' ? ar : undefined })}
      </p>

      <div className="flex items-center gap-1 mt-3 pt-3 border-t border-[var(--border)]">
        <button
          onClick={e => { e.stopPropagation(); setRenameTarget(p); setRenameName(p.name) }}
          className="icon-btn icon-btn-primary"
          title={tr('rename')}
        >
          <Edit2 size={14} />
        </button>
        <button
          onClick={e => {
            e.stopPropagation()
            const token = localStorage.getItem('token')
            window.open(`/api/files/${p.id}/download-zip?token=${encodeURIComponent(token || '')}`)
          }}
          className="icon-btn icon-btn-primary"
          title={tr('export')}
        >
          <Download size={14} />
        </button>
        <button
          onClick={e => { e.stopPropagation(); setDeleteTarget(p) }}
          className="icon-btn icon-btn-danger"
          title={tr('delete')}
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  )

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto font-cairo">
      <OnboardingTour />

      <div className="flex items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--text)]">{tr('projects')}</h1>
        </div>
        <button onClick={() => setShowNew(true)} className="btn-primary flex items-center gap-2 shrink-0">
          <Plus size={18} />
          <span className="hidden sm:inline">{tr('newProject')}</span>
        </button>
      </div>

      <div className="flex gap-3 mb-6 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={16} className="absolute start-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
          <input className="input-field ps-9" placeholder={tr('searchProjects')} value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="input-field w-auto" value={sort} onChange={e => setSort(e.target.value)}>
          <option value="updated_at">{tr('newest')}</option>
          <option value="created_at">{tr('oldest')}</option>
          <option value="name">{tr('alphabetical')}</option>
        </select>
        <select className="input-field w-auto" value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="all">{tr('filterType')}</option>
          <option value="excel">Excel</option>
          <option value="csv">CSV</option>
          <option value="pdf">PDF</option>
          <option value="word">Word</option>
        </select>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-20 h-20 rounded-2xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center mb-4">
            <Database size={40} className="text-primary-600" />
          </div>
          <h2 className="text-xl font-bold text-[var(--text)] mb-2">{search ? tr('noSearchResults') : tr('noProjects')}</h2>
          <p className="text-[var(--muted)] mb-6 max-w-sm text-sm">{search ? tr('tryDifferentSearch') : tr('noProjectsDesc')}</p>
          {!search && (
            <button onClick={() => setShowNew(true)} className="btn-primary flex items-center gap-2">
              <Plus size={18} /> {tr('newProject')}
            </button>
          )}
          {!search && <p className="text-xs text-[var(--muted)] mt-3">{tr('supportedFiles')}</p>}
        </div>
      ) : (
        <>
          {pinned.length > 0 && (
            <div className="mb-6">
              <h2 className="text-sm font-semibold text-[var(--muted)] mb-3 flex items-center gap-2">
                <Pin size={14} /> {tr('pinned')}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {pinned.map(p => <ProjectCard key={p.id} p={p} />)}
              </div>
            </div>
          )}
          {recent.length > 0 && (
            <div>
              {pinned.length > 0 && <h2 className="text-sm font-semibold text-[var(--muted)] mb-3">{tr('recent')}</h2>}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {recent.map(p => <ProjectCard key={p.id} p={p} />)}
              </div>
            </div>
          )}
        </>
      )}

      {showNew && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowNew(false)}>
          <div className="card-elevated p-6 w-full max-w-md animate-fade-in" onClick={e => e.stopPropagation()}>
            <h2 className="font-bold text-lg text-[var(--text)] mb-4">{tr('createProject')}</h2>
            <label className="block text-sm font-semibold text-[var(--text)] mb-1">{tr('projectName')}</label>
            <input autoFocus className="input-field mb-4" placeholder={tr('projectNamePlaceholder')} value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') createProject(); if (e.key === 'Escape') setShowNew(false) }} />
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowNew(false)} className="btn-ghost">{tr('cancel')}</button>
              <button onClick={createProject} disabled={!newName.trim()} className="btn-primary">{tr('create')}</button>
            </div>
          </div>
        </div>
      )}

      {renameTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setRenameTarget(null)}>
          <div className="card-elevated p-6 w-full max-w-md animate-fade-in" onClick={e => e.stopPropagation()}>
            <h2 className="font-bold text-lg text-[var(--text)] mb-4">{tr('rename')}</h2>
            <input autoFocus className="input-field mb-4" value={renameName} onChange={e => setRenameName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') renameProject(); if (e.key === 'Escape') setRenameTarget(null) }} />
            <div className="flex gap-3 justify-end">
              <button onClick={() => setRenameTarget(null)} className="btn-ghost">{tr('cancel')}</button>
              <button onClick={renameProject} className="btn-primary">{tr('save')}</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!deleteTarget}
        title={tr('deleteProject')}
        icon="🗑️"
        danger
        description={`${tr('deleteProjectConfirm')} "${deleteTarget?.name}"؟\n${tr('deleteConfirmText')}`}
        confirmLabel={tr('confirmDelete')}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={deleteProject}
      />
    </div>
  )
}
