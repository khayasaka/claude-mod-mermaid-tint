// Gives each box of a diagram its own outline color, and a fill of that color mixed lightly into the background.
// Boxes are flowchart and state diagram nodes, sequence diagram participants, class diagram classes and ER diagram entities.
// The idea comes from NahumLitvin/prismantis, which colors each box of its text diagrams.
//
// beautiful-mermaid's SVG writes each box as a group such as <g class="node" data-id="…">,
// and points to the default fill and outline with var(--_node-fill) and var(--_node-stroke).
// Only boxes that use those two are colored, so a box given a style in the diagram and
// the start and end circles of a state diagram (drawn in the text color) stay as they are.
// The fill is written with color-mix(), and css.mjs's resolveCss mixes it with the background, so colors are worked out in one place.

// The classes of the groups that get colors (node: flowchart and state diagram, actor: sequence diagram, class-node: class diagram, entity: ER diagram)
const BOX_CLASSES = new Set(['node', 'actor', 'class-node', 'entity'])

// How much of the box color goes into the fill (%).
// A dark background takes more, since a light tint sinks into it
const FILL_SHARE = { light: 14, dark: 20 }

// The least width of a colored outline.
// beautiful-mermaid's default of 0.75 is too thin to tell the colors apart
const MIN_STROKE_WIDTH = 1.25

// Box colors for each theme.
// Eight colors from each theme's published palette that stand out on its background, ordered so that neighboring boxes don't look alike.
// nord-light darkens nord's colors in the same hues, which are too pale on a light background
export const PALETTES = {
  'zinc-light': ['#0969da', '#1a7f37', '#8250df', '#bc4c00', '#1b7c83', '#9a6700', '#cf222e', '#bf3989'],
  'zinc-dark': ['#58a6ff', '#3fb950', '#bc8cff', '#ffa657', '#39c5cf', '#d29922', '#ff7b72', '#f778ba'],
  'tokyo-night': ['#7aa2f7', '#9ece6a', '#bb9af7', '#ff9e64', '#7dcfff', '#e0af68', '#f7768e', '#73daca'],
  'tokyo-night-storm': ['#7aa2f7', '#9ece6a', '#bb9af7', '#ff9e64', '#7dcfff', '#e0af68', '#f7768e', '#73daca'],
  'tokyo-night-light': ['#34548a', '#485e30', '#5a4a78', '#965027', '#0f4b6e', '#8f5e15', '#8c4351', '#33635c'],
  'catppuccin-mocha': ['#89b4fa', '#a6e3a1', '#cba6f7', '#fab387', '#89dceb', '#f9e2af', '#f38ba8', '#94e2d5'],
  'catppuccin-latte': ['#1e66f5', '#40a02b', '#8839ef', '#fe640b', '#04a5e5', '#df8e1d', '#d20f39', '#179299'],
  nord: ['#88c0d0', '#a3be8c', '#b48ead', '#d08770', '#81a1c1', '#ebcb8b', '#bf616a', '#8fbcbb'],
  'nord-light': ['#5e81ac', '#6f8f57', '#946d8e', '#c06f52', '#4c8fa3', '#a8862a', '#bf616a', '#5e9b9a'],
  dracula: ['#bd93f9', '#50fa7b', '#ff79c6', '#ffb86c', '#8be9fd', '#f1fa8c', '#ff5555', '#6272a4'],
  'github-light': ['#0969da', '#1a7f37', '#8250df', '#bc4c00', '#1b7c83', '#9a6700', '#cf222e', '#bf3989'],
  'github-dark': ['#58a6ff', '#3fb950', '#bc8cff', '#ffa657', '#39c5cf', '#d29922', '#ff7b72', '#f778ba'],
  'solarized-light': ['#268bd2', '#859900', '#6c71c4', '#cb4b16', '#2aa198', '#b58900', '#dc322f', '#d33682'],
  'solarized-dark': ['#268bd2', '#859900', '#6c71c4', '#cb4b16', '#2aa198', '#b58900', '#dc322f', '#d33682'],
  'one-dark': ['#61afef', '#98c379', '#c678dd', '#d19a66', '#56b6c2', '#e5c07b', '#e06c75', '#be5046'],
}

// Box colors for the auto theme (the terminal's colors) and for themes not in the table, picked by how light the background is
const FALLBACK = { light: PALETTES['github-light'], dark: PALETTES['catppuccin-mocha'] }

// Returns where the contents of the group opening at `from` end (the position of its matching </g>).
// A box group can hold nested <g>, as an actor's figure does, so depth is counted
function groupEnd(svg, from) {
  const tag = /<g\b|<\/g>/g
  tag.lastIndex = from
  let depth = 1
  let m
  while ((m = tag.exec(svg))) {
    depth += m[0] === '</g>' ? -1 : 1
    if (depth === 0) return m.index
  }
  return svg.length
}

// Within a box group, replaces only the elements that use the default fill and outline with the box's color
function recolor(body, color, share) {
  return body.replace(/<[^>]+>/g, tag => {
    let out = tag.replaceAll('fill="var(--_node-fill)"', `fill="color-mix(in srgb, ${color} ${share}%, var(--bg))"`)
    if (out.includes('stroke="var(--_node-stroke)"')) {
      out = out
        .replaceAll('stroke="var(--_node-stroke)"', `stroke="${color}"`)
        .replace(/stroke-width="([\d.]+)"/, (_, width) => `stroke-width="${Math.max(Number(width), MIN_STROKE_WIDTH)}"`)
    }
    return out
  })
}

// Assigns colors to the boxes of a beautiful-mermaid SVG in the order they appear.
// Boxes with the same data-id (such as a sequence diagram participant drawn at the top and the bottom) share a color.
// `light` says whether the background is light, which sets the fill strength and the colors for themes not in the table
export function colorBoxes(svg, { theme, light }) {
  const palette = PALETTES[theme] ?? (light ? FALLBACK.light : FALLBACK.dark)
  const share = light ? FILL_SHARE.light : FILL_SHARE.dark
  const assigned = new Map()
  const open = /<g class="([^"]+)" data-id="([^"]*)"[^>]*>/g
  let out = ''
  let pos = 0
  let m
  while ((m = open.exec(svg))) {
    // Groups that aren't boxes, such as subgraphs, are skipped, and the search goes on inside them
    if (!BOX_CLASSES.has(m[1])) continue
    const start = open.lastIndex
    const end = groupEnd(svg, start)
    const body = svg.slice(start, end)
    // A box that doesn't use the default colors (one with a style, or a start or end circle) keeps its colors and takes no color from the order
    if (!body.includes('var(--_node-fill)') && !body.includes('var(--_node-stroke)')) continue
    if (!assigned.has(m[2])) assigned.set(m[2], palette[assigned.size % palette.length])
    out += svg.slice(pos, start) + recolor(body, assigned.get(m[2]), share)
    pos = end
    open.lastIndex = end
  }
  return out + svg.slice(pos)
}
