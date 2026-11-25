// Tests for the box colors (bin/box-colors.mjs).
// Run with `node --test tests/*.test.mjs`.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { renderMermaidSVG } from '../vendor/beautiful-mermaid/index.mjs'

import { PALETTES, colorBoxes } from '../bin/box-colors.mjs'
import { resolveCss } from '../bin/css.mjs'

// For each box group in the SVG (class and data-id), the attributes of the first shape inside
function boxes(svg) {
  return [...svg.matchAll(/<g class="(node|actor|class-node|entity)" data-id="([^"]*)"[^>]*>\s*<(?:rect|polygon|circle|path|g)\b([^>]*)>/g)].map(m => ({
    kind: m[1],
    id: m[2],
    stroke: /stroke="([^"]*)"/.exec(m[3])?.[1],
    fill: /fill="([^"]*)"/.exec(m[3])?.[1],
    width: /stroke-width="([^"]*)"/.exec(m[3])?.[1],
  }))
}

test('each box of a flowchart gets its own outline color and a light fill of that color', () => {
  const svg = colorBoxes(renderMermaidSVG('graph TD\n  A --> B\n  B --> C', {}), { theme: 'nord-light', light: true })
  const [a, b, c] = boxes(svg)
  assert.deepEqual([a.stroke, b.stroke, c.stroke], PALETTES['nord-light'].slice(0, 3))
  assert.equal(a.fill, `color-mix(in srgb, ${PALETTES['nord-light'][0]} 14%, var(--bg))`)
  // The default 0.75 is too thin, so colored outlines are 1.25
  assert.equal(a.width, '1.25')
})

test('a box given its own style and the start and end of a state diagram keep their colors, and take no color from the list', () => {
  const styled = boxes(colorBoxes(renderMermaidSVG('graph TD\n  A --> B\n  B --> C\n  style B fill:#ff0000,stroke:#00ff00', {}), { theme: 'nord', light: false }))
  assert.deepEqual(styled.map(box => box.stroke), [PALETTES.nord[0], '#00ff00', PALETTES.nord[1]])
  assert.equal(styled[1].fill, '#ff0000')

  const state = boxes(colorBoxes(renderMermaidSVG('stateDiagram-v2\n  [*] --> Idle\n  Idle --> Busy\n  Busy --> [*]', {}), { theme: 'nord', light: false }))
  const byId = Object.fromEntries(state.map(box => [box.id, box]))
  assert.equal(byId._start.fill, 'var(--_text)')
  assert.equal(byId._end.stroke, 'var(--_text)')
  assert.deepEqual([byId.Idle.stroke, byId.Busy.stroke], PALETTES.nord.slice(0, 2))
})

test('sequence participants, classes and ER entities are colored, and a participant drawn twice keeps one color', () => {
  const seq = boxes(colorBoxes(renderMermaidSVG('sequenceDiagram\n  participant U\n  participant S\n  U->>S: hi', {}), { theme: 'dracula', light: false }))
  const colorOf = Object.fromEntries(seq.map(box => [box.id, box.stroke]))
  assert.deepEqual([colorOf.U, colorOf.S], PALETTES.dracula.slice(0, 2))
  for (const box of seq) assert.equal(box.stroke, colorOf[box.id])

  const cls = boxes(colorBoxes(renderMermaidSVG('classDiagram\n  Animal <|-- Duck', {}), { theme: 'dracula', light: false }))
  assert.deepEqual(new Set(cls.map(box => box.stroke)).size, 2)
  const er = boxes(colorBoxes(renderMermaidSVG('erDiagram\n  CUSTOMER ||--o{ ORDER : places', {}), { theme: 'dracula', light: false }))
  assert.deepEqual(new Set(er.map(box => box.stroke)).size, 2)
})

test("a timeline's period shares one color with its events, and each period gets its own", () => {
  const svg = colorBoxes(renderMermaidSVG('timeline\n  2024 : Alpha : Beta\n  2025 : Stable', {}), { theme: 'nord-light', light: true })
  const [first, second] = svg.split('data-id="period-1"')
  const firstStrokes = [...first.matchAll(/class="timeline-box"[^>]*stroke="([^"]*)"/g)].map(m => m[1])
  const secondStrokes = [...second.matchAll(/class="timeline-box"[^>]*stroke="([^"]*)"/g)].map(m => m[1])
  assert.deepEqual(firstStrokes, Array(3).fill(PALETTES['nord-light'][0]))
  assert.deepEqual(secondStrokes, Array(2).fill(PALETTES['nord-light'][1]))
})

test("a mindmap's branches each get a color shared by the nodes on them, from the palette's second, and the root keeps the accent", () => {
  const svg = colorBoxes(renderMermaidSVG('mindmap\n  root\n    A\n      A1\n    B', {}), { theme: 'nord-light', light: true })
  const stroke = label => new RegExp(`stroke="([^"]*)"[^>]*/>\\s*<text[^>]*>${label}<`).exec(svg)?.[1]
  assert.equal(stroke('A'), PALETTES['nord-light'][1])
  assert.equal(stroke('A1'), PALETTES['nord-light'][1])
  assert.equal(stroke('B'), PALETTES['nord-light'][2])
  const root = svg.slice(svg.indexOf('<g class="mindmap-root"'), svg.indexOf('<g class="mindmap-node"'))
  assert.doesNotMatch(root, /stroke="#/)
})

test('the auto theme picks colors by the background, a dark one mixing in more of the color', () => {
  const source = renderMermaidSVG('graph TD\n  A --> B', {})
  const [light] = boxes(colorBoxes(source, { theme: 'auto', light: true }))
  const [dark] = boxes(colorBoxes(source, { theme: 'auto', light: false }))
  assert.equal(light.stroke, PALETTES['github-light'][0])
  assert.equal(dark.stroke, PALETTES['catppuccin-mocha'][0])
  assert.ok(dark.fill.includes(' 20%,'), dark.fill)
})

test('resolveCss turns the fill into a plain color mixed into the background', () => {
  const svg = colorBoxes(renderMermaidSVG('graph TD\n  A --> B', {}), { theme: 'nord-light', light: true })
  const out = resolveCss(svg, { '--bg': '#ffffff', '--fg': '#000000' })
  const [a] = boxes(out)
  // #5e81ac mixed 14% into white
  assert.equal(a.fill, '#e8edf3')
  assert.ok(!out.includes('color-mix('), 'color-mix() left in the SVG')
})
