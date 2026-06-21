import { X, FolderCheck, Download, Zap, Calendar, FolderSync, Shield, HardDrive, Info } from 'lucide-react'

interface Props { onClose: () => void }

const features = [
  {
    icon: <FolderCheck size={18} className="text-green-600" />,
    bg: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
    title: 'الحفظ التلقائي',
    desc: 'كل ملف يُولّده الذكاء الاصطناعي (Excel، PDF، CSV…) يُحفظ تلقائياً في المجلد المرتبط بمجرد اكتمال التحليل، دون أي تدخل يدوي.',
    example: null,
  },
  {
    icon: <Download size={18} className="text-blue-600" />,
    bg: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
    title: 'الاستيراد المباشر',
    desc: 'تصفّح الملفات الموجودة على جهازك مباشرةً وارفعها إلى المشروع بنقرة — دون سحب وإفلات يدوي.',
    example: 'مثال: ربط مجلد "التقارير الشهرية" واستيراد ملفات يناير مباشرةً',
  },
  {
    icon: <Zap size={18} className="text-purple-600" />,
    bg: 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800',
    title: 'المعالجة الدفعية',
    desc: 'اختر عدة ملفات واضغط "استيراد وتحليل" — يُرفع جميعها ثم يُرسل طلب التحليل تلقائياً إلى الذكاء الاصطناعي في رسالة واحدة.',
    example: 'مثال: استيراد 12 تقرير شهري وتحليلها دفعةً واحدة للحصول على تقرير سنوي',
  },
  {
    icon: <Calendar size={18} className="text-amber-600" />,
    bg: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800',
    title: 'الحفظ المؤرَّخ (مجلدات فرعية)',
    desc: 'خيار اختياري: ينشئ التطبيق مجلداً فرعياً بتاريخ اليوم داخل المجلد المرتبط لتنظيم المخرجات تلقائياً.',
    example: 'مثال: Documents/2025-06-21/تقرير_المبيعات.xlsx',
  },
  {
    icon: <FolderSync size={18} className="text-indigo-600" />,
    bg: 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800',
    title: 'مجلدات متعددة في المشروع الواحد',
    desc: 'يمكنك ربط أكثر من مجلد في نفس الوقت. مثلاً: مجلد للمدخلات (Input) ومجلد منفصل للمخرجات (Output).',
    example: 'مثال: "بيانات_خام" للاستيراد + "نتائج_التحليل" للحفظ التلقائي',
  },
]

const howTo = [
  { step: '١', text: 'اضغط "ربط" في قسم المجلدات المرتبطة' },
  { step: '٢', text: 'اختر المجلد المطلوب من جهازك' },
  { step: '٣', text: 'سيطلب المتصفح إذن الوصول — اضغط "السماح"' },
  { step: '٤', text: 'استمتع بالحفظ التلقائي والاستيراد المباشر' },
]

const notes = [
  { icon: <Shield size={13} className="text-blue-500" />, text: 'الإذن مقيّد بالمجلد المختار فقط — لا يرى التطبيق ملفات خارجه.' },
  { icon: <HardDrive size={13} className="text-green-500" />, text: 'الإذن مؤقت لجلسة المتصفح. عند إعادة الفتح تحتاج لمنحه مرة أخرى.' },
  { icon: <Info size={13} className="text-amber-500" />, text: 'هذه الميزة تعمل على Chrome وEdge فقط. Firefox غير مدعوم حالياً.' },
]

export default function FolderCapabilitiesModal({ onClose }: Props) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col animate-fade-in"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center">
              <FolderSync size={16} className="text-primary-600" />
            </div>
            <div>
              <h2 className="font-bold text-[var(--text)] text-sm leading-none">دليل المجلدات المرتبطة</h2>
              <p className="text-[11px] text-[var(--muted)] mt-0.5">كل ما يمكنك فعله بمجلد محلي</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--bg)] text-[var(--muted)] transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Features */}
          <div className="space-y-3">
            {features.map((f, i) => (
              <div key={i} className={`rounded-xl border p-3.5 ${f.bg}`}>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-white/60 dark:bg-black/20 flex items-center justify-center shrink-0 mt-0.5">
                    {f.icon}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-[var(--text)] mb-1">{f.title}</p>
                    <p className="text-xs text-[var(--muted)] leading-relaxed">{f.desc}</p>
                    {f.example && (
                      <p className="text-[11px] text-[var(--muted)] opacity-80 mt-1.5 font-mono bg-black/5 dark:bg-white/5 rounded px-2 py-1">
                        {f.example}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* How to grant permission */}
          <div>
            <h3 className="text-xs font-bold text-[var(--text)] mb-2 flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center text-[9px] font-bold text-primary-600">?</span>
              كيف تمنح التطبيق صلاحية على مجلد؟
            </h3>
            <div className="space-y-1.5">
              {howTo.map(s => (
                <div key={s.step} className="flex items-center gap-3 px-3 py-2 rounded-xl bg-[var(--bg)] border border-[var(--border)]">
                  <span className="w-6 h-6 rounded-full bg-primary-500 text-white text-xs font-bold flex items-center justify-center shrink-0">
                    {s.step}
                  </span>
                  <span className="text-xs text-[var(--text)]">{s.text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3 space-y-2">
            <p className="text-[11px] font-bold text-[var(--muted)] uppercase tracking-wide">ملاحظات هامة</p>
            {notes.map((n, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="shrink-0 mt-0.5">{n.icon}</span>
                <p className="text-xs text-[var(--muted)] leading-relaxed">{n.text}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[var(--border)]">
          <button onClick={onClose} className="w-full btn-primary py-2.5 text-sm rounded-xl">
            فهمت، شكراً
          </button>
        </div>
      </div>
    </div>
  )
}
