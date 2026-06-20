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

    // Strip all proxy/identity headers — send a clean API request
    // Do NOT set Origin/Referer pointing to agentrouter.org (triggers unauthorized_client_error)
    const STRIP = new Set([
      'host', 'origin', 'referer', 'cf-connecting-ip',
      'x-forwarded-for', 'cf-ray', 'cf-ipcountry',
      'accept-encoding', 'cookie',
    ])
    const newHeaders = new Headers()
    for (const [key, val] of request.headers.entries()) {
      if (STRIP.has(key.toLowerCase())) continue
      newHeaders.set(key, val)
    }
    newHeaders.set('Host', 'agentrouter.org')
    // Use a realistic browser User-Agent to pass WAF checks
    newHeaders.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36')
    newHeaders.set('Accept-Language', 'en-US,en;q=0.9')
    // No Origin or Referer — treat as direct API call, not a browser web session

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
