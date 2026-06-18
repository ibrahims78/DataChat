import { useState } from 'react'
import { Trash2, Download, Eye, Upload, ChevronLeft, ChevronRight } from 'lucide-react'
import { useTheme } from '../../contexts/ThemeContext'
import { useT } from '../../i18n/translations'
import api from '../../lib/api'
import toast from 'react-hot-toast'
import ConfirmModal from '../ui/ConfirmModal'

interface Props {
  files: any[]
  generatedFiles: any[]
  projectId: number
  onFileDeleted: () => void
  onUpload: () => void
}

const typeIcons: Record<string, string> = { excel: '📊', csv: '📋', pdf: '📄', word: '📝' }
const genTypeIcons: Record<string, string> = { excel: '📊', pdf: '📄' }

function formatSize(bytes: number) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

export default function FilePanel({ files, generatedFiles, projectId, onFileDeleted, onUpload }: Props) {
  const [collapsed, setCollapsed] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<any>(null)
  const [previewFile, setPreviewFile] = useState<any>(null)
  const [preview, setPreview] = useState<any>(null)
  const { lang } = useTheme()
  const tr = useT(lang)

  const deleteFile = async () => {
    if (!deleteTarget) return
    try {
      await api.delete(`/files/${projectId}/${deleteTarget.id}`)
      setDeleteTarget(null); onFileDeleted()
      toast.success('تم حذف الملف')
    } catch { toast.error('فشل الحذف') }
  }

  const showPreview = async (file: any) => {
    setPreviewFile(file)
    try {
      const res = await api.get(`/files/${projectId}/${file.id}/preview`)
      setPreview(res.data.preview)
    } catch { setPreview({ type: 'error', message: 'فشل تحميل المعاينة' }) }
  }

  if (collapsed) return (
    <button onClick={() => setCollapsed(false)}
      className="hidden md:flex w-10 bg-[var(--surface)] border-s border-[var(--border)] items-center justify-center hover:bg-[var(--bg)] transition-colors">
      <ChevronLeft size={16} className={`text-[var(--muted)] ${lang === 'ar' ? '' : 'rotate-180'}`} />
    </button>
  )

  return (
    <aside className="hidden md:flex flex-col w-64 bg-[var(--surface)] border-s border-[var(--border)] shrink-0">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
        <span className="font-semibold text-sm text-[var(--text)]">{tr('files')}</span>
        <div className="flex items-center gap-1">
          <button onClick={onUpload} className="p-1.5 rounded-lg hover:bg-[var(--bg)] text-[var(--muted)] transition-colors" title={tr('uploadFile')}>
            <Upload size={14} />
          </button>
          <button onClick={() => setCollapsed(true)} className="p-1.5 rounded-lg hover:bg-[var(--bg)] text-[var(--muted)] transition-colors">
            <ChevronRight size={14} className={lang === 'ar' ? '' : 'rotate-180'} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        <div>
          <p className="text-xs font-semibold text-[var(--muted)] mb-2 uppercase tracking-wide">{tr('files')} ({files.length})</p>
          {files.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-xs text-[var(--muted)]">{tr('noFilesYet')}</p>
              <button onClick={onUpload} className="text-xs text-primary-600 mt-1 hover:underline">{tr('uploadFile')}</button>
            </div>
          ) : files.map(f => (
            <div key={f.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-[var(--bg)] group transition-colors">
              <span className="text-lg shrink-0">{typeIcons[f.file_type] || '📎'}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-[var(--text)] truncate">{f.original_name}</p>
                <p className="text-xs text-[var(--muted)]">{formatSize(f.file_size)}</p>
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => showPreview(f)} className="p-1 rounded hover:bg-primary-100 dark:hover:bg-primary-900/30 text-[var(--muted)] hover:text-primary-600 transition-colors">
                  <Eye size={12} />
                </button>
                <button onClick={() => setDeleteTarget(f)} className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/20 text-[var(--muted)] hover:text-red-600 transition-colors">
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {generatedFiles.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-[var(--muted)] mb-2 uppercase tracking-wide">{tr('generatedFiles')} ({generatedFiles.length})</p>
            {generatedFiles.map(f => (
              <div key={f.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-[var(--bg)] group transition-colors">
                <span className="text-lg shrink-0">{genTypeIcons[f.file_type] || '📎'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-[var(--text)] truncate">{f.original_name}</p>
                </div>
                <button
                  className="flex items-center gap-1 px-2 py-1 rounded-md bg-primary-600 hover:bg-primary-700 text-white text-xs font-medium transition-colors shrink-0"
                  title="تحميل الملف"
                  onClick={async (e) => {
                    e.stopPropagation()
                    try {
                      const token = localStorage.getItem('token')
                      const res = await fetch(`/api/files/generated/${f.id}/download`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                      })
                      if (!res.ok) throw new Error('فشل التحميل')
                      const blob = await res.blob()
                      const url = URL.createObjectURL(blob)
                      const a = document.createElement('a')
                      a.href = url
                      a.download = f.original_name
                      a.click()
                      URL.revokeObjectURL(url)
                    } catch {
                      alert('فشل تحميل الملف. يرجى المحاولة مرة أخرى.')
                    }
                  }}>
                  <Download size={11} />
                  <span>تحميل</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmModal
        open={!!deleteTarget}
        title="حذف الملف"
        icon="🗑️"
        danger
        description={`هل تريد حذف "${deleteTarget?.original_name}"؟`}
        confirmLabel="حذف"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={deleteFile}
      />

      {previewFile && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => { setPreviewFile(null); setPreview(null) }}>
          <div className="card p-6 w-full max-w-2xl max-h-[80vh] flex flex-col animate-fade-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-[var(--text)]">{previewFile.original_name}</h3>
              <button onClick={() => { setPreviewFile(null); setPreview(null) }} className="btn-ghost text-sm">{tr('close')}</button>
            </div>
            <div className="overflow-auto flex-1">
              {!preview ? (
                <div className="flex justify-center py-8"><div className="animate-spin w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full" /></div>
              ) : preview.type === 'table' ? (
                <div>
                  <p className="text-xs text-[var(--muted)] mb-3">{preview.totalRows} {tr('rows')} × {preview.totalCols} {tr('columns')} — أول 5 صفوف</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead><tr>{preview.headers.map((h: string, i: number) => <th key={i} className="border border-[var(--border)] bg-primary-600 text-white px-3 py-2 text-start">{h}</th>)}</tr></thead>
                      <tbody>{preview.rows.map((row: any[], ri: number) => <tr key={ri} className="hover:bg-[var(--bg)]">{row.map((cell, ci) => <td key={ci} className="border border-[var(--border)] px-3 py-1.5">{cell}</td>)}</tr>)}</tbody>
                    </table>
                  </div>
                </div>
              ) : preview.type === 'text' ? (
                <div>
                  {preview.totalPages && <p className="text-xs text-[var(--muted)] mb-2">{preview.totalPages} {tr('pages')}</p>}
                  <p className="text-sm text-[var(--text)] whitespace-pre-wrap leading-relaxed bg-[var(--bg)] rounded-lg p-4">{preview.text}...</p>
                </div>
              ) : (
                <p className="text-red-500 text-sm">{preview.message}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}
