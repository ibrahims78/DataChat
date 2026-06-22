import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowRight, MoreHorizontal, Download, FolderOpen, Files } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useT } from '../i18n/translations'
import api from '../lib/api'
import toast from 'react-hot-toast'
import FilePanel from '../components/files/FilePanel'
import ChatMessages from '../components/chat/ChatMessages'
import ChatInput from '../components/chat/ChatInput'
import FileUploadModal from '../components/files/FileUploadModal'
import { useFolderSyncContext } from '../contexts/FolderSyncContext'
import { uploadChunked } from '../lib/uploadChunked'
import { readFolderFileForAI } from '../lib/folderFileReader'
import type { FileInfo } from '../lib/useFolderSync'
import { generateDocxFromMarkdown } from '../lib/folderDocxWriter'

interface Project {
  id: number; name: string; user_id: number
  files: any[]; messages: any[]; generated_files: any[]; folders: any[]
  conversation_id: number; file_count: number; message_count: number
}

export default function ProjectPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { lang } = useTheme()
  const tr = useT(lang)

  const {
    saveFile: saveFolderFile, folderName, permState: folderPermState,
    listAllFiles, createDirectory, writeFileContent, deleteFile, primaryFolder
  } = useFolderSyncContext()
  const saveFolderFileRef = useRef(saveFolderFile)
  const listAllFilesRef = useRef(listAllFiles)
  const createDirectoryRef = useRef(createDirectory)
  const writeFileContentRef = useRef(writeFileContent)
  const deleteFileRef = useRef(deleteFile)
  const primaryFolderRef = useRef(primaryFolder)
  useEffect(() => { saveFolderFileRef.current = saveFolderFile }, [saveFolderFile])
  useEffect(() => { listAllFilesRef.current = listAllFiles }, [listAllFiles])
  useEffect(() => { createDirectoryRef.current = createDirectory }, [createDirectory])
  useEffect(() => { writeFileContentRef.current = writeFileContent }, [writeFileContent])
  useEffect(() => { deleteFileRef.current = deleteFile }, [deleteFile])
  useEffect(() => { primaryFolderRef.current = primaryFolder }, [primaryFolder])
  const folderActiveRef = useRef(false)
  useEffect(() => { folderActiveRef.current = folderPermState === 'granted' && !!folderName }, [folderPermState, folderName])

  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [messages, setMessages] = useState<any[]>([])
  const [isTyping, setIsTyping] = useState(false)
  const [typingStep, setTypingStep] = useState('')
  const [showUpload, setShowUpload] = useState(false)
  const [streamBuffer, setStreamBuffer] = useState('')
  const [messagePreviews, setMessagePreviews] = useState<Record<number, { fileUrl: string; page: number; filename: string }>>({})
  const [contentPreviews, setContentPreviews] = useState<Record<number, { html: string; previewType: string; filename: string }>>({})
  const [showMobilePanel, setShowMobilePanel] = useState(false)
  const [queueCount, setQueueCount] = useState(0)
  const [isSyncing, setIsSyncing] = useState(false)
  const [openFolderFiles, setOpenFolderFiles] = useState<FileInfo[]>([])
  const openFolderFilesRef = useRef<FileInfo[]>([])
  useEffect(() => { openFolderFilesRef.current = openFolderFiles }, [openFolderFiles])
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const moreMenuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!showMoreMenu) return
    const handler = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) setShowMoreMenu(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showMoreMenu])
  const tempAiIdRef = useRef<number>(0)

  // Queue refs (useRef to avoid stale closures inside async functions)
  const isProcessingRef = useRef(false)
  const queueRef = useRef<Array<{ msgId: number; content: string }>>([])
  const conversationIdRef = useRef<number | null>(null)
  const projectIdRef = useRef<string | undefined>(id)

  useEffect(() => { projectIdRef.current = id }, [id])

  const fetchProject = async () => {
    try {
      const res = await api.get(`/projects/${id}`)
      setProject(res.data)
      setMessages(res.data.messages || [])
      conversationIdRef.current = res.data.conversation_id
      return res.data
    } catch { toast.error('فشل تحميل المشروع') }
    finally { setLoading(false) }
  }

  useEffect(() => {
    let pollTimer: ReturnType<typeof setTimeout> | null = null

    const load = async () => {
      const data = await fetchProject()
      if (!data) return
      const msgs: any[] = data.messages || []
      const lastMsg = msgs[msgs.length - 1]
      if (lastMsg && lastMsg.role === 'user') {
        let attempts = 0
        const poll = async () => {
          attempts++
          if (attempts > 20) return
          try {
            const res = await api.get(`/projects/${id}`)
            const newMsgs: any[] = res.data.messages || []
            const newLast = newMsgs[newMsgs.length - 1]
            if (newLast && newLast.role === 'assistant') {
              setProject(res.data)
              setMessages(newMsgs)
              toast.success('✅ تم استلام الرد — راجع لوحة الملفات إن طلبت ملفاً', { duration: 4000 })
            } else {
              pollTimer = setTimeout(poll, 2000)
            }
          } catch {}
        }
        pollTimer = setTimeout(poll, 2000)
      }
    }

    load()
    return () => { if (pollTimer) clearTimeout(pollTimer) }
  }, [id])

  const syncFolderToProject = useCallback(async (silent = false) => {
    if (folderPermState !== 'granted' || !id) return
    setIsSyncing(true)
    const toastId = silent ? null : toast.loading('جاري مزامنة ملفات المجلد...')
    try {
      const allFiles = await listAllFilesRef.current(true)
      const SUPPORTED = new Set(['xlsx','xlsm','xls','csv','pdf','docx','doc','md','txt','json','html','htm','jpg','jpeg','png','gif','webp','bmp','tiff','tif','heic','heif'])
      const projectFileNames = new Set((project?.files || []).map((f: any) => f.original_name))
      const toUpload = allFiles.filter(f => {
        const ext = f.name.split('.').pop()?.toLowerCase() || ''
        return SUPPORTED.has(ext) && !projectFileNames.has(f.name)
      })
      if (toUpload.length === 0) {
        if (toastId) { toast.dismiss(toastId); toast('لا توجد ملفات جديدة للمزامنة', { icon: 'ℹ️' }) }
        return
      }
      let done = 0
      for (const fi of toUpload) {
        try {
          const file = await fi.fileHandle.getFile()
          await uploadChunked(file, parseInt(id), () => {})
          done++
        } catch {}
      }
      await fetchProject()
      if (toastId) { toast.dismiss(toastId); toast.success(`✅ تمت مزامنة ${done} ملف من المجلد`) }
    } catch {
      if (toastId) { toast.dismiss(toastId); toast.error('فشل مزامنة المجلد') }
    } finally {
      setIsSyncing(false)
    }
  }, [folderPermState, id, project])

  const sendMessageInternal = useCallback(async (content: string, pendingMsgId?: number) => {
    const convId = conversationIdRef.current
    if (!convId) return

    if (pendingMsgId !== undefined) {
      setMessages(prev => prev.map(m => m.id === pendingMsgId ? { ...m, pending: false } : m))
    }

    setIsTyping(true)
    setTypingStep(tr('readingFile'))
    setStreamBuffer('')

    const steps = [tr('readingFile'), tr('analyzingData'), tr('composingAnswer')]
    let stepIdx = 0
    const stepInterval = setInterval(() => {
      stepIdx = (stepIdx + 1) % steps.length
      setTypingStep(steps[stepIdx])
    }, 2000)

    const aiMsg = { id: Date.now() + 1, role: 'assistant', content: '', created_at: new Date().toISOString() }
    tempAiIdRef.current = aiMsg.id
    setMessages(prev => [...prev, aiMsg])

    const token = localStorage.getItem('token')

    // Collect linked folder file list to pass to AI context
    let folderFiles: Array<{name: string; path: string; size: number; lastModified: number}> = []
    if (folderActiveRef.current) {
      try {
        const files = await listAllFilesRef.current(true)
        folderFiles = files.map(f => ({ name: f.name, path: f.path, size: f.size, lastModified: f.lastModified }))
      } catch {}
    }

    // Read content of open folder files (no upload needed)
    let folderFileContents: Array<{name: string; path: string; content: string; truncated: boolean}> = []
    const openFiles = openFolderFilesRef.current
    if (openFiles.length > 0) {
      const results = await Promise.allSettled(
        openFiles.map(fi => readFolderFileForAI(fi.fileHandle, fi.name, fi.path))
      )
      folderFileContents = results
        .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
        .map(r => r.value)
    }

    try {
      // ── Server-side SSE stream (Gemini / OpenAI) ──
      {
        const response = await fetch(`/api/chat/${projectIdRef.current}/message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ message: content, conversationId: convId, folderFiles, folderFileContents })
        })

        if (response.status === 401) {
          localStorage.removeItem('token')
          localStorage.removeItem('user')
          navigate('/login')
          return
        }

        const reader = response.body!.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let fullText = ''
        const FILE_TAGS = ['EXCEL_FILE', 'PDF_FILE', 'HTML_FILE', 'MD_FILE', 'TXT_FILE', 'JSON_FILE', 'WORD_FILE', 'EXTRACT_PAGE', 'SHOW_PAGE', 'SHOW_CONTENT']
        const stripTags = (t: string) => {
          let out = t
          for (const tag of FILE_TAGS) {
            out = out.replace(new RegExp(`\\[${tag}\\][\\s\\S]*?\\[\\/${tag}\\]`, 'g'), '')
            out = out.replace(new RegExp(`\\[${tag}\\][\\s\\S]*$`, 'g'), '')
          }
          return out.trim()
        }

        outer: while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            try {
              const data = JSON.parse(line.slice(6))
              if (data.type === 'text') {
                fullText += data.content
                setMessages(prev => prev.map(m => m.id === aiMsg.id ? { ...m, content: stripTags(fullText) } : m))
              } else if (data.type === 'update_content') {
                fullText = data.content
                const displayContent = data.content
                  .replace(/\n@@PAGE_PREVIEW@@[\s\S]*?@@END_PREVIEW@@/g, '')
                  .replace(/\n@@CONTENT_PREVIEW@@[\s\S]*?@@END_CONTENT_PREVIEW@@/g, '')
                  .trim()
                setMessages(prev => prev.map(m => m.id === aiMsg.id ? { ...m, content: displayContent } : m))
              } else if (data.type === 'page_preview') {
                const tempId = tempAiIdRef.current
                setMessagePreviews(prev => ({ ...prev, [tempId]: { fileUrl: data.fileUrl, page: data.page, filename: data.filename } }))
              } else if (data.type === 'content_preview') {
                const tempId = tempAiIdRef.current
                setContentPreviews(prev => ({ ...prev, [tempId]: { html: data.html, previewType: data.previewType, filename: data.filename } }))
              } else if (data.type === 'drive_action_start') {
                const actionNames: Record<string, string> = {
                  listDriveFiles: 'جارٍ استعراض ملفات Drive…',
                  createDriveFolder: 'جارٍ إنشاء المجلد…',
                  renameDriveFile: 'جارٍ إعادة التسمية…',
                  deleteDriveFile: 'جارٍ الحذف…',
                  copyDriveFile: 'جارٍ النسخ…',
                  importDriveFileToProject: 'جارٍ استيراد الملف…',
                  uploadGeneratedFileToDrive: 'جارٍ الرفع إلى Drive…',
                  moveDriveFile: 'جارٍ النقل…',
                  readDriveFileContent: 'جارٍ قراءة محتوى الملف…',
                }
                setTypingStep(actionNames[data.action] || 'جارٍ تنفيذ عملية Drive…')
              } else if (data.type === 'drive_action_done') {
                setTypingStep('جاري صياغة الإجابة…')
                // Trigger Drive panel refresh via custom event
                window.dispatchEvent(new CustomEvent('drive:refresh'))
                // If file was imported, refresh project files list
                if (data.action === 'importDriveFileToProject' && data.result?.success) {
                  fetchProject()
                }
              } else if (data.type === 'drive_action_error') {
                toast.error(`خطأ Drive: ${data.error}`, { duration: 4000 })
                setTypingStep('جاري صياغة الإجابة…')
              } else if (data.type === 'github_action_start') {
                const ghActionNames: Record<string, string> = {
                  listGithubRepos: '🔍 جارٍ استعراض المستودعات…',
                  getGithubRepo: '📁 جارٍ جلب تفاصيل المستودع…',
                  listGithubFiles: '📂 جارٍ استعراض الملفات…',
                  readGithubFile: '📄 جارٍ قراءة الملف…',
                  searchGithubCode: '🔍 جارٍ البحث في الكود…',
                  createOrUpdateGithubFile: '✍️ جارٍ رفع الملف وعمل commit…',
                  createGithubRepo: '🏗️ جارٍ إنشاء المستودع…',
                  listGithubBranches: '🌿 جارٍ استعراض الفروع…',
                  createGithubBranch: '🌿 جارٍ إنشاء الفرع…',
                  listGithubCommits: '📜 جارٍ جلب Commits…',
                  deleteGithubFile: '🗑️ جارٍ حذف الملف…',
                  listGithubIssues: '🐛 جارٍ جلب Issues…',
                  createGithubIssue: '🐛 جارٍ إنشاء Issue…',
                  getGithubProfile: '👤 جارٍ جلب الملف الشخصي…',
                  forkGithubRepo: '🍴 جارٍ عمل Fork…',
                }
                setTypingStep(ghActionNames[data.action] || '⚙️ جارٍ تنفيذ عملية GitHub…')
              } else if (data.type === 'github_action_done') {
                setTypingStep('جاري صياغة الإجابة…')
              } else if (data.type === 'github_action_error') {
                toast.error(`خطأ GitHub: ${data.error}`, { duration: 4000 })
                setTypingStep('جاري صياغة الإجابة…')
              } else if (data.type === 'folder_action') {
                if (data.action === 'create_dir' && data.path) {
                  const fname = primaryFolderRef.current?.name || ''
                  const result = await createDirectoryRef.current(fname, data.path)
                  if (result === 'created') toast.success(`✅ تم إنشاء مجلد "${data.path}" في المجلد المرتبط`)
                  else if (result !== 'no_folder') toast.error(`فشل إنشاء المجلد "${data.path}"`)
                } else if (data.action === 'write_file' && data.path) {
                  const mimeMap: Record<string, string> = { txt: 'text/plain', md: 'text/markdown', html: 'text/html', json: 'application/json', csv: 'text/csv' }
                  const ext = data.path.split('.').pop()?.toLowerCase() || 'txt'
                  const mime = mimeMap[ext] || 'text/plain'
                  const fname = primaryFolderRef.current?.name || ''
                  const result = await writeFileContentRef.current(fname, data.path, data.content || '', mime)
                  if (result === 'saved') toast.success(`✅ تم كتابة "${data.path}" في المجلد المرتبط`)
                  else if (result !== 'no_folder') toast.error(`فشل كتابة الملف "${data.path}"`)
                } else if (data.action === 'write_docx' && data.path) {
                  try {
                    const blob = await generateDocxFromMarkdown(data.content || '')
                    const fname = primaryFolderRef.current?.name || ''
                    const result = await writeFileContentRef.current(fname, data.path, blob, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
                    if (result === 'saved') toast.success(`✅ تم كتابة "${data.path}" (Word) في المجلد المرتبط`)
                    else if (result !== 'no_folder') toast.error(`فشل كتابة ملف Word "${data.path}"`)
                  } catch (e: any) {
                    toast.error(`خطأ في إنشاء ملف Word: ${e?.message || 'غير معروف'}`)
                  }
                } else if (data.action === 'delete_file' && data.path) {
                  const fname = primaryFolderRef.current?.name || ''
                  const result = await deleteFileRef.current(fname, data.path)
                  if (result === 'deleted') toast.success(`🗑️ تم حذف "${data.path}" من المجلد المرتبط`)
                  else if (result !== 'no_folder') toast.error(`فشل حذف الملف "${data.path}"`)
                }
              } else if (data.type === 'done') {
                if (data.generatedFile) {
                  setProject(p => p ? { ...p, generated_files: [...p.generated_files, data.generatedFile] } : p)
                  // Auto-save to linked folder if active
                  if (folderActiveRef.current) {
                    const gf = data.generatedFile
                    const tk = localStorage.getItem('token')
                    fetch(`/api/files/generated/${gf.id}/download?token=${encodeURIComponent(tk ?? '')}`)
                      .then(r => r.ok ? r.blob() : null)
                      .then(async blob => {
                        if (!blob) return
                        const result = await saveFolderFileRef.current(gf.original_name, blob)
                        if (result === 'saved') {
                          toast.success(`✅ تم حفظ "${gf.original_name}" في المجلد المرتبط`, { duration: 4000 })
                        } else {
                          toast.success('✅ الملف جاهز للتحميل — راجع قسم "النتائج المُولَّدة" في لوحة الملفات', { duration: 5000 })
                        }
                      })
                      .catch(() => {
                        toast.success('✅ الملف جاهز للتحميل — راجع قسم "النتائج المُولَّدة" في لوحة الملفات', { duration: 5000 })
                      })
                  } else {
                    toast.success('✅ الملف جاهز للتحميل — راجع قسم "النتائج المُولَّدة" في لوحة الملفات', { duration: 5000 })
                  }
                }
                if (data.messageId) {
                  const tempId = tempAiIdRef.current
                  setMessages(prev => prev.map(m => m.id === tempId ? { ...m, id: data.messageId } : m))
                  setMessagePreviews(prev => {
                    if (prev[tempId]) {
                      const { [tempId]: preview, ...rest } = prev
                      return { ...rest, [data.messageId]: preview }
                    }
                    return prev
                  })
                  setContentPreviews(prev => {
                    if (prev[tempId]) {
                      const { [tempId]: cp, ...rest } = prev
                      return { ...rest, [data.messageId]: cp }
                    }
                    return prev
                  })
                }
              }
            } catch {}
          }
        }

      }
    } catch (err: any) {
      const errMsg = err?.message && err.message !== 'Failed to fetch'
        ? `❌ خطأ: ${err.message}`
        : 'حدث خطأ في الاتصال. يرجى المحاولة مرة أخرى.'
      setMessages(prev => prev.map(m => m.id === aiMsg.id ? { ...m, content: errMsg } : m))
    } finally {
      clearInterval(stepInterval)
      setIsTyping(false)
      setTypingStep('')

      // Process next message in queue
      if (queueRef.current.length > 0) {
        const next = queueRef.current.shift()!
        setQueueCount(queueRef.current.length)
        // Small delay so UI updates before next processing starts
        setTimeout(() => sendMessageInternal(next.content, next.msgId), 300)
      } else {
        isProcessingRef.current = false
        setQueueCount(0)
      }
    }
  }, [navigate, tr])

  const sendMessage = useCallback((content: string) => {
    const userMsgId = Date.now()
    const userMsg = { id: userMsgId, role: 'user', content, created_at: new Date().toISOString() }

    if (isProcessingRef.current) {
      // Add to queue and show as pending in chat
      setMessages(prev => [...prev, { ...userMsg, pending: true }])
      queueRef.current = [...queueRef.current, { msgId: userMsgId, content }]
      setQueueCount(queueRef.current.length)
      return
    }

    // Not processing — send immediately
    isProcessingRef.current = true
    setMessages(prev => [...prev, userMsg])
    sendMessageInternal(content)
  }, [sendMessageInternal])

  const handleFileUploaded = async (_file: any, silent = false) => {
    await fetchProject()
    if (!silent) toast.success(tr('uploadSuccess'))
  }

  const handleExport = async (format: string) => {
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`/api/chat/${id}/export?format=${format}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = format === 'txt' ? 'chat-export.txt' : 'chat-export.xlsx'
      a.click()
      URL.revokeObjectURL(url)
    } catch { toast.error('فشل التصدير') }
  }

  const handleDownloadZip = async () => {
    try {
      const token = localStorage.getItem('token')
      const toastId = toast.loading('جاري تحضير ملفات المشروع...')
      const response = await fetch(`/api/files/${id}/download-zip`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (!response.ok) throw new Error('فشل التحميل')
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${project?.name || 'project'}.zip`
      a.click()
      URL.revokeObjectURL(url)
      toast.dismiss(toastId)
      toast.success('تم تحميل ملفات المشروع')
    } catch { toast.error('فشل تحميل ملفات المشروع') }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-screen">
      <div className="animate-spin w-10 h-10 border-4 border-primary-600 border-t-transparent rounded-full" />
    </div>
  )

  if (!project) return (
    <div className="flex flex-col items-center justify-center h-screen">
      <p className="text-[var(--muted)]">المشروع غير موجود</p>
      <button onClick={() => navigate('/')} className="btn-primary mt-4">{tr('back')}</button>
    </div>
  )

  return (
    <div className="flex h-screen flex-col font-cairo">
      <header className="flex items-center gap-3 px-4 py-3 bg-[var(--surface)] border-b border-[var(--border)] shrink-0">
        <button onClick={() => navigate('/')}
          className="p-2 rounded-lg hover:bg-[var(--bg)] text-[var(--muted)] transition-colors shrink-0"
          title="العودة للمشاريع">
          <ArrowRight size={18} className={lang === 'ar' ? 'rotate-180' : ''} />
        </button>

        <div className="flex-1 min-w-0">
          <h1 className="font-bold text-[var(--text)] truncate text-sm">{project.name}</h1>
          <div className="flex items-center gap-2 mt-0.5">
            {project.files.length > 0 && (
              <span className="flex items-center gap-1 text-[11px] text-[var(--muted)] bg-[var(--bg)] px-2 py-0.5 rounded-full">
                <Files size={11} />
                {project.files.length} {project.files.length === 1 ? 'ملف' : 'ملف'}
              </span>
            )}
            {project.message_count > 0 && (
              <span className="text-[11px] text-[var(--muted)]">
                {project.message_count} رسالة
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Mobile: open file panel */}
          <button onClick={() => setShowMobilePanel(true)}
            className="md:hidden p-2 rounded-lg hover:bg-[var(--bg)] text-[var(--muted)] transition-colors" title="الملفات">
            <FolderOpen size={18} />
          </button>

          {/* Export / download menu — click controlled */}
          <div className="relative" ref={moreMenuRef}>
            <button
              onClick={() => setShowMoreMenu(p => !p)}
              className={`p-2 rounded-lg transition-colors ${showMoreMenu ? 'bg-[var(--bg)] text-[var(--text)]' : 'hover:bg-[var(--bg)] text-[var(--muted)]'}`}
              title="تصدير وتحميل">
              <MoreHorizontal size={18} />
            </button>
            {showMoreMenu && (
              <div className="absolute end-0 top-10 w-56 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-xl py-1 z-30 animate-fade-in">
                <p className="text-[10px] text-[var(--muted)] px-4 pt-1 pb-0.5 font-semibold uppercase tracking-wide">تصدير المحادثة</p>
                <button onClick={() => { handleExport('excel'); setShowMoreMenu(false) }}
                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-[var(--text)] hover:bg-[var(--bg)] transition-colors">
                  <Download size={14} /> تصدير Excel
                </button>
                <button onClick={() => { handleExport('txt'); setShowMoreMenu(false) }}
                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-[var(--text)] hover:bg-[var(--bg)] transition-colors">
                  <Download size={14} /> {tr('exportTXT')}
                </button>
                <div className="border-t border-[var(--border)] my-1" />
                <p className="text-[10px] text-[var(--muted)] px-4 pt-1 pb-0.5 font-semibold uppercase tracking-wide">الملفات</p>
                <button onClick={() => { handleDownloadZip(); setShowMoreMenu(false) }}
                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-[var(--text)] hover:bg-[var(--bg)] transition-colors">
                  <Download size={14} /> تحميل جميع الملفات (ZIP)
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-col flex-1 overflow-hidden">
          <ChatMessages
            messages={messages}
            isTyping={isTyping}
            typingStep={typingStep}
            projectId={parseInt(id!)}
            onMessageUpdated={fetchProject}
            hasFiles={project.files.length > 0}
            messagePreviews={messagePreviews}
            contentPreviews={contentPreviews}
          />
          <ChatInput
            onSend={sendMessage}
            disabled={false}
            queueCount={queueCount}
            projectId={parseInt(id!)}
            onFileUploaded={handleFileUploaded}
          />
        </div>

        <FilePanel
          files={project.files}
          generatedFiles={project.generated_files}
          folders={project.folders || []}
          projectId={project.id}
          onRefresh={fetchProject}
          onUpload={() => setShowUpload(true)}
          onBatchAnalyze={(msg) => sendMessage(msg)}
          mobileOpen={showMobilePanel}
          onMobileClose={() => setShowMobilePanel(false)}
          onSyncAll={syncFolderToProject}
          isSyncing={isSyncing}
          onFolderFilesOpen={setOpenFolderFiles}
        />
      </div>

      {showUpload && (
        <FileUploadModal
          projectId={project.id}
          onClose={() => setShowUpload(false)}
          onUploaded={handleFileUploaded}
        />
      )}
    </div>
  )
}
