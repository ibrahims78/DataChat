import { useState, useRef, useCallback, useEffect } from 'react'
import { Send, Paperclip } from 'lucide-react'
import { useTheme } from '../../contexts/ThemeContext'
import { useT } from '../../i18n/translations'
import { useDropzone } from 'react-dropzone'
import { uploadStarted, uploadFinished } from '../../lib/api'
import { uploadChunked } from '../../lib/uploadChunked'
import toast from 'react-hot-toast'

interface Props {
  onSend: (msg: string) => void
  disabled: boolean
  queueCount?: number
  projectId: number
  onFileUploaded: (file: any) => void
}

export default function ChatInput({ onSend, disabled, queueCount = 0, projectId, onFileUploaded }: Props) {
  const [text, setText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { lang } = useTheme()
  const tr = useT(lang)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)

  useEffect(() => {
    if (!uploading) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = 'جاري رفع الملف، هل أنت متأكد من المغادرة؟'
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [uploading])

  const handleSend = () => {
    const trimmed = text.trim()
    if (!trimmed) return
    onSend(trimmed)
    setText('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  const onDrop = useCallback(async (accepted: File[]) => {
    if (!accepted.length) return
    setUploading(true)
    setUploadProgress(0)
    uploadStarted()
    try {
      const data = await uploadChunked(accepted[0], projectId, setUploadProgress)
      onFileUploaded(data.file)
    } catch (err: any) {
      toast.error(err.response?.data?.error || tr('uploadError'))
    } finally {
      uploadFinished()
      setUploading(false)
      setUploadProgress(0)
    }
  }, [projectId])

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop, noClick: true, noKeyboard: true,
    accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': [], 'application/vnd.ms-excel': [], 'text/csv': [], 'application/pdf': [], 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [], 'application/msword': [] }
  })

  const autoResize = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px'
    }
  }

  return (
    <div {...getRootProps()} className={`px-4 py-3 bg-[var(--surface)] border-t border-[var(--border)] transition-colors ${isDragActive ? 'bg-primary-50 dark:bg-primary-900/10' : ''}`}>
      <input {...getInputProps()} />
      {isDragActive && (
        <div className="text-center text-primary-600 text-sm py-2 font-semibold animate-fade-in">
          📎 أفلت الملف هنا للرفع
        </div>
      )}
      {uploading && (
        <div className="flex items-center gap-2 text-xs text-[var(--muted)] py-1 animate-fade-in">
          <span className="inline-block w-3 h-3 border-2 border-primary-600 border-t-transparent rounded-full animate-spin shrink-0" />
          <span>جاري الرفع {uploadProgress < 95 ? `${uploadProgress}%` : '— جاري المعالجة...'} — لا تحدّث الصفحة</span>
        </div>
      )}
      {queueCount > 0 && (
        <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 py-1 animate-fade-in">
          <span className="inline-block w-3 h-3 border-2 border-amber-500 border-t-transparent rounded-full animate-spin shrink-0" />
          <span>{queueCount === 1 ? 'سؤال واحد في الانتظار' : `${queueCount} أسئلة في الانتظار`} — سيُعالجها الذكاء بالترتيب</span>
        </div>
      )}
      <div className="flex items-end gap-3 bg-[var(--bg)] rounded-2xl border border-[var(--border)] px-4 py-2 focus-within:border-primary-400 transition-colors">
        <button onClick={open} disabled={uploading}
          className="p-1.5 rounded-lg hover:bg-[var(--surface)] text-[var(--muted)] transition-colors shrink-0 self-end mb-0.5"
          title={tr('uploadFile')}>
          {uploading
            ? <span className="inline-block w-4 h-4 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
            : <Paperclip size={18} />}
        </button>
        <textarea
          ref={textareaRef}
          className="flex-1 bg-transparent outline-none text-sm text-[var(--text)] placeholder-[var(--muted)] resize-none min-h-[36px] max-h-[120px] py-1.5 font-cairo leading-relaxed"
          placeholder={tr('typeMessage')}
          value={text}
          onChange={e => { setText(e.target.value); autoResize() }}
          onKeyDown={handleKeyDown}
          rows={1}
        />
        <button onClick={handleSend} disabled={!text.trim()}
          className="p-2 rounded-xl bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shrink-0 self-end">
          <Send size={16} />
        </button>
      </div>
    </div>
  )
}
