// Run with `node --test tests/*.test.mjs`.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'

import { pickFonts } from '../bin/fonts.mjs'
import { measureTexts, textKey } from '../bin/measure.mjs'

const require = createRequire(import.meta.url)
const { Resvg } = require('@resvg/resvg-js')

const fonts = pickFonts({ font: 'auto' })
const font = { loadSystemFonts: false, fontFiles: fonts.files, defaultFontFamily: fonts.sans?.family ?? 'sans-serif' }
const SANS = { fontSize: 13, fontWeight: 500, mono: false }

// The width of one text as measureTexts returns it.
const widthOf = (text, style = SANS) => measureTexts([[text, style]], fonts, font, Resvg).get(textKey(text, style))

test('a longer text measures wider, and measuring texts together gives the widths of each alone', { skip: !fonts.sans && 'no sans-serif font' }, () => {
  const short = widthOf('Start')
  const long = widthOf('Start of the long label')
  assert.ok(short > 20 && short < 60, `Start: ${short}`)
  assert.ok(long > short * 3, `long: ${long}`)
  const both = measureTexts([['Start', SANS], ['Start of the long label', SANS], ['Start', SANS]], fonts, font, Resvg)
  assert.equal(both.size, 2)
  assert.ok(Math.abs(both.get(textKey('Start', SANS)) - short) <= 0.5)
  assert.ok(Math.abs(both.get(textKey('Start of the long label', SANS)) - long) <= 0.5)
})

test('the size, the weight and the monospace font change the width', { skip: !fonts.sans && 'no sans-serif font' }, () => {
  const base = widthOf('Measure me')
  assert.ok(widthOf('Measure me', { ...SANS, fontSize: 26 }) > base * 1.8)
  assert.ok(widthOf('iiii', { ...SANS, mono: true }) > widthOf('iiii'))
})

test('a text with nothing drawn is left out, so it keeps the estimate', () => {
  assert.equal(widthOf('   '), undefined)
  assert.equal(measureTexts([], fonts, font, Resvg).size, 0)
})

test('markup characters are measured as text', { skip: !fonts.sans && 'no sans-serif font' }, () => {
  assert.ok(widthOf('a < b & "c"') > widthOf('a'))
})
