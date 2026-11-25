// Run with `node --test tests/*.test.mjs`; `claude plugin test` runs the *.test.ts files.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { mixColors, resolveCss } from '../bin/css.mjs'
import { cellWidth, diagramColors, fitToCells, renderPicture, renderText, withMath } from '../bin/diagram.mjs'

const JETBRAINS = { rowPx: 48, cellRatio: 2.125, lineEm: 1.308, textScale: 1 }

test('color-mix weighs the two colors by their shares', () => {
  const white = { r: 255, g: 255, b: 255, a: 1 }
  const black = { r: 0, g: 0, b: 0, a: 1 }
  assert.deepEqual(mixColors(white, 0.2, black, undefined), { r: 51, g: 51, b: 51, a: 1 })
  // Mixing with transparent keeps the color and scales its alpha.
  assert.deepEqual(mixColors(white, 0.2, { r: 0, g: 0, b: 0, a: 0 }, undefined), { r: 255, g: 255, b: 255, a: 0.2 })
})

test('var() and color-mix() become plain colors, the base winning over the document', () => {
  const svg = [
    '<svg style="--bg:#ffffff;--fg:#000000">',
    '<style>svg { --_line: var(--line, color-mix(in srgb, var(--fg) 50%, var(--bg))); --_text: var(--fg); }</style>',
    '<path stroke="var(--_line)" fill="var(--_text)"/><rect fill="var(--accent, var(--_text))"/>',
    '</svg>',
  ].join('')
  const out = resolveCss(svg, { '--bg': '#282c34' })
  // Half of #000000 into the base's #282c34.
  assert.ok(out.includes('<path stroke="#14161a" fill="#000000"/>'), out)
  assert.ok(!out.includes('var('), out)
  assert.ok(!out.includes('color-mix('), out)
  assert.ok(out.includes('<rect fill="#000000"'), out)
})

test('a diagram is sized to its labels at the text size, and shrunk to the room', () => {
  // 260 x 130 px of SVG at JetBrains Mono 13pt: 13px labels drawn at the 36.7px text size.
  const fit = fitToCells({ width: 260, height: 130 }, JETBRAINS, 200)
  assert.equal(fit.columns, Math.ceil((260 * fit.scale) / (48 / 2.125)))
  assert.equal(fit.rows, Math.ceil((130 * fit.scale) / 48))
  const narrow = fitToCells({ width: 260, height: 130 }, JETBRAINS, 20)
  assert.equal(narrow.columns, 20)
  assert.ok(narrow.scale < fit.scale)
})

test('a tall diagram is shrunk toward the screen height, but not below 60% of its labels', () => {
  const natural = fitToCells({ width: 100, height: 2000 }, JETBRAINS, 200)
  const fitted = fitToCells({ width: 100, height: 2000 }, JETBRAINS, 200, 40)
  assert.ok(Math.abs(fitted.scale - natural.scale * 0.6) < 1e-9)
  const short = fitToCells({ width: 100, height: 400 }, JETBRAINS, 200, 40)
  assert.ok(short.rows <= 40)
})

test('auto colors follow the terminal; a named theme brings its own background as a card', () => {
  assert.deepEqual(diagramColors({ terminal: { background: '#1e1e1e', foreground: '#cccccc' } }), {
    colors: { bg: '#1e1e1e', fg: '#cccccc', accent: '#d77757' },
    card: false,
    theme: 'auto',
  })
  assert.deepEqual(diagramColors({ prefersDark: false }).colors, { bg: '#ffffff', fg: '#24292f', accent: '#d77757' })
  const nord = diagramColors({ theme: 'nord', overrides: { accent: '#ff0000' } })
  assert.equal(nord.card, true)
  assert.equal(nord.colors.bg, '#2e3440')
  assert.equal(nord.colors.accent, '#ff0000')
  assert.equal(diagramColors({ theme: 'no-such-theme' }).theme, 'auto')
})

test('Hangul and CJK take two cells', () => {
  assert.equal(cellWidth('A→B'), 3)
  assert.equal(cellWidth('요청'), 4)
})

test('ideographs beyond the BMP and wide emoji below U+1F300 take two cells', () => {
  assert.equal(cellWidth('𠮷'), 2)
  assert.equal(cellWidth(String.fromCodePoint(0x3134a)), 2)
  assert.equal(cellWidth('✅⌛☕⭐'), 8)
  assert.equal(cellWidth('〈〉'), 4)
  // Halfwidth katakana and ambiguous-width symbols stay one cell
  assert.equal(cellWidth('ｱ★○'), 3)
})

test('box drawing keeps its columns where labels hold two-cell letters', () => {
  const art = renderText({ key: 'k', source: 'graph LR\n  A[開始] --> B[保存する]\n  B --> C[中文]\n  C --> D[한국어]\n  D --> E[𠮷野家 ✅]', kind: 'text', maxColumns: 120 })
  const widths = art.text.split('\n').map(cellWidth)
  assert.deepEqual(widths, widths.map(() => art.columns), art.text)
  assert.match(art.text, /開始/)
  assert.match(art.text, /𠮷野家 ✅/)
})

test('two-cell letters keep their columns in a sequence diagram, and private-use letters in a label stay', () => {
  const icon = ''
  const art = renderText({ key: 'k', source: `sequenceDiagram\n  せんぱい->>まゆ: 図を描いて ${icon}\n  まゆ-->>せんぱい: 描きました`, kind: 'text', maxColumns: 120 })
  const lines = art.text.split('\n')
  // The row of participant names ends in the same column as the boxes' top border
  assert.equal(cellWidth(lines[1]), cellWidth(lines[0]), art.text)
  assert.ok(lines[1].includes('│ せんぱい │'), art.text)
  assert.ok(art.text.includes(icon), art.text)
})

test('two-cell letters keep their columns in a state name, and a stand-in letter the source holds stays', () => {
  const art = renderText({ key: 'k', source: 'stateDiagram-v2\n  [*] --> 待機\n  待機 --> ᐁ実行中\n  ᐁ実行中 --> [*]', kind: 'text', maxColumns: 120 })
  const lines = art.text.split('\n')
  const label = lines.findIndex(line => line.includes('待機'))
  assert.ok(label > 0, art.text)
  assert.equal(cellWidth(lines[label]), cellWidth(lines[label - 1]), art.text)
  assert.ok(art.text.includes('ᐁ実行中'), art.text)
})

test('a combining mark, an accent or an arrow over a letter, takes no cell', () => {
  assert.equal(cellWidth('x\u0304 = y\u0302'), 5)
  assert.equal(cellWidth('v\u20d7'), 1)
})

test("box drawing keeps its columns where a label's letters carry combining marks", () => {
  const art = renderText({ key: 'k', source: 'graph LR\n  A[x\u0304 = y\u0302] --> B[v\u20d7]', kind: 'text', maxColumns: 80 })
  const widths = art.text.split('\n').map(cellWidth)
  assert.deepEqual(widths, widths.map(() => art.columns), art.text)
})

test('box drawing keeps its columns where a label holds a one-cell letter from beyond the BMP', () => {
  const script = String.fromCodePoint(0x1d49c)
  const art = renderText({ key: 'k', source: `graph LR\n  A[${script}] --> B[x]`, kind: 'text', maxColumns: 80 })
  const widths = art.text.split('\n').map(cellWidth)
  assert.deepEqual(widths, widths.map(() => art.columns), art.text)
})

// The spans the mod sends for formulas in `source`: each TeX with its text.
function spans(source, pairs) {
  return pairs.map(([tex, text]) => {
    const start = source.indexOf(tex)
    return { start, end: start + tex.length, text }
  })
}

test("a formula goes in as its text only where the diagram's structure stays as it was", () => {
  const source = 'graph LR\n  A -->|$\\lvert x\\rvert$| B\n  B --> C[$\\lbrack y\\rbrack$]\n  C --> D[$x^2$]'
  const math = spans(source, [['$\\lvert x\\rvert$', '|x|'], ['$\\lbrack y\\rbrack$', '[y]'], ['$x^2$', 'x²']])
  assert.equal(withMath(source, math), 'graph LR\n  A -->|$\\lvert x\\rvert$| B\n  B --> C[$\\lbrack y\\rbrack$]\n  C --> D[x²]')
})

test('a sequence diagram, whose labels run to the end of their line, takes every formula, and one without math is left alone', () => {
  const source = 'sequenceDiagram\n  A->>B: $\\lvert x\\rvert$ and $x^2$'
  const math = spans(source, [['$\\lvert x\\rvert$', '|x|'], ['$x^2$', 'x²']])
  assert.equal(withMath(source, math), 'sequenceDiagram\n  A->>B: |x| and x²')
  assert.equal(withMath('graph LR\n  A --> B'), 'graph LR\n  A --> B')
})

test('in another diagram the parser does not read, a formula goes in only if its text adds no bracket, comma, semicolon, bar or quote', () => {
  const source = 'xychart-beta\n  title "Growth of $x^2$"\n  x-axis [$\\binom{n}{k}$, $f(x)$, B]\n  bar [1, 2, 3]'
  const math = spans(source, [['$x^2$', 'x²'], ['$\\binom{n}{k}$', 'C(n, k)'], ['$f(x)$', 'f(x)']])
  assert.equal(withMath(source, math), 'xychart-beta\n  title "Growth of x²"\n  x-axis [$\\binom{n}{k}$, f(x), B]\n  bar [1, 2, 3]')
})

test('the picture and the box drawing both draw the math', () => {
  const source = 'graph LR\n  A[$x^2$] --> B'
  const art = renderText({ key: 'k', source, math: spans(source, [['$x^2$', 'x²']]), kind: 'text', maxColumns: 80 })
  assert.ok(art.text.includes('x²') && !art.text.includes('$'), art.text)
})

test('box drawing for a flowchart, and an error for a diagram too wide', () => {
  const item = { key: 'k', source: 'graph LR\n  A --> B', kind: 'text', maxColumns: 80 }
  const art = renderText(item)
  assert.ok(art.text.includes('A') && art.text.includes('►'), art.text)
  assert.equal(art.rows, art.text.split('\n').length)
  assert.throws(() => renderText({ ...item, maxColumns: 5 }), /wider than the 5/)
})

test('a picture is a PNG of whole cells; an unsupported diagram fails', () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mermaid-tint-'))
  const request = { ...JETBRAINS, outDir, theme: 'auto', overrides: {}, terminal: {}, prefersDark: true, font: 'auto' }
  const result = renderPicture({ key: 'p', source: 'graph TD\n  A[Start] --> B[End]', maxColumns: 80, maxRows: 40 }, request)
  const png = fs.readFileSync(result.file)
  assert.equal(png.subarray(1, 4).toString(), 'PNG')
  // The PNG's size is the box of cells it fills.
  assert.equal(png.readUInt32BE(16), Math.round(result.columns * (48 / 2.125)))
  assert.equal(png.readUInt32BE(20), result.rows * 48)
  assert.throws(() => renderPicture({ key: 'q', source: 'pie title Pets\n  "Dogs" : 3', maxColumns: 80, maxRows: 40 }, request), /Invalid mermaid header/)
  fs.rmSync(outDir, { recursive: true, force: true })
})
