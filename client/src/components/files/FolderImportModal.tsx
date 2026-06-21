import { useState, useEffect, useCallback } from 'react'
import {
  X, Download, CheckSquare, Square, Loader2,
  CheckCircle, AlertCircle, Clock, FolderOpen,
  Zap, Filter, ChevronDown
} from 'lucide-react'
import FileTypeIcon from '../ui/FileTypeIcon'
import { useFolderSyncContext } from '../../contexts/FolderSyncContext'
import { uploadChunked } from '../../lib/uploadChunked'
import { uploadStarted, uploadFinished } from '../../lib/api'
import toast from 'react-hot-toast'
import type { FileInfo } from '../../lib/useFolderSync'

// ─── Types ───────────────────────────────────────────────────────────────────────
type Phase = 'browse' | 'uploading' | 'done'
type ItemStatus = 'idle' | 'uploading' | 'done' | 'error'

interface ImportItem {
  info: FileInfo
  selected: boolean
  status: ItemStatus
  progress: number
  error?: string
}

interface Props {
  projectId:      number
  folderName:     string
  onClose:        () => void
  onRefresh:      () => void
  onBatchAnalyze?: (msg: string) => void
}

// ─── Helpers ─────────────────────────────────────────────────────────────────────
const ACCEPTED_EXTS = new Set([
  '.xlsx', '.xlsm', '.xls', '.csv', '.pdf', '.docx', '.doc',
  '.md', '.txt', '.json', '.html', '.htm',
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.tif', '.heic', '.heif',
])
function ext(name: string) { return name.split('.').pop()?.toLowerCase() ?? '' }
function extToType(name: string): string {
  const e = ext(name)
  if (['xlsx','xlsm','xls'].includes(e)) return 'excel'
  if (e === 'csv') return 'csv'
  if (e === 'pdf') return 'pdf'
  if (['doc','docx'].includes(e)) return 'word'
  if (['html','htm'].includes(e)) return 'html'
  if (e === 'md') return 'markdown'
  if (e === 'json') return 'json'
  if (['txt','log'].includes(e)) return 'text'
  if (['jpg','jpeg','png','gif','webp','bmp','tiff','tif','heic','heif'].includes(e)) return 'image'
  return 'default'
}
function fmtSize(b: number) {
  if (b < 1024) return b + ' B'
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB'
  return (b / 1048576).toFixed(1) + ' MB'
}
function fmtDate(ts: number) {
  return new Date(ts).toLocaleDateString('ar-SA', { day: 'numeric', month: 'short', year: 'numeric' })
}

const FILTER_OPTIONS = [
  { label: 'الكل', value: 'all' },
  { label: 'جداول بيانات', value: 'sheet' },
  { label: 'مستندات', value: 'doc' },
  { label: 'صور', value: 'img' },
  { label: 'أخرى', value: 'other' },
]
function filterMatch(name: string, filter: string) {
  const e = ext(name)
  if (filter === 'all') return true
  if (filter === 'sheet') return ['xlsx','xlsm','xls','csv'].includes(e)
  if (filter === 'doc')   return ['pdf','docx','doc','md','txt','json','html','htm'].includes(e)
  if (filter === 'img')   return ['jpg','jpeg','png','gif','webp','bmp','tiff','tif','heic','heif'].includes(e)
  if (filter === 'other') return !['xlsx','xlsm','xls','csv','pdf','docx','doc','md','txt','json','html','htm','jpg','jpeg','png','gif','webp','bmp','tiff','tif','heic','heif'].includes(e)
  return true
}

const CONCURRENCY = 2

// ─── Component ───────────────────────────────────────────────────────────────────
export default function FolderImportModal({ projectId, folderName, onClose, onRefresh, onBatchAnalyze }: Props) {
  const { listFiles } = useFolderSyncContext()
  const [phase,    setPhase]    = useState<Phase>('browse')
  const [loading,  setLoading]  = useState(true)
  const [items,    setItems]    = useState<ImportItem[]>([])
  const [filter,   setFilter]   = useState('all')
  const [recursive, setRecursive] = useState(false)
  const [showFilter, setShowFilter] = useState(false)

  // Load file list
  const loadFiles = useCallback(async () => {
    setLoading(true)
    const infos = await listFiles(folderName, recursive)
    const valid = infos.filter(f => ACCEPTED_EXTS.has('.' + ext(f.name)))
    setItems(valid.map(info => ({ info, selected: false, status: 'idle', progress: 0 })))
    setLoading(false)
  }, [folderName, recursive, listFiles])

  useEffect(() => { loadFiles() }, [loadFiles])

  // ── Selection helpers ───────────────────────────────────────────────────────
  const visible    = items.filter(i => filterMatch(i.info.name, filter))
  const allSel     = visible.length > 0 && visible.every(i => i.selected)
  const someSel    = visible.some(i => i.selected)
  const selectedItems = items.filter(i => i.selected)
  const selSize    = selectedItems.reduce((s, i) => s + i.info.size, 0)

  function toggleItem(path: string) {
    setItems(prev => prev.map(i => i.info.path === path ? { ...i, selected: !i.selected } : i))
  }
  function toggleAll() {
    const paths = new Set(visible.map(i => i.info.path))
    setItems(prev => prev.map(i => paths.has(i.info.path) ? { ...i, selected: !allSel } : i))
  }

  // ── Upload ──────────────────────────────────────────────────────────────────
  async function startUpload(andAnalyze = false) {
    const toUpload = items.filter(i => i.selected)
    if (!toUpload.length) { toast.error('اختر ملفاً واحداً على الأقل'); return }
    setPhase('uploading')
    uploadStarted()

    let idx = 0
    async function worker() {
      while (idx < toUpload.length) {
        const item = toUpload[idx++]
        setItems(prev => prev.map(x => x.info.path === item.info.path ? { ...x, status: 'uploading', progress: 0 } : x))
        try {
          const file = await item.info.fileHandle.getFile()
          await uploadChunked(file, projectId, pct => {
            setItems(prev => prev.map(x => x.info.path === item.info.path ? { ...x, progress: pct } : x))
          })
          setItems(prev => prev.map(x => x.info.path === item.info.path ? { ...x, status: 'done', progress: 100 } : x))
        } catch (e: any) {
          const msg = e?.response?.data?.error || 'فشل الرفع'
          setItems(prev => prev.map(x => x.info.path === item.info.path ? { ...x, status: 'error', error: msg } : x))
        }
      }
    }

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, toUpload.length) }, worker))
    uploadFinished()
    await onRefresh()
    setPhase('done')

    setItems(prev => {
      const s = prev.filter(x => x.status === 'done').length
      const f = prev.filter(x => x.status === 'error').length
      if (f === 0) toast.success(`✅ تم استيراد ${s} ملف بنجاح`)
      else toast(`⚠️ ${s} بنجاح · ${f} فشل`, { duration: 5000 })
      return prev
    })

    if (andAnalyze && onBatchAnalyze) {
      const fileNames = toUpload.map(i => i.info.name).join('، ')
      onBatchAnalyze(`قمت للتو باستيراد هذه الملفات من مجلد "${folderName}": ${fileNames}\nقم بتحليل جميع الملفات في المشروع وقدّم تقريراً شاملاً يتضمن الأنماط الرئيسية والمعطيات الهامة وأبرز الاستنتاجات.`)
      onClose()
    }
  }

  // ── Derived upload state ────────────────────────────────────────────────────
  const uploadedItems = items.filter(i => i.selected)
  const doneCount     = uploadedItems.filter(i => i.status === 'done').length
  const errCount      = uploadedItems.filter(i => i.status === 'error').length
  const overallPct    = uploadedItems.length
    ? Math.round(uploadedItems.reduce((s, i) => s + i.progress, 0) / uploadedItems.length)
    : 0

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={phase === 'uploading' ? undefined : onClose}>
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-2xl w-full max-w-lg max-h-[88vh] flex flex-col animate-fade-in"
        onClick={e => e.stopPropagation()}>

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
              <FolderOpen size={16} className="text-blue-600" />
            </div>
            <div>
              <h2 className="font-bold text-[var(--text)] text-sm leading-none">استيراد من المجلد</h2>
              <p className="text-[11px] text-[var(--muted)] mt-0.5">📁 {folderName}</p>
            </div>
          </div>
          <button onClick={phase === 'uploading' ? undefined : onClose} disabled={phase === 'uploading'}
            className="p-1.5 rounded-lg hover:bg-[var(--bg)] text-[var(--muted)] disabled:opacity-30 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto">
          {/* Browse phase */}
          {phase === 'browse' && (
            <>
              {/* Toolbar */}
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[var(--border)] bg-[var(--bg)]">
                {/* Select all */}
                <button onClick={toggleAll} className="flex items-center gap-1.5 text-xs text-[var(--text)] hover:text-primary-600 transition-colors">
                  {allSel ? <CheckSquare size={14} className="text-primary-500" /> : <Square size={14} />}
                  {allSel ? 'إلغاء الكل' : 'اختيار الكل'}
                </button>
                <span className="text-[var(--border)]">|</span>
                {/* Filter */}
                <div className="relative">
                  <button onClick={() => setShowFilter(p => !p)}
                    className="flex items-center gap-1 text-xs text-[var(--muted)] hover:text-[var(--text)] transition-colors">
                    <Filter size={11} />
                    {FILTER_OPTIONS.find(f => f.value === filter)?.label ?? 'الكل'}
                    <ChevronDown size={10} />
                  </button>
                  {showFilter && (
                    <div className="absolute top-full right-0 mt-1 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-lg z-10 py-1 min-w-[110px]">
                      {FILTER_OPTIONS.map(o => (
                        <button key={o.value} onClick={() => { setFilter(o.value); setShowFilter(false) }}
                          className={`w-full text-right px-3 py-1.5 text-xs hover:bg-[var(--bg)] transition-colors
                            ${filter === o.value ? 'text-primary-600 font-medium' : 'text-[var(--text)]'}`}>
                          {o.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {/* Recursive toggle */}
                <label className="flex items-center gap-1 text-xs text-[var(--muted)] cursor-pointer mr-auto">
                  <input type="checkbox" checked={recursive} onChange={e => setRecursive(e.target.checked)}
                    className="accent-primary-500 w-3 h-3" />
                  المجلدات الفرعية
                </label>
              </div>

              {/* File list */}
              {loading ? (
                <div className="flex items-center justify-center py-12 gap-3 text-[var(--muted)]">
                  <Loader2 size={20} className="animate-spin text-primary-500" />
                  <span className="text-sm">جاري قراءة المجلد...</span>
                </div>
              ) : visible.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-[var(--muted)]">
                  <FolderOpen size={36} className="mb-2 opacity-40" />
                  <p className="text-sm">لا توجد ملفات مدعومة في هذا المجلد</p>
                  <button onClick={() => setRecursive(true)} className="text-xs text-primary-500 hover:underline mt-2">
                    تضمين المجلدات الفرعية
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-[var(--border)]">
                  {visible.map(item => (
                    <label key={item.info.path}
                      className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors
                        ${item.selected ? 'bg-primary-50/60 dark:bg-primary-900/20' : 'hover:bg-[var(--bg)]'}`}>
                      <div className="shrink-0">
                        {item.selected
                          ? <CheckSquare size={15} className="text-primary-500" />
                          : <Square size={15} className="text-[var(--muted)]" />}
                      </div>
                      <input type="checkbox" checked={item.selected}
                        onChange={() => toggleItem(item.info.path)} className="hidden" />
                      <FileTypeIcon type={extToType(item.info.name)} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-[var(--text)] truncate" title={item.info.path}>
                          {item.info.name}
                        </p>
                        {item.info.path.includes('/') && (
                          <p className="text-[10px] text-[var(--muted)] truncate">
                            {item.info.path.split('/').slice(0, -1).join('/')}
                          </p>
                        )}
                      </div>
                      <div className="shrink-0 text-end">
                        <p className="text-[11px] text-[var(--muted)]">{fmtSize(item.info.size)}</p>
                        <p className="text-[10px] text-[var(--muted)] opacity-60">{fmtDate(item.info.lastModified)}</p>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Uploading phase */}
          {(phase === 'uploading' || (phase === 'done' && uploadedItems.length > 0)) && (
            <div className="divide-y divide-[var(--border)]">
              {uploadedItems.map(item => (
                <div key={item.info.path}
                  className={`flex items-center gap-3 px-4 py-2.5 transition-colors
                    ${item.status === 'done'  ? 'bg-green-50/50 dark:bg-green-900/10' : ''}
                    ${item.status === 'error' ? 'bg-red-50/50 dark:bg-red-900/10' : ''}`}>
                  <FileTypeIcon type={extToType(item.info.name)} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-[var(--text)] truncate">{item.info.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-[var(--muted)]">{fmtSize(item.info.size)}</span>
                      {item.status !== 'error' && (
                        <div className="flex-1 flex items-center gap-1.5">
                          <div className="flex-1 h-1.5 rounded-full bg-[var(--border)] overflow-hidden">
                            <div className={`h-full rounded-full transition-all duration-300
                              ${item.status === 'done' ? 'bg-green-500' : 'bg-primary-500'}`}
                              style={{ width: `${item.status === 'done' ? 100 : item.progress}%` }} />
                          </div>
                          {item.status === 'uploading' && (
                            <span className="text-[10px] text-primary-600 font-medium w-7 text-end">{item.progress}%</span>
                          )}
                          {item.status === 'idle' && (
                            <span className="text-[10px] text-[var(--muted)]">في الانتظار</span>
                          )}
                        </div>
                      )}
                      {item.status === 'error' && (
                        <span className="text-[10px] text-red-500 truncate">{item.error}</span>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 w-5 flex justify-center">
                    {item.status === 'idle'     && <Clock      size={14} className="text-[var(--muted)]" />}
                    {item.status === 'uploading' && <Loader2   size={14} className="text-primary-500 animate-spin" />}
                    {item.status === 'done'      && <CheckCircle size={14} className="text-green-500" />}
                    {item.status === 'error'     && <AlertCircle size={14} className="text-red-500" />}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="px-5 py-4 border-t border-[var(--border)] bg-[var(--bg)] rounded-b-2xl">
          {/* Overall progress (uploading) */}
          {phase === 'uploading' && (
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-[var(--muted)]">التقدم الإجمالي</span>
                <span className="text-xs font-semibold text-primary-600">{doneCount}/{uploadedItems.length} · {overallPct}%</span>
              </div>
              <div className="h-2 bg-[var(--border)] rounded-full overflow-hidden">
                <div className="h-full bg-primary-500 rounded-full transition-all duration-500"
                  style={{ width: `${overallPct}%` }} />
              </div>
              <p className="text-[10px] text-[var(--muted)] mt-1">لا تغلق الصفحة أثناء الرفع</p>
            </div>
          )}

          {/* Done summary */}
          {phase === 'done' && (
            <div className={`mb-3 px-3 py-2 rounded-xl text-xs font-medium
              ${errCount === 0 ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800'
                              : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800'}`}>
              {errCount === 0
                ? `✅ تم استيراد ${doneCount} ${doneCount === 1 ? 'ملف' : 'ملفات'} بنجاح إلى المشروع`
                : `⚠️ ${doneCount} بنجاح · ${errCount} فشل`}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between gap-2">
            {/* Left: summary or hint */}
            <div>
              {phase === 'browse' && someSel && (
                <span className="text-xs text-[var(--muted)]">
                  {selectedItems.length} ملف · {fmtSize(selSize)}
                </span>
              )}
            </div>

            {/* Right: buttons */}
            <div className="flex items-center gap-2 mr-auto">
              {phase === 'browse' && (
                <>
                  <button onClick={onClose} className="btn-ghost px-3 py-2 text-xs rounded-xl">إلغاء</button>
                  {onBatchAnalyze && (
                    <button onClick={() => startUpload(true)} disabled={!someSel}
                      className="flex items-center gap-1.5 px-3 py-2 text-xs rounded-xl font-medium
                                 bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300
                                 hover:bg-purple-200 dark:hover:bg-purple-900/60 disabled:opacity-40
                                 disabled:cursor-not-allowed transition-colors">
                      <Zap size={13} />
                      استيراد وتحليل
                    </button>
                  )}
                  <button onClick={() => startUpload(false)} disabled={!someSel}
                    className="btn-primary px-4 py-2 text-xs rounded-xl flex items-center gap-1.5
                               disabled:opacity-40 disabled:cursor-not-allowed">
                    <Download size={13} />
                    استيراد {someSel ? `(${selectedItems.length})` : ''}
                  </button>
                </>
              )}
              {phase === 'done' && (
                <>
                  {onBatchAnalyze && doneCount > 0 && (
                    <button onClick={() => {
                      const names = uploadedItems.filter(i => i.status === 'done').map(i => i.info.name).join('، ')
                      onBatchAnalyze(`قمت باستيراد هذه الملفات: ${names}\nقم بتحليل جميع الملفات في المشروع وقدّم تقريراً شاملاً.`)
                      onClose()
                    }}
                      className="flex items-center gap-1.5 px-3 py-2 text-xs rounded-xl font-medium
                                 bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300
                                 hover:bg-purple-200 dark:hover:bg-purple-900/60 transition-colors">
                      <Zap size={13} />
                      تحليل الآن
                    </button>
                  )}
                  <button onClick={onClose} className="btn-primary px-4 py-2 text-xs rounded-xl flex items-center gap-1.5">
                    <CheckCircle size={13} />
                    إغلاق
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
