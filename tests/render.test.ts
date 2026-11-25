import type { On } from 'claude-code'
import { expect, test, type Engine } from 'claude-code/testing'

const SESSION = { cwd: '/tmp', surface: 'terminal' as const, isInteractive: true }
const DIAGRAM = '```mermaid\ngraph LR\n  A --> B\n```'
const REPLY = 'Before.\n\n' + DIAGRAM + '\n\nAfter.'

// The engine beneath the plugin: no terminal variables, default settings, a
// cache that answers `cached` for every key (or holds nothing), and a message
// drawing that shows the text it was handed, a bullet marking the reply's
// first, or an engine element when `engineElement` is set.
// `png` makes reads of bytes (`as: 'bytes'`) return that base64.
// Without it the read fails and diagrams are passed as file paths.
// `packages: false` answers that the packages in node_modules are missing.
// `settings` is returned when the settings are read.
// `env` gives the environment variables that are read (any other is unset).
function engine(
  on: On,
  cached?: unknown,
  options: { engineElement?: boolean; png?: string; packages?: boolean; settings?: Record<string, unknown>; env?: Record<string, string> } = {},
) {
  on('session.start', async ($, e) => ({ cwd: e.cwd }))
  on('env.get', async ($, e) => ({ value: options.env?.[e.name] }))
  on('settings.read', async () => ({ value: options.settings ?? {} }))
  on('command.register', async ($, e) => ({ value: { command: e.name } }))
  on('clock.every', async () => ({ value: undefined }))
  on('prompt.submit', async ($, e) => ({ text: e.text, context: e.context }))
  on('fs.exists', async ($, e) => ({
    value: e.path.replaceAll('\\', '/').endsWith('node_modules/@resvg/resvg-js') ? options.packages !== false : cached !== undefined,
  }))
  on('fs.read', async ($, e) => {
    if (e.as !== 'bytes') return { value: JSON.stringify(cached) }
    if (options.png === undefined) throw new Error('not readable')
    return { value: { base64: options.png } }
  })
  on('ui.render', { component: 'AssistantMessage' }, async ($, e) => {
    if (options.engineElement) return { type: 'engine', ref: 1 } as never
    return { type: 'Text', props: {}, children: [(e.props.isFirstOfReply ? '● ' : '') + e.props.text] }
  })
}

async function draw($: Engine, text: string, isFirstOfReply = true) {
  return $.ui.mount({ plugin: 'mermaid-tint', surface: 'terminal', component: 'AssistantMessage', props: { text, isFirstOfReply } })
}

const PICTURE = { file: '/tmp/diagram.png', columns: 40, rows: 9 }

async function rowsOf(ui: Awaited<ReturnType<typeof draw>>) {
  const drawn = await ui.drawn()
  return drawn.type === 'Box' ? (drawn.children ?? []) : []
}

const ENGINE_IN_GUTTER = [{ type: 'Box', props: { width: 2 } }, { type: 'Box', children: [{ type: 'engine', ref: 1 }] }]

test('a diagram that opens the reply starts with the blank row Claude Code puts above a reply', { options: { mode: 'on', font_metrics: 'manual' } }, async ($, on) => {
  engine(on, PICTURE)
  await $.session.start(SESSION)
  const ui = await draw($, DIAGRAM + '\n\nAfter.')
  expect((await rowsOf(ui))[0]).toMatchObject({ type: 'Box', props: { marginTop: 1 } })
})

test('a diagram in a part that does not open the reply brings its own blank row', { options: { mode: 'on', font_metrics: 'manual' } }, async ($, on) => {
  engine(on, PICTURE)
  await $.session.start(SESSION)
  const ui = await draw($, DIAGRAM, false)
  expect((await rowsOf(ui))[0]).toMatchObject({ type: 'Box', props: { marginTop: 1 } })
})

test('a block Claude Code draws gets the gutter whenever it does not open the reply', { options: { mode: 'on', font_metrics: 'manual' } }, async ($, on) => {
  engine(on, PICTURE, { engineElement: true })
  await $.session.start(SESSION)
  const ui = await draw($, REPLY, false)
  const first = (await rowsOf(ui))[0]
  expect((first as { props?: { marginTop?: number } } | undefined)?.props?.marginTop ?? 0).toBe(0)
  expect(first).toMatchObject({ type: 'Box', props: { flexDirection: 'row' }, children: ENGINE_IN_GUTTER })
})

test('a tree from a mod below is placed as it comes, with no margin added', { options: { mode: 'on', font_metrics: 'manual' } }, async ($, on) => {
  engine(on, PICTURE)
  await $.session.start(SESSION)
  const ui = await draw($, REPLY)
  expect((await rowsOf(ui))[2]).toMatchObject({ type: 'Text', children: ['After.'] })
})

test('a reply without a diagram is left to the engine', { options: { mode: 'on', font_metrics: 'manual' } }, async ($, on) => {
  engine(on)
  await $.session.start(SESSION)
  const ui = await draw($, 'Just text.')
  expect((await ui.findAll({ type: 'Text' })).map(found => found.text)).toEqual(['● Just text.'])
})

test('a diagram still rendering shows its code block, and the text around it is drawn beneath', { options: { mode: 'on', font_metrics: 'manual' } }, async ($, on) => {
  engine(on)
  await $.session.start(SESSION)
  const ui = await draw($, REPLY)
  expect((await ui.findAll({ type: 'Text' })).map(found => found.text)).toEqual(['● Before.', DIAGRAM, 'After.'])
})

test('a drawn diagram replaces its code block with the picture', { options: { mode: 'on', font_metrics: 'manual' } }, async ($, on) => {
  engine(on, { file: '/tmp/diagram.png', columns: 40, rows: 9 })
  await $.session.start(SESSION)
  const ui = await draw($, REPLY)
  const image = await ui.find({ type: 'Image' })
  expect(image?.props).toMatchObject({ source: { file: '/tmp/diagram.png', format: 'png' }, columns: 40, rows: 9 })
  const texts = (await ui.findAll({ type: 'Text' })).map(found => found.text)
  expect(texts).toContain('● Before.')
  expect(texts).toContain('After.')
  expect(texts).not.toContain(DIAGRAM)
})

// The engine checks the start of an Image's { png } (signature and IHDR), so build a PNG head that holds a width and height
function pngHead(width: number, height: number): string {
  const bytes = new Uint8Array(33)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52])
  const view = new DataView(bytes.buffer)
  view.setUint32(16, width)
  view.setUint32(20, height)
  return btoa(String.fromCharCode(...bytes))
}

// A PNG that could be read goes as data, for a Claude Code in WSL drawn in a Windows terminal
test('a drawn diagram whose PNG can be read is handed to the Image as bytes', { options: { mode: 'on', font_metrics: 'manual' } }, async ($, on) => {
  const png = pngHead(320, 72)
  engine(on, { file: '/tmp/diagram.png', columns: 40, rows: 9 }, { png })
  await $.session.start(SESSION)
  const ui = await draw($, REPLY)
  const image = await ui.find({ type: 'Image' })
  expect(image?.props).toMatchObject({ source: { png }, columns: 40, rows: 9 })
})

test('a diagram that opens the reply carries the bullet', { options: { mode: 'on', font_metrics: 'manual' } }, async ($, on) => {
  engine(on, { file: '/tmp/diagram.png', columns: 40, rows: 9 })
  await $.session.start(SESSION)
  const ui = await draw($, DIAGRAM + '\n\nAfter.')
  const texts = (await ui.findAll({ type: 'Text' })).map(found => found.text)
  expect(texts).toEqual(['⏺', 'After.'])
})

const IN_LIST = '1. First\n   ```mermaid\n   graph LR\n     A --> B\n   ```\n\n   - more on the first\n2. Second'

test("a diagram in a list item is drawn at the item's indent, and the rest of the item beneath it", { options: { mode: 'on', font_metrics: 'manual' } }, async ($, on) => {
  engine(on, PICTURE, { engineElement: true })
  await $.session.start(SESSION)
  const ui = await draw($, IN_LIST)
  const [, diagram, rest, next] = await rowsOf(ui)
  expect(diagram).toMatchObject({ type: 'Box', props: { marginTop: 1 }, children: [{ type: 'Box', props: { width: 5 } }, { type: 'Box', props: { justifyContent: 'flex-start' } }] })
  // The test harness renumbers the engine elements' refs (1, 2, 3) in the order they appear in the drawn tree.
  // This reply has three of them (1. First, the rest of the item, 2. Second), so a ref of 1 can't be expected and refs aren't compared
  expect(rest).toMatchObject({ type: 'Box', props: { flexDirection: 'row' }, children: [{ type: 'Box', props: { width: 5 } }, { type: 'Box', children: [{ type: 'engine' }] }] })
  expect(next).toMatchObject({ type: 'Box', props: { flexDirection: 'row' }, children: [{ type: 'Box', props: { width: 2 } }, { type: 'Box', children: [{ type: 'engine' }] }] })
})

test('the rest of a list item after its diagram goes beneath without its indent, and a tree from a mod below is moved in by it', { options: { mode: 'on', font_metrics: 'manual' } }, async ($, on) => {
  engine(on, PICTURE)
  await $.session.start(SESSION)
  const ui = await draw($, IN_LIST)
  const rest = (await rowsOf(ui))[2]
  expect(rest).toMatchObject({ type: 'Box', props: { paddingLeft: 3 }, children: [{ type: 'Text', children: ['- more on the first'] }] })
})

test('a diagram in a list item still rendering shows its code block at the same indent', { options: { mode: 'on', font_metrics: 'manual' } }, async ($, on) => {
  engine(on)
  await $.session.start(SESSION)
  const ui = await draw($, IN_LIST)
  const block = (await rowsOf(ui))[1]
  expect(block).toMatchObject({ type: 'Box', props: { paddingLeft: 3 }, children: [{ type: 'Text', children: [DIAGRAM] }] })
})

test('in text mode a diagram is drawn as box drawing', { options: { mode: 'text' } }, async ($, on) => {
  engine(on, { text: '┌───┐\n│ A │\n└───┘', columns: 5, rows: 3 })
  await $.session.start(SESSION)
  const ui = await draw($, REPLY)
  expect((await ui.findAll({ type: 'Text' })).map(found => found.text)).toContain('┌───┐\n│ A │\n└───┘')
  expect(await ui.find({ type: 'Image' })).toBeUndefined()
})

test('a diagram that cannot be drawn keeps its code block', { options: { mode: 'on', font_metrics: 'manual' } }, async ($, on) => {
  engine(on, { error: 'Invalid mermaid header: "pie"' })
  await $.session.start(SESSION)
  const ui = await draw($, REPLY)
  expect((await ui.findAll({ type: 'Text' })).map(found => found.text)).toEqual(['● Before.', DIAGRAM, 'After.'])
})

test('with mode off a reply is drawn as written', { options: { mode: 'off' } }, async ($, on) => {
  engine(on, { file: '/tmp/diagram.png', columns: 40, rows: 9 })
  await $.session.start(SESSION)
  const ui = await draw($, REPLY)
  expect((await ui.findAll({ type: 'Text' })).map(found => found.text)).toEqual(['● ' + REPLY])
})

// A note when node_modules is missing
const PROMPT = { text: 'next', wait: false, origin: { kind: 'composer' as const } }

async function noticesOf($: Engine) {
  const result = await $.prompt.submit(PROMPT)
  return (result.context ?? []).filter(context => context.startsWith('[mermaid-tint]'))
}

test('without node_modules the next prompt carries one notice, and only once', { options: { mode: 'on', font_metrics: 'manual' } }, async ($, on) => {
  engine(on, undefined, { packages: false })
  await $.session.start(SESSION)
  const first = await noticesOf($)
  expect(first.length).toBe(1)
  expect(first[0]).toContain('npm ci --ignore-scripts')
  expect((await noticesOf($)).length).toBe(0)
})

test('with node_modules no notice is added', { options: { mode: 'on', font_metrics: 'manual' } }, async ($, on) => {
  engine(on)
  await $.session.start(SESSION)
  expect((await noticesOf($)).length).toBe(0)
})

test('with mode off a missing node_modules is not reported', { options: { mode: 'off' } }, async ($, on) => {
  engine(on, undefined, { packages: false })
  await $.session.start(SESSION)
  expect((await noticesOf($)).length).toBe(0)
})

// Diagrams are cached in the session's scratchpad
async function picturesLine($: Engine) {
  // origin and presentation are filled in by Claude Code, so the test passes them without matching their types
  const { text } = await $.command.run({ command: 'mermaid-tint', args: '', origin: { kind: 'composer' } } as never)
  return (text ?? '').split('\n').find(line => line.startsWith('Pictures: '))
}

test('the cache goes in the scratchpad SessionStart names, given before the session starts', { options: { mode: 'on', font_metrics: 'manual' } }, async ($, on) => {
  engine(on)
  on('classic.SessionStart', () => ({}))
  await $.classic.SessionStart({ source: 'startup', scratchpad_dir: '/tmp/claude/p/s1/scratchpad' } as never)
  await $.session.start(SESSION)
  expect(await picturesLine($)).toBe('Pictures: /tmp/claude/p/s1/scratchpad/mermaid-tint/v2')
})

test('the cache moves to the scratchpad when SessionStart comes after the session starts', { options: { mode: 'on', font_metrics: 'manual' } }, async ($, on) => {
  engine(on)
  on('classic.SessionStart', () => ({}))
  await $.session.start(SESSION)
  await $.classic.SessionStart({ source: 'startup', scratchpad_dir: '/tmp/claude/p/s2/scratchpad' } as never)
  expect(await picturesLine($)).toBe('Pictures: /tmp/claude/p/s2/scratchpad/mermaid-tint/v2')
})

// A Windows scratchpad uses backslashes, and the folders under it follow, both in SessionStart before and after the session starts
test('a Windows scratchpad keeps its backslashes in the cache folder', { options: { mode: 'on', font_metrics: 'manual' } }, async ($, on) => {
  engine(on)
  on('classic.SessionStart', () => ({}))
  await $.classic.SessionStart({ source: 'startup', scratchpad_dir: 'C:\\Temp\\claude\\s3\\scratchpad' } as never)
  await $.session.start(SESSION)
  expect(await picturesLine($)).toBe('Pictures: C:\\Temp\\claude\\s3\\scratchpad\\mermaid-tint\\v2')
  await $.classic.SessionStart({ source: 'clear', scratchpad_dir: 'C:\\Temp\\claude\\s4\\scratchpad\\' } as never)
  expect(await picturesLine($)).toBe('Pictures: C:\\Temp\\claude\\s4\\scratchpad\\mermaid-tint\\v2')
})

// Without HOME on Windows, the usual cache folder is joined under USERPROFILE with its own backslashes
test('a Windows USERPROFILE keeps its backslashes in the usual cache folder', { options: { mode: 'on', font_metrics: 'manual' } }, async ($, on) => {
  engine(on, undefined, { env: { USERPROFILE: 'C:\\Users\\taro' } })
  on('classic.SessionStart', () => ({}))
  await $.session.start(SESSION)
  expect(await picturesLine($)).toBe('Pictures: C:\\Users\\taro\\.cache\\mermaid-tint\\v2')
})

test('without a scratchpad the cache stays in the usual cache folder', { options: { mode: 'on', font_metrics: 'manual' } }, async ($, on) => {
  engine(on)
  on('classic.SessionStart', () => ({}))
  await $.classic.SessionStart({ source: 'startup' })
  await $.session.start(SESSION)
  expect(await picturesLine($)).toBe('Pictures: /.cache/mermaid-tint/v2')
})

// Old pictures in the fallback folder are removed at session start
const DAY = 24 * 60 * 60 * 1000
const NOW = 100 * DAY

// A fallback folder holding pictures from 40 and 10 days ago, a file that isn't a picture and a folder. Starting node records its argv and input
function fallbackFolder(on: On) {
  const runs: { argv: readonly string[]; stdin: unknown }[] = []
  const entry = { size: 0, isLink: false }
  on('clock.now', () => ({ value: NOW }))
  on('fs.list', ($, e) => ({
    value:
      // On Windows the separator arrives as a backslash, so compare with /
      e.path.replaceAll('\\', '/').endsWith('/.cache/mermaid-tint/v2')
        ? [
            { name: 'old.png', kind: 'file', mtimeMs: NOW - 40 * DAY, ...entry },
            { name: 'old.json', kind: 'file', mtimeMs: NOW - 40 * DAY, ...entry },
            { name: 'recent.png', kind: 'file', mtimeMs: NOW - 10 * DAY, ...entry },
            { name: 'notes.txt', kind: 'file', mtimeMs: NOW - 40 * DAY, ...entry },
            { name: 'old-folder', kind: 'dir', mtimeMs: 0, ...entry },
          ]
        : [],
  }))
  on('process.run', ($, e) => {
    runs.push({ argv: e.argv, stdin: JSON.parse(String(e.init?.stdin ?? 'null')) })
    return { value: { exitCode: 0, stdout: '{"removed":2}', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  return runs
}

test('pictures in the usual cache folder older than 30 days are removed at session start', { options: { mode: 'off' } }, async ($, on) => {
  engine(on)
  const runs = fallbackFolder(on)
  await $.session.start(SESSION)
  expect(runs.length).toBe(1)
  expect(runs[0]?.argv.at(-1)?.endsWith('/bin/prune.mjs')).toBe(true)
  expect(runs[0]?.stdin).toEqual({ dir: '/.cache/mermaid-tint/v2', names: ['old.png', 'old.json'] })
})

// On Windows without HOME, the fallback folder is under USERPROFILE (it used to be /.cache at the root of the drive)
test('without HOME the usual cache folder is under USERPROFILE', { options: { mode: 'off' } }, async ($, on) => {
  engine(on, undefined, { env: { USERPROFILE: 'C:/Users/taro' } })
  const runs = fallbackFolder(on)
  await $.session.start(SESSION)
  expect(runs[0]?.stdin).toEqual({ dir: 'C:/Users/taro/.cache/mermaid-tint/v2', names: ['old.png', 'old.json'] })
})

test('the age follows cleanupPeriodDays', { options: { mode: 'off' } }, async ($, on) => {
  engine(on, undefined, { settings: { cleanupPeriodDays: 7 } })
  const runs = fallbackFolder(on)
  await $.session.start(SESSION)
  expect(runs[0]?.stdin).toEqual({ dir: '/.cache/mermaid-tint/v2', names: ['old.png', 'old.json', 'recent.png'] })
})

test('node is not started when nothing is old enough', { options: { mode: 'off' } }, async ($, on) => {
  engine(on, undefined, { settings: { cleanupPeriodDays: 60 } })
  const runs = fallbackFolder(on)
  await $.session.start(SESSION)
  expect(runs.length).toBe(0)
})

test('a missing usual cache folder does not stop the session from starting', { options: { mode: 'off' } }, async ($, on) => {
  engine(on)
  on('fs.list', () => {
    throw new Error('ENOENT')
  })
  await $.session.start(SESSION)
  expect(await picturesLine($)).toBe(undefined)
})
