// Tests for turning arrow heads (bin/markers.mjs).
// Run with `node --test tests/*.test.mjs`.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { renderMermaidSVG } from 'beautiful-mermaid'

import { fixMarkerOrient } from '../bin/markers.mjs'

// The opening tag of each marker, by id
function markers(svg) {
  return Object.fromEntries([...svg.matchAll(/<marker\b[^>]*\bid="([^"]*)"[^>]*>/g)].map(m => [m[1], m[0]]))
}

// marker-start and marker-end of each edge, by data-from and data-to
function uses(svg) {
  return [...svg.matchAll(/<polyline class="(?:edge|class-relationship)" data-from="([^"]*)" data-to="([^"]*)"[^>]*>/g)].map(m => ({
    edge: `${m[1]}->${m[2]}`,
    start: /marker-start="url\(#([^)]+)\)"/.exec(m[0])?.[1],
    end: /marker-end="url\(#([^)]+)\)"/.exec(m[0])?.[1],
  }))
}

test('no marker keeps auto-start-reverse, which resvg cannot read', () => {
  for (const source of ['classDiagram\n  A --> B\n  C <|-- A\n  A *-- D', 'graph LR\n  X <--> Y', 'sequenceDiagram\n  A->>B: x\n  B-->>A: y']) {
    const out = fixMarkerOrient(renderMermaidSVG(source, {}))
    assert.ok(!out.includes('auto-start-reverse'), source)
  }
})

test('a backward marker (its shape before refX) is reversed at the start of a line and kept at the end', () => {
  const out = fixMarkerOrient(renderMermaidSVG('classDiagram\n  A --> B\n  C <|-- A', {}))
  const byEdge = Object.fromEntries(uses(out).map(use => [use.edge, use]))
  // The inheritance triangle is used at the start (the C side), so it is replaced by the turned copy
  assert.equal(byEdge['C->A'].start, 'cls-inherit-reversed')
  // The association arrow is used at the end, so it stays
  assert.equal(byEdge['A->B'].end, 'cls-arrow')
  const reversed = markers(out)['cls-inherit-reversed']
  // Turned about the center of the box, with refX moved to the opposite side (12 → 0)
  assert.match(reversed, /refX="0"/)
  assert.ok(out.includes('<g transform="rotate(180 6 5)">'), 'the copy is not turned around its middle')
})

test('a forward marker (its shape past refX) is kept at the start of a line, so it is not hidden under the box', () => {
  const comp = fixMarkerOrient(renderMermaidSVG('classDiagram\n  A *-- D', {}))
  assert.equal(uses(comp)[0].start, 'cls-composition')
  assert.equal(markers(comp)['cls-composition-reversed'], undefined)

  const flow = fixMarkerOrient(renderMermaidSVG('graph LR\n  X <--> Y', {}))
  assert.deepEqual(uses(flow)[0], { edge: 'X->Y', start: 'arrowhead-start', end: 'arrowhead' })
})
