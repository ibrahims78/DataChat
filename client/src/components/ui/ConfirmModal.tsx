import { useTheme } from '../../contexts/ThemeContext'
import { useT } from '../../i18n/translations'

interface Props {
  open: boolean
  title: string
  description: string
  icon?: string
  danger?: boolean
  confirmLabel?: string
  onCancel: () => void
  onConfirm: () => void
}

export default function ConfirmModal({ open, title, description, icon = 'ℹ️', danger, confirmLabel, onCancel, onConfirm }: Props) {
  const { lang } = useTheme()
  const tr = useT(lang)
  if (!open) return null
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onCancel}>
      <div className="card p-6 w-full max-w-md animate-fade-in" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <span className="text-2xl">{icon}</span>
          <h2 className="font-bold text-lg text-[var(--text)]">{title}</h2>
        </div>
        <p className="text-sm text-[var(--muted)] mb-6 whitespace-pre-line">{description}</p>
        <div className="flex gap-3 justify-end">
          <button onClick={onCancel} className="btn-ghost">{tr('cancel')}</button>
          <button onClick={onConfirm} className={danger ? 'btn-danger' : 'btn-primary'}>
            {confirmLabel || tr('save')}
          </button>
        </div>
      </div>
    </div>
  )
}
