// Run with `node --test tests/*.test.mjs`.
// bin/prune.mjs removes only diagram PNGs and JSON, and only inside the folder it is given
import assert from 'node:assert/strict'
import path from 'node:path'
import { test } from 'node:test'

import { prune } from '../bin/prune.mjs'

test('only pictures and their records in the folder are removed', () => {
  const removed = []
  const result = prune(
    { dir: '/cache/v2', names: ['a.png', 'a.json', 'notes.txt', '../outside.png', 'sub/b.png', 'sub\\c.png', 42] },
    file => removed.push(file),
  )
  assert.deepEqual(removed, [path.join('/cache/v2', 'a.png'), path.join('/cache/v2', 'a.json')])
  assert.deepEqual(result, { removed: 2 })
})

test('a file that cannot be removed is skipped and not counted', () => {
  const result = prune({ dir: '/cache/v2', names: ['busy.png', 'b.png'] }, file => {
    if (file.endsWith('busy.png')) throw new Error('EBUSY')
  })
  assert.deepEqual(result, { removed: 1 })
})
