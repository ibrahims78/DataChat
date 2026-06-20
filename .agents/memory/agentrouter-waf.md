---
name: AgentRouter WAF and streaming
description: How agentrouter.org WAF blocks server calls, and the browser-direct solution used in this project
---

## WAF block behavior
- agentrouter.org uses Aliyun WAF with sliding CAPTCHA
- Blocks ALL Replit server IPs — no header trick can bypass it server-side
- Browser (user's IP) is NOT blocked — browser-direct calls work fine

## Architecture decision: browser-direct flow
- When provider=agentrouter, the `/api/chat/:id/message` endpoint does NOT call agentrouter.
  Instead, it sends `{ type: 'use_client_ar', config, messages, conversationId }` via SSE, then ends the stream.
- `ProjectPage.tsx` catches this event, breaks out of the SSE loop, and calls `streamAgentRouter()`
  from `client/src/lib/agentrouter.ts` directly from the browser.
- After streaming completes, client POSTs full response to `/api/chat/:id/submit-response`
  with `skipUserMessage: true` (user msg already saved by the main handler at line 740).
- `submit-response` handles file generation (EXCEL/PDF/HTML/MD/TXT/JSON/WORD/EXTRACT_PAGE/SHOW_PAGE/SHOW_CONTENT) and saves the AI message.

**Why:** Aliyun WAF requires a JS CAPTCHA challenge that cannot be solved server-side. The only viable bypass is to route the actual API call through the user's browser.

## Key files
- `server/src/routes/chat.js`: agentrouter branch at `router.post('/:projectId/message')` — sends `use_client_ar`
- `client/src/lib/agentrouter.ts`: `streamAgentRouter()` — browser-side streaming function
- `client/src/pages/ProjectPage.tsx`: `sendMessageInternal()` — handles `use_client_ar` event + browser-direct flow
- `server/src/routes/chat.js`: `router.post('/:projectId/submit-response')` — file generation + DB save (accepts `skipUserMessage` flag)

## Test endpoint (admin.js)
- `testAgentRouter()` in `agentrouter.ts` calls directly from browser — works fine
- Server-side admin test also exists but shows WAF warning

## Streaming note
- `streamAgentRouter(config, messages, onChunk)` calls `onChunk(delta)` per chunk (delta only, not accumulated)
- Must accumulate manually in the calling code for UI display
