import { useState, useEffect, useCallback, useRef } from 'react'
import {
  HardDrive, FolderOpen, Folder, RefreshCw, FolderPlus,
  ChevronLeft, Search, X, Link2Off, Download, Trash2, Copy,
  FileInput, Pencil, Loader2, AlertCircle, ExternalLink,
  MoreVertical, Home, Link, Link2, Settings
} from 'lucide-react'
import api from '../../lib/api'
import toast from 'react-hot-toast'
import FileTypeIcon, { resolveFileType } from '../ui/FileTypeIcon'
import ConfirmModal from '../ui/ConfirmModal'

const FOLDER_MIME = 'application/vnd.google-apps.folder'

interface DriveFile {
  id: string; name: string; mimeType: string
  size?: string; modifiedTime?: string; webViewLink?: string
}
interface BreadcrumbItem { id: string; name: string }
interface DriveLink { id: number; drive_file_id: string; drive_file_name: string }
interface Project { id: number; name: string }

function isFolder(f: DriveFile) { return f.mimeType === FOLDER_MIME }

function fmtSize(bytes?: string) {
  if (!bytes) return '—'
  const b = parseInt(bytes)
  if (b < 1024) return b + ' B'
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB'
  return (b / 1048576).toFixed(1) + ' MB'
}

function driveTypeToLocal(mimeType: string, name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  const googleMap: Record<string, string> = {
    'application/vnd.google-apps.spreadsheet': 'excel',
    'application/vnd.google-apps.document': 'word',
    'application/vnd.google-apps.presentation': 'other',
    'application/vnd.google-apps.folder': 'other',
  }
  if (googleMap[mimeType]) return googleMap[mimeType]
  return resolveFileType(ext)
}

function Modal({ title, onClose, children, wide = false }: {
  title: string; onClose: () => void; children: React.ReactNode; wide?: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className={`bg-[var(--surface)] rounded-2xl shadow-xl w-full ${wide ? 'max-w-2xl' : 'max-w-md'} border border-[var(--border)]`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <h3 className="font-semibold text-[var(--text)] text-sm">{title}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--bg)] text-[var(--muted)] transition-colors"><X size={15} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

function MenuItem({ icon: Icon, label, onClick, danger = false }: {
  icon: any; label: string; onClick: () => void; danger?: boolean
}) {
  return (
    <button onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors ${danger ? 'text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20' : 'text-[var(--text)] hover:bg-[var(--bg)]'}`}>
      <Icon size={13} className="shrink-0" />{label}
    </button>
  )
}

function PreviewContent({ data }: { data: any }) {
  const p = data.preview
  if (!p) return <p className="text-[var(--muted)] text-sm">لا توجد معاينة</p>
  if (p.type === 'error') return (
    <div className="flex items-center gap-2 text-red-500 p-4">
      <AlertCircle size={18} /><span className="text-sm">{p.text}</span>
    </div>
  )
  if (p.type === 'image') return <img src={p.data} alt="معاينة" className="max-w-full rounded-xl" />
  if (p.type === 'excel' || p.type === 'csv') return (
    <div className="overflow-x-auto">
      <table className="text-xs w-full border-collapse">
        <tbody>
          {(p.rows || []).slice(0, 30).map((row: any[], ri: number) => (
            <tr key={ri} className={ri === 0 ? 'bg-primary-50 dark:bg-primary-900/20 font-semibold' : 'border-b border-[var(--border)]'}>
              {row.map((cell: any, ci: number) => (
                <td key={ci} className="px-2 py-1 border-e border-[var(--border)] text-[var(--text)] max-w-[150px] truncate">{String(cell ?? '')}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
  if (p.type === 'pdf' || p.type === 'word' || p.type === 'text') return (
    <div className="text-sm text-[var(--text)] whitespace-pre-wrap leading-relaxed font-mono bg-[var(--bg)] p-4 rounded-xl max-h-80 overflow-y-auto">
      {p.text}
      {p.pages && <div className="mt-2 text-[var(--muted)] text-xs">عدد الصفحات: {p.pages}</div>}
    </div>
  )
  return <p className="text-[var(--muted)] text-sm p-4 text-center">هذا النوع لا يدعم المعاينة</p>
}

interface Props {
  projectId: number
  onImport?: () => void
}

export default function DrivePanelTab({ projectId, onImport }: Props) {
  const [status, setStatus] = useState<{ configured: boolean; connected: boolean; google_email?: string } | null>(null)
  const [files, setFiles] = useState<DriveFile[]>([])
  const [links, setLinks] = useState<DriveLink[]>([])
  const [loading, setLoading] = useState(false)
  const [currentFolder, setCurrentFolder] = useState('root')
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([{ id: 'root', name: 'My Drive' }])
  const [searchQ, setSearchQ] = useState('')
  const [searchMode, setSearchMode] = useState(false)
  const [nextPageToken, setNextPageToken] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [projects, setProjects] = useState<Project[]>([])

  // Context menu
  const [menuFile, setMenuFile] = useState<DriveFile | null>(null)
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 })
  const menuRef = useRef<HTMLDivElement>(null)

  // Modals
  const [renameTarget, setRenameTarget] = useState<DriveFile | null>(null)
  const [renameName, setRenameName] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<DriveFile | null>(null)
  const [importTarget, setImportTarget] = useState<DriveFile | null>(null)
  const [importProject, setImportProject] = useState<number | null>(projectId)
  const [importing, setImporting] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [previewFile, setPreviewFile] = useState<DriveFile | null>(null)
  const [previewData, setPreviewData] = useState<any>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  // Link-to-AI state
  const [linkingId, setLinkingId] = useState<string | null>(null)

  useEffect(() => { fetchStatus() }, [])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuFile(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const fetchStatus = async () => {
    try {
      const r = await api.get('/drive/status')
      setStatus(r.data)
      if (r.data.connected) {
        loadFiles('root')
        loadLinks()
        loadProjects()
      }
    } catch { setStatus({ configured: false, connected: false }) }
  }

  const loadFiles = useCallback(async (folderId: string, token?: string, q?: string) => {
    setLoading(true)
    try {
      const params: any = { folderId }
      if (token) params.pageToken = token
      if (q) params.q = q
      const r = await api.get('/drive/files', { params })
      if (token) { setFiles(prev => [...prev, ...r.data.files]) }
      else { setFiles(r.data.files ?? r.data) }
      setNextPageToken(r.data.nextPageToken || null)
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'فشل تحميل الملفات')
    } finally { setLoading(false) }
  }, [])

  const loadLinks = async () => {
    try {
      const r = await api.get(`/drive/projects/${projectId}/links`)
      setLinks(r.data)
    } catch {}
  }

  const loadProjects = async () => {
    try {
      const r = await api.get('/drive/projects')
      setProjects(r.data)
    } catch {}
  }

  const openFolder = (folder: DriveFile) => {
    setCurrentFolder(folder.id)
    setSearchMode(false); setSearchQ('')
    loadFiles(folder.id)
    loadBreadcrumb(folder.id)
  }

  const loadBreadcrumb = async (folderId: string) => {
    try {
      const r = await api.get('/drive/breadcrumb', { params: { folderId } })
      setBreadcrumbs(r.data)
    } catch {}
  }

  const goToBreadcrumb = (crumb: BreadcrumbItem, idx: number) => {
    setCurrentFolder(crumb.id)
    setSearchMode(false); setSearchQ('')
    loadFiles(crumb.id)
    setBreadcrumbs(prev => prev.slice(0, idx + 1))
  }

  const handleSearch = () => {
    if (!searchQ.trim()) { setSearchMode(false); loadFiles(currentFolder); return }
    setSearchMode(true)
    loadFiles(currentFolder, undefined, searchQ)
  }

  const connect = async () => {
    setConnecting(true)
    try {
      const r = await api.get('/drive/auth/url')
      window.location.href = r.data.url
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'فشل الاتصال')
      setConnecting(false)
    }
  }

  const disconnect = async () => {
    try {
      await api.delete('/drive/auth/disconnect')
      setStatus(s => s ? { ...s, connected: false, google_email: undefined } : s)
      setFiles([]); setLinks([])
      toast.success('تم فصل Google Drive')
    } catch { toast.error('فشل الفصل') }
  }

  const openMenu = (e: React.MouseEvent, file: DriveFile) => {
    e.preventDefault(); e.stopPropagation()
    setMenuFile(file)
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setMenuPos({ x: rect.left - 160, y: rect.bottom + 4 })
  }

  const doRename = async () => {
    if (!renameTarget || !renameName.trim()) return
    try {
      await api.post(`/drive/file/${renameTarget.id}/rename`, { name: renameName.trim() })
      setFiles(fs => fs.map(f => f.id === renameTarget.id ? { ...f, name: renameName.trim() } : f))
      toast.success('تمت إعادة التسمية')
      setRenameTarget(null)
    } catch (err: any) { toast.error(err.response?.data?.error || 'فشل إعادة التسمية') }
  }

  const doDelete = async () => {
    if (!deleteTarget) return
    try {
      await api.delete(`/drive/file/${deleteTarget.id}`)
      setFiles(fs => fs.filter(f => f.id !== deleteTarget.id))
      toast.success('تم النقل إلى المهملات')
      setDeleteTarget(null)
    } catch (err: any) { toast.error(err.response?.data?.error || 'فشل الحذف') }
  }

  const doCopy = async (file: DriveFile) => {
    try {
      await api.post(`/drive/file/${file.id}/copy`, { name: `نسخة من ${file.name}`, folderId: currentFolder })
      toast.success('تم النسخ')
      loadFiles(currentFolder)
    } catch (err: any) { toast.error(err.response?.data?.error || 'فشل النسخ') }
  }

  const doImport = async () => {
    if (!importTarget || !importProject) return
    setImporting(true)
    try {
      await api.post(`/drive/file/${importTarget.id}/import`, { projectId: importProject })
      toast.success(`تم استيراد "${importTarget.name}" إلى المشروع`)
      setImportTarget(null); setImportProject(projectId)
      if (importProject === projectId) onImport?.()
    } catch (err: any) { toast.error(err.response?.data?.error || 'فشل الاستيراد') }
    finally { setImporting(false) }
  }

  const doNewFolder = async () => {
    if (!newFolderName.trim()) return
    try {
      await api.post('/drive/folder', { name: newFolderName.trim(), parentId: currentFolder })
      toast.success('تم إنشاء المجلد')
      setNewFolderName(''); setShowNewFolder(false)
      loadFiles(currentFolder)
    } catch (err: any) { toast.error(err.response?.data?.error || 'فشل الإنشاء') }
  }

  const doPreview = async (file: DriveFile) => {
    if (isFolder(file)) { openFolder(file); return }
    setPreviewFile(file); setPreviewData(null); setPreviewLoading(true)
    try {
      const r = await api.get(`/drive/file/${file.id}/preview`)
      setPreviewData(r.data)
    } catch (err: any) {
      setPreviewData({ preview: { type: 'error', text: err.response?.data?.error || 'فشل التحميل' } })
    } finally { setPreviewLoading(false) }
  }

  const isLinked = (fileId: string) => links.some(l => l.drive_file_id === fileId)

  const toggleLink = async (file: DriveFile) => {
    setLinkingId(file.id)
    try {
      if (isLinked(file.id)) {
        await api.delete(`/drive/projects/${projectId}/links/${file.id}`)
        setLinks(prev => prev.filter(l => l.drive_file_id !== file.id))
        toast.success('تم إلغاء ربط الملف بالذكاء الاصطناعي')
      } else {
        const r = await api.post(`/drive/projects/${projectId}/links`, {
          drive_file_id: file.id, drive_file_name: file.name, drive_mime_type: file.mimeType
        })
        setLinks(prev => [...prev, r.data])
        toast.success('تم الربط — الذكاء الاصطناعي سيقرأ هذا الملف تلقائياً')
      }
    } catch { toast.error('فشلت العملية') }
    finally { setLinkingId(null) }
  }

  // ── Loading state ──
  if (!status) {
    return (
      <div className="flex-1 flex items-center justify-center py-12">
        <Loader2 size={20} className="animate-spin text-[var(--muted)]" />
      </div>
    )
  }

  // ── Not configured ──
  if (!status.configured) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-4 text-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-green-500 flex items-center justify-center">
          <HardDrive size={22} className="text-white" />
        </div>
        <p className="text-xs font-semibold text-[var(--text)]">Google Drive غير مُهيأ</p>
        <p className="text-xs text-[var(--muted)]">يرجى إضافة Client ID وClient Secret في الإعدادات</p>
        <a href="/settings" className="text-xs px-3 py-1.5 rounded-lg bg-primary-600 hover:bg-primary-700 text-white transition-colors flex items-center gap-1.5">
          <Settings size={12} /> الإعدادات
        </a>
      </div>
    )
  }

  // ── Not connected ──
  if (!status.connected) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-4 text-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 via-green-400 to-yellow-400 flex items-center justify-center shadow-lg">
          <HardDrive size={26} className="text-white" />
        </div>
        <div>
          <p className="text-sm font-bold text-[var(--text)] mb-1">ربط Google Drive</p>
          <p className="text-xs text-[var(--muted)] leading-relaxed">
            تصفح ملفاتك، استوردها، وأتح للذكاء الاصطناعي قراءتها مباشرةً
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 w-full text-xs">
          {[
            { icon: FolderOpen, label: 'تصفح المجلدات' },
            { icon: FileInput, label: 'استيراد للمشروع' },
            { icon: Copy, label: 'نسخ وحذف' },
            { icon: Link2, label: 'ربط بالذكاء الاصطناعي' },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-1.5 p-2 rounded-lg bg-[var(--bg)] text-[var(--muted)]">
              <Icon size={12} className="text-primary-500 shrink-0" /><span>{label}</span>
            </div>
          ))}
        </div>
        <button onClick={connect} disabled={connecting}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-xs font-medium transition-colors">
          {connecting ? <Loader2 size={14} className="animate-spin" /> : (
            <svg viewBox="0 0 48 48" width="14" height="14">
              <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"/>
              <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"/>
              <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"/>
              <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z"/>
            </svg>
          )}
          {connecting ? 'جاري التوجيه...' : 'تسجيل الدخول بـ Google'}
        </button>
      </div>
    )
  }

  const folders = files.filter(f => isFolder(f))
  const fileItems = files.filter(f => !isFolder(f))
  const linkedCount = links.length

  return (
    <div className="flex-1 flex flex-col overflow-hidden">

      {/* ── Account header ── */}
      <div className="flex items-center gap-2 px-2 py-2 border-b border-[var(--border)] shrink-0 bg-[var(--bg)]">
        <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-blue-500 to-green-500 flex items-center justify-center shrink-0">
          <HardDrive size={12} className="text-white" />
        </div>
        <span className="text-xs text-[var(--muted)] flex-1 truncate">{status.google_email || 'Google Drive'}</span>
        <button onClick={() => setShowNewFolder(true)} title="مجلد جديد"
          className="p-1 rounded-lg hover:bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--text)] transition-colors">
          <FolderPlus size={13} />
        </button>
        <button onClick={() => loadFiles(currentFolder)} title="تحديث"
          className="p-1 rounded-lg hover:bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--text)] transition-colors">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
        <button onClick={disconnect} title="فصل الحساب"
          className="p-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-[var(--muted)] hover:text-red-500 transition-colors">
          <Link2Off size={13} />
        </button>
      </div>

      {/* ── Linked files notice ── */}
      {linkedCount > 0 && (
        <div className="px-2 py-1.5 bg-green-50 dark:bg-green-900/10 border-b border-green-200 dark:border-green-900/20 shrink-0">
          <p className="text-xs text-green-700 dark:text-green-400 flex items-center gap-1.5">
            <Link size={10} className="shrink-0" />
            <span>{linkedCount} ملف مرتبط — الذكاء الاصطناعي يقرأها تلقائياً</span>
          </p>
        </div>
      )}

      {/* ── Breadcrumb ── */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-[var(--border)] shrink-0 overflow-x-auto">
        {breadcrumbs.map((crumb, i) => (
          <span key={crumb.id} className="flex items-center gap-0.5 shrink-0">
            {i > 0 && <ChevronLeft size={11} className="text-[var(--muted)]" />}
            <button onClick={() => goToBreadcrumb(crumb, i)}
              className={`text-xs px-1.5 py-0.5 rounded transition-colors ${i === breadcrumbs.length - 1
                ? 'font-semibold text-[var(--text)] cursor-default'
                : 'text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface)]'}`}>
              {i === 0 ? <Home size={11} /> : crumb.name}
            </button>
          </span>
        ))}
      </div>

      {/* ── Search bar ── */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-[var(--border)] shrink-0">
        <div className="relative flex-1">
          <Search size={12} className="absolute start-2 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
          <input
            value={searchQ}
            onChange={e => setSearchQ(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="بحث في Drive..."
            dir="rtl"
            className="w-full text-xs bg-[var(--bg)] border border-[var(--border)] rounded-lg ps-7 pe-2 py-1.5 outline-none focus:border-primary-400 text-[var(--text)] placeholder:text-[var(--muted)]"
          />
        </div>
        {searchMode && (
          <button onClick={() => { setSearchMode(false); setSearchQ(''); loadFiles(currentFolder) }}
            className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-400 transition-colors">
            <X size={12} />
          </button>
        )}
      </div>

      {/* ── File list ── */}
      <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
        {loading && files.length === 0 ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 size={18} className="animate-spin text-[var(--muted)]" />
          </div>
        ) : files.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2">
            <FolderOpen size={28} className="text-[var(--muted)]" />
            <p className="text-xs text-[var(--muted)]">{searchMode ? 'لا توجد نتائج' : 'هذا المجلد فارغ'}</p>
          </div>
        ) : (
          <>
            {folders.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-[var(--muted)] uppercase tracking-wide px-1.5 py-1">
                  المجلدات ({folders.length})
                </p>
                {folders.map(f => (
                  <DriveRow key={f.id} file={f}
                    linked={false}
                    linkingId={linkingId}
                    onOpen={() => openFolder(f)}
                    onMenu={openMenu}
                    onImport={() => { setImportTarget(f); setImportProject(projectId) }}
                    onToggleLink={() => {}}
                    showLink={false}
                  />
                ))}
              </div>
            )}
            {fileItems.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-[var(--muted)] uppercase tracking-wide px-1.5 py-1">
                  الملفات ({fileItems.length})
                </p>
                {fileItems.map(f => (
                  <DriveRow key={f.id} file={f}
                    linked={isLinked(f.id)}
                    linkingId={linkingId}
                    onOpen={() => doPreview(f)}
                    onMenu={openMenu}
                    onImport={() => { setImportTarget(f); setImportProject(projectId) }}
                    onToggleLink={() => toggleLink(f)}
                    showLink={true}
                  />
                ))}
              </div>
            )}
            {nextPageToken && (
              <button onClick={() => loadFiles(currentFolder, nextPageToken)} disabled={loading}
                className="w-full text-xs py-2 text-[var(--muted)] hover:text-[var(--text)] flex items-center justify-center gap-1.5 transition-colors">
                {loading ? <Loader2 size={12} className="animate-spin" /> : null}
                تحميل المزيد
              </button>
            )}
          </>
        )}
      </div>

      {/* ── Context Menu ── */}
      {menuFile && (
        <div ref={menuRef}
          className="fixed z-50 w-48 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-xl py-1 overflow-hidden"
          style={{ top: menuPos.y, left: Math.max(8, menuPos.x) }}>
          {!isFolder(menuFile) && (
            <>
              <MenuItem icon={Link} label={isLinked(menuFile.id) ? 'إلغاء ربط AI' : 'ربط بالذكاء الاصطناعي'}
                onClick={() => { toggleLink(menuFile); setMenuFile(null) }} />
              <MenuItem icon={FileInput} label="استيراد للمشروع"
                onClick={() => { setImportTarget(menuFile); setImportProject(projectId); setMenuFile(null) }} />
            </>
          )}
          <MenuItem icon={Pencil} label="إعادة تسمية"
            onClick={() => { setRenameTarget(menuFile); setRenameName(menuFile.name); setMenuFile(null) }} />
          {!isFolder(menuFile) && (
            <MenuItem icon={Copy} label="نسخ"
              onClick={() => { doCopy(menuFile); setMenuFile(null) }} />
          )}
          {menuFile.webViewLink && (
            <MenuItem icon={ExternalLink} label="فتح في Drive"
              onClick={() => { window.open(menuFile.webViewLink, '_blank'); setMenuFile(null) }} />
          )}
          <div className="my-1 border-t border-[var(--border)]" />
          <MenuItem icon={Trash2} label="حذف (مهملات)"
            onClick={() => { setDeleteTarget(menuFile); setMenuFile(null) }} danger />
        </div>
      )}

      {/* ── New Folder Modal ── */}
      {showNewFolder && (
        <Modal title="مجلد جديد في Drive" onClose={() => setShowNewFolder(false)}>
          <input value={newFolderName} onChange={e => setNewFolderName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && doNewFolder()}
            placeholder="اسم المجلد" className="input w-full" autoFocus />
          <div className="flex gap-2 mt-4">
            <button onClick={doNewFolder} className="btn-primary flex-1">إنشاء</button>
            <button onClick={() => setShowNewFolder(false)} className="btn-ghost flex-1">إلغاء</button>
          </div>
        </Modal>
      )}

      {/* ── Rename Modal ── */}
      {renameTarget && (
        <Modal title="إعادة تسمية" onClose={() => setRenameTarget(null)}>
          <p className="text-xs text-[var(--muted)] mb-2">{renameTarget.name}</p>
          <input value={renameName} onChange={e => setRenameName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && doRename()}
            className="input w-full" autoFocus />
          <div className="flex gap-2 mt-4">
            <button onClick={doRename} className="btn-primary flex-1">حفظ</button>
            <button onClick={() => setRenameTarget(null)} className="btn-ghost flex-1">إلغاء</button>
          </div>
        </Modal>
      )}

      {/* ── Delete Confirm ── */}
      <ConfirmModal
        open={!!deleteTarget} danger
        title="نقل للمهملات"
        icon="🗑️"
        description={`سيتم نقل "${deleteTarget?.name}" إلى مهملات Google Drive.`}
        confirmLabel="نقل للمهملات"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={doDelete}
      />

      {/* ── Import Modal ── */}
      {importTarget && (
        <Modal title="استيراد إلى مشروع" onClose={() => { setImportTarget(null); setImportProject(projectId) }}>
          <div className="flex items-center gap-3 mb-4 p-3 bg-[var(--bg)] rounded-xl">
            <FileTypeIcon type={driveTypeToLocal(importTarget.mimeType, importTarget.name)} size="md" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-[var(--text)] truncate">{importTarget.name}</p>
              <p className="text-xs text-[var(--muted)]">{fmtSize(importTarget.size)}</p>
            </div>
          </div>
          <label className="block text-xs font-medium text-[var(--text)] mb-2">اختر المشروع</label>
          {projects.length === 0 ? (
            <p className="text-[var(--muted)] text-sm">لا توجد مشاريع</p>
          ) : (
            <select value={importProject || ''} onChange={e => setImportProject(Number(e.target.value))} className="input w-full text-sm">
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}{p.id === projectId ? ' (هذا المشروع)' : ''}</option>
              ))}
            </select>
          )}
          <div className="flex gap-2 mt-4">
            <button onClick={doImport} disabled={importing || !importProject || projects.length === 0}
              className="btn-primary flex-1 flex items-center justify-center gap-2">
              {importing ? <Loader2 size={14} className="animate-spin" /> : <FileInput size={14} />}
              {importing ? 'جاري الاستيراد...' : 'استيراد'}
            </button>
            <button onClick={() => { setImportTarget(null); setImportProject(projectId) }} className="btn-ghost flex-1">إلغاء</button>
          </div>
        </Modal>
      )}

      {/* ── Preview Modal ── */}
      {previewFile && (
        <Modal title={previewFile.name} onClose={() => { setPreviewFile(null); setPreviewData(null) }} wide>
          <div className="max-h-[60vh] overflow-y-auto">
            {previewLoading ? (
              <div className="flex items-center justify-center h-32 gap-3">
                <Loader2 size={24} className="animate-spin text-primary-500" />
                <span className="text-[var(--muted)] text-sm">جاري تحميل المعاينة...</span>
              </div>
            ) : previewData ? (
              <PreviewContent data={previewData} />
            ) : null}
          </div>
          <div className="flex gap-2 mt-4 pt-4 border-t border-[var(--border)]">
            <button
              onClick={() => { toggleLink(previewFile); setPreviewFile(null); setPreviewData(null) }}
              className={`flex items-center gap-2 text-sm px-3 py-2 rounded-xl border transition-colors ${
                isLinked(previewFile.id)
                  ? 'border-red-300 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20'
                  : 'border-green-300 text-green-700 hover:bg-green-50 dark:hover:bg-green-900/20'
              }`}>
              {isLinked(previewFile.id) ? <Link2Off size={14} /> : <Link size={14} />}
              {isLinked(previewFile.id) ? 'إلغاء ربط AI' : 'ربط بالذكاء الاصطناعي'}
            </button>
            <button onClick={() => { setImportTarget(previewFile); setImportProject(projectId); setPreviewFile(null); setPreviewData(null) }}
              className="btn-primary flex items-center gap-2 text-sm">
              <FileInput size={14} /> استيراد
            </button>
            {previewFile.webViewLink && (
              <a href={previewFile.webViewLink} target="_blank" rel="noreferrer"
                className="btn-ghost flex items-center gap-2 text-sm">
                <ExternalLink size={14} /> فتح في Drive
              </a>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}

function DriveRow({ file, linked, linkingId, onOpen, onMenu, onImport, onToggleLink, showLink }: {
  file: DriveFile; linked: boolean; linkingId: string | null
  onOpen: () => void; onMenu: (e: React.MouseEvent, f: DriveFile) => void
  onImport: () => void; onToggleLink: () => void; showLink: boolean
}) {
  const folder = isFolder(file)
  const isLinking = linkingId === file.id
  return (
    <div
      className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg group transition-all cursor-pointer
        ${linked ? 'bg-green-50 dark:bg-green-900/10 ring-1 ring-green-300 dark:ring-green-800' : 'hover:bg-[var(--bg)]'}`}
      onClick={onOpen}
    >
      {folder ? (
        <div className="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center shrink-0">
          <Folder size={15} className="text-amber-500" />
        </div>
      ) : (
        <div className="shrink-0">
          <FileTypeIcon type={driveTypeToLocal(file.mimeType, file.name)} size="sm" />
        </div>
      )}

      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-[var(--text)] truncate">{file.name}</p>
        {!folder && file.size && (
          <p className="text-[10px] text-[var(--muted)]">{fmtSize(file.size)}</p>
        )}
      </div>

      {linked && (
        <span className="text-[10px] px-1 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 font-bold shrink-0">AI</span>
      )}

      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" onClick={e => e.stopPropagation()}>
        {showLink && (
          <button onClick={onToggleLink} disabled={isLinking}
            className={`p-1 rounded transition-colors ${linked
              ? 'text-green-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20'
              : 'text-[var(--muted)] hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20'}`}
            title={linked ? 'إلغاء ربط AI' : 'ربط بالذكاء الاصطناعي'}>
            {isLinking ? <Loader2 size={11} className="animate-spin" /> : linked ? <Link2Off size={11} /> : <Link size={11} />}
          </button>
        )}
        {!folder && (
          <button onClick={onImport}
            className="p-1 rounded text-[var(--muted)] hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors"
            title="استيراد للمشروع">
            <Download size={11} />
          </button>
        )}
        <button onClick={e => onMenu(e, file)}
          className="p-1 rounded text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface)] transition-colors"
          title="المزيد">
          <MoreVertical size={11} />
        </button>
      </div>
    </div>
  )
}
