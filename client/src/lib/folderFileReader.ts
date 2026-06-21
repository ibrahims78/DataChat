export interface FolderFileContent {
  name: string
  path: string
  content: string
  truncated: boolean
  error?: string
}

const MAX_CHARS = 80_000   // ~80 KB of text per file
const MAX_FILE_SIZE = 10 * 1024 * 1024  // 10 MB hard limit

export async function readFolderFileForAI(
  fileHandle: FileSystemFileHandle,
  name: string,
  path: string
): Promise<FolderFileContent> {
  const ext = name.split('.').pop()?.toLowerCase() || ''

  try {
    const file = await fileHandle.getFile()

    if (file.size > MAX_FILE_SIZE) {
      return {
        name, path,
        content: `[الملف كبير جداً (${Math.round(file.size / 1024 / 1024)} MB). يرجى استيراده للمشروع لتحليله.]`,
        truncated: false,
      }
    }

    // ── Plain text ────────────────────────────────────────────────────────────
    if (['txt', 'md', 'json', 'html', 'htm', 'csv', 'tsv', 'log', 'xml', 'yaml', 'yml', 'js', 'ts', 'py', 'sql'].includes(ext)) {
      let text = await file.text()
      const truncated = text.length > MAX_CHARS
      if (truncated) {
        text = text.slice(0, MAX_CHARS) + `\n\n[... تم اقتطاع المحتوى. الحجم الكلي: ${Math.round(file.size / 1024)} KB]`
      }
      return { name, path, content: text, truncated }
    }

    // ── Excel ─────────────────────────────────────────────────────────────────
    if (['xlsx', 'xls', 'xlsm'].includes(ext)) {
      const XLSX = await import('xlsx')
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(new Uint8Array(buf), { type: 'array' })
      let content = `[ملف Excel: ${name}]\n`
      for (const sheetName of wb.SheetNames) {
        const sheet = wb.Sheets[sheetName]
        const csv = XLSX.utils.sheet_to_csv(sheet, { RS: '\n' })
        const lines = csv.split('\n').filter(l => l.trim().replace(/,/g, ''))
        content += `\n[ورقة: ${sheetName} — ${lines.length} صف]\n${lines.join('\n')}\n`
      }
      const truncated = content.length > MAX_CHARS
      return { name, path, content: truncated ? content.slice(0, MAX_CHARS) + '\n[... محتوى مقتطع]' : content, truncated }
    }

    // ── PDF ───────────────────────────────────────────────────────────────────
    if (ext === 'pdf') {
      const pdfjsLib = await import('pdfjs-dist')
      if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url
        ).toString()
      }
      const buf = await file.arrayBuffer()
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise
      let content = `[ملف PDF: ${name} — ${pdf.numPages} صفحة]\n\n`
      const maxPages = Math.min(pdf.numPages, 30)
      for (let i = 1; i <= maxPages; i++) {
        const page = await pdf.getPage(i)
        const tc = await page.getTextContent()
        const pageText = tc.items.map((item: any) => 'str' in item ? item.str : '').join(' ').trim()
        if (pageText) content += `[صفحة ${i}]\n${pageText}\n\n`
      }
      if (pdf.numPages > maxPages) {
        content += `[${pdf.numPages - maxPages} صفحة إضافية غير مُدرجة]\n`
      }
      const truncated = content.length > MAX_CHARS
      return { name, path, content: truncated ? content.slice(0, MAX_CHARS) + '\n...' : content, truncated }
    }

    // ── Unsupported ───────────────────────────────────────────────────────────
    return {
      name, path,
      content: `[صيغة الملف ".${ext}" لا تدعم القراءة المباشرة. استورد الملف للمشروع لتحليله.]`,
      truncated: false,
    }
  } catch (e: any) {
    return { name, path, content: `[خطأ في قراءة الملف: ${e?.message || 'غير معروف'}]`, truncated: false, error: e?.message }
  }
}

export function canReadDirectly(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  return ['txt','md','json','html','htm','csv','tsv','log','xml','yaml','yml',
          'js','ts','py','sql','xlsx','xls','xlsm','pdf'].includes(ext)
}
