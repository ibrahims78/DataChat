import { FolderSync as FolderSyncIcon, FolderCheck, FolderX, RefreshCw, X, AlertTriangle } from 'lucide-react'
import { useFolderSyncContext } from '../../contexts/FolderSyncContext'

export default function FolderSyncSection() {
  const { isSupported, folderName, permState, pickFolder, removeFolder, requestPermission } = useFolderSyncContext()

  if (!isSupported) return (
    <div className="mx-2 mb-2 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 flex items-center gap-2">
      <AlertTriangle size={13} className="text-amber-500 shrink-0" />
      <p className="text-xs text-amber-700 dark:text-amber-300">
        المتصفح لا يدعم الوصول للمجلدات — استخدم Chrome أو Edge
      </p>
    </div>
  )

  if (permState === 'loading') return null

  // No folder selected
  if (!folderName) return (
    <div className="mx-2 mb-2">
      <button
        onClick={pickFolder}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-[var(--border)] hover:border-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 text-[var(--muted)] hover:text-primary-600 transition-all group"
      >
        <FolderSyncIcon size={14} className="shrink-0 group-hover:text-primary-500 transition-colors" />
        <span className="text-xs font-medium">ربط مجلد للحفظ التلقائي</span>
      </button>
    </div>
  )

  // Folder connected but needs permission re-grant
  if (permState === 'prompt') return (
    <div className="mx-2 mb-2 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700">
      <div className="flex items-center gap-2 mb-1.5">
        <AlertTriangle size={13} className="text-amber-500 shrink-0" />
        <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">يحتاج إذن مرة أخرى</span>
        <button onClick={removeFolder} className="mr-auto p-0.5 rounded hover:bg-amber-200 dark:hover:bg-amber-800 text-amber-400 transition-colors" title="إلغاء الربط">
          <X size={11} />
        </button>
      </div>
      <p className="text-xs text-amber-600 dark:text-amber-400 mb-2 truncate" title={folderName}>📁 {folderName}</p>
      <button
        onClick={requestPermission}
        className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md bg-amber-500 hover:bg-amber-600 text-white text-xs font-medium transition-colors"
      >
        <RefreshCw size={11} />
        منح الإذن
      </button>
    </div>
  )

  // Permission denied
  if (permState === 'denied') return (
    <div className="mx-2 mb-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700">
      <div className="flex items-center gap-2">
        <FolderX size={13} className="text-red-500 shrink-0" />
        <span className="text-xs text-red-600 dark:text-red-400 flex-1">تم رفض الإذن</span>
        <button onClick={removeFolder} className="p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900 text-red-400 transition-colors">
          <X size={11} />
        </button>
      </div>
      <button onClick={pickFolder} className="mt-1.5 w-full text-xs text-red-600 dark:text-red-400 hover:underline">
        اختر مجلداً آخر
      </button>
    </div>
  )

  // Folder connected and granted
  return (
    <div className="mx-2 mb-2 px-3 py-2 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700">
      <div className="flex items-center gap-2">
        <FolderCheck size={13} className="text-green-600 dark:text-green-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-green-700 dark:text-green-300">حفظ تلقائي مفعّل</p>
          <p className="text-xs text-green-600 dark:text-green-400 truncate" title={folderName}>📁 {folderName}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={pickFolder}
            className="p-1 rounded hover:bg-green-100 dark:hover:bg-green-900/40 text-green-500 transition-colors"
            title="تغيير المجلد"
          >
            <FolderSyncIcon size={11} />
          </button>
          <button
            onClick={removeFolder}
            className="p-1 rounded hover:bg-green-100 dark:hover:bg-green-900/40 text-green-500 transition-colors"
            title="إلغاء الربط"
          >
            <X size={11} />
          </button>
        </div>
      </div>
    </div>
  )
}
