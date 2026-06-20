import { useState } from 'react'
import { X, Maximize2 } from 'lucide-react'

interface Props {
  html: string
  filename?: string
  previewType?: string
}

export default function ContentPreview({ html, filename, previewType }: Props) {
  const [fullscreen, setFullscreen] = useState(false)

  const icon = previewType === 'table' ? '📊' : filename?.endsWith('.docx') || filename?.endsWith('.doc') ? '📝' : filename?.endsWith('.json') ? '{ }' : '📄'

  return (
    <div className={`my-3 rounded-xl overflow-hidden border border-[var(--border)] bg-[var(--bg)] ${fullscreen ? 'fixed inset-4 z-50 shadow-2xl flex flex-col' : ''}`}>
      <div className="flex items-center justify-between px-3 py-2 bg-[var(--surface)] border-b border-[var(--border)]">
        <span className="text-xs font-medium text-[var(--text)] truncate max-w-[250px]">
          {icon} {filename || 'معاينة الملف'}
        </span>
        <button onClick={() => setFullscreen(f => !f)}
          className="p-1 rounded hover:bg-[var(--bg)] text-[var(--muted)]"
          title={fullscreen ? 'إغلاق' : 'ملء الشاشة'}>
          {fullscreen ? <X size={14} /> : <Maximize2 size={14} />}
        </button>
      </div>
      <div
        className={`overflow-auto ${fullscreen ? 'flex-1' : 'max-h-[460px]'} bg-white dark:bg-gray-900`}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  )
}
