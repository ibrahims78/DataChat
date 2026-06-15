---
name: Gemini model names
description: Correct model identifiers for Google Gemini API as of June 2026
---

Gemini 1.5 models (gemini-1.5-flash, gemini-1.5-pro) are fully deprecated and return 404.

**Working models (June 2026):**
- `gemini-2.5-flash` — default, fast and reliable
- `gemini-2.5-pro` — highest accuracy
- `gemini-2.0-flash-001` — stable older version
- `gemini-flash-latest` — always latest flash

**systemInstruction format:**
The `systemInstruction` field must be an object `{ role: 'user', parts: [{ text: '...' }] }` — passing a plain string causes a 400 Bad Request error.

**Why:** Google deprecated v1.5 models and changed the systemInstruction schema in the v1beta API.

**How to apply:** Always set default model to `gemini-2.5-flash` in code and DB. Always wrap systemInstruction text in the object format.
