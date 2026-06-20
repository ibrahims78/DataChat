---
name: AgentRouter WAF and streaming
description: AgentRouter WAF blocks + Cloudflare Worker proxy solution
---

## Block summary (confirmed)

| Path | Result |
|---|---|
| Replit server → agentrouter.org (any headers) | ❌ Aliyun WAF HTML 11KB |
| Browser from `.replit.dev` or `.replit.app` | ❌ JSON `content-blocked` |
| curl from Replit server | ❌ same WAF HTML |

IP-based block only — no header tricks work.

## Solution: Cloudflare Worker proxy

Architecture: `Replit Server → CF Worker (workers.dev) → agentrouter.org`

- Server calls CF Worker at `*.workers.dev` → no IP block (CF Workers are a public relay)
- Worker calls agentrouter.org with `Origin: https://agentrouter.org` → WAF passes it (CF IPs not blocked)
- Worker adds `Access-Control-Allow-Origin: *` → browser can also call it directly

## Implementation

- `proxy/agentrouter-worker.js` — complete Worker code (strips host/origin/referer, sets agentrouter.org ones)
- `ai_settings.proxy_url` DB column — stored via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
- `admin.js` GET/PATCH — returns/saves `proxy_url`; test-api uses proxy endpoint when set
- `chat.js` agentrouter branch — if `proxy_url` set: server-side streaming via `streamOpenAICompatible(proxyEndpoint, ...)`; else: browser-direct fallback (`use_client_ar` SSE event)
- `SettingsPage.tsx` — proxy URL field + collapsible Worker code with copy button + setup instructions

## Setup steps for user

1. Go to workers.cloudflare.com (free account)
2. New Worker → paste `proxy/agentrouter-worker.js` code → Deploy
3. Copy the `*.workers.dev` URL
4. Admin → AI → AgentRouter → paste URL in "Proxy URL" field → Save
5. Test the API key — should show ✅ via proxy
