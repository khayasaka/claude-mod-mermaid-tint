import type { EngineInterface, Register } from 'claude-code'

import { splitReply } from './parse'
import { diagramStyle, parseColors, type ColorKey, type DiagramStyle } from './support'
import { mathSpans, type MathSpan } from './tex'
// Imported so the type check includes the $.state contract (types/index.d.ts)
import type { MermaidTintStateKey } from '../types'

// Part of every cache key: bump it when bin/render.mjs draws differently.
const VERSION = 2
// A revision that only goes into the cache key, raised when a change draws diagrams differently with the same options (1: edge steps removed, 2: arrow heads turned, 3: two-cell letters in box drawing, and pie, timeline and mindmap drawn instead of kept as errors, 4: box colors for timeline periods and mindmap branches, 5: wider padding in timeline boxes, 6: default fonts on Windows, so `font` set to `auto` draws labels there).
// It is kept apart from VERSION: raising VERSION renames the cache folder (v2), and pruneFallback would stop finding the old pictures in the fallback folder
const LOCAL_REVISION = 6
// Pixels per terminal row in the pictures; the terminal scales each picture
// to its cells, so this only sets how sharp they are.
const ROW_PX = 48
// The themes beautiful-mermaid ships; `theme` names one of them or `auto`.
const THEMES = [
  'zinc-light',
  'zinc-dark',
  'tokyo-night',
  'tokyo-night-storm',
  'tokyo-night-light',
  'catppuccin-mocha',
  'catppuccin-latte',
  'nord',
  'nord-light',
  'dracula',
  'github-light',
  'github-dark',
  'solarized-light',
  'solarized-dark',
  'one-dark',
]

// Added to the system prompt where the mod draws pictures, so Claude knows
// a diagram will be seen as one and writes the kinds the renderer reads.
const DIAGRAM_INSTRUCTION = [
  '# Diagrams in replies',
  'This terminal draws Mermaid diagrams in your replies as pictures (the mermaid-tint plugin renders them).',
  'When a diagram explains something better than prose would (an architecture, a flow of data or control, a state machine, the calls between components, a class or entity model), write it as a fenced code block with the language mermaid, on its own at the top level of the reply rather than inside a list item.',
  'Use flowchart (graph TD or graph LR), sequenceDiagram, stateDiagram-v2, classDiagram, erDiagram, xychart-beta, pie, timeline or mindmap; other kinds are shown as code. Write node ids in ASCII letters and digits; labels may be in any language.',
  'Keep a diagram small enough to read in a terminal: about 12 nodes at most, each label a few words on one line (no <br/>), a decision a short question, details in the text around it. Prefer graph TD for long chains, which grow wide in graph LR.',
].join('\n')

type Picture = { file: string; columns: number; rows: number }
type Art = { text: string; columns: number; rows: number }
type Entry = Picture | Art | { error: string }
// `math`: the formulas in `source`, which the renderer puts in as Unicode
// text where the diagram's structure stays as it was.
type Job = { source: string; math: MathSpan[]; kind: 'png' | 'text'; maxColumns: number; maxRows: number }
type Options = Readonly<Record<string, unknown>>

const entries = new Map<string, Entry>()
const queue = new Map<string, Job>()
// Keys the running render process holds, so a redraw meanwhile does not queue them again.
const inflight = new Set<string>()
// The last drawing of each diagram, shown while the same diagram renders at a
// new width.
const lastDrawn = new Map<string, Picture | Art>()
// The base64 of each diagram's PNG, so that Image gets the picture as data rather than as a file path.
// A terminal on Windows can't open a WSL path (~/.cache/mermaid-inline in mermaid-inline 0.1.3), so a Claude Code running in WSL drew empty frames there.
const pngData = new Map<string, string>()
// The most Image takes as { png } (2 MiB). A larger picture, or one that can't be read, is passed as a file path.
const PNG_DATA_MAX_BYTES = 2 * 1024 * 1024
// A note for the model, added once to the next prompt, when node_modules is missing.
// Claude Code installs no npm packages for a plugin loaded from a folder, and without them diagrams stay code with no visible reason.
// The mod doesn't run npm ci itself: Claude runs it with Bash, so the user's permission rules apply.
let packagesNotice: string | undefined
// The session's scratchpad folder. Diagrams are cached there so they are cleaned up with the session's transcript:
// Claude Code removes the scratchpad when it removes the transcript after cleanupPeriodDays (30 days by default).
// Pictures kept in XDG_CACHE_HOME or ~/.cache stayed after their session was gone.
const SCRATCHPAD_DIR = { plugin: 'mermaid-tint', key: 'scratchpadDir' satisfies MermaidTintStateKey } as const
// How many days pictures stay in the fallback folder by default, matching Claude Code's default cleanupPeriodDays (30)
const DEFAULT_CLEANUP_DAYS = 30
let isRendering = false

// The picture geometry: the terminal font's cell (height over width) and the
// cell height in ems of the font, worked out from the terminal's font at
// session start or taken from the user's settings.
let geometry = { cellRatio: 2.125, lineEm: 1.308 }
let terminal: { background?: string; foreground?: string } = {}
let config = {
  node: 'node',
  cacheDir: '',
  style: 'off' as DiagramStyle,
  teach: true,
  textScale: 1,
  theme: 'auto',
  overrides: {} as Partial<Record<ColorKey, string>>,
  font: 'auto',
  prefersDark: true,
  // Whether each box gets its own color (bin/box-colors.mjs)
  boxColors: true,
}
// What bin/terminal.mjs made of the terminal, and what the options held, for /mermaid-tint.
let fontReport = 'not looked up'
let colorReport = 'not looked up'
let optionNotes: string[] = []

function numberOption(options: Options, key: string, fallback: number): number {
  const value = options[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function stringOption(options: Options, key: string, fallback: string): string {
  const value = options[key]
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : fallback
}

// Joins path segments with the separator the base already uses, so a Windows folder (C:\...\scratchpad) doesn't end in /mermaid-tint/v2.
// The module has no Node, so node:path isn't available, and $ has no way to ask for the platform's separator.
// A base without a backslash (POSIX, or a Windows path written with /) keeps using /.
function joinPath(base: string, ...parts: string[]): string {
  const separator = base.includes('\\') ? '\\' : '/'
  return [base.replace(/[\\/]+$/, ''), ...parts].join(separator)
}

// The settings a drawing depends on, beside the diagram itself.
function drawingSettings() {
  return {
    rowPx: ROW_PX,
    ...geometry,
    textScale: config.textScale,
    theme: config.theme,
    overrides: config.overrides,
    terminal,
    prefersDark: config.prefersDark,
    font: config.font,
    boxColors: config.boxColors,
  }
}

// cyrb53 by bryc, public domain (linked in the README): a short stable key
// for the cache file names.
function keyOf(job: Job): string {
  const s = `${VERSION}.${LOCAL_REVISION}|${JSON.stringify(drawingSettings())}|${job.kind}|${job.maxColumns}|${job.maxRows}|${job.source}|${JSON.stringify(job.math)}`
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0')
}

type TerminalAnswer = {
  cell: { ok: true; family: string; file?: string; size: number; cell_aspect: number; line_height: number } | { ok: false; reason: string }
  colors: { ok: true; background: string; foreground: string; source: string } | { ok: false; reason: string }
}

// Reads the terminal's font cell and colors off its config; on any failure
// the settings' numbers and the theme's colors stay.
async function probeTerminal($: EngineInterface, name: string, measureFont: boolean): Promise<void> {
  try {
    const { exitCode, stdout, stderr } = await $.process.run([config.node, `${$.plugin.root}/bin/terminal.mjs`], {
      stdin: JSON.stringify({ terminal: name, prefersDark: config.prefersDark }),
      timeoutMs: 10_000,
    })
    if (exitCode !== 0) {
      const reason = stderr.trim().split('\n').pop() ?? `exit ${exitCode}`
      fontReport = `lookup failed: ${reason}`
      colorReport = `lookup failed: ${reason}`
      return
    }
    const answer = JSON.parse(stdout) as TerminalAnswer
    if (measureFont) {
      if (answer.cell.ok) {
        geometry = { cellRatio: answer.cell.cell_aspect, lineEm: answer.cell.line_height }
        fontReport = `${answer.cell.family} ${answer.cell.size}pt${answer.cell.file ? ` (${answer.cell.file})` : ''}`
      } else {
        fontReport = `not found (${answer.cell.reason}); using the settings`
      }
    }
    if (answer.colors.ok) {
      terminal = { background: answer.colors.background, foreground: answer.colors.foreground }
      colorReport = `background ${answer.colors.background}, text ${answer.colors.foreground} (${answer.colors.source})`
    } else {
      colorReport = `not found (${answer.colors.reason}); using Claude Code's theme`
    }
  } catch (error) {
    fontReport = `lookup failed: ${String(error)}`
    colorReport = fontReport
  }
}

// Finds a diagram's drawing in memory or in the on-disk cache, and queues it
// for rendering when neither has it.
async function lookup($: EngineInterface, job: Job): Promise<Entry | undefined> {
  const id = keyOf(job)
  const known = entries.get(id)
  if (known !== undefined || queue.has(id) || inflight.has(id)) return known
  const sidecar = joinPath(config.cacheDir, `${id}.json`)
  try {
    if (await $.fs.exists(sidecar)) {
      const entry = JSON.parse(await $.fs.read(sidecar)) as Entry
      entries.set(id, entry)
      return entry
    }
  } catch {
    // An unreadable cache entry is rendered again.
  }
  queue.set(id, job)
  return undefined
}

// Renders every queued diagram in one process, then redraws so the drawings
// replace the code drawn meanwhile. A failed process is kept in memory only,
// so the next session tries again.
async function drain($: EngineInterface): Promise<void> {
  if (isRendering || queue.size === 0) return
  isRendering = true
  const items = [...queue].map(([key, job]) => ({ key, ...job }))
  queue.clear()
  for (const item of items) inflight.add(item.key)
  try {
    const { exitCode, stdout, stderr } = await $.process.run([config.node, `${$.plugin.root}/bin/render.mjs`], {
      stdin: JSON.stringify({ items, outDir: config.cacheDir, ...drawingSettings() }),
      timeoutMs: 60_000,
    })
    if (exitCode === 0) {
      const { results } = JSON.parse(stdout) as { results: ({ key: string } & Entry)[] }
      for (const result of results) entries.set(result.key, result)
    } else {
      const reason = stderr.trim().split('\n').pop() ?? `exit ${exitCode}`
      for (const item of items) entries.set(item.key, { error: reason })
    }
  } catch (error) {
    for (const item of items) entries.set(item.key, { error: String(error) })
  } finally {
    for (const item of items) inflight.delete(item.key)
    isRendering = false
  }
  $.ui.invalidate('ui.render')
}

// Removes the pictures written more than `days` days ago from the fallback folder (XDG_CACHE_HOME or ~/.cache).
// Claude Code never cleans that folder, so pictures from sessions without a scratchpad would stay there.
// The files are picked here by modification time, and only the deletion is left to bin/prune.mjs, since $.fs has no way to remove a file.
// When nothing is old enough, no node process is started.
async function pruneFallback($: EngineInterface, dir: string, days: number): Promise<void> {
  try {
    const cutoff = (await $.clock.now()) - days * 24 * 60 * 60 * 1000
    const names = (await $.fs.list(dir))
      .filter(entry => entry.kind === 'file' && /\.(png|json)$/.test(entry.name) && entry.mtimeMs < cutoff)
      .map(entry => entry.name)
    if (names.length === 0) return
    await $.process.run([config.node, `${$.plugin.root}/bin/prune.mjs`], { stdin: JSON.stringify({ dir, names }), timeoutMs: 30_000 })
  } catch {
    // A missing folder, or a node that can't start, is ignored: it doesn't affect drawing
  }
}

function isDrawing(entry: Entry | undefined): entry is Picture | Art {
  return entry !== undefined && !('error' in entry)
}

// Reads a diagram's PNG and returns it as { png }; when it can't be read or is over the limit, returns { file }.
// The base64 is kept in pngData, so redrawing doesn't read the file again.
async function pictureSource($: EngineInterface, file: string): Promise<{ png: string } | { file: string; format: 'png' }> {
  const known = pngData.get(file)
  if (known !== undefined) return { png: known }
  const base64 = await $.fs.read(file, { as: 'bytes' }).then(
    bytes => bytes.base64,
    () => undefined,
  )
  // A picture that couldn't be read is passed as a path, for terminals that can open it (such as on native Windows)
  if (typeof base64 !== 'string' || base64 === '' || (base64.length * 3) / 4 > PNG_DATA_MAX_BYTES) return { file, format: 'png' }
  pngData.set(file, base64)
  return { png: base64 }
}

export const register: Register = (on, options) => {
  geometry = {
    cellRatio: numberOption(options, 'cell_aspect', geometry.cellRatio),
    lineEm: numberOption(options, 'line_height', geometry.lineEm),
  }

  on('session.start', async ($, e, next) => {
    const env = {
      TERM_PROGRAM: await $.env.get('TERM_PROGRAM'),
      TERM: await $.env.get('TERM'),
      KITTY_WINDOW_ID: await $.env.get('KITTY_WINDOW_ID'),
      TMUX: await $.env.get('TMUX'),
    }
    const settings = (await $.settings.read()) as { theme?: unknown; cleanupPeriodDays?: unknown }
    // Use the scratchpad when it is known; only sessions without one (API key logins and the like) use the fallback folder
    const scratchpad = (await $.state.get(SCRATCHPAD_DIR)).value ?? ''
    // On Windows without HOME, use USERPROFILE.
    // Without it the home was empty and the cache landed at the root of the drive (/.cache)
    const home = (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE')) ?? ''
    const fallbackHome = (await $.env.get('XDG_CACHE_HOME')) ?? joinPath(home, '.cache')
    const cacheHome = scratchpad !== '' ? scratchpad : fallbackHome
    const theme = stringOption(options, 'theme', 'auto').toLowerCase()
    const parsed = parseColors(stringOption(options, 'colors', ''))
    optionNotes = []
    if (theme !== 'auto' && !THEMES.includes(theme)) optionNotes.push(`theme "${theme}" is not one of auto, ${THEMES.join(', ')}; using auto`)
    if (parsed.rejected.length > 0) optionNotes.push(`colors ignored: ${parsed.rejected.join(' ')}`)
    // Checks that the packages bin/render.mjs uses are installed (beautiful-mermaid itself is bundled in vendor/)
    const hasPackages = await $.fs.exists(`${$.plugin.root}/node_modules/@resvg/resvg-js`)
    packagesNotice = undefined
    if (!hasPackages) {
      optionNotes.push(`node_modules is missing; run npm ci --ignore-scripts in ${$.plugin.root}`)
      packagesNotice =
        `[mermaid-tint] There is no node_modules in ${$.plugin.root}, so diagrams can't be drawn and mermaid code blocks are shown as written. ` +
        `Running npm ci --ignore-scripts in that folder fixes it. ` +
        `Tell the user before running it with Bash.`
    }
    config = {
      node: stringOption(options, 'node_path', 'node'),
      cacheDir: joinPath(cacheHome, 'mermaid-tint', `v${VERSION}`),
      style: diagramStyle(env, stringOption(options, 'mode', 'auto')),
      teach: options.teach_claude !== false,
      textScale: Math.min(3, Math.max(0.3, numberOption(options, 'text_scale', 1))),
      theme: THEMES.includes(theme) ? theme : 'auto',
      overrides: parsed.colors,
      font: stringOption(options, 'font', 'auto'),
      prefersDark: !(typeof settings.theme === 'string' && settings.theme.startsWith('light')),
      boxColors: options.box_colors !== false,
    }
    fontReport = 'set by hand (font_metrics is manual)'
    colorReport = 'not looked up in this terminal'
    if (config.style === 'pictures') {
      const isGhostty = env.TERM_PROGRAM === 'ghostty' || env.TERM === 'xterm-ghostty'
      const isKitty = Boolean(env.TERM?.includes('kitty')) || Boolean(env.KITTY_WINDOW_ID)
      const measureFont = stringOption(options, 'font_metrics', 'auto') !== 'manual'
      if (isGhostty || isKitty) await probeTerminal($, isGhostty ? 'ghostty' : 'kitty', measureFont)
      else if (measureFont) fontReport = 'no font rules for this terminal; using the settings'
    }
    if (config.style !== 'off') {
      $.clock.every(200, () => {
        void drain($)
      })
    } else {
      // With diagrams turned off, missing packages do no harm, so nothing is reported
      packagesNotice = undefined
    }
    await $.command.register({
      name: 'mermaid-tint',
      description: 'Show whether mermaid-tint draws diagrams here, and the font and colors it uses',
    })
    // Removes old pictures from the fallback folder. Done in every session, scratchpad or not, to clear pictures an earlier session left there
    const days = typeof settings.cleanupPeriodDays === 'number' && settings.cleanupPeriodDays > 0 ? settings.cleanupPeriodDays : DEFAULT_CLEANUP_DAYS
    await pruneFallback($, joinPath(fallbackHome, 'mermaid-tint', `v${VERSION}`), days)
    return next(e)
  })

  on('command.run', { command: 'mermaid-tint' }, async () => {
    const notes = optionNotes.map(note => `Note: ${note}`)
    if (config.style === 'off') return { text: ['Diagrams: left as code (mode is off)', ...notes].join('\n') }
    if (config.style === 'text') {
      const why = stringOption(options, 'mode', 'auto') === 'text' ? 'mode is text' : 'this terminal shows no kitty-graphics pictures'
      return { text: [`Diagrams: drawn as Unicode box drawing (${why})`, ...notes].join('\n') }
    }
    const overrides = Object.entries(config.overrides)
      .map(([name, value]) => `${name}=${value}`)
      .join(' ')
    const lines = [
      'Diagrams: drawn as pictures',
      `Terminal font: ${fontReport}`,
      `Cell: height/width ${geometry.cellRatio.toFixed(3)}, ${geometry.lineEm.toFixed(3)} em tall`,
      `Terminal colors: ${colorReport}`,
      `Design: theme ${config.theme}${overrides ? `, colors ${overrides}` : ''}, font ${config.font}, text ${config.textScale}x, box colors ${config.boxColors ? 'on' : 'off'}`,
      `Pictures: ${config.cacheDir}`,
      ...notes,
    ]
    return { text: lines.join('\n') }
  })

  // Keeps the scratchpad_dir from the SessionStart hook's input as the diagram cache.
  // The hooks documentation lists scratchpad_dir among the common inputs, but the mod type declarations don't have it yet, so its type is checked here.
  // The cacheDir in config is replaced here too, so it works when this arrives after session.start.
  on('classic.SessionStart', async ($, e, next) => {
    const dir = (e as { scratchpad_dir?: unknown }).scratchpad_dir
    if (typeof dir === 'string' && dir !== '') {
      await $.state.set(SCRATCHPAD_DIR, dir)
      config = { ...config, cacheDir: joinPath(dir, 'mermaid-tint', `v${VERSION}`) }
    }
    return next(e)
  })

  // Adds the missing node_modules note to the session's first prompt, once.
  // Slash commands and meta prompts don't carry it.
  on('prompt.submit', ($, e, next) => {
    if (packagesNotice === undefined || e.command !== undefined || e.isMeta === true) return next(e)
    const context = packagesNotice
    packagesNotice = undefined
    return next({ ...e, context: [...(e.context ?? []), context] })
  })

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    if (config.style !== 'pictures' || !config.teach || !e.surfaces.includes('terminal')) return composed
    return { sections: [...composed.sections, { id: 'mermaid-tint:diagrams', text: DIAGRAM_INSTRUCTION, scope: 'session' as const }] }
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || config.style === 'off') return next(e)
    const segments = splitReply(e.props.text)
    if (!segments.some(segment => segment.kind === 'mermaid')) return next(e)

    // The two-column gutter and the empty last column leave this much room;
    // a diagram is shrunk to the screen's height too, down to a point.
    const width = Math.max(10, (e.viewport?.columns ?? 80) - 3)
    const height = Math.max(10, (e.viewport?.rows ?? 40) - 8)
    const kind = config.style === 'pictures' ? 'png' : 'text'
    const { Box, Image, Text } = $.ui.resolve(e)

    // Each run of markdown is drawn by the plugins beneath and the engine, as
    // a reply of its own; each diagram is drawn here, or, until it has a
    // drawing or when it cannot be drawn, left to them as the code block.
    // Each part brings the blank row above it, as Claude Code's drawing of a
    // block does in the normal view, so whoever places it adds none. Where
    // Claude Code puts a message header above a reply instead, as in the ctrl+o
    // view, it leaves that row out, and a mod cannot tell those views apart.
    // Claude Code draws a block that does not open the reply with no gutter:
    // such a block gets the gutter here.
    // A part from inside a list item, a diagram or the rest of the item after
    // it, is moved in here by that item's indent. Its text comes without the
    // indent, because leading spaces do not indent markdown drawn on its own:
    // a nested bullet would come out at the top level. A diagram there starts
    // at the indent, under the item's text, instead of being centered like one
    // at the top level.
    const rows = []
    let isFirst = e.props.isFirstOfReply
    for (const segment of segments) {
      const indent = segment.indent ?? 0
      let drawing: Picture | Art | undefined
      if (segment.kind === 'mermaid') {
        // beautiful-mermaid draws no math, so the renderer gets each formula's
        // Unicode text with the diagram.
        const job: Job = { source: segment.source, math: mathSpans(segment.source), kind, maxColumns: Math.max(10, width - indent), maxRows: height }
        const entry = await lookup($, job)
        const lastKey = `${kind}|${segment.source}`
        if (isDrawing(entry)) lastDrawn.set(lastKey, entry)
        drawing = entry === undefined ? lastDrawn.get(lastKey) : isDrawing(entry) ? entry : undefined
      }
      if (segment.kind === 'text' || drawing === undefined) {
        const text = segment.kind === 'text' ? segment.text : segment.raw
        const drawn = await next({ ...e, props: { ...e.props, text, isFirstOfReply: isFirst } })
        if (drawn.type === 'engine' && !isFirst) {
          rows.push(
            <Box flexDirection="row">
              <Box width={2 + indent} flexShrink={0} />
              <Box flexDirection="column" flexGrow={1} flexShrink={1}>
                {drawn}
              </Box>
            </Box>,
          )
        } else if (indent > 0) {
          // A tree from a mod below brings its own gutter: move it in by the indent.
          rows.push(
            <Box flexDirection="column" paddingLeft={indent}>
              {drawn}
            </Box>,
          )
        } else {
          rows.push(drawn)
        }
      } else {
        const header = segment.kind === 'mermaid' ? (segment.source.trim().split('\n')[0] ?? '').trim() : ''
        const source = 'file' in drawing ? await pictureSource($, drawing.file) : undefined
        rows.push(
          <Box flexDirection="row" marginTop={1} paddingRight={1}>
            <Box width={2 + indent} flexShrink={0}>
              <Text>{isFirst ? '⏺' : ' '}</Text>
            </Box>
            {'file' in drawing ? (
              <Box flexDirection="row" flexGrow={1} justifyContent={indent > 0 ? 'flex-start' : 'center'}>
                <Image source={source ?? { file: drawing.file, format: 'png' }} columns={drawing.columns} rows={drawing.rows} alt={`[diagram: ${header}]`} />
              </Box>
            ) : (
              <Box flexDirection="column" flexShrink={1}>
                <Text wrap="truncate-end">{drawing.text}</Text>
              </Box>
            )}
          </Box>,
        )
      }
      isFirst = false
    }
    return <Box flexDirection="column">{rows}</Box>
  })
}
