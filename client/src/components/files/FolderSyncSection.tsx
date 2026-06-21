import { useState } from 'react'
import {
  FolderSync as FolderSyncIcon, FolderCheck, FolderX, RefreshCw,
  X, AlertTriangle, Plus, Download, Info, ChevronDown, ChevronUp,
  Calendar, Zap
} from 'lucide-react'
import { useFolderSyncContext } from '../../contexts/FolderSyncContext'
import type { FolderEntry } from '../../lib/useFolderSync'

interface Props {
  projectId: number
  onRefresh:          () => void
  onOpenImport:       (folderName: string) => void
  onOpenCapabilities: () => void
  onSyncAll?:         () => void
  isSyncing?:         boolean
}

// ── Per-folder row ────────────────────────────────────────────────────────────
function FolderRow({
  entry, onRemove, onRequestPermission, onToggleDated, onImport,
}: {
  entry: FolderEntry
  onRemove:           () => void
  onRequestPermission:() => void
  onToggleDated:      () => void
  onImport:           () => void
}) {
  const [open, setOpen] = useState(false)

  const isGranted = entry.perm === 'granted'
  const isPrompt  = entry.perm === 'prompt'
  const isDenied  = entry.perm === 'denied'

  // colour themes
  const theme = isGranted
    ? { bg: 'bg-green-50 dark:bg-green-900/10', border: 'border-green-200 dark:border-green-800',
        text: 'text-green-700 dark:text-green-300', sub: 'text-green-600 dark:text-green-400',
        icon: <FolderCheck size={13} className="text-green-600 dark:text-green-400 shrink-0" /> }
    : isPrompt
    ? { bg: 'bg-amber-50 dark:bg-amber-900/10', border: 'border-amber-200 dark:border-amber-800',
        text: 'text-amber-700 dark:text-amber-300', sub: 'text-amber-600 dark:text-amber-400',
        icon: <AlertTriangle size={13} className="text-amber-500 shrink-0" /> }
    : { bg: 'bg-red-50 dark:bg-red-900/10', border: 'border-red-200 dark:border-red-800',
        text: 'text-red-700 dark:text-red-300', sub: 'text-red-500 dark:text-red-400',
        icon: <FolderX size={13} className="text-red-500 shrink-0" /> }

  return (
    <div className={`rounded-xl border ${theme.bg} ${theme.border} overflow-hidden`}>
      {/* Main row */}
      <div className="flex items-center gap-2 px-3 py-2">
        {theme.icon}
        <div className="flex-1 min-w-0">
          <p className={`text-xs font-semibold ${theme.text} truncate`} title={entry.name}>
            {entry.name}
          </p>
          <p className={`text-[10px] ${theme.sub}`}>
            {isGranted ? (entry.datedSave ? 'حفظ في مجلدات مؤرخة' : 'حفظ تلقائي مفعّل')
             : isPrompt ? 'يحتاج إذن'
             : 'الإذن مرفوض'}
          </p>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {isGranted && (
            <button onClick={onImport} title="استيراد ملفات"
              className={`p-1.5 rounded-lg ${theme.sub} hover:bg-green-100 dark:hover:bg-green-900/40 transition-colors`}>
              <Download size={12} />
            </button>
          )}
          <button onClick={() => setOpen(p => !p)} title="إعدادات"
            className={`p-1.5 rounded-lg ${theme.sub} hover:bg-black/5 dark:hover:bg-white/10 transition-colors`}>
            {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
          <button onClick={onRemove} title="إزالة المجلد"
            className={`p-1.5 rounded-lg ${theme.sub} hover:bg-red-100 dark:hover:bg-red-900/40 hover:text-red-500 transition-colors`}>
            <X size={12} />
          </button>
        </div>
      </div>

      {/* Expanded settings */}
      {open && (
        <div className={`px-3 pb-2 pt-1 border-t ${theme.border} space-y-2`}>
          {(isPrompt || isDenied) && (
            <button onClick={onRequestPermission}
              className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg
                         bg-amber-500 hover:bg-amber-600 text-white text-xs font-medium transition-colors">
              <RefreshCw size={11} />
              منح الإذن مرة أخرى
            </button>
          )}
          {isGranted && (
            <label className="flex items-center justify-between cursor-pointer">
              <div className="flex items-center gap-1.5">
                <Calendar size={11} className={theme.sub} />
                <span className={`text-[11px] ${theme.text}`}>حفظ في مجلدات حسب التاريخ</span>
              </div>
              <div
                onClick={onToggleDated}
                className={`relative w-8 h-4 rounded-full transition-colors cursor-pointer
                  ${entry.datedSave ? 'bg-green-500' : 'bg-[var(--border)]'}`}
              >
                <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform
                  ${entry.datedSave ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </div>
            </label>
          )}
          {isGranted && entry.datedSave && (
            <p className={`text-[10px] ${theme.sub} leading-relaxed`}>
              مثال: <span className="font-mono">{entry.name}/{new Date().toISOString().split('T')[0]}/ملف.xlsx</span>
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function FolderSyncSection({ onRefresh, onOpenImport, onOpenCapabilities, onSyncAll, isSyncing }: Props) {
  const { isSupported, loading, folders, addFolder, removeFolder, requestPermission, toggleDatedSave } =
    useFolderSyncContext()

  if (!isSupported) return (
    <div className="mx-2 mb-2 px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 flex items-center gap-2">
      <AlertTriangle size={13} className="text-amber-500 shrink-0" />
      <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
        المتصفح لا يدعم الوصول للمجلدات. استخدم Chrome أو Edge
      </p>
    </div>
  )

  if (loading) return null

  return (
    <div className="mx-2 mb-2 space-y-1.5">
      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-1.5">
          <FolderSyncIcon size={12} className="text-[var(--muted)]" />
          <span className="text-[11px] font-semibold text-[var(--muted)] uppercase tracking-wide">
            المجلدات المرتبطة
          </span>
        </div>
        <div className="flex items-center gap-1">
          {onSyncAll && folders.some(f => f.perm === 'granted') && (
            <button onClick={onSyncAll} disabled={isSyncing} title="مزامنة ملفات المجلد مع المشروع"
              className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-100 dark:bg-emerald-900/40
                         text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-900/60
                         text-[11px] font-medium transition-colors disabled:opacity-60">
              <RefreshCw size={11} className={isSyncing ? 'animate-spin' : ''} />
              {isSyncing ? 'جارٍ...' : 'مزامنة'}
            </button>
          )}
          <button onClick={onOpenCapabilities} title="دليل الإمكانيات"
            className="p-1 rounded-lg hover:bg-[var(--bg)] text-[var(--muted)] hover:text-primary-500 transition-colors">
            <Info size={12} />
          </button>
          <button onClick={addFolder} title="ربط مجلد جديد"
            className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-primary-100 dark:bg-primary-900/40
                       text-primary-700 dark:text-primary-300 hover:bg-primary-200 dark:hover:bg-primary-900/60
                       text-[11px] font-medium transition-colors">
            <Plus size={11} />
            ربط
          </button>
        </div>
      </div>

      {/* Folder list */}
      {folders.length === 0 ? (
        <button onClick={addFolder}
          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border border-dashed border-[var(--border)]
                     hover:border-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20
                     text-[var(--muted)] hover:text-primary-600 transition-all group">
          <FolderSyncIcon size={14} className="shrink-0 group-hover:text-primary-500" />
          <div className="text-start">
            <p className="text-xs font-medium">ربط مجلد محلي</p>
            <p className="text-[10px] opacity-70">حفظ تلقائي · استيراد · معالجة دفعية</p>
          </div>
        </button>
      ) : (
        <div className="space-y-1.5">
          {folders.map(entry => (
            <FolderRow
              key={entry.name}
              entry={entry}
              onRemove={()            => removeFolder(entry.name)}
              onRequestPermission={()=> requestPermission(entry.name)}
              onToggleDated={()       => toggleDatedSave(entry.name)}
              onImport={()            => onOpenImport(entry.name)}
            />
          ))}
          {/* Batch analyze hint */}
          {folders.some(f => f.perm === 'granted') && (
            <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-[var(--bg)] border border-[var(--border)]">
              <Zap size={11} className="text-primary-500 shrink-0" />
              <p className="text-[10px] text-[var(--muted)]">
                اضغط <Download size={9} className="inline" /> على أي مجلد لاستيراد ملفاته أو تحليلها دفعةً
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
