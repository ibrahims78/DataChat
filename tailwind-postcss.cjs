/**
 * Custom PostCSS plugin for Tailwind CSS v4
 * Wraps the tailwindcss compile API for use with PostCSS
 */
const tw = require('tailwindcss')
const fs = require('fs')
const path = require('path')

function resolveStylesheet(id, base) {
  // Handle tailwindcss imports
  if (id === 'tailwindcss') {
    return { content: fs.readFileSync(require.resolve('tailwindcss/index.css'), 'utf8'), base: path.dirname(require.resolve('tailwindcss/index.css')) }
  }
  if (id.startsWith('tailwindcss/')) {
    const subpath = id.replace('tailwindcss/', '')
    const resolved = path.join(path.dirname(require.resolve('tailwindcss/package.json')), subpath + (subpath.endsWith('.css') ? '' : '.css'))
    if (fs.existsSync(resolved)) {
      return { content: fs.readFileSync(resolved, 'utf8'), base: path.dirname(resolved) }
    }
  }
  // Try to resolve relative to base
  if (base) {
    const resolved = path.resolve(base, id)
    if (fs.existsSync(resolved)) {
      return { content: fs.readFileSync(resolved, 'utf8'), base: path.dirname(resolved) }
    }
  }
  return null
}

module.exports = {
  postcssPlugin: 'tailwind-postcss-v4',
  async Once(root, { result }) {
    const inputPath = result.opts.from || process.cwd()
    const inputBase = path.dirname(inputPath)

    let inputCss = ''
    root.walk(node => { inputCss += node.toString() + '\n' })

    try {
      const compiled = await tw.compile(inputCss, {
        loadStylesheet: async (id, base) => {
          const resolved = resolveStylesheet(id, base || inputBase)
          if (resolved) return resolved
          throw new Error(`Cannot resolve stylesheet: ${id}`)
        },
        loadModule: async (id) => {
          if (id.startsWith('tailwindcss/')) {
            const mod = require(id.replace('tailwindcss/', 'tailwindcss/plugin'))
            return { module: mod, base: '' }
          }
          return { module: require(id), base: '' }
        }
      })
      if (compiled && compiled.build) {
        const outputCss = compiled.build([])
        const newRoot = require('postcss').parse(outputCss)
        root.removeAll()
        newRoot.each(node => root.append(node.clone()))
      }
    } catch(e) {
      console.warn('[tailwind-postcss-v4] Warning:', e.message?.slice(0, 100))
    }
  }
}
module.exports.postcss = true
