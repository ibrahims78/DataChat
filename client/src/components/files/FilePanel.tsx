import { useState, useRef, useEffect } from 'react'
import {
  Trash2, Download, Eye, Upload, ChevronLeft, ChevronRight,
  FolderPlus, Folder, FolderOpen, Pencil, Check, X, GripVertical,
  ChevronDown, ChevronUp
} from 'lucide-react'
import { useTheme } from '../../contexts/ThemeContext'
import { useT } from '../../i18n/translations'
import api from '../../lib/api'
import toast from 'react-hot-toast'
import ConfirmModal from '../ui/ConfirmModal'
import FolderSyncSection from './FolderSyncSection'
import FolderFilesSection from './FolderFilesSection'
import FolderImportModal from './FolderImportModal'
import FolderCapabilitiesModal from './FolderCapabilitiesModal'

interface FolderItem { id: number; name: string; sort_order: number }
interface FileItem {
  id: number; original_name: string; display_name?: string
  file_type: string; file_size: number; sort_order: number; folder_id?: number | null
}
interface GenFile {
  id: number; original_name: string; display_name?: string
  file_type: string; sort_order: number
}

interface Props {
  files: FileItem[]
  generatedFiles: GenFile[]
  folders: FolderItem[]
  projectId: number
  onRefresh: () => void
  onUpload: () => void
  onBatchAnalyze?: (msg: string) => void
  mobileOpen?: boolean
  onMobileClose?: () => void
  onSyncAll?: () => void
  isSyncing?: boolean
  onFolderFilesOpen?: (files: any[]) => void
}

const typeIcons: Record<string, string> = { excel: '📊', csv: '📋', pdf: '📄', word: '📝', html: '🌐', markdown: '📑', text: '📃', json: '🗂️' }
const genTypeIcons: Record<string, string> = { excel: '📊', pdf: '📄', html: '🌐', markdown: '📑', text: '📃', json: '🗂️' }

function formatSize(bytes: number) {
  if (!bytes) return ''
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function fileName(f: FileItem | GenFile) {
  return f.display_name || f.original_name
}

export default function FilePanel({ files, generatedFiles, folders, projectId, onRefresh, onUpload, onBatchAnalyze, mobileOpen = false, onMobileClose, onSyncAll, isSyncing, onFolderFilesOpen }: Props) {
  const [collapsed, setCollapsed] = useState(false)
  const [collapsedFolders, setCollapsedFolders] = useState<Set<number>>(new Set())
  const [importFolder, setImportFolder] = useState<string | null>(null)
  const [showCapabilities, setShowCapabilities] = useState(false)

  // Rename state
  const [renaming, setRenaming] = useState<{ type: 'file' | 'gen' | 'folder'; id: number; value: string } | null>(null)
  const renameRef = useRef<HTMLInputElement>(null)

  // New folder state
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const newFolderRef = useRef<HTMLInputElement>(null)

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'file' | 'gen' | 'folder'; item: any } | null>(null)

  // Preview
  const [previewFile, setPreviewFile] = useState<FileItem | null>(null)
  const [preview, setPreview] = useState<any>(null)

  // Drag & drop
  const [dragItem, setDragItem] = useState<{ type: 'file' | 'gen'; id: number; folderId: number | null } | null>(null)
  const [dragOverTarget, setDragOverTarget] = useState<{ type: 'file' | 'gen' | 'folder'; id: number } | null>(null)

  const { lang } = useTheme()
  const tr = useT(lang)

  useEffect(() => {
    if (renaming) setTimeout(() => renameRef.current?.focus(), 50)
  }, [renaming])

  useEffect(() => {
    if (creatingFolder) setTimeout(() => newFolderRef.current?.focus(), 50)
  }, [creatingFolder])

  // ─── Rename ────────────────────────────────────────────────────────────────
  const startRename = (type: 'file' | 'gen' | 'folder', id: number, currentName: string) => {
    setRenaming({ type, id, value: currentName })
  }

  const commitRename = async () => {
    if (!renaming || !renaming.value.trim()) { setRenaming(null); return }
    try {
      if (renaming.type === 'file') {
        await api.patch(`/files/${projectId}/${renaming.id}/rename`, { name: renaming.value })
      } else if (renaming.type === 'gen') {
        await api.patch(`/files/generated/${renaming.id}/rename`, { name: renaming.value })
      } else {
        await api.patch(`/files/${projectId}/folders/${renaming.id}`, { name: renaming.value })
      }
      onRefresh()
      toast.success('تم التغيير')
    } catch { toast.error('فشل التغيير') }
    setRenaming(null)
  }

  // ─── Create folder ─────────────────────────────────────────────────────────
  const createFolder = async () => {
    if (!newFolderName.trim()) { setCreatingFolder(false); return }
    try {
      await api.post(`/files/${projectId}/folders`, { name: newFolderName.trim() })
      onRefresh()
      toast.success('تم إنشاء المجلد')
    } catch { toast.error('فشل إنشاء المجلد') }
    setCreatingFolder(false)
    setNewFolderName('')
  }

  // ─── Delete ────────────────────────────────────────────────────────────────
  const confirmDelete = async () => {
    if (!deleteTarget) return
    try {
      if (deleteTarget.type === 'file') {
        await api.delete(`/files/${projectId}/${deleteTarget.item.id}`)
        toast.success('تم حذف الملف')
      } else if (deleteTarget.type === 'gen') {
        await api.delete(`/files/generated/${deleteTarget.item.id}`)
        toast.success('تم الحذف')
      } else {
        await api.delete(`/files/${projectId}/folders/${deleteTarget.item.id}`)
        toast.success('تم حذف المجلد')
      }
      onRefresh()
    } catch { toast.error('فشل الحذف') }
    setDeleteTarget(null)
  }

  // ─── Preview ───────────────────────────────────────────────────────────────
  const showPreview = async (file: FileItem) => {
    setPreviewFile(file)
    try {
      const res = await api.get(`/files/${projectId}/${file.id}/preview`)
      setPreview(res.data.preview)
    } catch { setPreview({ type: 'error', message: 'فشل تحميل المعاينة' }) }
  }

  // ─── Download uploaded file ──────────────────────────────────────────────────
  const downloadFile = (f: FileItem) => {
    const token = localStorage.getItem('token')
    if (!token) { toast.error('يرجى تسجيل الدخول أولاً'); return }
    const a = document.createElement('a')
    a.href = `/api/files/${projectId}/${f.id}/download?token=${encodeURIComponent(token)}`
    a.download = fileName(f)
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  // ─── Download generated file ───────────────────────────────────────────────
  const downloadGenFile = (f: GenFile) => {
    const token = localStorage.getItem('token')
    if (!token) { toast.error('يرجى تسجيل الدخول أولاً'); return }
    const a = document.createElement('a')
    a.href = `/api/files/generated/${f.id}/download?token=${encodeURIComponent(token)}`
    a.download = fileName(f)
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  // ─── Drag & drop ───────────────────────────────────────────────────────────
  const onDragStart = (e: React.DragEvent, type: 'file' | 'gen', id: number, folderId: number | null = null) => {
    setDragItem({ type, id, folderId })
    e.dataTransfer.effectAllowed = 'move'
  }

  const onDragOver = (e: React.DragEvent, type: 'file' | 'gen' | 'folder', id: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverTarget({ type, id })
  }

  const onDragLeave = () => setDragOverTarget(null)
  const onDragEnd = () => { setDragItem(null); setDragOverTarget(null) }

  const onDropOnFolder = async (e: React.DragEvent, folderId: number) => {
    e.preventDefault()
    setDragOverTarget(null)
    if (!dragItem || dragItem.type !== 'file' || dragItem.folderId === folderId) { setDragItem(null); return }
    try {
      const updatedFiles = files.map(f =>
        f.id === dragItem.id
          ? { id: f.id, sort_order: f.sort_order, folder_id: folderId }
          : { id: f.id, sort_order: f.sort_order, folder_id: f.folder_id ?? null }
      )
      await api.patch(`/files/${projectId}/reorder`, { items: updatedFiles })
      onRefresh()
    } catch { toast.error('فشل النقل') }
    setDragItem(null)
  }

  const onDropOnFile = async (e: React.DragEvent, targetId: number, targetFolderId: number | null) => {
    e.preventDefault()
    setDragOverTarget(null)
    if (!dragItem || dragItem.id === targetId) { setDragItem(null); return }

    if (dragItem.type === 'file') {
      const list = [...files]
      const fromIdx = list.findIndex(f => f.id === dragItem.id)
      const toIdx = list.findIndex(f => f.id === targetId)
      if (fromIdx === -1 || toIdx === -1) { setDragItem(null); return }
      const [moved] = list.splice(fromIdx, 1)
      list.splice(toIdx, 0, moved)
      const items = list.map((f, i) => ({
        id: f.id,
        sort_order: i,
        folder_id: f.id === dragItem.id ? targetFolderId : (f.folder_id ?? null)
      }))
      try {
        await api.patch(`/files/${projectId}/reorder`, { items })
        onRefresh()
      } catch { toast.error('فشل الترتيب') }
    } else {
      const list = [...generatedFiles]
      const fromIdx = list.findIndex(f => f.id === dragItem.id)
      const toIdx = list.findIndex(f => f.id === targetId)
      if (fromIdx === -1 || toIdx === -1) { setDragItem(null); return }
      const [moved] = list.splice(fromIdx, 1)
      list.splice(toIdx, 0, moved)
      const items = list.map((f, i) => ({ id: f.id, sort_order: i }))
      try {
        await api.patch(`/files/${projectId}/reorder-generated`, { items })
        onRefresh()
      } catch { toast.error('فشل الترتيب') }
    }
    setDragItem(null)
  }

  const onDropOnUncategorized = async (e: React.DragEvent) => {
    e.preventDefault()
    setDragOverTarget(null)
    if (!dragItem || dragItem.type !== 'file' || dragItem.folderId === null) { setDragItem(null); return }
    try {
      const items = files.map(f => ({
        id: f.id,
        sort_order: f.sort_order,
        folder_id: f.id === dragItem.id ? null : (f.folder_id ?? null)
      }))
      await api.patch(`/files/${projectId}/reorder`, { items })
      onRefresh()
    } catch { toast.error('فشل النقل') }
    setDragItem(null)
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────
  const filesInFolder = (folderId: number) => files.filter(f => f.folder_id === folderId)
  const uncategorizedFiles = files.filter(f => !f.folder_id)
  const isDragOver = (type: string, id: number) => dragOverTarget?.type === type && dragOverTarget.id === id

  const deleteModalDesc = () => {
    if (!deleteTarget) return ''
    if (deleteTarget.type === 'folder') return `سيتم حذف المجلد وستُنقل الملفات إلى القائمة العامة`
    return `هل تريد حذف "${fileName(deleteTarget.item)}"؟`
  }

  // ─── Render a single file row ──────────────────────────────────────────────
  const renderFileRow = (f: FileItem, folderId: number | null = null) => {
    const isRenamingThis = renaming?.type === 'file' && renaming.id === f.id
    const isDraggingThis = dragItem?.id === f.id && dragItem.type === 'file'
    const isOver = isDragOver('file', f.id)

    return (
      <div
        key={f.id}
        draggable
        onDragStart={e => onDragStart(e, 'file', f.id, folderId)}
        onDragOver={e => onDragOver(e, 'file', f.id)}
        onDragLeave={onDragLeave}
        onDragEnd={onDragEnd}
        onDrop={e => onDropOnFile(e, f.id, folderId)}
        className={`flex items-center gap-1.5 p-2 rounded-lg group transition-all cursor-default select-none
          ${isDraggingThis ? 'opacity-40' : ''}
          ${isOver ? 'bg-primary-100 dark:bg-primary-900/40 ring-1 ring-primary-400' : 'hover:bg-[var(--bg)]'}
        `}
      >
        <span className="text-[var(--muted)] cursor-grab active:cursor-grabbing shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <GripVertical size={12} />
        </span>
        <span className="text-base shrink-0">{typeIcons[f.file_type] || '📎'}</span>
        <div className="flex-1 min-w-0">
          {isRenamingThis ? (
            <input
              ref={renameRef}
              value={renaming!.value}
              onChange={e => setRenaming(r => r ? { ...r, value: e.target.value } : r)}
              onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenaming(null) }}
              onBlur={commitRename}
              className="text-xs w-full bg-[var(--bg)] border border-primary-400 rounded px-1.5 py-0.5 outline-none text-[var(--text)]"
              onClick={e => e.stopPropagation()}
            />
          ) : (
            <p className="text-xs font-medium text-[var(--text)] truncate" onDoubleClick={() => startRename('file', f.id, fileName(f))}>
              {fileName(f)}
            </p>
          )}
          {!!f.file_size && <p className="text-xs text-[var(--muted)]">{formatSize(f.file_size)}</p>}
        </div>
        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button
            onClick={e => { e.stopPropagation(); startRename('file', f.id, fileName(f)) }}
            className="p-1 rounded hover:bg-primary-100 dark:hover:bg-primary-900/30 text-[var(--muted)] hover:text-primary-600 transition-colors" title="إعادة التسمية">
            <Pencil size={11} />
          </button>
          {(f.file_type === 'excel' || f.file_type === 'csv') ? (
            <button
              onClick={e => { e.stopPropagation(); downloadFile(f) }}
              className="p-1 rounded hover:bg-primary-100 dark:hover:bg-primary-900/30 text-[var(--muted)] hover:text-primary-600 transition-colors" title="فتح في Excel">
              <Download size={11} />
            </button>
          ) : (f.file_type === 'markdown' || f.file_type === 'text' || f.file_type === 'json') ? (
            <>
              <button
                onClick={e => { e.stopPropagation(); showPreview(f) }}
                className="p-1 rounded hover:bg-primary-100 dark:hover:bg-primary-900/30 text-[var(--muted)] hover:text-primary-600 transition-colors" title="معاينة">
                <Eye size={11} />
              </button>
              <button
                onClick={e => { e.stopPropagation(); downloadFile(f) }}
                className="p-1 rounded hover:bg-primary-100 dark:hover:bg-primary-900/30 text-[var(--muted)] hover:text-primary-600 transition-colors" title="تحميل">
                <Download size={11} />
              </button>
            </>
          ) : (
            <button
              onClick={e => { e.stopPropagation(); showPreview(f) }}
              className="p-1 rounded hover:bg-primary-100 dark:hover:bg-primary-900/30 text-[var(--muted)] hover:text-primary-600 transition-colors" title="معاينة">
              <Eye size={11} />
            </button>
          )}
          <button
            onClick={e => { e.stopPropagation(); setDeleteTarget({ type: 'file', item: f }) }}
            className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/20 text-[var(--muted)] hover:text-red-500 transition-colors" title="حذف">
            <Trash2 size={11} />
          </button>
        </div>
      </div>
    )
  }

  // ─── Render a generated file row ────────────────────────────────────────────
  const renderGenRow = (f: GenFile) => {
    const isRenamingThis = renaming?.type === 'gen' && renaming.id === f.id
    const isDraggingThis = dragItem?.id === f.id && dragItem.type === 'gen'
    const isOver = isDragOver('gen', f.id)

    return (
      <div
        key={f.id}
        draggable
        onDragStart={e => onDragStart(e, 'gen', f.id)}
        onDragOver={e => onDragOver(e, 'gen', f.id)}
        onDragLeave={onDragLeave}
        onDragEnd={onDragEnd}
        onDrop={e => onDropOnFile(e, f.id, null)}
        className={`flex items-center gap-1.5 p-2 rounded-lg group transition-all select-none
          ${isDraggingThis ? 'opacity-40' : ''}
          ${isOver ? 'bg-primary-100 dark:bg-primary-900/40 ring-1 ring-primary-400' : 'hover:bg-[var(--bg)]'}
        `}
      >
        <span className="text-[var(--muted)] cursor-grab active:cursor-grabbing shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <GripVertical size={12} />
        </span>
        <span className="text-base shrink-0">{genTypeIcons[f.file_type] || '📎'}</span>
        <div className="flex-1 min-w-0">
          {isRenamingThis ? (
            <input
              ref={renameRef}
              value={renaming!.value}
              onChange={e => setRenaming(r => r ? { ...r, value: e.target.value } : r)}
              onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenaming(null) }}
              onBlur={commitRename}
              className="text-xs w-full bg-[var(--bg)] border border-primary-400 rounded px-1.5 py-0.5 outline-none text-[var(--text)]"
              onClick={e => e.stopPropagation()}
            />
          ) : (
            <p className="text-xs font-medium text-[var(--text)] truncate" onDoubleClick={() => startRename('gen', f.id, fileName(f))}>
              {fileName(f)}
            </p>
          )}
        </div>
        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button
            onClick={e => { e.stopPropagation(); startRename('gen', f.id, fileName(f)) }}
            className="p-1 rounded hover:bg-primary-100 dark:hover:bg-primary-900/30 text-[var(--muted)] hover:text-primary-600 transition-colors" title="إعادة التسمية">
            <Pencil size={11} />
          </button>
          <button
            onClick={e => { e.stopPropagation(); downloadGenFile(f) }}
            className="p-1 rounded hover:bg-primary-100 dark:hover:bg-primary-900/30 text-[var(--muted)] hover:text-primary-600 transition-colors" title="تحميل">
            <Download size={11} />
          </button>
          <button
            onClick={e => { e.stopPropagation(); setDeleteTarget({ type: 'gen', item: f }) }}
            className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/20 text-[var(--muted)] hover:text-red-500 transition-colors" title="حذف">
            <Trash2 size={11} />
          </button>
        </div>
      </div>
    )
  }

  // ─── Shared panel content (called as function, not rendered as component) ───
  const panelContent = (onClose?: () => void) => (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
        <span className="font-semibold text-sm text-[var(--text)]">{tr('files')}</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setCreatingFolder(true)}
            className="p-1.5 rounded-lg hover:bg-[var(--bg)] text-[var(--muted)] hover:text-primary-600 transition-colors" title={tr('newFolder')}>
            <FolderPlus size={14} />
          </button>
          <button
            onClick={onUpload}
            className="p-1.5 rounded-lg hover:bg-[var(--bg)] text-[var(--muted)] hover:text-primary-600 transition-colors" title={tr('uploadFile')}>
            <Upload size={14} />
          </button>
          {onClose ? (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-[var(--bg)] text-[var(--muted)] transition-colors" title="إغلاق">
              <X size={14} />
            </button>
          ) : (
            <button
              onClick={() => setCollapsed(true)}
              className="p-1.5 rounded-lg hover:bg-[var(--bg)] text-[var(--muted)] transition-colors">
              <ChevronRight size={14} className={lang === 'ar' ? '' : 'rotate-180'} />
            </button>
          )}
        </div>
      </div>

      {/* Folder sync section */}
      <FolderSyncSection
        projectId={projectId}
        onRefresh={onRefresh}
        onOpenImport={setImportFolder}
        onOpenCapabilities={() => setShowCapabilities(true)}
        onSyncAll={onSyncAll}
        isSyncing={isSyncing}
      />

      <div className="flex-1 overflow-y-auto p-2 space-y-3">

        {/* Linked folder files */}
        <FolderFilesSection
          projectId={projectId}
          onRefresh={onRefresh}
          onAnalyze={onBatchAnalyze}
          onOpenFilesChange={onFolderFilesOpen}
        />

        {/* New folder input */}
        {creatingFolder && (
          <div className="flex items-center gap-1 px-2">
            <Folder size={14} className="text-primary-500 shrink-0" />
            <input
              ref={newFolderRef}
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') createFolder(); if (e.key === 'Escape') { setCreatingFolder(false); setNewFolderName('') } }}
              onBlur={createFolder}
              placeholder={tr('folderName')}
              className="text-xs flex-1 bg-[var(--bg)] border border-primary-400 rounded px-2 py-1 outline-none text-[var(--text)]"
            />
          </div>
        )}

        {/* Folders */}
        {folders.map(folder => {
          const folderFiles = filesInFolder(folder.id)
          const isOpen = !collapsedFolders.has(folder.id)
          const isRenamingFolder = renaming?.type === 'folder' && renaming.id === folder.id
          const isDropTarget = isDragOver('folder', folder.id)

          return (
            <div key={folder.id}
              onDragOver={e => { e.preventDefault(); setDragOverTarget({ type: 'folder', id: folder.id }) }}
              onDragLeave={onDragLeave}
              onDrop={e => onDropOnFolder(e, folder.id)}
              className={`rounded-lg transition-all ${isDropTarget ? 'ring-2 ring-primary-400 bg-primary-50 dark:bg-primary-900/20' : ''}`}
            >
              {/* Folder header */}
              <div
                className="flex items-center gap-1 px-2 py-1.5 group rounded-lg hover:bg-[var(--bg)] cursor-pointer"
                onClick={() => setCollapsedFolders(prev => {
                  const s = new Set(prev)
                  s.has(folder.id) ? s.delete(folder.id) : s.add(folder.id)
                  return s
                })}
              >
                <span className="text-primary-500 shrink-0">
                  {isOpen ? <FolderOpen size={14} /> : <Folder size={14} />}
                </span>
                {isRenamingFolder ? (
                  <input
                    ref={renameRef}
                    value={renaming!.value}
                    onChange={e => setRenaming(r => r ? { ...r, value: e.target.value } : r)}
                    onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenaming(null) }}
                    onBlur={commitRename}
                    onClick={e => e.stopPropagation()}
                    className="text-xs flex-1 bg-[var(--bg)] border border-primary-400 rounded px-1.5 py-0.5 outline-none text-[var(--text)]"
                  />
                ) : (
                  <span
                    className="text-xs font-medium text-[var(--text)] flex-1 truncate"
                    onDoubleClick={e => { e.stopPropagation(); startRename('folder', folder.id, folder.name) }}>
                    {folder.name}
                  </span>
                )}
                <span className="text-xs text-[var(--muted)]">{folderFiles.length}</span>
                <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                  <button
                    onClick={e => { e.stopPropagation(); startRename('folder', folder.id, folder.name) }}
                    className="p-0.5 rounded hover:bg-primary-100 dark:hover:bg-primary-900/30 text-[var(--muted)] hover:text-primary-600 transition-colors">
                    <Pencil size={10} />
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); setDeleteTarget({ type: 'folder', item: folder }) }}
                    className="p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/20 text-[var(--muted)] hover:text-red-500 transition-colors">
                    <Trash2 size={10} />
                  </button>
                </div>
                <span className="text-[var(--muted)]">
                  {isOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                </span>
              </div>

              {/* Files inside folder */}
              {isOpen && (
                <div className="ps-3 space-y-0.5">
                  {folderFiles.length === 0 ? (
                    <p className="text-xs text-[var(--muted)] px-2 py-2 italic">اسحب ملفاً هنا...</p>
                  ) : (
                    folderFiles.map(f => renderFileRow(f, folder.id))
                  )}
                </div>
              )}
            </div>
          )
        })}

        {/* Uncategorized files */}
        <div>
          {folders.length > 0 && (
            <div
              onDragOver={e => { e.preventDefault(); setDragOverTarget({ type: 'folder', id: -1 }) }}
              onDragLeave={onDragLeave}
              onDrop={onDropOnUncategorized}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-lg mb-1 transition-all
                ${isDragOver('folder', -1) ? 'bg-primary-50 dark:bg-primary-900/20 ring-1 ring-primary-300' : ''}
              `}
            >
              <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide flex-1">
                {tr('uncategorized')} ({uncategorizedFiles.length})
              </p>
            </div>
          )}

          {uncategorizedFiles.length === 0 && files.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-xs text-[var(--muted)]">{tr('noFilesYet')}</p>
              <button onClick={onUpload} className="text-xs text-primary-600 mt-1 hover:underline">{tr('uploadFile')}</button>
            </div>
          ) : (
            <div className="space-y-0.5">
              {uncategorizedFiles.map(f => renderFileRow(f, null))}
            </div>
          )}
        </div>

        {/* Generated files */}
        {generatedFiles.length > 0 && (
          <div className="border-t border-[var(--border)] pt-3">
            <p className="text-xs font-semibold text-[var(--muted)] mb-2 px-1 uppercase tracking-wide">
              {tr('generatedFiles')} ({generatedFiles.length})
            </p>
            <div className="space-y-0.5">
              {generatedFiles.map(f => renderGenRow(f))}
            </div>
          </div>
        )}
      </div>

      {/* Confirm delete modal */}
      <ConfirmModal
        open={!!deleteTarget}
        title={deleteTarget?.type === 'folder' ? tr('deleteFolder') : 'حذف الملف'}
        icon="🗑️"
        danger
        description={deleteModalDesc()}
        confirmLabel="حذف"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />

      {/* Folder import modal */}
      {importFolder && (
        <FolderImportModal
          projectId={projectId}
          folderName={importFolder}
          onClose={() => setImportFolder(null)}
          onRefresh={onRefresh}
          onBatchAnalyze={onBatchAnalyze}
        />
      )}

      {/* Folder capabilities modal */}
      {showCapabilities && (
        <FolderCapabilitiesModal onClose={() => setShowCapabilities(false)} />
      )}

      {/* File preview modal */}
      {previewFile && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          onClick={() => { setPreviewFile(null); setPreview(null) }}>
          <div className="card p-6 w-full max-w-2xl max-h-[80vh] flex flex-col animate-fade-in"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-[var(--text)]">{fileName(previewFile)}</h3>
              <button onClick={() => { setPreviewFile(null); setPreview(null) }} className="btn-ghost text-sm">{tr('close')}</button>
            </div>
            <div className="overflow-auto flex-1">
              {!preview ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full" />
                </div>
              ) : preview.type === 'table' ? (
                <div>
                  <p className="text-xs text-[var(--muted)] mb-3">{preview.totalRows} {tr('rows')} × {preview.totalCols} {tr('columns')} — أول 5 صفوف</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr>{preview.headers.map((h: string, i: number) =>
                          <th key={i} className="border border-[var(--border)] bg-primary-600 text-white px-3 py-2 text-start">{h}</th>
                        )}</tr>
                      </thead>
                      <tbody>
                        {preview.rows.map((row: any[], ri: number) =>
                          <tr key={ri} className="hover:bg-[var(--bg)]">
                            {row.map((cell, ci) => <td key={ci} className="border border-[var(--border)] px-3 py-1.5">{cell}</td>)}
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : preview.type === 'text' ? (
                <div>
                  {preview.totalPages && <p className="text-xs text-[var(--muted)] mb-2">{preview.totalPages} {tr('pages')}</p>}
                  <p className="text-sm text-[var(--text)] whitespace-pre-wrap leading-relaxed bg-[var(--bg)] rounded-lg p-4">{preview.text}...</p>
                </div>
              ) : preview.type === 'markdown' ? (
                <div>
                  <p className="text-xs text-[var(--muted)] mb-2">معاينة Markdown</p>
                  <pre className="text-sm text-[var(--text)] whitespace-pre-wrap leading-relaxed bg-[var(--bg)] rounded-lg p-4 font-mono overflow-x-auto">{preview.text}{preview.text?.length >= 1000 ? '...' : ''}</pre>
                </div>
              ) : preview.type === 'json' ? (
                <div>
                  <p className="text-xs text-[var(--muted)] mb-2">معاينة JSON</p>
                  <pre className="text-sm text-[var(--text)] whitespace-pre-wrap leading-relaxed bg-[var(--bg)] rounded-lg p-4 font-mono overflow-x-auto">{preview.text}{preview.text?.length >= 1000 ? '...' : ''}</pre>
                </div>
              ) : (
                <p className="text-red-500 text-sm">{preview.message}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )

  // ─── Collapsed (desktop only) ──────────────────────────────────────────────
  if (collapsed) return (
    <button onClick={() => setCollapsed(false)}
      className="hidden md:flex w-10 bg-[var(--surface)] border-s border-[var(--border)] items-center justify-center hover:bg-[var(--bg)] transition-colors">
      <ChevronLeft size={16} className={`text-[var(--muted)] ${lang === 'ar' ? '' : 'rotate-180'}`} />
    </button>
  )

  return (
    <>
      {/* Mobile drawer overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={onMobileClose} />
          <aside className={`relative z-50 w-72 bg-[var(--surface)] flex flex-col h-full shadow-2xl ${lang === 'ar' ? 'me-auto' : 'ms-auto'}`}>
            {panelContent(onMobileClose)}
          </aside>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-64 bg-[var(--surface)] border-s border-[var(--border)] shrink-0">
        {panelContent()}
      </aside>
    </>
  )
}
