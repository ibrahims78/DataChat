import {
  FileSpreadsheet, FileText, File, FileImage, FileCode,
  Globe, BookOpen, Braces, Paperclip, Sparkles
} from 'lucide-react'

interface Props {
  type: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  generated?: boolean
}

const typeConfig: Record<string, { icon: React.ElementType; bg: string; color: string }> = {
  excel:    { icon: FileSpreadsheet, bg: 'bg-emerald-100 dark:bg-emerald-900/40', color: 'text-emerald-600 dark:text-emerald-400' },
  csv:      { icon: FileSpreadsheet, bg: 'bg-teal-100 dark:bg-teal-900/40',     color: 'text-teal-600 dark:text-teal-400' },
  pdf:      { icon: FileText,        bg: 'bg-red-100 dark:bg-red-900/40',        color: 'text-red-600 dark:text-red-400' },
  word:     { icon: FileText,        bg: 'bg-blue-100 dark:bg-blue-900/40',      color: 'text-blue-600 dark:text-blue-400' },
  image:    { icon: FileImage,       bg: 'bg-pink-100 dark:bg-pink-900/40',      color: 'text-pink-600 dark:text-pink-400' },
  html:     { icon: Globe,           bg: 'bg-orange-100 dark:bg-orange-900/40',  color: 'text-orange-600 dark:text-orange-400' },
  markdown: { icon: BookOpen,        bg: 'bg-slate-100 dark:bg-slate-700/60',    color: 'text-slate-600 dark:text-slate-300' },
  text:     { icon: FileText,        bg: 'bg-gray-100 dark:bg-gray-700/60',      color: 'text-gray-600 dark:text-gray-300' },
  json:     { icon: Braces,          bg: 'bg-yellow-100 dark:bg-yellow-900/40',  color: 'text-yellow-600 dark:text-yellow-400' },
  default:  { icon: Paperclip,       bg: 'bg-purple-100 dark:bg-purple-900/40',  color: 'text-purple-600 dark:text-purple-400' },
}

const extToType: Record<string, string> = {
  xlsx: 'excel', xlsm: 'excel', xls: 'excel',
  csv: 'csv',
  pdf: 'pdf',
  docx: 'word', doc: 'word',
  jpg: 'image', jpeg: 'image', png: 'image', gif: 'image', webp: 'image',
  bmp: 'image', tiff: 'image', tif: 'image', heic: 'image', heif: 'image',
  html: 'html', htm: 'html',
  md: 'markdown',
  txt: 'text',
  json: 'json',
}

const sizeMap = {
  sm: { wrap: 'w-6 h-6 rounded-md', icon: 14 },
  md: { wrap: 'w-8 h-8 rounded-lg', icon: 16 },
  lg: { wrap: 'w-10 h-10 rounded-xl', icon: 20 },
  xl: { wrap: 'w-14 h-14 rounded-2xl', icon: 28 },
}

export function resolveFileType(typeOrExt: string): string {
  if (typeConfig[typeOrExt]) return typeOrExt
  return extToType[typeOrExt?.toLowerCase()] || 'default'
}

export default function FileTypeIcon({ type, size = 'md', generated = false }: Props) {
  const resolved = resolveFileType(type)
  const cfg = generated
    ? { icon: Sparkles, bg: 'bg-violet-100 dark:bg-violet-900/40', color: 'text-violet-600 dark:text-violet-400' }
    : (typeConfig[resolved] || typeConfig.default)
  const { wrap, icon: iconSize } = sizeMap[size]
  const Icon = cfg.icon

  return (
    <div className={`${wrap} ${cfg.bg} flex items-center justify-center shrink-0`}>
      <Icon size={iconSize} className={cfg.color} strokeWidth={1.8} />
    </div>
  )
}
