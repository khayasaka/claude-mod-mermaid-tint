// Replaces orient="auto-start-reverse" on arrow heads (<marker>) with forms resvg can read.
// resvg 2.6.2 doesn't read auto-start-reverse and draws such markers unrotated.
// Class diagram arrows (cls-arrow) then pointed right whatever the edge's direction, and on a downward edge only their top half showed above the box.
// Leftward messages in sequence diagrams pointed right too.
//
// beautiful-mermaid's markers point one of two ways.
// - Backward: the shape lies before refX (cls-inherit, cls-arrow, seq-arrow; refX at the right side of the marker box)
// - Forward: the shape lies past refX (cls-composition, cls-aggregation, arrowhead-start; refX near the left side)
// Turning every marker at the start, as auto-start-reverse does, points a forward marker's shape into the box it starts from, where it is hidden.
// So each end decides whether to turn, so that the shape always extends along the edge.
// - Backward markers: as they are (orient="auto") at the end, a copy turned 180° at the start
// - Forward markers: as they are at the start, a copy turned 180° at the end

// The suffix of the ids of the turned copies
const REVERSED_SUFFIX = '-reversed'

const attr = (attrs, name) => new RegExp(`\\b${name}="([^"]*)"`).exec(attrs)?.[1]

// A marker with its shape turned 180°.
// It turns about the center of the marker box, and refX and refY move to the opposite side.
// Turning about refX and refY would move the shape out of the box (0 to markerWidth), where resvg clips it
function reversedMarker(id, attrs, body) {
  // markerWidth and markerHeight default to 3, as the SVG specification says
  const width = Number(attr(attrs, 'markerWidth') ?? 3)
  const height = Number(attr(attrs, 'markerHeight') ?? 3)
  const refX = Number(attr(attrs, 'refX') ?? 0)
  const refY = Number(attr(attrs, 'refY') ?? 0)
  const rest = attrs.replace(`id="${id}"`, `id="${id}${REVERSED_SUFFIX}"`).replace(/\s(refX|refY)="[^"]*"/g, '')
  return `<marker${rest} refX="${width - refX}" refY="${height - refY}" orient="auto"><g transform="rotate(180 ${width / 2} ${height / 2})">${body}</g></marker>`
}

export function fixMarkerOrient(svg) {
  // Which end ('start' or 'end') uses the turned copy, for each marker id
  const reverseAt = new Map()
  const copies = []
  const out = svg.replace(/<marker\b([^>]*)\borient="auto-start-reverse"([^>]*)>([\s\S]*?)<\/marker>/g, (_, before, after, body) => {
    const attrs = `${before} ${after}`.replace(/\s+/g, ' ').trimEnd()
    const id = attr(attrs, 'id')
    if (id !== undefined) {
      const width = Number(attr(attrs, 'markerWidth') ?? 3)
      const backward = Number(attr(attrs, 'refX') ?? 0) > width / 2
      const side = backward ? 'start' : 'end'
      if (svg.includes(`marker-${side}="url(#${id})"`)) {
        reverseAt.set(id, side)
        copies.push(reversedMarker(id, attrs, body))
      }
    }
    return `<marker${attrs} orient="auto">${body}</marker>`
  })
  if (copies.length === 0) return out
  // Points the references on that end to the copy, and adds the copies at the end of <defs>
  return out
    .replace(/marker-(start|end)="url\(#([^)]+)\)"/g, (all, side, id) => (reverseAt.get(id) === side ? `marker-${side}="url(#${id}${REVERSED_SUFFIX})"` : all))
    .replace('</defs>', `${copies.join('\n')}\n</defs>`)
}
