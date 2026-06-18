import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowRight, Upload, MoreHorizontal, Download, Share2 } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useT } from '../i18n/translations'
import api from '../lib/api'
import toast from 'react-hot-toast'
import FilePanel from '../components/files/FilePanel'
import ChatMessages from '../components/chat/ChatMessages'
import ChatInput from '../components/chat/ChatInput'
import FileUploadModal from '../components/files/FileUploadModal'

interface Project {
  id: number; name: string; user_id: number
  files: any[]; messages: any[]; generated_files: any[]
  conversation_id: number; file_count: number; message_count: number
}

export default function ProjectPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { lang } = useTheme()
  const tr = useT(lang)

  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [messages, setMessages] = useState<any[]>([])
  const [isTyping, setIsTyping] = useState(false)
  const [typingStep, setTypingStep] = useState('')
  const [showUpload, setShowUpload] = useState(false)
  const [streamBuffer, setStreamBuffer] = useState('')

  const fetchProject = async () => {
    try {
      const res = await api.get(`/projects/${id}`)
      setProject(res.data)
      setMessages(res.data.messages || [])
    } catch { toast.error('فشل تحميل المشروع') }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchProject() }, [id])

  const sendMessage = async (content: string) => {
    if (!project?.conversation_id) return
    const userMsg = { id: Date.now(), role: 'user', content, created_at: new Date().toISOString() }
    setMessages(prev => [...prev, userMsg])
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
    setMessages(prev => [...prev, aiMsg])

    try {
      const response = await fetch(`/api/chat/${id}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ message: content, conversationId: project.conversation_id })
      })

      const reader = response.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let fullText = ''

      while (true) {
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
              setMessages(prev => prev.map(m => m.id === aiMsg.id ? { ...m, content: fullText } : m))
            } else if (data.type === 'update_content') {
              // Replace displayed text with clean version (tags stripped)
              fullText = data.content
              setMessages(prev => prev.map(m => m.id === aiMsg.id ? { ...m, content: fullText } : m))
            } else if (data.type === 'done') {
              if (data.generatedFile) {
                setProject(p => p ? { ...p, generated_files: [...p.generated_files, data.generatedFile] } : p)
                toast.success('تم إنشاء الملف بنجاح! 📁')
              }
              if (data.messageId) {
                setMessages(prev => prev.map(m => m.id === aiMsg.id ? { ...m, id: data.messageId } : m))
              }
            }
          } catch {}
        }
      }
    } catch (err: any) {
      setMessages(prev => prev.map(m => m.id === aiMsg.id ? { ...m, content: 'حدث خطأ في الاتصال. يرجى المحاولة مرة أخرى.' } : m))
    } finally {
      clearInterval(stepInterval)
      setIsTyping(false)
      setTypingStep('')
    }
  }

  const handleFileUploaded = (file: any) => {
    setProject(p => p ? { ...p, files: [...p.files, file] } : p)
    toast.success(tr('uploadSuccess'))
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
      a.download = format === 'pdf' ? 'chat-export.pdf' : 'chat-export.txt'
      a.click()
    } catch { toast.error('فشل التصدير') }
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
        <button onClick={() => navigate('/')} className="p-2 rounded-lg hover:bg-[var(--bg)] text-[var(--muted)] transition-colors">
          <ArrowRight size={18} className={lang === 'ar' ? 'rotate-180' : ''} />
        </button>

        <div className="flex-1 min-w-0">
          <h1 className="font-bold text-[var(--text)] truncate">{project.name}</h1>
          <div className="flex items-center gap-3 text-xs text-[var(--muted)]">
            {project.files.slice(0, 3).map((f, i) => (
              <span key={i} className="flex items-center gap-1">
                <span>{f.file_type === 'excel' ? '📊' : f.file_type === 'csv' ? '📋' : f.file_type === 'pdf' ? '📄' : '📝'}</span>
                <span className="truncate max-w-24">{f.original_name}</span>
              </span>
            ))}
            {project.files.length > 3 && <span>+{project.files.length - 3}</span>}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => setShowUpload(true)}
            className="flex items-center gap-2 btn-ghost text-sm px-3 py-2">
            <Upload size={16} />
            <span className="hidden sm:inline">{tr('uploadFile')}</span>
          </button>
          <div className="relative group">
            <button className="p-2 rounded-lg hover:bg-[var(--bg)] text-[var(--muted)] transition-colors">
              <MoreHorizontal size={18} />
            </button>
            <div className="absolute end-0 top-10 w-48 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-lg py-1 z-20 hidden group-hover:block">
              <button onClick={() => handleExport('pdf')} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-[var(--text)] hover:bg-[var(--bg)]">
                <Download size={14} /> {tr('exportPDF')}
              </button>
              <button onClick={() => handleExport('txt')} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-[var(--text)] hover:bg-[var(--bg)]">
                <Download size={14} /> {tr('exportTXT')}
              </button>
            </div>
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
          />
          <ChatInput
            onSend={sendMessage}
            disabled={isTyping}
            projectId={parseInt(id!)}
            onFileUploaded={handleFileUploaded}
          />
        </div>

        <FilePanel
          files={project.files}
          generatedFiles={project.generated_files}
          projectId={project.id}
          onFileDeleted={fetchProject}
          onUpload={() => setShowUpload(true)}
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
