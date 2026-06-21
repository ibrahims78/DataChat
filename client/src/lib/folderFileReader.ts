export interface FolderFileContent {
  name: string
  path: string
  content: string
  truncated: boolean
  error?: string
  // For images sent as Gemini inline_data:
  isImage?: boolean
  mimeType?: string
  base64?: string
}

const MAX_CHARS = 120_000   // ~120 KB of text per file
const MAX_FILE_SIZE = 50 * 1024 * 1024  // 50 MB hard limit
const MAX_IMAGE_SIZE = 20 * 1024 * 1024 // 20 MB for images

const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp']
const IMAGE_MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg',
  png: 'image/png', gif: 'image/gif', webp: 'image/webp'
}

export async function readFolderFileForAI(
  fileHandle: FileSystemFileHandle,
  name: string,
  path: string
): Promise<FolderFileContent> {
  const ext = name.split('.').pop()?.toLowerCase() || ''

  try {
    const file = await fileHandle.getFile()

    // ── Images — pass as base64 inline_data for Gemini multimodal ─────────────
    if (IMAGE_EXTS.includes(ext)) {
      if (file.size > MAX_IMAGE_SIZE) {
        return {
          name, path, content: `[الصورة كبيرة جداً (${Math.round(file.size / 1024 / 1024)} MB). الحد: 20 MB]`,
          truncated: false
        }
      }
      const buf = await file.arrayBuffer()
      const bytes = new Uint8Array(buf)
      let binary = ''
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
      const base64 = btoa(binary)
      const mimeType = IMAGE_MIME[ext] || 'image/jpeg'
      return {
        name, path,
        content: `[صورة: ${name} — ${Math.round(file.size / 1024)} KB — مرسلة كبيانات مرئية للذكاء الاصطناعي]`,
        truncated: false,
        isImage: true, mimeType, base64
      }
    }

    if (file.size > MAX_FILE_SIZE) {
      return {
        name, path,
        content: `[الملف كبير جداً (${Math.round(file.size / 1024 / 1024)} MB). الحد: 50 MB]`,
        truncated: false,
      }
    }

    // ── Plain text ─────────────────────────────────────────────────────────────
    if (['txt', 'md', 'json', 'html', 'htm', 'csv', 'tsv', 'log', 'xml',
         'yaml', 'yml', 'js', 'ts', 'tsx', 'jsx', 'py', 'sql', 'sh', 'css'].includes(ext)) {
      let text = await file.text()
      const truncated = text.length > MAX_CHARS
      if (truncated) {
        const head = text.slice(0, MAX_CHARS * 0.85)
        const tail = text.slice(-Math.floor(MAX_CHARS * 0.1))
        text = head + `\n\n[... محتوى محذوف (${Math.round((text.length - MAX_CHARS) / 1024)} KB) ...]\n\n` + tail
      }
      return { name, path, content: text, truncated }
    }

    // ── DOCX / DOC ─────────────────────────────────────────────────────────────
    if (['docx', 'doc'].includes(ext)) {
      const mammoth = await import('mammoth')
      const buf = await file.arrayBuffer()
      let result: { value: string; messages: any[] }
      try {
        result = await mammoth.extractRawText({ arrayBuffer: buf })
      } catch {
        // fallback: try HTML extraction for richer content
        const htmlResult = await mammoth.convertToHtml({ arrayBuffer: buf })
        result = { value: htmlResult.value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '), messages: [] }
      }
      let text = `[ملف Word: ${name} — ${Math.round(file.size / 1024)} KB]\n\n${result.value}`
      const truncated = text.length > MAX_CHARS
      if (truncated) {
        const head = text.slice(0, MAX_CHARS * 0.85)
        const tail = text.slice(-Math.floor(MAX_CHARS * 0.1))
        text = head + `\n\n[... محتوى محذوف ...]\n\n` + tail
      }
      return { name, path, content: text, truncated }
    }

    // ── Excel — smart sampling ─────────────────────────────────────────────────
    if (['xlsx', 'xls', 'xlsm', 'ods'].includes(ext)) {
      const XLSX = await import('xlsx')
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(new Uint8Array(buf), { type: 'array' })
      const MAX_ROWS_PER_SHEET = 1000
      let content = `[ملف Excel: ${name} — ${wb.SheetNames.length} ورقة]\n`

      for (const sheetName of wb.SheetNames) {
        const sheet = wb.Sheets[sheetName]
        const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1')
        const totalRows = range.e.r + 1
        const totalCols = range.e.c + 1

        content += `\n═══ [ورقة: "${sheetName}" — ${totalRows} صف × ${totalCols} عمود] ═══\n`

        if (totalRows > MAX_ROWS_PER_SHEET) {
          // Emit header + first rows + last rows
          const headerSheet = XLSX.utils.sheet_new()
          const sampleRange = { ...range, e: { ...range.e, r: Math.min(MAX_ROWS_PER_SHEET - 1, range.e.r) } }
          const headRows = XLSX.utils.sheet_to_json(sheet, { header: 1, range: 0 }) as any[][]
          const sampleRows = headRows.slice(0, MAX_ROWS_PER_SHEET)
          const csv = sampleRows.map(row => row.join('\t')).join('\n')
          const omitted = totalRows - MAX_ROWS_PER_SHEET
          content += csv + `\n\n⚠️ [${omitted} صف محذوف من العرض — الملف يحتوي ${totalRows} صف إجمالاً]\n`
        } else {
          const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][]
          content += rows.map(row => row.join('\t')).join('\n') + '\n'
        }
      }

      const truncated = content.length > MAX_CHARS
      return {
        name, path,
        content: truncated ? content.slice(0, MAX_CHARS) + '\n\n[... محتوى مقتطع]' : content,
        truncated
      }
    }

    // ── PDF — smart chunking ───────────────────────────────────────────────────
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
      const total = pdf.numPages
      const MAX_HEAD_PAGES = 45
      const MAX_TAIL_PAGES = 5

      let content = `[ملف PDF: ${name} — ${total} صفحة — ${Math.round(file.size / 1024)} KB]\n\n`

      const readPage = async (i: number) => {
        const page = await pdf.getPage(i)
        const tc = await page.getTextContent()
        return tc.items.map((item: any) => 'str' in item ? item.str : '').join(' ').trim()
      }

      // Head pages
      const headCount = Math.min(total, MAX_HEAD_PAGES)
      for (let i = 1; i <= headCount; i++) {
        const text = await readPage(i)
        if (text) content += `[صفحة ${i}]\n${text}\n\n`
      }

      // Tail pages (if doc is long)
      if (total > MAX_HEAD_PAGES + MAX_TAIL_PAGES) {
        const omitted = total - MAX_HEAD_PAGES - MAX_TAIL_PAGES
        content += `\n[... ${omitted} صفحة محذوفة ...]\n\n`
        for (let i = total - MAX_TAIL_PAGES + 1; i <= total; i++) {
          const text = await readPage(i)
          if (text) content += `[صفحة ${i}]\n${text}\n\n`
        }
      }

      const truncated = content.length > MAX_CHARS
      return {
        name, path,
        content: truncated ? content.slice(0, MAX_CHARS) + '\n...' : content,
        truncated
      }
    }

    // ── Unsupported ────────────────────────────────────────────────────────────
    return {
      name, path,
      content: `[صيغة ".${ext}" غير مدعومة للقراءة المباشرة. استورد الملف للمشروع لتحليله.]`,
      truncated: false,
    }
  } catch (e: any) {
    return {
      name, path,
      content: `[خطأ في قراءة الملف: ${e?.message || 'غير معروف'}]`,
      truncated: false, error: e?.message
    }
  }
}

export function canReadDirectly(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  return [
    'txt', 'md', 'json', 'html', 'htm', 'csv', 'tsv', 'log', 'xml',
    'yaml', 'yml', 'js', 'ts', 'tsx', 'jsx', 'py', 'sql', 'sh', 'css',
    'xlsx', 'xls', 'xlsm', 'ods',
    'pdf',
    'docx', 'doc',
    'jpg', 'jpeg', 'png', 'gif', 'webp'
  ].includes(ext)
}
