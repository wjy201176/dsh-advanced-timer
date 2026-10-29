/**
 * Advanced Timer — Host half smoke test.
 *
 * Boots the plugin against a fake cordis context and drives the route the page
 * calls: the saved series must round-trip, survive a restart, and never be
 * trusted as-is.
 */

import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

const home = await mkdtemp(join(tmpdir(), 'adv-timer-host-'))
process.env.DSH_HOME = home

const { apply, dataDir, SeriesStore } = await import('../index.js')
const { cleanSeries, clampSeconds, MAX_INTERVALS } = await import('../lib/series.js')

test('cleaning a series keeps the shape the page relies on', () => {
  const cleaned = cleanSeries({
    intervals: [
      { id: 'a', name: '  Warm   up ', seconds: 90 },
      { id: 'a', name: 'duplicate id', seconds: 30 },
      { id: 'bad id!', name: 'x'.repeat(200), seconds: -4 },
      'not a row',
    ],
    loop: true,
    voice: false,
  })
  assert.equal(cleaned.intervals.length, 3)
  assert.equal(cleaned.intervals[0].name, 'Warm up')
  assert.equal(cleaned.intervals[0].seconds, 90)
  assert.notEqual(cleaned.intervals[1].id, 'a', 'a duplicate id must be replaced, not dropped')
  assert.equal(cleaned.intervals[2].name.length, 80)
  assert.equal(cleaned.intervals[2].seconds, 1, 'a negative length clamps to the minimum, not to the default')
  assert.equal(cleaned.loop, true)
  assert.equal(cleaned.voice, false)
  assert.equal(cleaned.beep, true, 'beep defaults on')
  assert.equal(cleaned.warn, true, 'the five-second warning defaults on')
  assert.equal(cleaned.secondBeep, true, 'the per-second beep defaults on')
})

test('the five-second warning switch survives a round trip', () => {
  const off = cleanSeries({ intervals: [{ id: 'a', name: 'A', seconds: 30 }], warn: false })
  assert.equal(off.warn, false, 'an explicit off must not be overridden by the default')
  const on = cleanSeries({ intervals: [{ id: 'a', name: 'A', seconds: 30 }], warn: true })
  assert.equal(on.warn, true)
  // An older saved file has no `warn` field at all: it must come back on.
  const legacy = cleanSeries({ intervals: [{ id: 'a', name: 'A', seconds: 30 }] })
  assert.equal(legacy.warn, true)
})

test('the per-second beep switch survives a round trip', () => {
  assert.equal(cleanSeries({ secondBeep: false }).secondBeep, false, 'an explicit off must stick')
  assert.equal(cleanSeries({ secondBeep: true }).secondBeep, true)
  // An older saved file has no `secondBeep` field: it comes back on.
  assert.equal(cleanSeries({}).secondBeep, true)
  assert.equal(cleanSeries({ intervals: [] }).secondBeep, true)
})

test('lengths are clamped to the supported range', () => {
  // Absent or non-numeric: the default length, because there is nothing to clamp.
  assert.equal(clampSeconds(undefined), 60)
  assert.equal(clampSeconds(null), 60)
  assert.equal(clampSeconds(''), 60)
  assert.equal(clampSeconds(Number.NaN), 60)
  assert.equal(clampSeconds('abc'), 60)
  // A number out of range is clamped, not defaulted: an emptied row is 1 s.
  assert.equal(clampSeconds(0), 1)
  assert.equal(clampSeconds(-5), 1)
  assert.equal(clampSeconds(0.4), 1)
  assert.equal(clampSeconds(1e9), 86_400)
  assert.equal(clampSeconds('45'), 45)
})

test('an unknown shape becomes an empty series rather than an error', () => {
  for (const input of [null, undefined, 'nonsense', 42, [], { intervals: 'no' }]) {
    const cleaned = cleanSeries(input)
    assert.deepEqual(cleaned.intervals, [])
    assert.equal(cleaned.loop, false)
    assert.equal(cleaned.voice, true)
  }
})

test('the series survives a store restart', async () => {
  const directory = join(home, 'store-restart')
  const first = new SeriesStore(directory)
  const saved = await first.update({ intervals: [{ id: 'a', name: 'Round trip', seconds: 125 }] })
  assert.equal(saved.intervals[0].seconds, 125)
  assert.ok(saved.updatedAt > 0, 'a save must be stamped so a client can order copies')

  const second = new SeriesStore(directory)
  const reread = second.get()
  assert.equal(reread.intervals.length, 1)
  assert.equal(reread.intervals[0].name, 'Round trip')
  assert.equal(reread.intervals[0].seconds, 125)
  assert.equal(reread.updatedAt, saved.updatedAt, 'the stamp must survive the round trip')
})

test('the series caps at the supported row count', async () => {
  const store = new SeriesStore(join(home, 'cap'))
  const intervals = Array.from({ length: MAX_INTERVALS + 10 }, (_, index) => ({ name: `i${index}`, seconds: 10 }))
  const saved = await store.update({ intervals })
  assert.equal(saved.intervals.length, MAX_INTERVALS)
})

/** A minimal route table: records handlers so the test can call them directly. */
function fakeWebServer() {
  const routes = new Map()
  return {
    routes,
    register(route) {
      routes.set(`${route.kind}:${route.path}`, route)
      return () => routes.delete(`${route.kind}:${route.path}`)
    },
  }
}

function request(method, path, body) {
  const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body))]
  return {
    method,
    url: path,
    headers: { host: '127.0.0.1:1' },
    socket: { remoteAddress: '127.0.0.1' },
    on(event, handler) {
      if (event === 'data') for (const chunk of chunks) handler(chunk)
      if (event === 'end') handler()
      return this
    },
    destroy() {},
  }
}

function response() {
  return {
    status: 0,
    headers: {},
    body: '',
    writeHead(status, headers) {
      this.status = status
      Object.assign(this.headers, headers ?? {})
    },
    end(body) {
      if (body !== undefined) this.body += Buffer.isBuffer(body) ? body.toString('utf8') : String(body)
    },
  }
}

test('the route serves and saves the series', async () => {
  const webServer = fakeWebServer()
  const ctx = {
    logger: { info() {}, warn() {} },
    get: (name) => (name === 'webServer' ? webServer : undefined),
    inject(names, callback) {
      callback({ webServer })
      return () => {}
    },
  }
  apply(ctx, {})
  assert.ok(webServer.routes.has('prefix:/advanced-timer/api'), 'the API prefix must be registered')

  const handler = webServer.routes.get('prefix:/advanced-timer/api').handler

  const empty = response()
  await handler(request('GET', '/advanced-timer/api/series'), empty)
  assert.equal(empty.status, 200)
  assert.deepEqual(JSON.parse(empty.body).value.intervals, [])

  const saved = response()
  await handler(
    request('POST', '/advanced-timer/api/series', { series: { intervals: [{ name: 'Warm up', seconds: 90 }], loop: true } }),
    saved,
  )
  assert.equal(saved.status, 200)
  const value = JSON.parse(saved.body).value
  assert.equal(value.intervals[0].name, 'Warm up')
  assert.equal(value.loop, true)

  const reread = response()
  await handler(request('GET', '/advanced-timer/api/series'), reread)
  assert.equal(JSON.parse(reread.body).value.intervals[0].seconds, 90)

  const missing = response()
  await handler(request('GET', '/advanced-timer/api/nope'), missing)
  assert.equal(missing.status, 404)

  assert.equal(dataDir(), join(home, 'advanced-timer'))
})

await rm(home, { recursive: true, force: true })
