// Measures the labels of a diagram in the fonts its picture is drawn with,
// so beautiful-mermaid sizes boxes for those fonts rather than by its
// estimate for Inter, which is off by up to a third for other fonts (wider
// for Latin letters in BIZ UDPGothic, narrower for Japanese).
//
// resvg reads every font file each time one is created, about 0.1 s with a
// CJK collection among them, so the texts are not measured one by one: they
// are drawn together in one picture, one per row, and each width is read
// from the pixels of its row. The width runs from the text's origin to its
// rightmost drawn pixel, which includes a fallback font resvg draws the
// whole label in when the first font lacks one of its characters.

// Pixels per SVG px, for half-pixel precision.
const SCALE = 2
// A row's height and the baseline's place in it, in em: room above for
// accents and below for descenders.
const ROW_EM = 2
const BASELINE_EM = 1.4
// Space left of the origin, in em, for a glyph that reaches past it.
const MARGIN_EM = 1
// Room per character, in em: wide enough for any glyph but the widest emoji.
const CHAR_EM = 1.5

// The key of a text and its style in the widths measureTexts returns.
export function textKey(text, { fontSize, fontWeight, mono }) {
  return `${mono ? 'mono' : 'sans'}|${fontSize}|${fontWeight}|${text}`
}

function escapeXml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// Widths in px by textKey for `entries`, [text, style] pairs as
// beautiful-mermaid's measureText receives them. `font` is the font option
// the picture is drawn with, and `fonts` the stacks pickFonts chose. A text
// with nothing drawn (spaces) is left out, so it keeps the estimate.
export function measureTexts(entries, fonts, font, Resvg) {
  const rows = [...new Map(entries.map(([text, style]) => [textKey(text, style), { text, style }])).entries()]
  const widths = new Map()
  if (rows.length === 0) return widths

  let top = 0
  let width = 0
  const texts = rows.map(([key, { text, style }]) => {
    const size = style.fontSize
    const row = { key, top, height: size * ROW_EM, margin: size * MARGIN_EM }
    width = Math.max(width, size * (MARGIN_EM * 2 + [...text].length * CHAR_EM))
    top += row.height
    const family = escapeXml(style.mono ? fonts.monoStack : fonts.sansStack)
    row.svg = `<text x="${row.margin}" y="${row.top + size * BASELINE_EM}" font-family="${family}" font-size="${size}" font-weight="${style.fontWeight}">${escapeXml(text)}</text>`
    return row
  })
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(width)}" height="${Math.ceil(top)}">${texts.map(row => row.svg).join('')}</svg>`
  const image = new Resvg(svg, { fitTo: { mode: 'zoom', value: SCALE }, font }).render()
  const pixels = image.pixels
  const stride = image.width * 4

  for (const row of texts) {
    const y0 = Math.floor(row.top * SCALE)
    const y1 = Math.min(image.height, Math.ceil((row.top + row.height) * SCALE))
    // The rightmost column with a drawn pixel in the row, searched from the right.
    let right = -1
    for (let x = image.width - 1; x >= 0 && right < 0; x--) {
      for (let y = y0; y < y1; y++) {
        if (pixels[y * stride + x * 4 + 3] > 0) {
          right = x
          break
        }
      }
    }
    if (right >= 0) widths.set(row.key, Math.max(0, (right + 1) / SCALE - row.margin))
  }
  return widths
}
