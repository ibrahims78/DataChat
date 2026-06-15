import { useState, useRef, useCallback } from 'react'
import { Send, Paperclip } from 'lucide-react'
import { useTheme } from '../../contexts/ThemeContext'
import { useT } from '../../i18n/translations'
import { useDropzone } from 'react-dropzone'
import api from '../../lib/api'
import toast from 'react-hot-toast'

interface Props {
  onSend: (msg: string) => void
  disabled: boolean
  projectId: number
  onFileUploaded: (file: any) => void
}

export default function ChatInput({ onSend, disabled, projectId, onFileUploaded }: Props) {
  const [text, setText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { lang } = useTheme()
  const tr = useT(lang)
  const [uploading, setUploading] = useState(false)

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
    const formData = new FormData()
    formData.append('file', accepted[0])
    try {
      const res = await api.post(`/files/${projectId}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      onFileUploaded(res.data.file)
    } catch (err: any) {
      toast.error(err.response?.data?.error || tr('uploadError'))
    } finally { setUploading(false) }
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
          disabled={disabled}
          rows={1}
        />
        <button onClick={handleSend} disabled={!text.trim() || disabled}
          className="p-2 rounded-xl bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shrink-0 self-end">
          <Send size={16} />
        </button>
      </div>
    </div>
  )
}
