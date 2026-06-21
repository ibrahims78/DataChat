import { useEffect, useRef, useState, useCallback } from 'react'
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize2, Minimize2 } from 'lucide-react'
import FileTypeIcon from '../ui/FileTypeIcon'

interface Props {
  fileUrl: string
  page: number
  filename?: string
}

export default function PdfPageViewer({ fileUrl, page, filename }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [currentPage, setCurrentPage] = useState(page)
  const [totalPages, setTotalPages] = useState(0)
  const [scale, setScale] = useState(1.2)
  const [fullscreen, setFullscreen] = useState(false)
  const pdfRef = useRef<any>(null)
  const renderTaskRef = useRef<any>(null)
  const renderingRef = useRef(false)

  // Load PDF document
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
      } catch {
        if (!cancelled) setError('تعذّر تحميل الملف')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [fileUrl])

  // Render current page at current scale
  const renderPage = useCallback(async () => {
    if (!pdfRef.current || !canvasRef.current) return
    if (renderingRef.current) {
      if (renderTaskRef.current) {
        try { renderTaskRef.current.cancel() } catch {}
        renderTaskRef.current = null
      }
    }
    renderingRef.current = true
    try {
      const pdfPage = await pdfRef.current.getPage(currentPage)
      const viewport = pdfPage.getViewport({ scale })
      const canvas = canvasRef.current
      if (!canvas) return
      canvas.width = viewport.width
      canvas.height = viewport.height
      const ctx = canvas.getContext('2d')!
      const task = pdfPage.render({ canvasContext: ctx, viewport })
      renderTaskRef.current = task
      await task.promise
    } catch (e: any) {
      if (e?.name !== 'RenderingCancelledException') {
        setError('تعذّر عرض الصفحة')
      }
    } finally {
      renderingRef.current = false
    }
  }, [currentPage, scale])

  useEffect(() => {
    if (pdfRef.current) renderPage()
  }, [renderPage])

  // Close fullscreen on Escape key
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && fullscreen) setFullscreen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fullscreen])

  const goTo = (p: number) => setCurrentPage(Math.max(1, Math.min(totalPages, p)))
  const zoomIn  = () => setScale(s => Math.min(4, parseFloat((s + 0.25).toFixed(2))))
  const zoomOut = () => setScale(s => Math.max(0.5, parseFloat((s - 0.25).toFixed(2))))
  const resetZoom = () => setScale(1.2)

  const toolbar = (
    <div className="flex items-center justify-between px-3 py-2 bg-[var(--surface)] border-b border-[var(--border)] flex-shrink-0">
      <span className="text-xs font-medium text-[var(--text)] truncate max-w-[180px] flex items-center gap-2">
        <FileTypeIcon type="pdf" size="sm" />
        {filename || 'معاينة PDF'}
      </span>
      <div className="flex items-center gap-1">
        {/* Zoom controls */}
        <button
          onClick={zoomOut}
          disabled={scale <= 0.5}
          className="p-1.5 rounded hover:bg-[var(--bg)] text-[var(--muted)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="تصغير"
        >
          <ZoomOut size={14} />
        </button>
        <button
          onClick={resetZoom}
          className="text-xs text-[var(--muted)] w-12 text-center hover:bg-[var(--bg)] rounded py-0.5 transition-colors cursor-pointer"
          title="إعادة تعيين الحجم"
        >
          {Math.round(scale * 100)}%
        </button>
        <button
          onClick={zoomIn}
          disabled={scale >= 4}
          className="p-1.5 rounded hover:bg-[var(--bg)] text-[var(--muted)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="تكبير"
        >
          <ZoomIn size={14} />
        </button>

        {/* Divider */}
        <div className="w-px h-4 bg-[var(--border)] mx-1" />

        {/* Fullscreen toggle */}
        <button
          onClick={() => setFullscreen(f => !f)}
          className="p-1.5 rounded hover:bg-[var(--bg)] text-[var(--muted)] transition-colors"
          title={fullscreen ? 'تصغير (Esc)' : 'ملء الشاشة'}
        >
          {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </button>
      </div>
    </div>
  )

  const pagination = totalPages > 1 && (
    <div className="flex items-center justify-center gap-3 px-3 py-2 bg-[var(--surface)] border-t border-[var(--border)] flex-shrink-0">
      <button
        onClick={() => goTo(currentPage - 1)}
        disabled={currentPage <= 1}
        className="p-1 rounded hover:bg-[var(--bg)] text-[var(--muted)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        <ChevronRight size={16} />
      </button>
      <span className="text-xs text-[var(--text)]">
        صفحة <strong>{currentPage}</strong> من <strong>{totalPages}</strong>
      </span>
      <button
        onClick={() => goTo(currentPage + 1)}
        disabled={currentPage >= totalPages}
        className="p-1 rounded hover:bg-[var(--bg)] text-[var(--muted)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        <ChevronLeft size={16} />
      </button>
    </div>
  )

  const viewer = (
    <div
      ref={scrollRef}
      className={`overflow-auto flex justify-center bg-gray-100 dark:bg-gray-900 ${fullscreen ? 'flex-1' : 'max-h-[500px]'}`}
    >
      {loading && (
        <div className="flex items-center justify-center h-48 w-full">
          <div className="animate-spin w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full" />
        </div>
      )}
      {error && (
        <div className="flex items-center justify-center h-48 w-full text-red-500 text-sm">{error}</div>
      )}
      <canvas
        ref={canvasRef}
        className={`shadow-md ${loading || error ? 'hidden' : 'block'}`}
        style={{ maxWidth: fullscreen ? 'none' : '100%' }}
      />
    </div>
  )

  if (fullscreen) {
    return (
      <>
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm"
          onClick={() => setFullscreen(false)}
        />
        {/* Fullscreen panel */}
        <div className="fixed inset-4 z-50 rounded-xl overflow-hidden border border-[var(--border)] bg-[var(--bg)] shadow-2xl flex flex-col">
          {toolbar}
          {viewer}
          {pagination}
        </div>
      </>
    )
  }

  return (
    <div className="my-3 rounded-xl overflow-hidden border border-[var(--border)] bg-[var(--bg)]">
      {toolbar}
      {viewer}
      {pagination}
    </div>
  )
}
