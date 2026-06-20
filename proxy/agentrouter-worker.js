/**
 * Cloudflare Worker — AgentRouter Proxy
 *
 * يعمل هذا الـ Worker كـ relay بين التطبيق وـ agentrouter.org.
 * سيرفر Replit محجوب من WAF بسبب IP-range ، لكن Cloudflare IPs غير محجوبة.
 *
 * نشر الـ Worker:
 * 1. سجّل في https://workers.cloudflare.com (مجاناً)
 * 2. أنشئ Worker جديد → الصق هذا الكود
 * 3. اضغط Deploy — ستحصل على رابط مثل:
 *    https://agentrouter-proxy.YOUR-NAME.workers.dev
 * 4. ضع الرابط في إعدادات التطبيق (Admin → AI → Proxy URL)
 */

export default {
  async fetch(request) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders })
    }

    const url = new URL(request.url)
    const targetPath = url.pathname + url.search
    const targetUrl = 'https://agentrouter.org' + targetPath

    const newHeaders = new Headers()
    for (const [key, val] of request.headers.entries()) {
      const lower = key.toLowerCase()
      if (['host', 'origin', 'referer', 'cf-connecting-ip', 'x-forwarded-for', 'cf-ray', 'cf-ipcountry'].includes(lower)) continue
      newHeaders.set(key, val)
    }
    newHeaders.set('Origin', 'https://agentrouter.org')
    newHeaders.set('Referer', 'https://agentrouter.org/')
    newHeaders.set('Host', 'agentrouter.org')

    let body
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      body = request.body
    }

    const proxyReq = new Request(targetUrl, {
      method: request.method,
      headers: newHeaders,
      body,
    })

    const response = await fetch(proxyReq)

    const respHeaders = new Headers(response.headers)
    respHeaders.set('Access-Control-Allow-Origin', '*')
    respHeaders.delete('X-Frame-Options')
    respHeaders.delete('Content-Security-Policy')

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: respHeaders,
    })
  }
}
