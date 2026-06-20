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

export async function testAgentRouter(apiKey: string, model: string): Promise<{ ok: boolean; msg: string }> {
  try {
    const response = await fetch(`${AGENTROUTER_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'مرحبا' }],
        max_tokens: 10,
        stream: false,
      }),
    })

    if (response.ok) {
      return { ok: true, msg: '✅ المفتاح صحيح والنموذج يعمل' }
    }

    const errText = await response.text()
    let errMsg = `خطأ ${response.status}`
    try { errMsg = JSON.parse(errText)?.error?.message || errMsg } catch {}
    return { ok: false, msg: errMsg }
  } catch (err: any) {
    return { ok: false, msg: err.message || 'فشل الاتصال' }
  }
}
