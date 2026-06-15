---
name: Tailwind v4 PostCSS workaround
description: How to use Tailwind CSS v4 in Vite 8 without @tailwindcss/postcss (blocked by package firewall)
---

Tailwind CSS v4 removed the direct PostCSS plugin; it now requires `@tailwindcss/postcss` which is blocked by Replit's package firewall.

**Workaround used:**
1. Add Tailwind CDN script to `client/index.html` with inline config for custom colors/fonts
2. Use plain CSS variables in `client/src/index.css` (no @tailwind directives)
3. Set `css: { postcss: { plugins: [] } }` in `client/vite.config.ts` to prevent auto-detection
4. Rename or delete `tailwind.config.js` so Vite 8 doesn't auto-detect it

**Why:** Vite 8 auto-detects tailwind.config.js and tries to inject tailwindcss as a PostCSS plugin, which fails with "use @tailwindcss/postcss instead".

**How to apply:** Any new project using Tailwind v4 with Vite 8 must use this CDN approach until @tailwindcss/postcss is unblocked.
