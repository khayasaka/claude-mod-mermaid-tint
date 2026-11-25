// Removes old pictures from the fallback cache folder (mermaid-tint in XDG_CACHE_HOME or ~/.cache).
// The mod (pruneFallback in hooks/register.tsx) picks the files by modification time and passes them on standard input
// as `{ dir, names }`. The mod's $.fs has no way to remove a file, so only the deletion happens here.
// It writes the number removed to standard output as `{ removed }`.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Removes only the diagram PNGs and the JSON beside them.
// A name holding a path separator could point outside dir, so it is left alone.
const NAME = /^[^\\/]+\.(png|json)$/

export function prune({ dir, names }, remove = file => fs.rmSync(file, { force: true })) {
  let removed = 0
  for (const name of names) {
    if (typeof name !== 'string' || !NAME.test(name)) continue
    try {
      remove(path.join(dir, name))
      removed += 1
    } catch {
      // A file that can't be removed (open in another process, say) is tried again next session
    }
  }
  return { removed }
}

// Reads standard input only when run directly with node, not when a test imports prune
if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const input = JSON.parse(fs.readFileSync(0, 'utf8'))
  process.stdout.write(JSON.stringify(prune(input)))
}
