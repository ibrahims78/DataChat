import {
  Document, Paragraph, TextRun, HeadingLevel, Packer,
  AlignmentType, Table, TableRow, TableCell, WidthType,
  BorderStyle
} from 'docx'

// ── Inline markdown parser ─────────────────────────────────────────────────────
function parseInline(text: string): TextRun[] {
  const runs: TextRun[] = []
  // Match bold+italic, bold, italic, strikethrough, code, plain
  const re = /\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*|___(.+?)___|\*\*_(.+?)_\*\*|__(.+?)__|_(.+?)_|~~(.+?)~~|`(.+?)`|([^*_~`]+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (!m[0]) break
    if (m[1])  runs.push(new TextRun({ text: m[1],  bold: true,   italics: true  }))
    else if (m[2])  runs.push(new TextRun({ text: m[2],  bold: true  }))
    else if (m[3])  runs.push(new TextRun({ text: m[3],  italics: true }))
    else if (m[4])  runs.push(new TextRun({ text: m[4],  bold: true,   italics: true }))
    else if (m[5])  runs.push(new TextRun({ text: m[5],  bold: true,   italics: true }))
    else if (m[6])  runs.push(new TextRun({ text: m[6],  bold: true  }))
    else if (m[7])  runs.push(new TextRun({ text: m[7],  italics: true }))
    else if (m[8])  runs.push(new TextRun({ text: m[8],  strike: true }))
    else if (m[9])  runs.push(new TextRun({ text: m[9],  font: 'Courier New', size: 18 }))
    else if (m[10]) runs.push(new TextRun({ text: m[10] }))
  }
  return runs.length > 0 ? runs : [new TextRun({ text })]
}

// ── Table parser ────────────────────────────────────────────────────────────────
function parseTable(lines: string[]): Table {
  const rows: TableRow[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^[\s|:-]+$/.test(line.replace(/\|/g, ''))) continue  // separator row
    const cells = line.split('|').filter((_, idx, arr) => idx > 0 && idx < arr.length - 1)
    rows.push(new TableRow({
      children: cells.map(cell => new TableCell({
        children: [new Paragraph({ children: parseInline(cell.trim()) })],
        width: { size: Math.floor(9000 / cells.length), type: WidthType.DXA },
      }))
    }))
  }
  return new Table({
    width: { size: 9000, type: WidthType.DXA },
    rows,
    borders: {
      top:    { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
      left:   { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
      right:  { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
      insideH:{ style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
      insideV:{ style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
    }
  })
}

// ── Main converter ─────────────────────────────────────────────────────────────
export async function generateDocxFromMarkdown(markdown: string): Promise<Blob> {
  const lines = markdown.split('\n')
  const elements: (Paragraph | Table)[] = []

  let i = 0
  while (i < lines.length) {
    const line = lines[i]

    // Table detection
    if (line.includes('|') && i + 1 < lines.length && /[|:-]/.test(lines[i + 1])) {
      const tableLines: string[] = [line]
      let j = i + 1
      while (j < lines.length && lines[j].includes('|')) {
        tableLines.push(lines[j++])
      }
      elements.push(parseTable(tableLines))
      elements.push(new Paragraph({ text: '' }))
      i = j
      continue
    }

    // Headings
    if (/^# /.test(line)) {
      elements.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: parseInline(line.slice(2).trim()) }))
    } else if (/^## /.test(line)) {
      elements.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: parseInline(line.slice(3).trim()) }))
    } else if (/^### /.test(line)) {
      elements.push(new Paragraph({ heading: HeadingLevel.HEADING_3, children: parseInline(line.slice(4).trim()) }))
    } else if (/^#### /.test(line)) {
      elements.push(new Paragraph({ heading: HeadingLevel.HEADING_4, children: parseInline(line.slice(5).trim()) }))

    // Unordered list (up to 3 levels)
    } else if (/^    [-*+] /.test(line)) {
      elements.push(new Paragraph({ bullet: { level: 2 }, children: parseInline(line.replace(/^    [-*+] /, '')) }))
    } else if (/^  [-*+] /.test(line)) {
      elements.push(new Paragraph({ bullet: { level: 1 }, children: parseInline(line.replace(/^  [-*+] /, '')) }))
    } else if (/^[-*+] /.test(line)) {
      elements.push(new Paragraph({ bullet: { level: 0 }, children: parseInline(line.slice(2)) }))

    // Ordered list
    } else if (/^\d+\. /.test(line)) {
      const text = line.replace(/^\d+\. /, '')
      elements.push(new Paragraph({ numbering: { reference: 'num1', level: 0 }, children: parseInline(text) }))

    // Blockquote
    } else if (/^> /.test(line)) {
      elements.push(new Paragraph({
        children: [new TextRun({ text: line.slice(2), italics: true, color: '555555' })],
        indent: { left: 720 },
      }))

    // Code block (fenced)
    } else if (line.startsWith('```')) {
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i++])
      }
      for (const cl of codeLines) {
        elements.push(new Paragraph({
          children: [new TextRun({ text: cl, font: 'Courier New', size: 18, color: '333333' })],
          indent: { left: 360 },
        }))
      }
    // Horizontal rule → empty paragraph with border
    } else if (/^---+$/.test(line.trim()) || /^\*\*\*+$/.test(line.trim())) {
      elements.push(new Paragraph({
        text: '',
        border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC' } },
        spacing: { after: 240 },
      }))

    // Empty line
    } else if (line.trim() === '') {
      elements.push(new Paragraph({ text: '', spacing: { after: 120 } }))

    // Normal paragraph
    } else {
      elements.push(new Paragraph({ children: parseInline(line) }))
    }

    i++
  }

  const doc = new Document({
    numbering: {
      config: [{
        reference: 'num1',
        levels: [{
          level: 0, format: 'decimal', text: '%1.',
          alignment: AlignmentType.START,
          style: { paragraph: { indent: { left: 720, hanging: 260 } } }
        }]
      }]
    },
    sections: [{ properties: {}, children: elements }]
  })

  return Packer.toBlob(doc)
}
