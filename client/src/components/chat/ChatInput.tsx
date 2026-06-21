import { useState, useRef, useCallback, useEffect } from 'react'
import { Send, Paperclip, Maximize2, Minimize2 } from 'lucide-react'
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
  const [expanded, setExpanded] = useState(false)
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
    if (!trimmed || disabled) return
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
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': [],
      'application/vnd.ms-excel': [],
      'text/csv': [],
      'application/pdf': [],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [],
      'application/msword': [],
      'text/html': [],
      'image/jpeg': [],
      'image/png': [],
      'image/gif': [],
      'image/webp': [],
      'image/bmp': [],
      'image/tiff': [],
      'image/heic': [],
      'image/heif': [],
    }
  })

  const autoResize = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      const maxH = expanded ? 320 : 120
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, maxH) + 'px'
    }
  }

  useEffect(() => { autoResize() }, [expanded])

  return (
    <div
      {...getRootProps()}
      className={`px-4 py-3 bg-[var(--surface)] border-t border-[var(--border)] transition-colors ${isDragActive ? 'bg-primary-50 dark:bg-primary-900/10' : ''}`}
    >
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
      <div className={`flex items-end gap-2 bg-[var(--bg)] rounded-2xl border border-[var(--border)] px-3 py-2 focus-within:border-primary-400 transition-all ${expanded ? 'shadow-lg' : ''}`}>
        {/* Attach file */}
        <button
          onClick={open}
          disabled={uploading}
          className="p-1.5 rounded-lg hover:bg-[var(--surface)] text-[var(--muted)] transition-colors shrink-0 self-end mb-0.5"
          title={tr('uploadFile')}
        >
          {uploading
            ? <span className="inline-block w-4 h-4 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
            : <Paperclip size={17} />}
        </button>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          className="flex-1 bg-transparent outline-none text-sm text-[var(--text)] placeholder-[var(--muted)] resize-none py-1.5 font-cairo leading-relaxed"
          style={{ minHeight: '36px', maxHeight: expanded ? '320px' : '120px' }}
          placeholder={tr('typeMessage')}
          value={text}
          onChange={e => { setText(e.target.value); autoResize() }}
          onKeyDown={handleKeyDown}
          rows={1}
        />

        {/* Expand / Collapse toggle */}
        <button
          onClick={() => setExpanded(p => !p)}
          className="p-1.5 rounded-lg hover:bg-[var(--surface)] text-[var(--muted)] hover:text-primary-500 transition-colors shrink-0 self-end mb-0.5"
          title={expanded ? 'تصغير صندوق الكتابة' : 'تكبير صندوق الكتابة'}
        >
          {expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
        </button>

        {/* Send */}
        <button
          onClick={handleSend}
          disabled={!text.trim() || disabled}
          className="p-2 rounded-xl bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shrink-0 self-end"
          title="إرسال (Enter)"
        >
          <Send size={16} />
        </button>
      </div>
      <p className="text-[10px] text-[var(--muted)] mt-1 px-1 select-none">
        Enter للإرسال &nbsp;·&nbsp; Shift+Enter لسطر جديد &nbsp;·&nbsp; اسحب ملفاً هنا للرفع
      </p>
    </div>
  )
}
