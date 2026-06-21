import { useState, useCallback, useRef, useEffect } from 'react'
import {
  Upload, X, CheckCircle, AlertCircle, Folder,
  Clock, Loader2, File, FolderOpen, Plus
} from 'lucide-react'
import FileTypeIcon from '../ui/FileTypeIcon'
import { uploadStarted, uploadFinished } from '../../lib/api'
import { uploadChunked } from '../../lib/uploadChunked'
import toast from 'react-hot-toast'

// ─── Constants ─────────────────────────────────────────────────────────────────
const ACCEPTED_EXTS = new Set([
  '.xlsx', '.xlsm', '.xls', '.csv',
  '.pdf', '.docx', '.doc',
  '.md', '.txt', '.json', '.html', '.htm',
  '.jpg', '.jpeg', '.png', '.gif', '.webp',
  '.bmp', '.tiff', '.tif', '.heic', '.heif',
])
const MAX_SIZE = 50 * 1024 * 1024
const CONCURRENCY = 2

// ─── Types ──────────────────────────────────────────────────────────────────────
type Phase = 'select' | 'ready' | 'uploading' | 'done'
type FileStatus = 'idle' | 'uploading' | 'done' | 'error'

interface UploadItem {
  id: string
  file: File
  status: FileStatus
  progress: number
  error?: string
}

interface Props {
  projectId: number
  onClose: () => void
  onUploaded: (file: any, silent?: boolean) => Promise<void>
}

// ─── Helpers ────────────────────────────────────────────────────────────────────
function getExt(name: string) { return name.split('.').pop()?.toLowerCase() ?? '' }

function formatSize(bytes: number) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1048576).toFixed(1) + ' MB'
}

function makeId(f: File) { return `${f.name}|${f.size}|${f.lastModified}` }

async function traverseDirectory(entry: FileSystemDirectoryEntry): Promise<File[]> {
  return new Promise(resolve => {
    const collected: File[] = []
    const reader = entry.createReader()
    function readBatch() {
      reader.readEntries(async entries => {
        if (!entries.length) { resolve(collected); return }
        for (const e of entries) {
          if (e.isFile) {
            await new Promise<void>(r => (e as FileSystemFileEntry).file(f => { collected.push(f); r() }, () => r()))
          } else if (e.isDirectory) {
            const sub = await traverseDirectory(e as FileSystemDirectoryEntry)
            collected.push(...sub)
          }
        }
        readBatch()
      }, () => resolve(collected))
    }
    readBatch()
  })
}

// ─── Component ──────────────────────────────────────────────────────────────────
export default function FileUploadModal({ projectId, onClose, onUploaded }: Props) {
  const [items, setItems] = useState<UploadItem[]>([])
  const [phase, setPhase] = useState<Phase>('select')
  const [isDragOver, setIsDragOver] = useState(false)
  const filesInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const idxRef = useRef(0)

  // Block page unload during upload
  useEffect(() => {
    if (phase !== 'uploading') return
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [phase])

  // ─── Add files ───────────────────────────────────────────────────────────────
  const addFiles = useCallback((raw: File[]) => {
    const skipped: string[] = []
    const valid: UploadItem[] = []

    for (const f of raw) {
      const ext = '.' + getExt(f.name)
      if (!ACCEPTED_EXTS.has(ext)) { skipped.push(f.name); continue }
      if (f.size > MAX_SIZE) { skipped.push(f.name + ' (> 50 MB)'); continue }
      valid.push({ id: makeId(f), file: f, status: 'idle', progress: 0 })
    }

    if (skipped.length) toast.error(`تم تجاهل ${skipped.length} ملف غير مدعوم أو حجمه كبير`)
    if (!valid.length) return

    setItems(prev => {
      const existingIds = new Set(prev.map(i => i.id))
      const unique = valid.filter(i => !existingIds.has(i.id))
      if (!unique.length) { toast('الملفات المختارة موجودة بالفعل'); return prev }
      const next = [...prev, ...unique]
      setPhase('ready')
      return next
    })
  }, [])

  // ─── Drag & Drop ─────────────────────────────────────────────────────────────
  const handleDragEnter = (e: React.DragEvent) => { e.preventDefault(); setIsDragOver(true) }
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragOver(false)
  }
  const handleDragOver = (e: React.DragEvent) => e.preventDefault()

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const files: File[] = []
    for (const item of Array.from(e.dataTransfer.items)) {
      if (item.kind !== 'file') continue
      const entry = item.webkitGetAsEntry?.()
      if (entry?.isDirectory) {
        const sub = await traverseDirectory(entry as FileSystemDirectoryEntry)
        files.push(...sub)
      } else {
        const f = item.getAsFile()
        if (f) files.push(f)
      }
    }
    addFiles(files)
  }

  // ─── Input handlers ──────────────────────────────────────────────────────────
  const handleFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(Array.from(e.target.files))
    e.target.value = ''
  }
  const handleFolderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(Array.from(e.target.files))
    e.target.value = ''
  }

  function removeItem(id: string) {
    setItems(prev => {
      const next = prev.filter(i => i.id !== id)
      if (!next.length) setPhase('select')
      return next
    })
  }

  // ─── Upload ──────────────────────────────────────────────────────────────────
  async function startUpload() {
    const snapshot = [...items]
    idxRef.current = 0
    setPhase('uploading')
    uploadStarted()

    async function worker() {
      while (true) {
        const i = idxRef.current++
        if (i >= snapshot.length) break
        const item = snapshot[i]

        setItems(prev => prev.map(x => x.id === item.id ? { ...x, status: 'uploading', progress: 0 } : x))

        try {
          const data = await uploadChunked(item.file, projectId, pct => {
            setItems(prev => prev.map(x => x.id === item.id ? { ...x, progress: pct } : x))
          })
          setItems(prev => prev.map(x => x.id === item.id ? { ...x, status: 'done', progress: 100 } : x))
          await onUploaded(data.file, true)
        } catch (err: any) {
          const msg = err?.response?.data?.error || 'فشل الرفع'
          setItems(prev => prev.map(x => x.id === item.id ? { ...x, status: 'error', error: msg } : x))
        }
      }
    }

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, snapshot.length) }, worker))
    uploadFinished()

    setItems(prev => {
      const s = prev.filter(x => x.status === 'done').length
      const f = prev.filter(x => x.status === 'error').length
      if (f === 0) toast.success(`✅ تم رفع ${s} ${s === 1 ? 'ملف' : 'ملفات'} بنجاح`)
      else if (s > 0) toast(`⚠️ ${s} بنجاح · ${f} فشل`, { duration: 5000 })
      else toast.error('فشل رفع جميع الملفات')
      return prev
    })
    setPhase('done')
  }

  // ─── Derived ─────────────────────────────────────────────────────────────────
  const totalSize  = items.reduce((s, i) => s + i.file.size, 0)
  const doneCount  = items.filter(i => i.status === 'done').length
  const errorCount = items.filter(i => i.status === 'error').length
  const overallPct = items.length
    ? Math.round(items.reduce((s, i) => s + i.progress, 0) / items.length)
    : 0

  const canClose = phase !== 'uploading'

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={canClose ? onClose : undefined}
    >
      <div
        className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-2xl w-full max-w-lg max-h-[88vh] flex flex-col animate-fade-in"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center">
              <Upload size={16} className="text-primary-600" />
            </div>
            <h2 className="font-bold text-[var(--text)]">رفع الملفات</h2>
          </div>
          <button
            onClick={canClose ? onClose : undefined}
            disabled={!canClose}
            className="p-1.5 rounded-lg hover:bg-[var(--bg)] text-[var(--muted)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto">

          {/* Drop zone — shown in select phase or as overlay when dragging in ready phase */}
          {phase === 'select' && (
            <div className="p-5">
              <div
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all duration-200
                  ${isDragOver
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 scale-[0.99]'
                    : 'border-[var(--border)] hover:border-primary-300 dark:hover:border-primary-700'}`}
              >
                {isDragOver ? (
                  <>
                    <FolderOpen size={44} className="text-primary-500 mx-auto mb-3" />
                    <p className="font-bold text-primary-600 text-lg">أفلت هنا</p>
                  </>
                ) : (
                  <>
                    <div className="w-14 h-14 rounded-2xl bg-[var(--bg)] border border-[var(--border)] flex items-center justify-center mx-auto mb-4">
                      <Upload size={26} className="text-[var(--muted)]" />
                    </div>
                    <p className="font-semibold text-[var(--text)] mb-1">اسحب ملفات أو مجلداً هنا</p>
                    <p className="text-xs text-[var(--muted)] mb-5 leading-relaxed">
                      xlsx · csv · pdf · docx · txt · json · png وغيرها<br/>الحد الأقصى 50 MB لكل ملف
                    </p>
                    <div className="flex items-center justify-center gap-3">
                      <button
                        onClick={() => filesInputRef.current?.click()}
                        className="btn-primary text-sm px-4 py-2.5 flex items-center gap-2 rounded-xl"
                      >
                        <File size={15} />
                        اختيار ملفات
                      </button>
                      <button
                        onClick={() => folderInputRef.current?.click()}
                        className="btn-ghost text-sm px-4 py-2.5 flex items-center gap-2 rounded-xl border border-[var(--border)]"
                      >
                        <Folder size={15} />
                        اختيار مجلد
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* File list */}
          {(phase === 'ready' || phase === 'uploading' || phase === 'done') && (
            <div
              onDragEnter={phase === 'ready' ? handleDragEnter : undefined}
              onDragLeave={phase === 'ready' ? handleDragLeave : undefined}
              onDragOver={phase === 'ready' ? handleDragOver : undefined}
              onDrop={phase === 'ready' ? handleDrop : undefined}
              className={`transition-all ${isDragOver ? 'ring-2 ring-inset ring-primary-400 bg-primary-50/50 dark:bg-primary-900/10' : ''}`}
            >
              {/* List header */}
              <div className="flex items-center justify-between px-5 py-2.5 bg-[var(--bg)] border-b border-[var(--border)]">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-[var(--text)]">
                    {items.length} {items.length === 1 ? 'ملف' : 'ملفات'}
                  </span>
                  <span className="text-xs text-[var(--muted)]">·</span>
                  <span className="text-xs text-[var(--muted)]">{formatSize(totalSize)}</span>
                </div>
                <div className="flex items-center gap-3">
                  {phase === 'uploading' && (
                    <span className="text-xs text-[var(--muted)]">
                      {doneCount} / {items.length} مكتملة
                    </span>
                  )}
                  {phase === 'done' && (
                    <span className={`text-xs font-semibold ${errorCount === 0 ? 'text-green-600' : 'text-amber-600'}`}>
                      {doneCount} نجح{errorCount > 0 ? ` · ${errorCount} فشل` : ''}
                    </span>
                  )}
                  {phase === 'ready' && (
                    <button
                      onClick={() => filesInputRef.current?.click()}
                      className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 font-medium"
                    >
                      <Plus size={12} />
                      إضافة المزيد
                    </button>
                  )}
                </div>
              </div>

              {/* Files */}
              <div className="divide-y divide-[var(--border)]">
                {items.map(item => (
                  <div key={item.id} className={`flex items-center gap-3 px-5 py-3 transition-colors
                    ${item.status === 'done' ? 'bg-green-50/50 dark:bg-green-900/10' : ''}
                    ${item.status === 'error' ? 'bg-red-50/50 dark:bg-red-900/10' : ''}
                  `}>
                    {/* Icon */}
                    <FileTypeIcon type={getExt(item.file.name)} size="md" />

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[var(--text)] truncate" title={item.file.name}>
                        {item.file.name}
                      </p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-xs text-[var(--muted)] shrink-0">{formatSize(item.file.size)}</span>

                        {/* Progress bar */}
                        {item.status !== 'error' && (
                          <div className="flex-1 flex items-center gap-2">
                            <div className="flex-1 h-1.5 rounded-full overflow-hidden bg-[var(--border)]">
                              <div
                                className={`h-full rounded-full transition-all duration-300 ${
                                  item.status === 'done'     ? 'bg-green-500' :
                                  item.status === 'uploading'? 'bg-primary-500' : 'bg-[var(--border)]'
                                }`}
                                style={{ width: `${item.status === 'done' ? 100 : item.progress}%` }}
                              />
                            </div>
                            {item.status === 'uploading' && (
                              <span className="text-xs font-medium text-primary-600 w-8 text-end shrink-0">
                                {item.progress}%
                              </span>
                            )}
                            {item.status === 'idle' && phase === 'uploading' && (
                              <span className="text-xs text-[var(--muted)] shrink-0">في الانتظار</span>
                            )}
                          </div>
                        )}
                        {item.status === 'error' && (
                          <span className="text-xs text-red-500 truncate flex-1">{item.error}</span>
                        )}
                      </div>
                    </div>

                    {/* Status icon */}
                    <div className="shrink-0 w-6 flex justify-center">
                      {item.status === 'idle' && phase === 'ready' && (
                        <button
                          onClick={() => removeItem(item.id)}
                          className="p-1 rounded-full hover:bg-[var(--bg)] text-[var(--muted)] hover:text-red-500 transition-colors"
                          title="إزالة"
                        >
                          <X size={13} />
                        </button>
                      )}
                      {item.status === 'idle' && phase === 'uploading' && (
                        <Clock size={15} className="text-[var(--muted)]" />
                      )}
                      {item.status === 'uploading' && (
                        <Loader2 size={15} className="text-primary-500 animate-spin" />
                      )}
                      {item.status === 'done' && (
                        <CheckCircle size={15} className="text-green-500" />
                      )}
                      {item.status === 'error' && (
                        <AlertCircle size={15} className="text-red-500" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="px-5 py-4 border-t border-[var(--border)] bg-[var(--bg)] rounded-b-2xl">
          {/* Overall progress bar */}
          {phase === 'uploading' && (
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-[var(--muted)]">التقدم الإجمالي</span>
                <span className="text-xs font-semibold text-primary-600">{overallPct}%</span>
              </div>
              <div className="h-2 bg-[var(--border)] rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary-500 rounded-full transition-all duration-500"
                  style={{ width: `${overallPct}%` }}
                />
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            {/* Left: hint */}
            <div>
              {phase === 'uploading' && (
                <span className="text-xs text-[var(--muted)]">لا تغلق الصفحة أثناء الرفع</span>
              )}
              {phase === 'done' && errorCount > 0 && (
                <button
                  onClick={() => {
                    setItems(prev => prev.filter(i => i.status !== 'done'))
                    setPhase('ready')
                  }}
                  className="text-xs text-amber-600 hover:underline"
                >
                  إعادة محاولة الفاشلة
                </button>
              )}
            </div>

            {/* Right: actions */}
            <div className="flex items-center gap-2 mr-auto">
              {phase === 'ready' && (
                <>
                  <button onClick={onClose} className="btn-ghost px-4 py-2 text-sm rounded-xl">
                    إلغاء
                  </button>
                  <button
                    onClick={startUpload}
                    className="btn-primary px-5 py-2 text-sm rounded-xl flex items-center gap-2"
                  >
                    <Upload size={15} />
                    رفع {items.length} {items.length === 1 ? 'ملف' : 'ملفات'}
                  </button>
                </>
              )}
              {phase === 'done' && (
                <button onClick={onClose} className="btn-primary px-5 py-2 text-sm rounded-xl flex items-center gap-2">
                  <CheckCircle size={15} />
                  إغلاق
                </button>
              )}
              {phase === 'select' && (
                <button onClick={onClose} className="btn-ghost px-4 py-2 text-sm rounded-xl">
                  إلغاء
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Hidden inputs ── */}
      <input
        ref={filesInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFilesChange}
      />
      <input
        ref={folderInputRef}
        type="file"
        {...{ webkitdirectory: '', multiple: true } as any}
        className="hidden"
        onChange={handleFolderChange}
      />
    </div>
  )
}
