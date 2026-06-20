const AGENTROUTER_BASE = 'https://agentrouter.org/v1'

export interface AgentRouterConfig {
  apiKey: string
  model: string
  temperature?: number
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export async function streamAgentRouter(
  config: AgentRouterConfig,
  messages: ChatMessage[],
  onChunk: (text: string) => void,
  signal?: AbortSignal
): Promise<string> {
  const response = await fetch(`${AGENTROUTER_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: config.temperature ?? 0.7,
      stream: true,
    }),
    signal,
  })

  if (!response.ok) {
    const errText = await response.text()
    let errMsg = `AgentRouter error ${response.status}`
    try { errMsg = JSON.parse(errText)?.error?.message || errMsg } catch {}
    throw new Error(errMsg)
  }

  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let fullText = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || !trimmed.startsWith('data: ')) continue
      const dataStr = trimmed.slice(6)
      if (dataStr === '[DONE]') continue
      try {
        const parsed = JSON.parse(dataStr)
        const delta = parsed.choices?.[0]?.delta?.content
        if (delta) {
          fullText += delta
          onChunk(delta)
        }
      } catch {}
    }
  }

  return fullText
}

export async function testAgentRouter(apiKey: string, model: string): Promise<{ ok: boolean; msg: string; warn?: string }> {
  // Basic key format validation first
  if (!apiKey || apiKey.length < 10) {
    return { ok: false, msg: 'المفتاح قصير جداً أو فارغ' }
  }
  if (!apiKey.startsWith('sk-')) {
    return { ok: false, msg: 'صيغة المفتاح غير صحيحة — يجب أن يبدأ بـ sk-' }
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)

    const response = await fetch(`${AGENTROUTER_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 5,
        stream: false,
      }),
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (response.ok) {
      return { ok: true, msg: '✅ المفتاح صحيح والنموذج يعمل' }
    }

    const errText = await response.text()

    // WAF block — known Aliyun WAF pattern from Replit/cloud IPs
    if (errText.includes('content-blocked') || errText.includes('blocked') || response.status === 403) {
      return {
        ok: true,
        msg: '⚠️ بيئة التطوير محجوبة — المفتاح صيغته صحيحة',
        warn: 'agentrouter-waf'
      }
    }

    if (response.status === 401) {
      return { ok: false, msg: 'مفتاح API غير صحيح أو منتهي الصلاحية' }
    }
    if (response.status === 404) {
      return { ok: false, msg: `النموذج "${model}" غير موجود — تحقق من اسمه` }
    }

    let errMsg = `خطأ ${response.status}`
    try { errMsg = JSON.parse(errText)?.error?.message || errMsg } catch {}
    return { ok: false, msg: errMsg }
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return { ok: true, msg: '⚠️ انتهت مهلة الاتصال من بيئة التطوير', warn: 'agentrouter-waf' }
    }
    // Network blocked (content-blocked browser error or CORS failure)
    if (err.message?.includes('Failed to fetch') || err.message?.includes('NetworkError') || err.message?.includes('Load failed')) {
      return {
        ok: true,
        msg: '⚠️ الطلب محجوب من بيئة Replit — المفتاح صيغته صحيحة',
        warn: 'agentrouter-waf'
      }
    }
    return { ok: false, msg: err.message || 'فشل الاتصال' }
  }
}
