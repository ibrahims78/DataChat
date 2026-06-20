import { useEffect, useRef, useState } from 'react'
import { Copy, Check, ThumbsUp, ThumbsDown, Edit2, Bot } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useTheme } from '../../contexts/ThemeContext'
import { useT } from '../../i18n/translations'
import { format } from 'date-fns'
import { ar } from 'date-fns/locale'
import api from '../../lib/api'
import toast from 'react-hot-toast'
import PdfPageViewer from './PdfPageViewer'
import ContentPreview from './ContentPreview'

interface Message { id: number; role: string; content: string; created_at: string; rating?: number }
interface PagePreview { fileUrl: string; page: number; filename: string }
interface ContentPreviewData { html: string; previewType: string; filename: string }

interface Props {
  messages: Message[]
  isTyping: boolean
  typingStep: string
  projectId: number
  onMessageUpdated: () => void
  hasFiles: boolean
  messagePreviews?: Record<number, PagePreview>
  contentPreviews?: Record<number, ContentPreviewData>
}

function parsePagePreview(content: string): { preview: PagePreview | null; cleanContent: string } {
  const match = content.match(/\n@@PAGE_PREVIEW@@([\s\S]*?)@@END_PREVIEW@@/)
  if (!match) return { preview: null, cleanContent: content }
  try {
    const preview = JSON.parse(match[1])
    const cleanContent = content.replace(/\n@@PAGE_PREVIEW@@[\s\S]*?@@END_PREVIEW@@/g, '').trim()
    return { preview, cleanContent }
  } catch {
    return { preview: null, cleanContent: content }
  }
}

function parseContentPreview(content: string): { cp: ContentPreviewData | null; cleanContent: string } {
  const match = content.match(/\n@@CONTENT_PREVIEW@@([\s\S]*?)@@END_CONTENT_PREVIEW@@/)
  if (!match) return { cp: null, cleanContent: content }
  try {
    const cp = JSON.parse(match[1])
    const cleanContent = content.replace(/\n@@CONTENT_PREVIEW@@[\s\S]*?@@END_CONTENT_PREVIEW@@/g, '').trim()
    return { cp, cleanContent }
  } catch {
    return { cp: null, cleanContent: content }
  }
}

export default function ChatMessages({ messages, isTyping, typingStep, projectId, onMessageUpdated, hasFiles, messagePreviews = {}, contentPreviews = {} }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const { lang } = useTheme()
  const tr = useT(lang)
  const [copied, setCopied] = useState<number | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editContent, setEditContent] = useState('')
  const [ratingComment, setRatingComment] = useState<{ id: number; val: number } | null>(null)
  const [commentText, setCommentText] = useState('')

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, isTyping])

  const copyText = (id: number, text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
    toast.success(tr('copied'))
  }

  const rate = async (id: number, val: number) => {
    if (ratingComment?.id === id) {
      await api.patch(`/chat/messages/${id}/rating`, { rating: ratingComment.val, comment: commentText })
      setRatingComment(null); setCommentText('')
      toast.success('شكراً على تقييمك!')
    } else {
      setRatingComment({ id, val })
    }
  }

  const saveEdit = async (id: number) => {
    await api.patch(`/chat/messages/${id}`, { content: editContent })
    setEditingId(null)
    onMessageUpdated()
  }

  if (messages.length === 0 && !isTyping) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center mb-4">
          <Bot size={32} className="text-primary-600" />
        </div>
        <h2 className="text-lg font-bold text-[var(--text)] mb-2">
          {hasFiles ? tr('chatReady') : tr('welcomeTitle')}
        </h2>
        <p className="text-[var(--muted)] text-sm mb-4">
          {hasFiles ? tr('exampleQuestions') : tr('welcomeDesc')}
        </p>
        {!hasFiles && <p className="text-xs text-[var(--muted)]">{tr('supportedFiles')}</p>}
        {hasFiles && (
          <div className="space-y-2 text-sm">
            {['ما مجموع المبيعات الكلي؟', 'اعرض لي أعلى 5 قيم', 'أنشئ ملف Excel بالملخص'].map((q, i) => (
              <div key={i} className="px-4 py-2 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 rounded-xl text-xs">{q}</div>
            ))}
          </div>
        )}
      </div>
    )
  }

  let lastDate = ''

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
      {messages.map((msg) => {
        const msgDate = format(new Date(msg.created_at), 'yyyy-MM-dd')
        const showDateSep = msgDate !== lastDate
        lastDate = msgDate

        return (
          <div key={msg.id} className="animate-slide-in-up">
            {showDateSep && (
              <div className="flex items-center gap-3 my-3">
                <div className="flex-1 h-px bg-[var(--border)]" />
                <span className="text-xs text-[var(--muted)] px-2">
                  {format(new Date(msg.created_at), 'EEEE, d MMMM', { locale: lang === 'ar' ? ar : undefined })}
                </span>
                <div className="flex-1 h-px bg-[var(--border)]" />
              </div>
            )}

            {msg.role === 'user' ? (
              <div className="flex justify-end gap-2 group">
                <div className="max-w-[75%]">
                  {editingId === msg.id ? (
                    <div className="space-y-2">
                      <textarea className="input-field text-sm w-full" value={editContent} onChange={e => setEditContent(e.target.value)} rows={3} />
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => setEditingId(null)} className="btn-ghost text-xs px-2 py-1">{tr('cancel')}</button>
                        <button onClick={() => saveEdit(msg.id)} className="btn-primary text-xs px-3 py-1">{tr('save')}</button>
                      </div>
                    </div>
                  ) : (
                    <div className="chat-bubble-user">
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                      <p className="text-xs text-white/70 mt-1 text-start">
                        {format(new Date(msg.created_at), 'HH:mm')}
                      </p>
                    </div>
                  )}
                </div>
                <button onClick={() => { setEditingId(msg.id); setEditContent(msg.content) }}
                  className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-[var(--bg)] text-[var(--muted)] transition-all self-start mt-1">
                  <Edit2 size={14} />
                </button>
              </div>
            ) : (
              <div className="flex gap-3 group">
                <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center shrink-0 mt-1">
                  <Bot size={16} className="text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  {(() => {
                    const sessionPreview = messagePreviews[msg.id]
                    const { preview: storedPreview, cleanContent: cleanAfterPage } = parsePagePreview(msg.content)
                    const preview = sessionPreview || storedPreview
                    const sessionCp = contentPreviews[msg.id]
                    const { cp: storedCp, cleanContent } = parseContentPreview(cleanAfterPage)
                    const cp = sessionCp || storedCp
                    // Always use fully-cleaned content — avoids showing raw markers when DB messages reload
                    const displayContent = cleanContent
                    return (
                  <div className="chat-bubble-ai">
                    <div className="prose prose-sm max-w-none dark:prose-invert text-[var(--text)] text-sm">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{displayContent}</ReactMarkdown>
                    </div>
                    {preview && (
                      <PdfPageViewer
                        fileUrl={preview.fileUrl}
                        page={preview.page}
                        filename={preview.filename}
                      />
                    )}
                    {cp && (
                      <ContentPreview
                        html={cp.html}
                        previewType={cp.previewType}
                        filename={cp.filename}
                      />
                    )}
                    <p className="text-xs text-[var(--muted)] mt-2">
                      {format(new Date(msg.created_at), 'HH:mm')}
                    </p>
                  </div>
                    )
                  })()}

                  <div className="flex items-center gap-2 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => copyText(msg.id, msg.content)}
                      className="p-1.5 rounded-lg hover:bg-[var(--bg)] text-[var(--muted)] transition-colors">
                      {copied === msg.id ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                    </button>
                    <button onClick={() => rate(msg.id, 1)}
                      className={`p-1.5 rounded-lg hover:bg-[var(--bg)] transition-colors ${msg.rating === 1 ? 'text-green-500' : 'text-[var(--muted)]'}`}>
                      <ThumbsUp size={14} />
                    </button>
                    <button onClick={() => rate(msg.id, -1)}
                      className={`p-1.5 rounded-lg hover:bg-[var(--bg)] transition-colors ${msg.rating === -1 ? 'text-red-500' : 'text-[var(--muted)]'}`}>
                      <ThumbsDown size={14} />
                    </button>
                  </div>

                  {ratingComment?.id === msg.id && (
                    <div className="mt-2 flex gap-2 animate-fade-in">
                      <input className="input-field text-sm flex-1" placeholder="أضف تعليقاً (اختياري)" value={commentText} onChange={e => setCommentText(e.target.value)} />
                      <button onClick={() => rate(msg.id, ratingComment.val)} className="btn-primary text-sm px-3">إرسال</button>
                      <button onClick={() => setRatingComment(null)} className="btn-ghost text-sm px-3">{tr('cancel')}</button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )
      })}

      {isTyping && (
        <div className="flex gap-3 animate-fade-in">
          <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center shrink-0">
            <Bot size={16} className="text-white" />
          </div>
          <div className="chat-bubble-ai flex items-center gap-2">
            <div className="flex gap-1">
              {[0,1,2].map(i => (
                <div key={i} className="w-2 h-2 rounded-full bg-primary-400 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
            <span className="text-xs text-[var(--muted)]">{typingStep}</span>
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  )
}
