import { useCallback, useState, useEffect } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, X, CheckCircle, AlertCircle } from 'lucide-react'
import { useTheme } from '../../contexts/ThemeContext'
import { useT } from '../../i18n/translations'
import { uploadStarted, uploadFinished } from '../../lib/api'
import { uploadChunked } from '../../lib/uploadChunked'
import toast from 'react-hot-toast'

interface Props { projectId: number; onClose: () => void; onUploaded: (file: any) => Promise<void> }

export default function FileUploadModal({ projectId, onClose, onUploaded }: Props) {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState<string>('')
  const { lang } = useTheme()
  const tr = useT(lang)

  useEffect(() => {
    if (!uploading) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = 'جاري رفع الملف، هل أنت متأكد من المغادرة؟'
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [uploading])

  const onDrop = useCallback(async (accepted: File[]) => {
    if (!accepted.length) return
    setUploading(true)
    setProgress('جاري الرفع...')
    uploadStarted()
    try {
      const data = await uploadChunked(accepted[0], projectId, (pct) => {
        if (pct < 95) setProgress(`${pct}%`)
        else setProgress('جاري المعالجة...')
      })
      await onUploaded(data.file)
      onClose()
    } catch (err: any) {
      toast.error(err.response?.data?.error || tr('uploadError'))
    } finally {
      uploadFinished()
      setUploading(false)
      setProgress('')
    }
  }, [projectId])

  const { getRootProps, getInputProps, isDragActive, acceptedFiles, fileRejections } = useDropzone({
    onDrop, maxFiles: 1, maxSize: 50 * 1024 * 1024,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel.sheet.macroEnabled.12': ['.xlsm'],
      'application/vnd.ms-excel': ['.xls'],
      'text/csv': ['.csv'],
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/msword': ['.doc'],
      'text/markdown': ['.md'],
      'text/plain': ['.txt'],
      'application/json': ['.json'],
    }
  })

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={uploading ? undefined : onClose}>
      <div className="card p-6 w-full max-w-md animate-fade-in" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-lg text-[var(--text)]">{tr('uploadFile')}</h2>
          <button onClick={uploading ? undefined : onClose} disabled={uploading} className="p-2 rounded-lg hover:bg-[var(--bg)] text-[var(--muted)] disabled:opacity-40 disabled:cursor-not-allowed"><X size={18} /></button>
        </div>

        <div {...getRootProps()} className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all
          ${isDragActive ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'border-[var(--border)] hover:border-primary-400'}`}>
          <input {...getInputProps()} />
          {uploading ? (
            <div className="space-y-3">
              <div className="animate-spin w-10 h-10 border-4 border-primary-600 border-t-transparent rounded-full mx-auto" />
              <p className="text-sm font-semibold text-primary-600">{progress}</p>
              <p className="text-xs text-[var(--muted)]">لا تغلق الصفحة أو تحدّثها أثناء الرفع</p>
            </div>
          ) : isDragActive ? (
            <div>
              <Upload size={40} className="text-primary-600 mx-auto mb-3" />
              <p className="font-semibold text-primary-600">أفلت الملف هنا</p>
            </div>
          ) : (
            <div>
              <Upload size={40} className="text-[var(--muted)] mx-auto mb-3" />
              <p className="font-semibold text-[var(--text)] mb-1">اسحب ملفك هنا أو اضغط للاختيار</p>
              <p className="text-xs text-[var(--muted)]">{tr('supportedFiles')}</p>
              <p className="text-xs text-[var(--muted)] mt-1">الحد الأقصى: 50 MB</p>
            </div>
          )}
        </div>

        {acceptedFiles.length > 0 && !uploading && (
          <div className="mt-3 flex items-center gap-2 text-sm text-green-600">
            <CheckCircle size={16} />
            <span>{acceptedFiles[0].name}</span>
          </div>
        )}

        {fileRejections.length > 0 && (
          <div className="mt-3 flex items-center gap-2 text-sm text-red-600">
            <AlertCircle size={16} />
            <span>{fileRejections[0].errors[0].message === 'File is larger than 52428800 bytes' ? 'الملف أكبر من 50 MB' : 'نوع الملف غير مدعوم'}</span>
          </div>
        )}
      </div>
    </div>
  )
}
