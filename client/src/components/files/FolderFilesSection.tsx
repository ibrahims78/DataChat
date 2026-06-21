import { useState, useEffect, useCallback, useRef } from 'react'
import {
  FolderOpen, RefreshCw, Download, MessageSquare, Trash2,
  ChevronDown, ChevronUp, Loader2, AlertCircle, BookOpen
} from 'lucide-react'
import { useFolderSyncContext } from '../../contexts/FolderSyncContext'
import type { FileInfo } from '../../lib/useFolderSync'
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

// ── helpers ───────────────────────────────────────────────────────────────────
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

function isSupported(name: string): boolean {
  return SUPPORTED_EXTS.has(name.split('.').pop()?.toLowerCase() || '')
}

// ── component ─────────────────────────────────────────────────────────────────
export default function FolderFilesSection({ projectId, onRefresh, onAnalyze, onOpenFilesChange }: Props) {
  const { folders, listFiles, deleteFile } = useFolderSyncContext()
  const grantedFolders = folders.filter(f => f.perm === 'granted')

  const [filesByFolder, setFilesByFolder] = useState<Record<string, FileInfo[]>>({})
  const [loadingFolders, setLoadingFolders] = useState<Set<string>>(new Set())
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [importing, setImporting] = useState<Set<string>>(new Set())
  const [importingAll, setImportingAll] = useState<Set<string>>(new Set())
  const [deleteTarget, setDeleteTarget] = useState<{ folder: string; fi: FileInfo } | null>(null)
  const [openFiles, setOpenFiles] = useState<Set<string>>(new Set())  // paths open for AI reading

  const allFiles = Object.values(filesByFolder).flat()

  const toggleOpenForAI = useCallback((fi: FileInfo) => {
    setOpenFiles(prev => {
      const next = new Set(prev)
      if (next.has(fi.path)) next.delete(fi.path)
      else next.add(fi.path)
      return next
    })
  }, [])

  // Notify parent when open files change
  useEffect(() => {
    const openFileInfos = allFiles.filter(f => openFiles.has(f.path))
    onOpenFilesChange?.(openFileInfos)
  }, [openFiles, JSON.stringify(allFiles.map(f => f.path))])

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

  const importFile = useCallback(async (folderName: string, fi: FileInfo) => {
    const key = `${folderName}:${fi.path}`
    setImporting(prev => new Set([...prev, key]))
    const tid = toast.loading(`جاري استيراد "${fi.name}"…`)
    try {
      const file = await fi.fileHandle.getFile()
      await uploadChunked(file, projectId, () => {})
      await onRefresh()
      toast.dismiss(tid)
      toast.success(`✅ تم استيراد "${fi.name}"`)
    } catch {
      toast.dismiss(tid)
      toast.error(`فشل استيراد "${fi.name}"`)
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
      try {
        const file = await fi.fileHandle.getFile()
        await uploadChunked(file, projectId, () => {})
        done++
      } catch {}
    }
    await onRefresh()
    toast.dismiss(tid)
    toast.success(`✅ تم استيراد ${done} من أصل ${files.length} ملف`)
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
      toast.dismiss(tid)
      toast.error(`فشل رفع "${fi.name}"`)
    } finally {
      setImporting(prev => { const s = new Set(prev); s.delete(key); return s })
    }
  }, [projectId, onRefresh, onAnalyze])

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return
    const { folder, fi } = deleteTarget
    setDeleteTarget(null)
    const result = await deleteFile(folder, fi.path)
    if (result === 'deleted') {
      toast.success(`🗑️ تم حذف "${fi.name}"`)
      setFilesByFolder(prev => ({
        ...prev,
        [folder]: (prev[folder] || []).filter(f => f.path !== fi.path)
      }))
    } else {
      toast.error(`فشل حذف "${fi.name}"`)
    }
  }, [deleteTarget, deleteFile])

  if (!grantedFolders.length) return null

  const totalOpen = openFiles.size

  return (
    <>
      {totalOpen > 0 && (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
          <BookOpen size={12} className="text-emerald-600 shrink-0" />
          <span className="text-[11px] text-emerald-700 dark:text-emerald-300 flex-1">
            {totalOpen} {totalOpen === 1 ? 'ملف مفتوح' : 'ملفات مفتوحة'} للذكاء الاصطناعي — يقرأ محتواها مع كل رسالة
          </span>
          <button
            onClick={() => setOpenFiles(new Set())}
            className="text-[10px] text-emerald-600 hover:text-emerald-800 underline shrink-0"
          >
            إغلاق الكل
          </button>
        </div>
      )}
      {grantedFolders.map(folder => {
        const files = filesByFolder[folder.name] || []
        const isLoading = loadingFolders.has(folder.name)
        const isCollapsed = collapsed[folder.name]
        const isImportingAll = importingAll.has(folder.name)

        return (
          <div key={folder.name} className="border border-[var(--border)] rounded-xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-2 px-3 py-2 bg-[var(--bg)] select-none">
              <button
                onClick={() => setCollapsed(prev => ({ ...prev, [folder.name]: !prev[folder.name] }))}
                className="flex items-center gap-2 flex-1 min-w-0 text-start"
              >
                <FolderOpen size={14} className="text-amber-500 shrink-0" />
                <span className="text-xs font-semibold text-[var(--text)] truncate flex-1">{folder.name}</span>
                <span className="text-[11px] text-[var(--muted)] shrink-0 ml-1">
                  {isLoading ? '…' : `${files.length} ملف`}
                </span>
                {isCollapsed ? <ChevronDown size={12} className="text-[var(--muted)] shrink-0" /> : <ChevronUp size={12} className="text-[var(--muted)] shrink-0" />}
              </button>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => loadFolder(folder.name)}
                  disabled={isLoading}
                  title="تحديث"
                  className="p-1 rounded-lg hover:bg-[var(--card)] text-[var(--muted)] hover:text-primary-500 transition-colors disabled:opacity-40"
                >
                  <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
                </button>
                <button
                  onClick={() => importAll(folder.name)}
                  disabled={isImportingAll || !files.some(f => isSupported(f.name))}
                  title="استيراد جميع الملفات إلى المشروع"
                  className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-primary-100 dark:bg-primary-900/40
                             text-primary-700 dark:text-primary-300 hover:bg-primary-200 dark:hover:bg-primary-900/60
                             text-[11px] font-medium transition-colors disabled:opacity-40"
                >
                  {isImportingAll
                    ? <Loader2 size={11} className="animate-spin" />
                    : <Download size={11} />}
                  استيراد الكل
                </button>
              </div>
            </div>

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
                    const isOpenForAI = openFiles.has(fi.path)

                    return (
                      <div key={fi.path}
                        className={`flex items-center gap-2 px-3 py-1.5 group transition-colors ${isOpenForAI ? 'bg-emerald-50 dark:bg-emerald-900/10' : 'hover:bg-[var(--bg)]'}`}>
                        <span className="text-sm shrink-0">{fileTypeIcon(fi.name)}</span>
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs font-medium truncate ${isOpenForAI ? 'text-emerald-700 dark:text-emerald-300' : 'text-[var(--text)]'}`} title={fi.path}>{fi.name}</p>
                          {fi.path.includes('/') && (
                            <p className="text-[10px] text-[var(--muted)] truncate">
                              {fi.path.split('/').slice(0, -1).join('/')}
                            </p>
                          )}
                        </div>
                        <span className="text-[10px] text-[var(--muted)] shrink-0 hidden group-hover:inline">
                          {formatSize(fi.size)}
                        </span>
                        {isOpenForAI && (
                          <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 shrink-0 bg-emerald-100 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded">
                            مفتوح للذكاء
                          </span>
                        )}
                        <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                          {readable && (
                            <button
                              onClick={() => toggleOpenForAI(fi)}
                              title={isOpenForAI ? 'إغلاق — لن يقرأ الذكاء الاصطناعي هذا الملف' : 'فتح للذكاء الاصطناعي — يقرأ محتواه مباشرةً بدون تحميل'}
                              className={`p-1 rounded transition-colors ${
                                isOpenForAI
                                  ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
                                  : 'hover:bg-emerald-100 dark:hover:bg-emerald-900/30 text-[var(--muted)] hover:text-emerald-600'
                              }`}
                            >
                              <BookOpen size={12} />
                            </button>
                          )}
                          {supported && (
                            <>
                              <button
                                onClick={() => importFile(folder.name, fi)}
                                disabled={isBusy}
                                title="استيراد إلى المشروع (رفع دائم)"
                                className="p-1 rounded hover:bg-primary-100 dark:hover:bg-primary-900/30
                                           text-[var(--muted)] hover:text-primary-600 transition-colors disabled:opacity-40"
                              >
                                {isBusy ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                              </button>
                              {onAnalyze && (
                                <button
                                  onClick={() => analyzeFile(folder.name, fi)}
                                  disabled={isBusy}
                                  title="استيراد وتحليل بالذكاء الاصطناعي"
                                  className="p-1 rounded hover:bg-blue-100 dark:hover:bg-blue-900/30
                                             text-[var(--muted)] hover:text-blue-600 transition-colors disabled:opacity-40"
                                >
                                  <MessageSquare size={12} />
                                </button>
                              )}
                            </>
                          )}
                          <button
                            onClick={() => setDeleteTarget({ folder: folder.name, fi })}
                            title="حذف من المجلد"
                            className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30
                                       text-[var(--muted)] hover:text-red-600 transition-colors"
                          >
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
    </>
  )
}
