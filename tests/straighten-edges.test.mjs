// Tests for removing steps in edges (bin/straighten-edges.mjs).
// Run with `node --test tests/*.test.mjs`.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { renderMermaidSVG } from '../vendor/beautiful-mermaid/index.mjs'

import { straightenEdges, straightenPoints } from '../bin/straighten-edges.mjs'

const pts = list => list.map(([x, y]) => ({ x, y }))

test('a jog just before the arrow is removed by moving the line before it, and the arrow end stays', () => {
  // A state diagram's Reloading → Loaded (stepped 1.76 px left)
  const out = straightenPoints(pts([[156.6, 398.4], [156.6, 386.4], [195.98, 386.4], [195.98, 318.1], [194.22, 318.1], [194.22, 152.9]]))
  assert.deepEqual(out, pts([[156.6, 398.4], [156.6, 386.4], [194.22, 386.4], [194.22, 152.9]]))
})

test('a jog right after the start moves the start along the box edge, and the line becomes one segment', () => {
  // A state diagram's Loaded → end (stepped 4.78 px right)
  const out = straightenPoints(pts([[216.2, 152.9], [216.2, 242.1], [220.98, 242.1], [220.98, 249.65]]))
  assert.deepEqual(out, pts([[220.98, 152.9], [220.98, 249.65]]))
})

test('a vertical jog between two horizontal lines is removed the same way', () => {
  const out = straightenPoints(pts([[0, 50], [100, 50], [100, 53], [200, 53]]))
  assert.deepEqual(out, pts([[0, 53], [200, 53]]))
})

test('two jogs in a row are both removed, and the line becomes one segment', () => {
  const out = straightenPoints(pts([[10, 0], [10, 50], [10.5, 50], [10.5, 60], [12, 60], [12, 100]]))
  assert.deepEqual(out, pts([[12, 0], [12, 100]]))
})

test('a long step and a plain bend stay as they are', () => {
  const long = pts([[0, 0], [0, 100], [40, 100], [40, 200]])
  assert.deepEqual(straightenPoints(long), long)
  const bend = pts([[0, 0], [0, 100], [100, 100]])
  assert.deepEqual(straightenPoints(bend), bend)
})

test('the state diagram that showed the jogs is drawn with straight lines into Loaded and the end', () => {
  const svg = straightenEdges(
    renderMermaidSVG('stateDiagram-v2\n  [*] --> Loaded\n  Loaded --> Editing: save\n  Editing --> Reloading: turn end\n  Reloading --> Loaded: reloaded\n  Loaded --> [*]', {}),
  )
  for (const m of svg.matchAll(/<polyline class="edge"[^>]*\spoints="([^"]*)"/g)) {
    const points = m[1].split(' ').map(pair => pair.split(',').map(Number))
    for (let i = 1; i < points.length; i++) {
      const [x0, y0] = points[i - 1]
      const [x1, y1] = points[i]
      const length = Math.hypot(x1 - x0, y1 - y0)
      // No short segment (a step) is left except at the ends
      if (i > 1 && i < points.length - 1) assert.ok(length >= 8, `a ${length.toFixed(2)}px step is left in ${m[1]}`)
    }
  }
})
