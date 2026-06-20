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

// Strip non-ISO-8859-1 characters from header values (required by Fetch API)
function safeHeader(value: string): string {
  return value.replace(/[^\x20-\x7E]/g, '')
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
      'Authorization': `Bearer ${safeHeader(config.apiKey)}`,
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
    try {
      const parsed = JSON.parse(errText)
      errMsg = parsed?.error?.message || parsed?.message || parsed?.error || errMsg
    } catch {}
    // Include raw response snippet for diagnosis
    if (errMsg === `AgentRouter error ${response.status}` && errText) {
      errMsg = `AgentRouter error ${response.status}: ${errText.substring(0, 300)}`
    }
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
  if (!apiKey || apiKey.length < 8) {
    return { ok: false, msg: 'المفتاح قصير جداً أو فارغ' }
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 12000)

    const cleanKey = safeHeader(apiKey)
    if (!cleanKey || cleanKey.length < 8) {
      return { ok: false, msg: 'المفتاح يحتوي على رموز غير صالحة — تأكد من نسخه بشكل صحيح' }
    }

    const response = await fetch(`${AGENTROUTER_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cleanKey}`,
      },
      body: JSON.stringify({
        model: safeHeader(model),
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

    // AgentRouter blocks all external origins (content-blocked policy)
    if (errText.includes('content-blocked') || errText.includes('blocked') || response.status === 403) {
      return {
        ok: false,
        msg: '❌ AgentRouter يحجب الطلبات من تطبيقات Replit (content-blocked). استخدم Gemini أو OpenAI بدلاً منه.',
        warn: 'agentrouter-waf'
      }
    }

    // Parse actual error from response body
    let actualMsg = ''
    try {
      const parsed = JSON.parse(errText)
      actualMsg = parsed?.error?.message || parsed?.message || parsed?.error || ''
    } catch {}

    if (response.status === 401) {
      const detail = actualMsg ? `: ${actualMsg}` : ''
      return { ok: false, msg: `مفتاح API غير صحيح أو منتهي الصلاحية${detail}` }
    }
    if (response.status === 404) {
      const detail = actualMsg ? `: ${actualMsg}` : ''
      return { ok: false, msg: `النموذج "${model}" غير موجود — تحقق من اسمه${detail}` }
    }
    if (response.status === 429) {
      return { ok: false, msg: 'تم استنفاد الحصة (Rate limit)' }
    }

    const displayMsg = actualMsg || errText.substring(0, 200)
    return { ok: false, msg: `خطأ ${response.status}: ${displayMsg}` }
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return { ok: true, msg: '⚠️ انتهت مهلة الاتصال (قد يكون المفتاح صحيحاً)', warn: 'agentrouter-waf' }
    }
    if (
      err.message?.includes('Failed to fetch') ||
      err.message?.includes('NetworkError') ||
      err.message?.includes('Load failed') ||
      err.message?.includes('CORS')
    ) {
      return {
        ok: true,
        msg: '⚠️ الطلب محجوب من بيئة Replit — المفتاح صيغته صحيحة',
        warn: 'agentrouter-waf'
      }
    }
    return { ok: false, msg: err.message || 'فشل الاتصال' }
  }
}
