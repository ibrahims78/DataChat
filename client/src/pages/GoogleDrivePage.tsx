import { useState, useEffect, useCallback, useRef } from 'react'
import {
  HardDrive, FolderOpen, Folder, RefreshCw, Upload, FolderPlus,
  ChevronRight, ChevronLeft, Search, X, Link2, Link2Off,
  Download, Trash2, Copy, Move, FileInput, Pencil, Loader2,
  AlertCircle, CheckCircle, ExternalLink, MoreVertical, Home
} from 'lucide-react'
import api from '../lib/api'
import toast from 'react-hot-toast'
import FileTypeIcon, { resolveFileType } from '../components/ui/FileTypeIcon'
import ConfirmModal from '../components/ui/ConfirmModal'

interface DriveFile {
  id: string
  name: string
  mimeType: string
  size?: string
  modifiedTime?: string
  webViewLink?: string
  parents?: string[]
}

interface BreadcrumbItem { id: string; name: string }
interface Project { id: number; name: string }

const FOLDER_MIME = 'application/vnd.google-apps.folder'

function isFolder(f: DriveFile) { return f.mimeType === FOLDER_MIME }

function fmtSize(bytes?: string) {
  if (!bytes) return '—'
  const b = parseInt(bytes)
  if (b < 1024) return b + ' B'
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB'
  if (b < 1073741824) return (b / 1048576).toFixed(1) + ' MB'
  return (b / 1073741824).toFixed(1) + ' GB'
}

function fmtDate(iso?: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' })
}

function driveTypeToLocal(mimeType: string, name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  const googleMap: Record<string, string> = {
    'application/vnd.google-apps.spreadsheet': 'excel',
    'application/vnd.google-apps.document': 'word',
    'application/vnd.google-apps.presentation': 'default',
    'application/vnd.google-apps.folder': 'default',
  }
  if (googleMap[mimeType]) return googleMap[mimeType]
  return resolveFileType(ext)
}

export default function GoogleDrivePage() {
  const [status, setStatus] = useState<{ configured: boolean; connected: boolean; google_email?: string; google_name?: string } | null>(null)
  const [files, setFiles] = useState<DriveFile[]>([])
  const [loading, setLoading] = useState(false)
  const [currentFolder, setCurrentFolder] = useState('root')
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([{ id: 'root', name: 'My Drive' }])
  const [searchQ, setSearchQ] = useState('')
  const [searchMode, setSearchMode] = useState(false)
  const [nextPageToken, setNextPageToken] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [selectedFile, setSelectedFile] = useState<DriveFile | null>(null)
  const [menuFile, setMenuFile] = useState<DriveFile | null>(null)
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 })
  const [renameTarget, setRenameTarget] = useState<DriveFile | null>(null)
  const [renameName, setRenameName] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<DriveFile | null>(null)
  const [importTarget, setImportTarget] = useState<DriveFile | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [importProject, setImportProject] = useState<number | null>(null)
  const [importing, setImporting] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [previewFile, setPreviewFile] = useState<DriveFile | null>(null)
  const [previewData, setPreviewData] = useState<any>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => { fetchStatus() }, [])
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('connected') === '1') {
      toast.success('تم ربط Google Drive بنجاح! 🎉')
      window.history.replaceState({}, '', '/drive')
      fetchStatus()
    }
    if (params.get('error')) {
      toast.error('فشل ربط Google Drive: ' + decodeURIComponent(params.get('error')!))
      window.history.replaceState({}, '', '/drive')
    }
  }, [])

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
      if (r.data.connected) { loadFiles('root'); loadProjects() }
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
      else { setFiles(r.data.files) }
      setNextPageToken(r.data.nextPageToken)
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'فشل تحميل الملفات')
    } finally { setLoading(false) }
  }, [])

  const loadProjects = async () => {
    try {
      const r = await api.get('/drive/projects')
      setProjects(r.data)
    } catch {}
  }

  const loadBreadcrumb = async (folderId: string) => {
    try {
      const r = await api.get('/drive/breadcrumb', { params: { folderId } })
      setBreadcrumbs(r.data)
    } catch {}
  }

  const openFolder = (folder: DriveFile) => {
    setCurrentFolder(folder.id)
    setSearchMode(false)
    setSearchQ('')
    loadFiles(folder.id)
    loadBreadcrumb(folder.id)
  }

  const goToBreadcrumb = (crumb: BreadcrumbItem) => {
    setCurrentFolder(crumb.id)
    setSearchMode(false)
    setSearchQ('')
    loadFiles(crumb.id)
    const idx = breadcrumbs.findIndex(b => b.id === crumb.id)
    setBreadcrumbs(breadcrumbs.slice(0, idx + 1))
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
      toast.error(err.response?.data?.error || 'فشل الاتصال بـ Google')
      setConnecting(false)
    }
  }

  const disconnect = async () => {
    try {
      await api.delete('/drive/auth/disconnect')
      setStatus(s => s ? { ...s, connected: false, google_email: undefined } : s)
      setFiles([])
      toast.success('تم فصل Google Drive')
    } catch { toast.error('فشل الفصل') }
  }

  const openMenu = (e: React.MouseEvent, file: DriveFile) => {
    e.preventDefault()
    e.stopPropagation()
    setMenuFile(file)
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setMenuPos({ x: rect.left, y: rect.bottom + 4 })
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
      setImportTarget(null)
      setImportProject(null)
    } catch (err: any) { toast.error(err.response?.data?.error || 'فشل الاستيراد') }
    finally { setImporting(false) }
  }

  const doNewFolder = async () => {
    if (!newFolderName.trim()) return
    try {
      await api.post('/drive/folder', { name: newFolderName.trim(), parentId: currentFolder })
      toast.success('تم إنشاء المجلد')
      setNewFolderName('')
      setShowNewFolder(false)
      loadFiles(currentFolder)
    } catch (err: any) { toast.error(err.response?.data?.error || 'فشل الإنشاء') }
  }

  const doPreview = async (file: DriveFile) => {
    if (isFolder(file)) { openFolder(file); return }
    setPreviewFile(file)
    setPreviewData(null)
    setPreviewLoading(true)
    try {
      const r = await api.get(`/drive/file/${file.id}/preview`)
      setPreviewData(r.data)
    } catch (err: any) {
      setPreviewData({ preview: { type: 'error', text: err.response?.data?.error || 'فشل التحميل' } })
    } finally { setPreviewLoading(false) }
  }

  if (!status) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 size={32} className="animate-spin text-primary-500" />
      </div>
    )
  }

  if (!status.configured) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 p-8 text-center">
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500 to-green-500 flex items-center justify-center shadow-lg">
          <HardDrive size={36} className="text-white" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-[var(--text)] mb-2">Google Drive</h2>
          <p className="text-[var(--muted)] max-w-sm">
            لم يتم إعداد Google Drive بعد. يرجى مطالبة المشرف بإضافة Client ID و Client Secret في صفحة الإعدادات.
          </p>
        </div>
        <a href="/settings" className="btn-primary flex items-center gap-2">
          <ExternalLink size={16} /> الذهاب إلى الإعدادات
        </a>
      </div>
    )
  }

  if (!status.connected) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-8 p-8 text-center">
        <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-blue-500 via-green-400 to-yellow-400 flex items-center justify-center shadow-xl">
          <HardDrive size={40} className="text-white" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-[var(--text)] mb-3">ربط Google Drive</h2>
          <p className="text-[var(--muted)] max-w-md leading-relaxed">
            ربط حساب Google Drive يتيح لك تصفح ملفاتك، واستيرادها للمشاريع، وإجراء كل العمليات عليها مباشرة من DataChat.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4 max-w-sm w-full">
          {[
            { icon: FolderOpen, label: 'تصفح المجلدات' },
            { icon: FileInput, label: 'استيراد للمشاريع' },
            { icon: Copy, label: 'نسخ ونقل' },
            { icon: Pencil, label: 'إعادة تسمية وحذف' },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="card p-4 flex items-center gap-3">
              <Icon size={18} className="text-primary-500 shrink-0" />
              <span className="text-sm text-[var(--text)]">{label}</span>
            </div>
          ))}
        </div>
        <button onClick={connect} disabled={connecting}
          className="btn-primary flex items-center gap-3 px-8 py-3 text-base">
          {connecting ? <Loader2 size={20} className="animate-spin" /> : (
            <svg viewBox="0 0 48 48" width="20" height="20">
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

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] bg-[var(--surface)] shrink-0 gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-green-500 flex items-center justify-center shrink-0">
            <HardDrive size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold text-[var(--text)] leading-tight">Google Drive</h1>
            <p className="text-xs text-[var(--muted)]">{status.google_email}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => loadFiles(currentFolder)} className="icon-btn" title="تحديث">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => setShowNewFolder(true)} className="icon-btn" title="مجلد جديد">
            <FolderPlus size={16} />
          </button>
          <button onClick={disconnect} className="icon-btn-danger text-xs flex items-center gap-1.5 px-3">
            <Link2Off size={14} /> فصل
          </button>
        </div>
      </div>

      {/* Breadcrumb + Search */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--border)] bg-[var(--bg)] shrink-0 flex-wrap">
        <div className="flex items-center gap-1 flex-1 min-w-0 overflow-x-auto">
          {breadcrumbs.map((crumb, i) => (
            <span key={crumb.id} className="flex items-center gap-1 shrink-0">
              {i > 0 && <ChevronLeft size={14} className="text-[var(--muted)]" />}
              <button onClick={() => goToBreadcrumb(crumb)}
                className={`text-xs px-2 py-1 rounded-lg transition-colors ${i === breadcrumbs.length - 1 ? 'font-semibold text-[var(--text)] bg-[var(--surface)]' : 'text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface)]'}`}>
                {i === 0 ? <Home size={13} /> : crumb.name}
              </button>
            </span>
          ))}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <div className="relative">
            <Search size={14} className="absolute start-2.5 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
            <input value={searchQ} onChange={e => setSearchQ(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="بحث في Drive..." dir="rtl"
              className="input ps-8 pe-3 py-1.5 text-xs w-44" />
          </div>
          {searchMode && (
            <button onClick={() => { setSearchMode(false); setSearchQ(''); loadFiles(currentFolder) }}
              className="icon-btn text-red-500"><X size={14} /></button>
          )}
        </div>
      </div>

      {/* File Grid */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading && files.length === 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="card p-4 flex flex-col gap-2 animate-pulse">
                <div className="w-10 h-10 rounded-xl bg-[var(--border)]" />
                <div className="h-3 bg-[var(--border)] rounded w-3/4" />
                <div className="h-2 bg-[var(--border)] rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : files.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <FolderOpen size={40} className="text-[var(--muted)]" />
            <p className="text-[var(--muted)] text-sm">{searchMode ? 'لا توجد نتائج' : 'هذا المجلد فارغ'}</p>
          </div>
        ) : (
          <>
            {folders.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-semibold text-[var(--muted)] mb-2 px-1">المجلدات ({folders.length})</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                  {folders.map(f => (
                    <DriveFileCard key={f.id} file={f} onOpen={() => openFolder(f)} onMenu={openMenu} onImport={null} />
                  ))}
                </div>
              </div>
            )}
            {fileItems.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-[var(--muted)] mb-2 px-1">الملفات ({fileItems.length})</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                  {fileItems.map(f => (
                    <DriveFileCard key={f.id} file={f} onOpen={() => doPreview(f)} onMenu={openMenu} onImport={() => { setImportTarget(f); setImportProject(projects[0]?.id || null) }} />
                  ))}
                </div>
              </div>
            )}
            {nextPageToken && (
              <button onClick={() => loadFiles(currentFolder, nextPageToken)} disabled={loading}
                className="mt-4 w-full btn-ghost text-sm flex items-center justify-center gap-2">
                {loading ? <Loader2 size={15} className="animate-spin" /> : null}
                تحميل المزيد
              </button>
            )}
          </>
        )}
      </div>

      {/* Context Menu */}
      {menuFile && (
        <div ref={menuRef}
          className="fixed z-50 w-52 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-xl py-1 overflow-hidden"
          style={{ top: menuPos.y, left: menuPos.x }}>
          {!isFolder(menuFile) && (
            <MenuItem icon={FileInput} label="استيراد لمشروع" onClick={() => { setImportTarget(menuFile); setImportProject(projects[0]?.id || null); setMenuFile(null) }} />
          )}
          <MenuItem icon={Pencil} label="إعادة تسمية" onClick={() => { setRenameTarget(menuFile); setRenameName(menuFile.name); setMenuFile(null) }} />
          {!isFolder(menuFile) && (
            <MenuItem icon={Copy} label="نسخ" onClick={() => { doCopy(menuFile); setMenuFile(null) }} />
          )}
          {menuFile.webViewLink && (
            <MenuItem icon={ExternalLink} label="فتح في Drive" onClick={() => { window.open(menuFile.webViewLink, '_blank'); setMenuFile(null) }} />
          )}
          <div className="my-1 border-t border-[var(--border)]" />
          <MenuItem icon={Trash2} label="حذف (مهملات)" onClick={() => { setDeleteTarget(menuFile); setMenuFile(null) }} danger />
        </div>
      )}

      {/* New Folder Modal */}
      {showNewFolder && (
        <Modal title="مجلد جديد" onClose={() => setShowNewFolder(false)}>
          <input value={newFolderName} onChange={e => setNewFolderName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && doNewFolder()}
            placeholder="اسم المجلد" className="input w-full" autoFocus />
          <div className="flex gap-2 mt-4">
            <button onClick={doNewFolder} className="btn-primary flex-1">إنشاء</button>
            <button onClick={() => setShowNewFolder(false)} className="btn-ghost flex-1">إلغاء</button>
          </div>
        </Modal>
      )}

      {/* Rename Modal */}
      {renameTarget && (
        <Modal title="إعادة تسمية" onClose={() => setRenameTarget(null)}>
          <input value={renameName} onChange={e => setRenameName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && doRename()}
            className="input w-full" autoFocus />
          <div className="flex gap-2 mt-4">
            <button onClick={doRename} className="btn-primary flex-1">حفظ</button>
            <button onClick={() => setRenameTarget(null)} className="btn-ghost flex-1">إلغاء</button>
          </div>
        </Modal>
      )}

      {/* Delete Confirm */}
      <ConfirmModal
        open={!!deleteTarget} danger
        title="نقل للمهملات"
        description={`سيتم نقل "${deleteTarget?.name}" إلى مهملات Google Drive.`}
        confirmLabel="نقل للمهملات"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={doDelete}
      />

      {/* Import Modal */}
      {importTarget && (
        <Modal title="استيراد ملف إلى مشروع" onClose={() => setImportTarget(null)}>
          <div className="flex items-center gap-3 mb-4 p-3 bg-[var(--bg)] rounded-xl">
            <FileTypeIcon type={driveTypeToLocal(importTarget.mimeType, importTarget.name)} size="md" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-[var(--text)] truncate">{importTarget.name}</p>
              <p className="text-xs text-[var(--muted)]">{fmtSize(importTarget.size)}</p>
            </div>
          </div>
          <label className="block text-sm font-medium text-[var(--text)] mb-2">اختر المشروع</label>
          {projects.length === 0 ? (
            <p className="text-[var(--muted)] text-sm">لا توجد مشاريع. أنشئ مشروعاً أولاً من لوحة التحكم.</p>
          ) : (
            <select value={importProject || ''} onChange={e => setImportProject(Number(e.target.value))}
              className="input w-full">
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          <div className="flex gap-2 mt-4">
            <button onClick={doImport} disabled={importing || !importProject || projects.length === 0}
              className="btn-primary flex-1 flex items-center justify-center gap-2">
              {importing ? <Loader2 size={15} className="animate-spin" /> : <FileInput size={15} />}
              {importing ? 'جاري الاستيراد...' : 'استيراد'}
            </button>
            <button onClick={() => setImportTarget(null)} className="btn-ghost flex-1">إلغاء</button>
          </div>
        </Modal>
      )}

      {/* Preview Modal */}
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
            {!isFolder(previewFile) && (
              <button onClick={() => { setImportTarget(previewFile); setImportProject(projects[0]?.id || null); setPreviewFile(null) }}
                className="btn-primary flex items-center gap-2">
                <FileInput size={15} /> استيراد لمشروع
              </button>
            )}
            {previewFile.webViewLink && (
              <a href={previewFile.webViewLink} target="_blank" rel="noreferrer"
                className="btn-ghost flex items-center gap-2">
                <ExternalLink size={15} /> فتح في Drive
              </a>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}

function DriveFileCard({ file, onOpen, onMenu, onImport }: {
  file: DriveFile
  onOpen: () => void
  onMenu: (e: React.MouseEvent, file: DriveFile) => void
  onImport: (() => void) | null
}) {
  const folder = isFolder(file)
  return (
    <div
      onDoubleClick={onOpen}
      onClick={onOpen}
      className="card p-3 flex flex-col gap-2 cursor-pointer hover:border-primary-300 dark:hover:border-primary-700 hover:shadow-md transition-all group relative">
      <div className="flex items-start justify-between gap-1">
        {folder ? (
          <div className="w-10 h-10 rounded-xl bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center">
            <Folder size={22} className="text-yellow-500" />
          </div>
        ) : (
          <FileTypeIcon type={driveTypeToLocal(file.mimeType, file.name)} size="md" />
        )}
        <button onClick={e => { e.stopPropagation(); onMenu(e, file) }}
          className="icon-btn opacity-0 group-hover:opacity-100 transition-opacity shrink-0 -mt-1 -me-1">
          <MoreVertical size={14} />
        </button>
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-[var(--text)] truncate" title={file.name}>{file.name}</p>
        <p className="text-[10px] text-[var(--muted)] mt-0.5">{folder ? 'مجلد' : fmtSize(file.size)}</p>
      </div>
      {onImport && !folder && (
        <button onClick={e => { e.stopPropagation(); onImport() }}
          className="opacity-0 group-hover:opacity-100 transition-opacity mt-auto btn-primary text-[10px] py-1 flex items-center justify-center gap-1">
          <FileInput size={11} /> استيراد
        </button>
      )}
    </div>
  )
}

function MenuItem({ icon: Icon, label, onClick, danger = false }: { icon: any; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-2 text-sm transition-colors ${danger ? 'text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20' : 'text-[var(--text)] hover:bg-[var(--bg)]'}`}>
      <Icon size={15} className="shrink-0" />
      {label}
    </button>
  )
}

function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className={`bg-[var(--surface)] rounded-2xl shadow-xl w-full ${wide ? 'max-w-2xl' : 'max-w-md'} border border-[var(--border)]`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <h3 className="font-semibold text-[var(--text)]">{title}</h3>
          <button onClick={onClose} className="icon-btn"><X size={16} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

function PreviewContent({ data }: { data: any }) {
  const p = data.preview
  if (!p) return <p className="text-[var(--muted)] text-sm">لا توجد معاينة</p>
  if (p.type === 'error') return (
    <div className="flex items-center gap-2 text-red-500 p-4">
      <AlertCircle size={18} /> <span className="text-sm">{p.text}</span>
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
    <div className="text-sm text-[var(--text)] whitespace-pre-wrap leading-relaxed font-mono bg-[var(--bg)] p-4 rounded-xl">
      {p.text}
      {p.pages && <div className="mt-2 text-[var(--muted)] text-xs">عدد الصفحات: {p.pages}</div>}
    </div>
  )
  return <p className="text-[var(--muted)] text-sm p-4 text-center">هذا النوع لا يدعم المعاينة</p>
}
