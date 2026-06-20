import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, X } from 'lucide-react'

interface Props {
  fileUrl: string
  page: number
  filename?: string
}

export default function PdfPageViewer({ fileUrl, page, filename }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [currentPage, setCurrentPage] = useState(page)
  const [totalPages, setTotalPages] = useState(0)
  const [scale, setScale] = useState(1.2)
  const [fullscreen, setFullscreen] = useState(false)
  const pdfRef = useRef<any>(null)
  const renderTaskRef = useRef<any>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        setLoading(true)
        setError('')
        const pdfjsLib = await import('pdfjs-dist')
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`
        const pdf = await pdfjsLib.getDocument(fileUrl).promise
        if (cancelled) return
        pdfRef.current = pdf
        setTotalPages(pdf.numPages)
        setCurrentPage(Math.min(page, pdf.numPages))
      } catch (e: any) {
        if (!cancelled) setError('تعذّر تحميل الملف')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [fileUrl])

  useEffect(() => {
    if (!pdfRef.current || !canvasRef.current) return
    let cancelled = false
    const render = async () => {
      try {
        if (renderTaskRef.current) {
          renderTaskRef.current.cancel()
          renderTaskRef.current = null
        }
        const pdfPage = await pdfRef.current.getPage(currentPage)
        if (cancelled) return
        const viewport = pdfPage.getViewport({ scale })
        const canvas = canvasRef.current!
        canvas.width = viewport.width
        canvas.height = viewport.height
        const ctx = canvas.getContext('2d')!
        const task = pdfPage.render({ canvasContext: ctx, viewport })
        renderTaskRef.current = task
        await task.promise
      } catch (e: any) {
        if (e?.name !== 'RenderingCancelledException' && !cancelled) {
          setError('تعذّر عرض الصفحة')
        }
      }
    }
    render()
    return () => { cancelled = true }
  }, [currentPage, scale, pdfRef.current])

  const goTo = (p: number) => {
    const clamped = Math.max(1, Math.min(totalPages, p))
    setCurrentPage(clamped)
  }

  return (
    <div className={`my-3 rounded-xl overflow-hidden border border-[var(--border)] bg-[var(--bg)] ${fullscreen ? 'fixed inset-4 z-50 shadow-2xl flex flex-col' : ''}`}>
      <div className="flex items-center justify-between px-3 py-2 bg-[var(--surface)] border-b border-[var(--border)]">
        <span className="text-xs font-medium text-[var(--text)] truncate max-w-[200px]">
          📄 {filename || 'معاينة PDF'}
        </span>
        <div className="flex items-center gap-1">
          <button onClick={() => setScale(s => Math.max(0.5, s - 0.2))}
            className="p-1 rounded hover:bg-[var(--bg)] text-[var(--muted)]" title="تصغير">
            <ZoomOut size={14} />
          </button>
          <span className="text-xs text-[var(--muted)] w-10 text-center">{Math.round(scale * 100)}%</span>
          <button onClick={() => setScale(s => Math.min(3, s + 0.2))}
            className="p-1 rounded hover:bg-[var(--bg)] text-[var(--muted)]" title="تكبير">
            <ZoomIn size={14} />
          </button>
          <button onClick={() => setFullscreen(f => !f)}
            className="p-1 rounded hover:bg-[var(--bg)] text-[var(--muted)] ml-1" title={fullscreen ? 'خروج' : 'ملء الشاشة'}>
            {fullscreen ? <X size={14} /> : <span className="text-xs">⛶</span>}
          </button>
        </div>
      </div>

      <div className={`overflow-auto flex justify-center bg-gray-100 dark:bg-gray-900 ${fullscreen ? 'flex-1' : 'max-h-[500px]'}`}>
        {loading && (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full" />
          </div>
        )}
        {error && (
          <div className="flex items-center justify-center h-48 text-red-500 text-sm">{error}</div>
        )}
        <canvas ref={canvasRef} className={`shadow-md ${loading ? 'hidden' : ''}`} />
      </div>

      {totalPages > 0 && (
        <div className="flex items-center justify-center gap-3 px-3 py-2 bg-[var(--surface)] border-t border-[var(--border)]">
          <button onClick={() => goTo(currentPage - 1)} disabled={currentPage <= 1}
            className="p-1 rounded hover:bg-[var(--bg)] text-[var(--muted)] disabled:opacity-30">
            <ChevronRight size={16} />
          </button>
          <span className="text-xs text-[var(--text)]">
            صفحة <strong>{currentPage}</strong> من <strong>{totalPages}</strong>
          </span>
          <button onClick={() => goTo(currentPage + 1)} disabled={currentPage >= totalPages}
            className="p-1 rounded hover:bg-[var(--bg)] text-[var(--muted)] disabled:opacity-30">
            <ChevronLeft size={16} />
          </button>
        </div>
      )}
    </div>
  )
}
