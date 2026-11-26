// Draws docs/kinds.png, the gallery of diagram kinds in the README: nine
// diagrams about an online shop, each drawn by renderPicture in the
// github-light theme and set on a card of its own, three to a row.
//
// Run with `node docs/make-gallery.mjs` after a change that draws diagrams
// differently (one that raises LOCAL_REVISION), on a machine with Segoe UI.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

import { diagramColors, renderPicture } from '../bin/diagram.mjs'
import { pickFonts } from '../bin/fonts.mjs'

const require = createRequire(import.meta.url)
const { Resvg } = require('@resvg/resvg-js')

const here = path.dirname(fileURLToPath(import.meta.url))
const outFile = path.join(here, 'kinds.png')

// One row each for flows, structures and data. Flowcharts and state diagrams
// run left to right to suit the wide cards; the ER diagram has two entities,
// since beautiful-mermaid spreads entities wide and ignores `direction`.
const DIAGRAMS = [
  ['flowchart', `graph LR
  A[Cart] --> B[Checkout]
  B --> C{Paid?}
  C -->|Yes| D[Ship order]
  C -->|No| E[Retry payment]`],
  ['sequenceDiagram', `sequenceDiagram
  participant U as User
  participant S as Shop
  participant P as Payments
  U->>S: Place order
  S->>P: Charge card
  P-->>S: Approved
  S-->>U: Confirmation`],
  ['stateDiagram-v2', `stateDiagram-v2
  direction LR
  [*] --> Pending
  Pending --> Paid
  Paid --> Shipped
  Shipped --> Delivered
  Pending --> Cancelled
  Delivered --> [*]`],
  ['classDiagram', `classDiagram
  class Order {
    +int id
    +total() Money
  }
  Customer <|-- Member
  Customer <|-- Guest
  Customer --> Order
  Order o-- LineItem`],
  ['erDiagram', `erDiagram
  CUSTOMER ||--o{ ORDER : places
  CUSTOMER {
    int id PK
    string name
  }
  ORDER {
    int id PK
    date placed
  }`],
  ['mindmap', `mindmap
  root((Shop))
    Catalog
      Search
    Checkout
      Payments
    Support`],
  ['xychart-beta', `xychart-beta
  title "Orders per month"
  x-axis [Jan, Feb, Mar, Apr, May]
  y-axis "Orders" 0 --> 500
  bar [180, 240, 310, 280, 420]`],
  ['pie', `pie title Payment methods
  "Card" : 58
  "Wallet" : 27
  "Bank transfer" : 15`],
  ['timeline', `timeline
  title Launch plan
  Q1 : Design : Prototype
  Q2 : Beta
  Q3 : Launch : Marketing`],
]

const THEME = 'github-light'
const FONT = 'Segoe UI'

// The gallery's measures in px; it is about as wide as themes.png.
const TILE_W = 620
const TILE_H = 440
const GAP = 32
const MARGIN = 32
const CAPTION = 44
const INSET = 20
const RADIUS = 18
// The largest scale from a diagram's picture to its card, at which labels
// come out about as big as in themes.png.
const MAX_SCALE = 0.5

const tileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mermaid-tint-gallery-'))
try {
  // The values the mod draws with in a terminal: ROW_PX and the cell's shape before it is measured.
  const request = { theme: THEME, font: FONT, rowPx: 48, cellRatio: 2.125, lineEm: 1.308, textScale: 1, boxColors: true, outDir: tileDir }
  const tiles = DIAGRAMS.map(([kind, source], i) => {
    const { file } = renderPicture({ key: `tile-${i}`, source, math: [], maxColumns: 255, maxRows: 255 }, request)
    const png = fs.readFileSync(file)
    // The width and the height from the PNG's IHDR chunk.
    return { kind, png, width: png.readUInt32BE(16), height: png.readUInt32BE(20) }
  })

  // Every card takes the same scale, the one the largest diagram needs, so labels are one size throughout.
  const areaW = TILE_W - INSET * 2
  const areaH = TILE_H - CAPTION - INSET
  const scale = Math.min(MAX_SCALE, ...tiles.map(tile => Math.min(areaW / tile.width, areaH / tile.height)))

  const page = diagramColors({ theme: 'auto' }).colors
  const card = diagramColors({ theme: THEME }).colors
  const width = MARGIN * 2 + TILE_W * 3 + GAP * 2
  const height = MARGIN * 2 + TILE_H * 3 + GAP * 2
  const cards = tiles.map((tile, i) => {
    const x = MARGIN + (i % 3) * (TILE_W + GAP)
    const y = MARGIN + Math.floor(i / 3) * (TILE_H + GAP)
    const w = tile.width * scale
    const h = tile.height * scale
    return [
      `<rect x="${x}" y="${y}" width="${TILE_W}" height="${TILE_H}" rx="${RADIUS}" ry="${RADIUS}" fill="${card.bg}"/>`,
      `<text x="${x + INSET}" y="${y + 32}" font-family="${FONT}" font-size="18" fill="${card.muted ?? card.fg}">${tile.kind}</text>`,
      `<image x="${x + INSET + (areaW - w) / 2}" y="${y + CAPTION + (areaH - h) / 2}" width="${w}" height="${h}" href="data:image/png;base64,${tile.png.toString('base64')}"/>`,
    ].join('')
  })
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="${page.bg}"/>${cards.join('')}</svg>`

  const fonts = pickFonts({ font: FONT })
  const png = new Resvg(svg, { fitTo: { mode: 'original' }, font: { loadSystemFonts: false, fontFiles: fonts.files, defaultFontFamily: FONT } })
    .render()
    .asPng()
  fs.writeFileSync(outFile, png)
  console.log(`${outFile}: ${width}x${height}, scale ${scale.toFixed(3)}`)
} finally {
  fs.rmSync(tileDir, { recursive: true, force: true })
}
