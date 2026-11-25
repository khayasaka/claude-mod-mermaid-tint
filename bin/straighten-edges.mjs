// Removes the small steps partway along edges (the <polyline class="edge"> of flowcharts and state diagrams).
// beautiful-mermaid can step a vertical edge 1 to 5 px sideways when it lines the edge up with the side of a box.
// For example, a state diagram's Reloading → Loaded edge stepped 1.76 px left on its way up into Loaded.
// In a picture that looks like a kink just before the arrow head, so the part before the step is moved to make one straight line.

// Steps shorter than this are removed (SVG px). Those seen were 1.76 px and 4.78 px, well under the space between edges
const MAX_JOG = 8
// The difference under which coordinates count as equal
const EPSILON = 0.01

const same = (a, b) => Math.abs(a - b) < EPSILON

function parsePoints(text) {
  return text
    .trim()
    .split(/\s+/)
    .map(pair => pair.split(',').map(Number))
    .map(([x, y]) => ({ x, y }))
}

function formatPoints(points) {
  return points.map(({ x, y }) => `${x},${y}`).join(' ')
}

// Removes repeated points and points partway along a straight run
function simplify(points) {
  const out = []
  for (const p of points) {
    const last = out[out.length - 1]
    if (last && same(last.x, p.x) && same(last.y, p.y)) continue
    const prev = out[out.length - 2]
    if (prev && last && ((same(prev.x, last.x) && same(last.x, p.x)) || (same(prev.y, last.y) && same(last.y, p.y)))) out.pop()
    out.push(p)
  }
  return out
}

// In an edge that turns vertical, horizontal, vertical (or the other way round), removes a short middle step.
// The arrow head (the last point) stays put; the line before the step is lined up with the line after it.
// The points are simplified first, so the segment before that line meets it at a right angle (moving the line only changes its length)
export function straightenPoints(input) {
  let points = simplify(input.map(p => ({ ...p })))
  for (let i = 1; i + 2 < points.length; i++) {
    const [a, b, c, d] = [points[i - 1], points[i], points[i + 1], points[i + 2]]
    // Horizontal step: a-b and c-d are vertical
    if (same(b.y, c.y) && same(a.x, b.x) && same(c.x, d.x) && Math.abs(b.x - c.x) < MAX_JOG) {
      a.x = c.x
      b.x = c.x
    } else if (same(b.x, c.x) && same(a.y, b.y) && same(c.y, d.y) && Math.abs(b.y - c.y) < MAX_JOG) {
      // Vertical step: a-b and c-d are horizontal
      a.y = c.y
      b.y = c.y
    } else {
      continue
    }
    points = simplify(points)
    i = 0
  }
  return points
}

// Replaces the points of the SVG's edges with ones that have no steps
export function straightenEdges(svg) {
  return svg.replace(/(<polyline class="edge"[^>]*?\spoints=")([^"]*)(")/g, (_, head, points, tail) => head + formatPoints(straightenPoints(parsePoints(points))) + tail)
}
