// Карта кода: файл → первая строка-комментарий, длина и экспорты с номерами строк.
// npm run codemap → docs/CODEMAP.md. Нужна, чтобы агенты находили код без чтения всего проекта.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOTS = ['src', 'scripts', 'tests']
const EXT = /\.(ts|tsx|js|jsx|mjs)$/
const EXPORT = /^export\s+(?:default\s+)?(?:async\s+)?(?:abstract\s+)?(function|class|const|let|interface|type|enum)\s+([A-Za-z0-9_$]+)/

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (EXT.test(name)) out.push(p)
  }
  return out
}

const lines = [
  '# Карта кода',
  '',
  'Генерируется `npm run codemap` — руками не править. Формат: файл — строк — первый комментарий; ниже экспорты (вид, строка).',
  '',
]
for (const root of ROOTS) {
  if (!existsSync(root)) continue
  lines.push(`## ${root}/`, '')
  for (const f of walk(root).sort()) {
    const src = readFileSync(f, 'utf8').split(/\r?\n/)
    const about = (src.find((l) => l.startsWith('//')) ?? '').replace(/^\/\/\s?/, '')
    const exps = []
    src.forEach((l, i) => {
      const m = l.match(EXPORT)
      if (m) exps.push(`\`${m[2]}\` (${m[1]}, ${i + 1})`)
    })
    lines.push(`- \`${relative('.', f).replace(/\\/g, '/')}\` — ${src.length} стр.${about ? ` — ${about}` : ''}`)
    if (exps.length) lines.push(`  - ${exps.join(', ')}`)
  }
  lines.push('')
}
writeFileSync('docs/CODEMAP.md', lines.join('\n'))
console.log('docs/CODEMAP.md обновлён')
