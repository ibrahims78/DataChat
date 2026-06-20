---
name: AgentRouter WAF and streaming
description: AgentRouter is fully incompatible with Replit — all request paths are blocked
---

## FINAL VERDICT: AgentRouter is incompatible with Replit

All three possible request paths are blocked:

| Path | Result | Reason |
|---|---|---|
| Server-side (any headers, streaming or not) | ❌ HTML WAF 11KB | Aliyun WAF blocks ALL Replit server IPs |
| Browser from `.replit.dev` | ❌ JSON `content-blocked` | AgentRouter policy blocks this origin |
| Browser from `.replit.app` (published) | ❌ JSON `content-blocked` | AgentRouter policy blocks this origin too |

**Why:** agentrouter.org uses Aliyun WAF that IP-blocks Replit server ranges, AND their application layer returns `content-blocked` for any browser Origin that isn't `agentrouter.org` itself. No header tricks, streaming modes, or deployment strategies can bypass both blocks simultaneously.

**The `content-blocked (request id: ...)` response** is an application-level block (not WAF HTML), meaning the request reaches AgentRouter servers but is rejected by their own policy for external origins.

## Current implementation

`chat.js` agentrouter branch: sends `use_client_ar` SSE event → browser calls AgentRouter directly → saves result via `/submit-response`. This shows the accurate error message when blocked.

`SettingsPage.tsx`: Shows amber warning when AgentRouter is selected, explaining incompatibility.

`agentrouter.ts` `testAgentRouter`: Returns `ok: false` with clear message when `content-blocked` detected.

## Recommendation

Use **Gemini** (built-in integration, no IP/origin issues) or **OpenAI** instead of AgentRouter for any Replit-hosted app.
