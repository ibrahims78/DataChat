import { useState, useEffect, useCallback, useRef } from 'react'
import {
  FolderOpen, RefreshCw, Download, MessageSquare, Trash2,
  ChevronDown, ChevronUp, Loader2, AlertCircle, BookOpen,
  Pencil, Copy, MoveRight, FolderPlus, Check, X, FileEdit,
  MoreHorizontal
} from 'lucide-react'
import { useFolderSyncContext } from '../../contexts/FolderSyncContext'
import type { FileInfo, FolderEntry } from '../../lib/useFolderSync'
import { uploadChunked } from '../../lib/uploadChunked'
import { canReadDirectly } from '../../lib/folderFileReader'
import toast from 'react-hot-toast'
import ConfirmModal from '../ui/ConfirmModal'

interface Props {
  projectId: number
  onRefresh: () => void
  onAnalyze?: (msg: string) => void
  onOpenFilesChange?: (files: FileInfo[]) => void
}

function fileTypeIcon(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  if (['xlsx', 'xlsm', 'xls'].includes(ext)) return '📊'
  if (ext === 'csv') return '📋'
  if (ext === 'pdf') return '📄'
  if (['doc', 'docx'].includes(ext)) return '📝'
  if (['htm', 'html'].includes(ext)) return '🌐'
  if (ext === 'md') return '📑'
  if (ext === 'json') return '🗂️'
  if (['txt', 'log'].includes(ext)) return '📃'
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff', 'tif', 'heic', 'heif'].includes(ext)) return '🖼️'
  return '📎'
}

function formatSize(bytes: number): string {
  if (!bytes) return ''
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

const SUPPORTED_EXTS = new Set([
  'xlsx', 'xlsm', 'xls', 'csv', 'pdf', 'docx', 'doc',
  'md', 'txt', 'json', 'html', 'htm',
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff', 'tif', 'heic', 'heif'
])
const EDITABLE_EXTS = new Set(['txt', 'md', 'json', 'html', 'htm', 'csv'])

function isSupported(name: string) { return SUPPORTED_EXTS.has(name.split('.').pop()?.toLowerCase() || '') }
function isEditable(name: string) { return EDITABLE_EXTS.has(name.split('.').pop()?.toLowerCase() || '') }

// ── CopyMoveModal ─────────────────────────────────────────────────────────────
interface CopyMoveModalProps {
  mode: 'copy' | 'move'
  fi: FileInfo
  sourceFolderName: string
  grantedFolders: FolderEntry[]
  onClose: () => void
  onConfirm: (targetFolder: string, targetPath: string) => Promise<void>
}

function CopyMoveModal({ mode, fi, sourceFolderName, grantedFolders, onClose, onConfirm }: CopyMoveModalProps) {
  const [targetFolder, setTargetFolder] = useState(sourceFolderName)
  const [subPath, setSubPath] = useState(() => {
    const parts = fi.path.split('/')
    return parts.length > 1 ? parts.slice(0, -1).join('/') : ''
  })
  const [newName, setNewName] = useState(fi.name)
  const [busy, setBusy] = useState(false)

  const targetPath = subPath.trim()
    ? `${subPath.trim().replace(/\/$/, '')}/${newName.trim()}`
    : newName.trim()

  const handleConfirm = async () => {
    if (!newName.trim()) return
    setBusy(true)
    try {
      await onConfirm(targetFolder, targetPath)
    } finally {
      setBusy(false)
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="card p-5 w-full max-w-md animate-fade-in" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-[var(--text)] flex items-center gap-2">
            {mode === 'copy' ? <Copy size={16} className="text-primary-500" /> : <MoveRight size={16} className="text-primary-500" />}
            {mode === 'copy' ? 'نسخ الملف' : 'نقل الملف'}
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-[var(--bg)] text-[var(--muted)]"><X size={16} /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-[var(--muted)] block mb-1">الملف المصدر</label>
            <div className="text-xs text-[var(--text)] bg-[var(--bg)] rounded-lg px-3 py-2 font-mono truncate">{fi.path}</div>
          </div>
          <div>
            <label className="text-xs text-[var(--muted)] block mb-1">المجلد المرتبط الهدف</label>
            <select value={targetFolder} onChange={e => setTargetFolder(e.target.value)}
              className="w-full text-xs bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--text)] outline-none focus:border-primary-400">
              {grantedFolders.map(f => <option key={f.name} value={f.name}>{f.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--muted)] block mb-1">مسار المجلد الفرعي (اختياري)</label>
            <input type="text" value={subPath} onChange={e => setSubPath(e.target.value)}
              placeholder="مثال: تقارير/2025"
              className="w-full text-xs bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--text)] outline-none focus:border-primary-400" />
          </div>
          <div>
            <label className="text-xs text-[var(--muted)] block mb-1">اسم الملف</label>
            <input type="text" value={newName} onChange={e => setNewName(e.target.value)}
              className="w-full text-xs bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--text)] outline-none focus:border-primary-400" />
          </div>
          <div className="text-[11px] text-[var(--muted)] bg-[var(--bg)] rounded-lg px-3 py-2">
            المسار النهائي: <span className="font-mono text-primary-600">{targetFolder}/{targetPath}</span>
          </div>
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 btn-ghost text-sm">إلغاء</button>
          <button onClick={handleConfirm} disabled={busy || !newName.trim()}
            className="flex-1 btn-primary text-sm flex items-center justify-center gap-2 disabled:opacity-50">
            {busy ? <Loader2 size={14} className="animate-spin" /> : (mode === 'copy' ? <Copy size={14} /> : <MoveRight size={14} />)}
            {mode === 'copy' ? 'نسخ' : 'نقل'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── EditModal ─────────────────────────────────────────────────────────────────
interface EditModalProps {
  fi: FileInfo
  folderName: string
  onClose: () => void
  onSave: (folderName: string, filePath: string, content: string) => Promise<void>
}

function EditModal({ fi, folderName, onClose, onSave }: EditModalProps) {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fi.fileHandle.getFile().then(f => f.text()).then(t => { setContent(t); setLoading(false) })
      .catch(() => { setContent(''); setLoading(false) })
  }, [fi])

  const handleSave = async () => {
    setBusy(true)
    try { await onSave(folderName, fi.path, content) }
    finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="card p-5 w-full max-w-2xl max-h-[85vh] flex flex-col animate-fade-in" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-[var(--text)] flex items-center gap-2 text-sm">
            <FileEdit size={15} className="text-primary-500" /> تعديل: {fi.name}
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-[var(--bg)] text-[var(--muted)]"><X size={16} /></button>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={20} className="animate-spin text-primary-500" />
          </div>
        ) : (
          <textarea value={content} onChange={e => setContent(e.target.value)}
            className="flex-1 min-h-[400px] text-xs font-mono bg-[var(--bg)] border border-[var(--border)] rounded-lg p-3 text-[var(--text)] outline-none focus:border-primary-400 resize-none" dir="ltr" />
        )}
        <div className="flex gap-2 mt-3">
          <button onClick={onClose} className="flex-1 btn-ghost text-sm">إلغاء</button>
          <button onClick={handleSave} disabled={busy || loading}
            className="flex-1 btn-primary text-sm flex items-center justify-center gap-2 disabled:opacity-50">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} حفظ
          </button>
        </div>
      </div>
    </div>
  )
}

// ── FileActionMenu ─────────────────────────────────────────────────────────────
interface FileActionMenuProps {
  fi: FileInfo
  folderName: string
  editable: boolean
  supported: boolean
  onEdit: () => void
  onRename: () => void
  onCopy: () => void
  onMove: () => void
  onAnalyze?: () => void
  onClose: () => void
}

function FileActionMenu({ fi, folderName, editable, supported, onEdit, onRename, onCopy, onMove, onAnalyze, onClose }: FileActionMenuProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    setTimeout(() => document.addEventListener('mousedown', handler), 0)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const Item = ({ icon, label, onClick, color = '' }: { icon: React.ReactNode; label: string; onClick: () => void; color?: string }) => (
    <button onClick={() => { onClick(); onClose() }}
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-[var(--bg)] transition-colors text-start ${color || 'text-[var(--text)]'}`}>
      {icon} {label}
    </button>
  )

  return (
    <div ref={ref}
      className="absolute end-6 top-0 z-30 w-44 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-xl py-1 animate-fade-in">
      {editable && <Item icon={<FileEdit size={12} />} label="تعديل المحتوى" onClick={onEdit} />}
      <Item icon={<Pencil size={12} />} label="إعادة التسمية" onClick={onRename} />
      <Item icon={<Copy size={12} />} label="نسخ إلى..." onClick={onCopy} />
      <Item icon={<MoveRight size={12} />} label="نقل إلى..." onClick={onMove} />
      {supported && onAnalyze && (
        <>
          <div className="border-t border-[var(--border)] my-0.5" />
          <Item icon={<MessageSquare size={12} />} label="تحليل بالذكاء الاصطناعي" onClick={onAnalyze} color="text-blue-600 dark:text-blue-400" />
        </>
      )}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function FolderFilesSection({ projectId, onRefresh, onAnalyze, onOpenFilesChange }: Props) {
  const { folders, listFiles, deleteFile, writeFileContent, createDirectory, readFileBlob } = useFolderSyncContext()
  const grantedFolders = folders.filter(f => f.perm === 'granted')

  const [filesByFolder, setFilesByFolder] = useState<Record<string, FileInfo[]>>({})
  const [loadingFolders, setLoadingFolders] = useState<Set<string>>(new Set())
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [importing, setImporting] = useState<Set<string>>(new Set())
  const [importingAll, setImportingAll] = useState<Set<string>>(new Set())
  const [deleteTarget, setDeleteTarget] = useState<{ folder: string; fi: FileInfo } | null>(null)
  const [openFiles, setOpenFiles] = useState<Set<string>>(new Set())
  const [renaming, setRenaming] = useState<{ folder: string; fi: FileInfo; value: string } | null>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)
  const [creatingFolder, setCreatingFolder] = useState<{ folderName: string; value: string } | null>(null)
  const newFolderRef = useRef<HTMLInputElement>(null)
  const [copyMoveTarget, setCopyMoveTarget] = useState<{ mode: 'copy' | 'move'; folder: string; fi: FileInfo } | null>(null)
  const [editTarget, setEditTarget] = useState<{ folder: string; fi: FileInfo } | null>(null)
  const [openActionMenu, setOpenActionMenu] = useState<string | null>(null)

  const allFiles = Object.values(filesByFolder).flat()

  const toggleOpenForAI = useCallback((fi: FileInfo) => {
    setOpenFiles(prev => {
      const next = new Set(prev)
      if (next.has(fi.path)) next.delete(fi.path)
      else next.add(fi.path)
      return next
    })
  }, [])

  useEffect(() => {
    const openFileInfos = allFiles.filter(f => openFiles.has(f.path))
    onOpenFilesChange?.(openFileInfos)
  }, [openFiles, JSON.stringify(allFiles.map(f => f.path))])

  useEffect(() => {
    if (renaming) setTimeout(() => renameInputRef.current?.focus(), 50)
  }, [renaming])

  useEffect(() => {
    if (creatingFolder) setTimeout(() => newFolderRef.current?.focus(), 50)
  }, [creatingFolder])

  const loadRef = useRef(listFiles)
  useEffect(() => { loadRef.current = listFiles }, [listFiles])

  const loadFolder = useCallback(async (folderName: string) => {
    setLoadingFolders(prev => new Set([...prev, folderName]))
    try {
      const files = await loadRef.current(folderName, true)
      setFilesByFolder(prev => ({ ...prev, [folderName]: files }))
    } catch {
      setFilesByFolder(prev => ({ ...prev, [folderName]: [] }))
    } finally {
      setLoadingFolders(prev => { const s = new Set(prev); s.delete(folderName); return s })
    }
  }, [])

  useEffect(() => {
    grantedFolders.forEach(f => loadFolder(f.name))
  }, [grantedFolders.map(f => f.name).join('|')])

  // ── Import ──────────────────────────────────────────────────────────────────
  const importFile = useCallback(async (folderName: string, fi: FileInfo) => {
    const key = `${folderName}:${fi.path}`
    setImporting(prev => new Set([...prev, key]))
    const tid = toast.loading(`جاري استيراد "${fi.name}"…`)
    try {
      const file = await fi.fileHandle.getFile()
      await uploadChunked(file, projectId, () => {})
      await onRefresh()
      toast.dismiss(tid); toast.success(`✅ تم استيراد "${fi.name}"`)
    } catch {
      toast.dismiss(tid); toast.error(`فشل استيراد "${fi.name}"`)
    } finally {
      setImporting(prev => { const s = new Set(prev); s.delete(key); return s })
    }
  }, [projectId, onRefresh])

  const importAll = useCallback(async (folderName: string) => {
    const files = (filesByFolder[folderName] || []).filter(f => isSupported(f.name))
    if (!files.length) { toast('لا توجد ملفات مدعومة للاستيراد', { icon: 'ℹ️' }); return }
    setImportingAll(prev => new Set([...prev, folderName]))
    const tid = toast.loading(`جاري استيراد ${files.length} ملف…`)
    let done = 0
    for (const fi of files) {
      try { const file = await fi.fileHandle.getFile(); await uploadChunked(file, projectId, () => {}); done++ } catch {}
    }
    await onRefresh()
    toast.dismiss(tid); toast.success(`✅ تم استيراد ${done} من أصل ${files.length} ملف`)
    setImportingAll(prev => { const s = new Set(prev); s.delete(folderName); return s })
  }, [filesByFolder, projectId, onRefresh])

  const analyzeFile = useCallback(async (folderName: string, fi: FileInfo) => {
    const key = `${folderName}:${fi.path}`
    setImporting(prev => new Set([...prev, key]))
    const tid = toast.loading(`جاري رفع "${fi.name}" للتحليل…`)
    try {
      const file = await fi.fileHandle.getFile()
      await uploadChunked(file, projectId, () => {})
      await onRefresh()
      toast.dismiss(tid)
      onAnalyze?.(`حلل الملف "${fi.name}"`)
    } catch {
      toast.dismiss(tid); toast.error(`فشل رفع "${fi.name}"`)
    } finally {
      setImporting(prev => { const s = new Set(prev); s.delete(key); return s })
    }
  }, [projectId, onRefresh, onAnalyze])

  // ── Delete ──────────────────────────────────────────────────────────────────
  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return
    const { folder, fi } = deleteTarget
    setDeleteTarget(null)
    const result = await deleteFile(folder, fi.path)
    if (result === 'deleted') {
      toast.success(`🗑️ تم حذف "${fi.name}"`)
      setFilesByFolder(prev => ({ ...prev, [folder]: (prev[folder] || []).filter(f => f.path !== fi.path) }))
    } else {
      toast.error(`فشل حذف "${fi.name}"`)
    }
  }, [deleteTarget, deleteFile])

  // ── Rename ──────────────────────────────────────────────────────────────────
  const commitRename = useCallback(async () => {
    if (!renaming || !renaming.value.trim()) { setRenaming(null); return }
    const { folder, fi, value } = renaming
    const newName = value.trim()
    if (newName === fi.name) { setRenaming(null); return }
    const subDir = fi.path.includes('/') ? fi.path.split('/').slice(0, -1).join('/') + '/' : ''
    const newPath = subDir + newName
    const tid = toast.loading(`جاري إعادة تسمية "${fi.name}"…`)
    setRenaming(null)
    try {
      const blob = await readFileBlob(fi.fileHandle)
      if (!blob) throw new Error('read failed')
      const writeResult = await writeFileContent(folder, newPath, blob)
      if (writeResult !== 'saved') throw new Error(writeResult)
      await deleteFile(folder, fi.path)
      toast.dismiss(tid); toast.success(`✅ تمت إعادة التسمية إلى "${newName}"`)
      await loadFolder(folder)
    } catch {
      toast.dismiss(tid); toast.error('فشل إعادة التسمية')
    }
  }, [renaming, readFileBlob, writeFileContent, deleteFile, loadFolder])

  // ── Copy / Move ─────────────────────────────────────────────────────────────
  const executeCopyMove = useCallback(async (
    mode: 'copy' | 'move',
    sourceFolderName: string,
    fi: FileInfo,
    targetFolderName: string,
    targetPath: string
  ) => {
    const tid = toast.loading(mode === 'copy' ? `جاري نسخ "${fi.name}"…` : `جاري نقل "${fi.name}"…`)
    try {
      const blob = await readFileBlob(fi.fileHandle)
      if (!blob) throw new Error('read failed')
      const writeResult = await writeFileContent(targetFolderName, targetPath, blob)
      if (writeResult !== 'saved') throw new Error(writeResult)
      if (mode === 'move') {
        await deleteFile(sourceFolderName, fi.path)
        await loadFolder(sourceFolderName)
      }
      await loadFolder(targetFolderName)
      toast.dismiss(tid)
      toast.success(mode === 'copy' ? `✅ تم نسخ "${fi.name}"` : `✅ تم نقل "${fi.name}"`)
    } catch {
      toast.dismiss(tid)
      toast.error(mode === 'copy' ? 'فشل النسخ' : 'فشل النقل')
    }
  }, [readFileBlob, writeFileContent, deleteFile, loadFolder])

  // ── Create folder ───────────────────────────────────────────────────────────
  const commitCreateFolder = useCallback(async () => {
    if (!creatingFolder || !creatingFolder.value.trim()) { setCreatingFolder(null); return }
    const { folderName, value } = creatingFolder
    setCreatingFolder(null)
    const tid = toast.loading(`جاري إنشاء المجلد "${value}"…`)
    try {
      const result = await createDirectory(folderName, value.trim())
      if (result === 'created') {
        toast.dismiss(tid); toast.success(`✅ تم إنشاء المجلد "${value}"`)
        await loadFolder(folderName)
      } else throw new Error(result)
    } catch {
      toast.dismiss(tid); toast.error('فشل إنشاء المجلد')
    }
  }, [creatingFolder, createDirectory, loadFolder])

  // ── Edit ────────────────────────────────────────────────────────────────────
  const saveEdit = useCallback(async (folderName: string, filePath: string, content: string) => {
    setEditTarget(null)
    const tid = toast.loading('جاري الحفظ…')
    try {
      const result = await writeFileContent(folderName, filePath, content)
      if (result !== 'saved') throw new Error(result)
      toast.dismiss(tid); toast.success('✅ تم الحفظ')
      await loadFolder(folderName)
    } catch {
      toast.dismiss(tid); toast.error('فشل الحفظ')
    }
  }, [writeFileContent, loadFolder])

  if (!grantedFolders.length) return null

  const totalOpen = openFiles.size

  return (
    <>
      {/* Open for AI indicator */}
      {totalOpen > 0 && (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
          <BookOpen size={12} className="text-emerald-600 shrink-0" />
          <span className="text-[11px] text-emerald-700 dark:text-emerald-300 flex-1">
            {totalOpen} {totalOpen === 1 ? 'ملف مفتوح' : 'ملفات مفتوحة'} للذكاء الاصطناعي
          </span>
          <button onClick={() => setOpenFiles(new Set())}
            className="text-[10px] text-emerald-600 hover:text-emerald-800 underline shrink-0">إغلاق الكل</button>
        </div>
      )}

      {grantedFolders.map(folder => {
        const files = filesByFolder[folder.name] || []
        const isLoading = loadingFolders.has(folder.name)
        const isCollapsed = collapsed[folder.name]
        const isImportingAll = importingAll.has(folder.name)

        return (
          <div key={folder.name} className="border border-[var(--border)] rounded-xl overflow-hidden">
            {/* Folder header */}
            <div className="flex items-center gap-2 px-3 py-2 bg-[var(--bg)] select-none">
              <button
                onClick={() => setCollapsed(prev => ({ ...prev, [folder.name]: !prev[folder.name] }))}
                className="flex items-center gap-2 flex-1 min-w-0 text-start"
              >
                <FolderOpen size={14} className="text-amber-500 shrink-0" />
                <span className="text-xs font-semibold text-[var(--text)] truncate flex-1">{folder.name}</span>
                <span className="text-[11px] text-[var(--muted)] shrink-0">
                  {isLoading ? '…' : `${files.length} ملف`}
                </span>
                {isCollapsed ? <ChevronDown size={12} className="text-[var(--muted)] shrink-0" /> : <ChevronUp size={12} className="text-[var(--muted)] shrink-0" />}
              </button>
              <div className="flex items-center gap-1 shrink-0">
                {/* New subfolder on disk */}
                <button onClick={() => setCreatingFolder({ folderName: folder.name, value: '' })}
                  title="إنشاء مجلد فرعي على القرص"
                  className="p-1 rounded-lg hover:bg-[var(--card)] text-[var(--muted)] hover:text-amber-500 transition-colors">
                  <FolderPlus size={12} />
                </button>
                {/* Refresh */}
                <button onClick={() => loadFolder(folder.name)} disabled={isLoading} title="تحديث"
                  className="p-1 rounded-lg hover:bg-[var(--card)] text-[var(--muted)] hover:text-primary-500 transition-colors disabled:opacity-40">
                  <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
                </button>
                {/* Import all */}
                <button onClick={() => importAll(folder.name)}
                  disabled={isImportingAll || !files.some(f => isSupported(f.name))}
                  title="استيراد جميع الملفات المدعومة إلى المشروع"
                  className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-primary-100 dark:bg-primary-900/40
                             text-primary-700 dark:text-primary-300 hover:bg-primary-200 dark:hover:bg-primary-900/60
                             text-[11px] font-medium transition-colors disabled:opacity-40">
                  {isImportingAll ? <Loader2 size={11} className="animate-spin" /> : <Download size={11} />}
                  استيراد الكل
                </button>
              </div>
            </div>

            {/* New subfolder input */}
            {creatingFolder?.folderName === folder.name && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--bg)] border-t border-[var(--border)]">
                <FolderPlus size={12} className="text-amber-500 shrink-0" />
                <input ref={newFolderRef} value={creatingFolder.value}
                  onChange={e => setCreatingFolder(prev => prev ? { ...prev, value: e.target.value } : prev)}
                  onKeyDown={e => { if (e.key === 'Enter') commitCreateFolder(); if (e.key === 'Escape') setCreatingFolder(null) }}
                  onBlur={commitCreateFolder}
                  placeholder="اسم المجلد الفرعي على القرص…"
                  className="flex-1 text-xs bg-[var(--surface)] border border-primary-400 rounded px-2 py-1 outline-none text-[var(--text)]" />
                <button onClick={commitCreateFolder} className="p-1 text-primary-500 hover:text-primary-700"><Check size={13} /></button>
                <button onClick={() => setCreatingFolder(null)} className="p-1 text-[var(--muted)] hover:text-red-500"><X size={13} /></button>
              </div>
            )}

            {/* File list */}
            {!isCollapsed && (
              <div className="divide-y divide-[var(--border)]">
                {isLoading ? (
                  <div className="flex items-center justify-center gap-2 py-6 text-[var(--muted)]">
                    <Loader2 size={14} className="animate-spin" />
                    <span className="text-xs">جاري تحميل الملفات…</span>
                  </div>
                ) : files.length === 0 ? (
                  <div className="flex items-center justify-center gap-2 py-6 text-[var(--muted)]">
                    <AlertCircle size={14} />
                    <span className="text-xs">المجلد فارغ</span>
                  </div>
                ) : (
                  files.map(fi => {
                    const key = `${folder.name}:${fi.path}`
                    const isBusy = importing.has(key)
                    const supported = isSupported(fi.name)
                    const readable = canReadDirectly(fi.name)
                    const editable = isEditable(fi.name)
                    const isOpenForAI = openFiles.has(fi.path)
                    const isRenamingThis = renaming?.folder === folder.name && renaming.fi.path === fi.path
                    const menuOpen = openActionMenu === fi.path

                    return (
                      <div key={fi.path}
                        className={`relative flex items-center gap-2 px-3 py-1.5 group transition-colors
                          ${isOpenForAI ? 'bg-emerald-50 dark:bg-emerald-900/10' : 'hover:bg-[var(--bg)]'}`}>

                        <span className="text-sm shrink-0">{fileTypeIcon(fi.name)}</span>

                        {/* File name / rename input */}
                        <div className="flex-1 min-w-0">
                          {isRenamingThis ? (
                            <input ref={renameInputRef} value={renaming!.value}
                              onChange={e => setRenaming(r => r ? { ...r, value: e.target.value } : r)}
                              onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenaming(null) }}
                              onBlur={commitRename}
                              onClick={e => e.stopPropagation()}
                              className="text-xs w-full bg-[var(--surface)] border border-primary-400 rounded px-1.5 py-0.5 outline-none text-[var(--text)]" />
                          ) : (
                            <>
                              <p className={`text-xs font-medium truncate ${isOpenForAI ? 'text-emerald-700 dark:text-emerald-300' : 'text-[var(--text)]'}`}
                                title={fi.path}
                                onDoubleClick={() => setRenaming({ folder: folder.name, fi, value: fi.name })}>
                                {fi.name}
                              </p>
                              {fi.path.includes('/') && (
                                <p className="text-[10px] text-[var(--muted)] truncate">
                                  {fi.path.split('/').slice(0, -1).join('/')}
                                </p>
                              )}
                            </>
                          )}
                        </div>

                        <span className="text-[10px] text-[var(--muted)] shrink-0 hidden group-hover:inline">
                          {formatSize(fi.size)}
                        </span>

                        {isOpenForAI && (
                          <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 shrink-0 bg-emerald-100 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded">
                            مفتوح
                          </span>
                        )}

                        {/* Primary action buttons — always on hover */}
                        <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                          {/* Open for AI — primary */}
                          {readable && (
                            <button onClick={e => { e.stopPropagation(); toggleOpenForAI(fi) }}
                              title={isOpenForAI ? 'إغلاق من الذكاء الاصطناعي' : 'فتح للذكاء الاصطناعي (قراءة مباشرة)'}
                              className={`p-1 rounded transition-colors ${
                                isOpenForAI
                                  ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
                                  : 'hover:bg-emerald-100 dark:hover:bg-emerald-900/30 text-[var(--muted)] hover:text-emerald-600'
                              }`}>
                              <BookOpen size={12} />
                            </button>
                          )}
                          {/* Import — primary (only if supported) */}
                          {supported && (
                            <button onClick={e => { e.stopPropagation(); importFile(folder.name, fi) }}
                              disabled={isBusy} title="استيراد إلى المشروع"
                              className="p-1 rounded hover:bg-primary-100 dark:hover:bg-primary-900/30 text-[var(--muted)] hover:text-primary-600 transition-colors disabled:opacity-40">
                              {isBusy ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                            </button>
                          )}
                          {/* More actions — overflow menu */}
                          <div className="relative">
                            <button onClick={e => { e.stopPropagation(); setOpenActionMenu(menuOpen ? null : fi.path) }}
                              title="المزيد من الإجراءات"
                              className={`p-1 rounded transition-colors ${menuOpen ? 'bg-[var(--bg)] text-primary-600' : 'hover:bg-[var(--bg)] text-[var(--muted)] hover:text-[var(--text)]'}`}>
                              <MoreHorizontal size={12} />
                            </button>
                            {menuOpen && (
                              <FileActionMenu
                                fi={fi} folderName={folder.name}
                                editable={editable} supported={supported}
                                onEdit={() => setEditTarget({ folder: folder.name, fi })}
                                onRename={() => setRenaming({ folder: folder.name, fi, value: fi.name })}
                                onCopy={() => setCopyMoveTarget({ mode: 'copy', folder: folder.name, fi })}
                                onMove={() => setCopyMoveTarget({ mode: 'move', folder: folder.name, fi })}
                                onAnalyze={onAnalyze ? () => analyzeFile(folder.name, fi) : undefined}
                                onClose={() => setOpenActionMenu(null)}
                              />
                            )}
                          </div>
                          {/* Delete — primary */}
                          <button onClick={e => { e.stopPropagation(); setDeleteTarget({ folder: folder.name, fi }) }}
                            title="حذف من المجلد"
                            className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-[var(--muted)] hover:text-red-600 transition-colors">
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            )}
          </div>
        )
      })}

      {/* Delete confirm */}
      <ConfirmModal
        open={!!deleteTarget}
        title="حذف الملف"
        icon="🗑️"
        danger
        description={`هل تريد حذف "${deleteTarget?.fi.name}" من المجلد المرتبط؟ لا يمكن التراجع عن هذا.`}
        confirmLabel="حذف"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />

      {/* Copy/Move modal */}
      {copyMoveTarget && (
        <CopyMoveModal
          mode={copyMoveTarget.mode}
          fi={copyMoveTarget.fi}
          sourceFolderName={copyMoveTarget.folder}
          grantedFolders={grantedFolders}
          onClose={() => setCopyMoveTarget(null)}
          onConfirm={(targetFolder, targetPath) =>
            executeCopyMove(copyMoveTarget.mode, copyMoveTarget.folder, copyMoveTarget.fi, targetFolder, targetPath)
          }
        />
      )}

      {/* Edit modal */}
      {editTarget && (
        <EditModal
          fi={editTarget.fi}
          folderName={editTarget.folder}
          onClose={() => setEditTarget(null)}
          onSave={saveEdit}
        />
      )}
    </>
  )
}
