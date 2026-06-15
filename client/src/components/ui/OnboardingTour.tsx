import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'
import { useT } from '../../i18n/translations'
import api from '../../lib/api'

const steps = [
  { icon: '🗂️', titleKey: 'onboardingStep1Title', descKey: 'onboardingStep1Desc' },
  { icon: '💬', titleKey: 'onboardingStep2Title', descKey: 'onboardingStep2Desc' },
  { icon: '📊', titleKey: 'onboardingStep3Title', descKey: 'onboardingStep3Desc' },
  { icon: '📁', titleKey: 'onboardingStep4Title', descKey: 'onboardingStep4Desc' },
]

export default function OnboardingTour() {
  const [show, setShow] = useState(false)
  const [step, setStep] = useState(0)
  const { user } = useAuth()
  const { lang } = useTheme()
  const tr = useT(lang)

  useEffect(() => {
    if (user && !user.onboarding_done && user.role === 'employee') setShow(true)
  }, [user])

  const finish = async () => {
    setShow(false)
    try { await api.post('/auth/complete-onboarding') } catch {}
  }

  if (!show) return null
  const s = steps[step]

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="card p-8 w-full max-w-sm text-center animate-fade-in">
        <p className="text-sm text-[var(--muted)] mb-4">{tr('step')} {step + 1} {tr('of')} {steps.length}</p>
        <div className="flex justify-center gap-1.5 mb-6">
          {steps.map((_, i) => <div key={i} className={`h-1.5 rounded-full transition-all ${i === step ? 'w-8 bg-primary-600' : 'w-4 bg-gray-200 dark:bg-gray-700'}`} />)}
        </div>
        <div className="text-5xl mb-4">{s.icon}</div>
        <h2 className="text-xl font-bold text-[var(--text)] mb-2">{tr(s.titleKey)}</h2>
        <p className="text-[var(--muted)] text-sm mb-8">{tr(s.descKey)}</p>
        <div className="flex gap-3">
          <button onClick={finish} className="btn-ghost flex-1">{tr('skipTour')}</button>
          {step < steps.length - 1
            ? <button onClick={() => setStep(s => s + 1)} className="btn-primary flex-1">{tr('next')} ←</button>
            : <button onClick={finish} className="btn-primary flex-1">{tr('startNow')} ✓</button>
          }
        </div>
      </div>
    </div>
  )
}
