import { useState, useEffect, useCallback } from 'react'
import {
  HardDrive, Folder, ChevronLeft,
  Link, Link2Off, Download, Loader2, RefreshCw, Home
} from 'lucide-react'
import api from '../../lib/api'
import toast from 'react-hot-toast'
import FileTypeIcon from '../ui/FileTypeIcon'

interface DriveFile {
  id: string
  name: string
  mimeType: string
  size?: string
  modifiedTime?: string
  isFolder: boolean
}

interface DriveLink {
  id: number
  drive_file_id: string
  drive_file_name: string
  drive_mime_type: string
}

interface Props {
  projectId: number
  onImport?: () => void
}

function formatDriveSize(bytes?: string) {
  if (!bytes) return ''
  const n = parseInt(bytes)
  if (isNaN(n)) return ''
  if (n < 1024) return n + ' B'
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB'
  return (n / (1024 * 1024)).toFixed(1) + ' MB'
}

function driveTypeToFileType(mimeType: string, name: string): string {
  if (mimeType === 'application/vnd.google-apps.folder') return 'folder'
  if (mimeType.includes('spreadsheet') || name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv')) return 'excel'
  if (mimeType.includes('pdf') || name.endsWith('.pdf')) return 'pdf'
  if (mimeType.includes('word') || name.endsWith('.docx') || name.endsWith('.doc')) return 'word'
  if (mimeType.includes('presentation') || name.endsWith('.pptx')) return 'other'
  if (mimeType.includes('text/plain') || name.endsWith('.txt')) return 'text'
  if (mimeType.includes('text/html') || name.endsWith('.html')) return 'html'
  if (mimeType.includes('json') || name.endsWith('.json')) return 'json'
  if (mimeType.includes('markdown') || name.endsWith('.md')) return 'markdown'
  if (mimeType.startsWith('image/')) return 'image'
  return 'other'
}

export default function DrivePanelTab({ projectId, onImport }: Props) {
  const [connected, setConnected] = useState<boolean | null>(null)
  const [files, setFiles] = useState<DriveFile[]>([])
  const [links, setLinks] = useState<DriveLink[]>([])
  const [loading, setLoading] = useState(false)
  const [folderId, setFolderId] = useState('root')
  const [breadcrumb, setBreadcrumb] = useState<{ id: string; name: string }[]>([{ id: 'root', name: 'My Drive' }])
  const [importingId, setImportingId] = useState<string | null>(null)
  const [linkingId, setLinkingId] = useState<string | null>(null)

  const checkConnection = useCallback(async () => {
    try {
      const r = await api.get('/drive/status')
      setConnected(r.data.connected)
    } catch {
      setConnected(false)
    }
  }, [])

  const fetchFiles = useCallback(async (folder: string) => {
    setLoading(true)
    try {
      const [filesRes, linksRes] = await Promise.all([
        api.get(`/drive/files?folderId=${folder}`),
        api.get(`/drive/projects/${projectId}/links`)
      ])
      setFiles(filesRes.data)
      setLinks(linksRes.data)
    } catch (e: any) {
      if (e?.response?.status === 401 || e?.response?.data?.error?.includes('ربط')) {
        setConnected(false)
      } else {
        toast.error('فشل تحميل ملفات Drive')
      }
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    checkConnection()
  }, [checkConnection])

  useEffect(() => {
    if (connected) fetchFiles(folderId)
  }, [connected, folderId, fetchFiles])

  const navigateTo = async (folder: DriveFile) => {
    const newFolderId = folder.id
    setFolderId(newFolderId)
    try {
      const res = await api.get(`/drive/breadcrumb?folderId=${newFolderId}`)
      setBreadcrumb(res.data)
    } catch {
      setBreadcrumb(prev => [...prev, { id: folder.id, name: folder.name }])
    }
  }

  const navigateBreadcrumb = async (crumb: { id: string; name: string }, idx: number) => {
    setFolderId(crumb.id)
    setBreadcrumb(prev => prev.slice(0, idx + 1))
  }

  const isLinked = (fileId: string) => links.some(l => l.drive_file_id === fileId)

  const toggleLink = async (file: DriveFile) => {
    if (file.isFolder) return
    setLinkingId(file.id)
    try {
      if (isLinked(file.id)) {
        await api.delete(`/drive/projects/${projectId}/links/${file.id}`)
        setLinks(prev => prev.filter(l => l.drive_file_id !== file.id))
        toast.success('تم إلغاء ربط الملف')
      } else {
        const r = await api.post(`/drive/projects/${projectId}/links`, {
          drive_file_id: file.id,
          drive_file_name: file.name,
          drive_mime_type: file.mimeType
        })
        setLinks(prev => [...prev, r.data])
        toast.success('تم ربط الملف — الذكاء الاصطناعي سيقرأه تلقائياً')
      }
    } catch {
      toast.error('فشلت العملية')
    } finally {
      setLinkingId(null)
    }
  }

  const importFile = async (file: DriveFile) => {
    if (file.isFolder) return
    setImportingId(file.id)
    try {
      await api.post('/drive/import', { fileId: file.id, fileName: file.name, projectId })
      toast.success(`تم استيراد "${file.name}" للمشروع`)
      onImport?.()
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'فشل الاستيراد')
    } finally {
      setImportingId(null)
    }
  }

  if (connected === null) {
    return (
      <div className="flex-1 flex items-center justify-center py-12">
        <Loader2 size={20} className="animate-spin text-[var(--muted)]" />
      </div>
    )
  }

  if (!connected) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-4 text-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
          <HardDrive size={22} className="text-blue-500" />
        </div>
        <p className="text-xs text-[var(--text)] font-medium">Google Drive غير مرتبط</p>
        <p className="text-xs text-[var(--muted)]">سجّل الدخول لعرض ملفاتك مباشرةً هنا</p>
        <button
          onClick={() => window.location.href = '/drive'}
          className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
        >
          ربط Google Drive
        </button>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-[var(--border)] shrink-0 overflow-x-auto">
        {breadcrumb.map((crumb, idx) => (
          <div key={crumb.id} className="flex items-center gap-1 shrink-0">
            {idx > 0 && <ChevronLeft size={10} className="text-[var(--muted)]" />}
            <button
              onClick={() => navigateBreadcrumb(crumb, idx)}
              className={`text-xs px-1 py-0.5 rounded transition-colors
                ${idx === breadcrumb.length - 1
                  ? 'text-[var(--text)] font-medium cursor-default'
                  : 'text-[var(--muted)] hover:text-primary-600'}`}
            >
              {idx === 0 ? <Home size={11} /> : crumb.name}
            </button>
          </div>
        ))}
        <button
          onClick={() => fetchFiles(folderId)}
          className="mr-auto p-1 rounded hover:bg-[var(--bg)] text-[var(--muted)] transition-colors shrink-0"
          title="تحديث"
        >
          <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Linked files summary */}
      {links.length > 0 && (
        <div className="px-2 py-1.5 bg-green-50 dark:bg-green-900/10 border-b border-green-200 dark:border-green-900/20 shrink-0">
          <p className="text-xs text-green-700 dark:text-green-400 font-medium flex items-center gap-1">
            <Link size={10} />
            {links.length} ملف مرتبط — الذكاء الاصطناعي يقرأها تلقائياً
          </p>
        </div>
      )}

      {/* File list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 size={18} className="animate-spin text-[var(--muted)]" />
          </div>
        ) : files.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-xs text-[var(--muted)]">لا توجد ملفات في هذا المجلد</p>
          </div>
        ) : (
          files.map(file => {
            const linked = isLinked(file.id)
            const isImporting = importingId === file.id
            const isLinking = linkingId === file.id
            return (
              <div
                key={file.id}
                className={`flex items-center gap-1.5 p-2 rounded-lg group transition-all
                  ${linked ? 'bg-green-50 dark:bg-green-900/10 ring-1 ring-green-300 dark:ring-green-800' : 'hover:bg-[var(--bg)]'}`}
              >
                {/* Icon */}
                {file.isFolder ? (
                  <button
                    onClick={() => navigateTo(file)}
                    className="shrink-0 text-amber-500 hover:text-amber-600 transition-colors"
                  >
                    <Folder size={15} />
                  </button>
                ) : (
                  <span className="shrink-0">
                    <FileTypeIcon type={driveTypeToFileType(file.mimeType, file.name)} size="sm" />
                  </span>
                )}

                {/* Name */}
                <div className="flex-1 min-w-0">
                  {file.isFolder ? (
                    <button
                      onClick={() => navigateTo(file)}
                      className="text-xs font-medium text-[var(--text)] truncate block w-full text-right hover:text-primary-600 transition-colors"
                    >
                      {file.name}
                    </button>
                  ) : (
                    <p className="text-xs font-medium text-[var(--text)] truncate">{file.name}</p>
                  )}
                  {file.size && (
                    <p className="text-xs text-[var(--muted)]">{formatDriveSize(file.size)}</p>
                  )}
                </div>

                {/* Actions */}
                {!file.isFolder && (
                  <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button
                      onClick={() => toggleLink(file)}
                      disabled={isLinking}
                      className={`p-1 rounded transition-colors ${
                        linked
                          ? 'text-green-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20'
                          : 'text-[var(--muted)] hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20'
                      }`}
                      title={linked ? 'إلغاء ربط الذكاء الاصطناعي' : 'ربط بالذكاء الاصطناعي'}
                    >
                      {isLinking
                        ? <Loader2 size={11} className="animate-spin" />
                        : linked
                          ? <Link2Off size={11} />
                          : <Link size={11} />
                      }
                    </button>
                    <button
                      onClick={() => importFile(file)}
                      disabled={isImporting}
                      className="p-1 rounded text-[var(--muted)] hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors"
                      title="استيراد للمشروع"
                    >
                      {isImporting
                        ? <Loader2 size={11} className="animate-spin" />
                        : <Download size={11} />
                      }
                    </button>
                  </div>
                )}

                {/* Linked badge */}
                {linked && (
                  <span className="text-[10px] px-1 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 font-medium shrink-0">
                    AI
                  </span>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
