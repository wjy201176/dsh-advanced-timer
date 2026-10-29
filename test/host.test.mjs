/**
 * Advanced Timer — Host half smoke test.
 *
 * Boots the plugin against a fake cordis context and drives the route the page
 * calls: the saved library of configurations must round-trip, survive a
 * restart, migrate an older single-series file, and never be trusted as-is.
 */

import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

const home = await mkdtemp(join(tmpdir(), 'adv-timer-host-'))
process.env.DSH_HOME = home

const { apply, dataDir, LibraryStore } = await import('../index.js')
const { cleanLibrary, cleanConfig, clampSeconds, MAX_CONFIGS, MAX_INTERVALS } = await import('../lib/series.js')

test('cleaning a configuration keeps the shape the page relies on', () => {
  const cleaned = cleanConfig({
    id: 'cfg-a',
    name: '  Morning   HIIT ',
    intervals: [
      { id: 'a', name: '  Warm   up ', seconds: 90 },
      { id: 'a', name: 'duplicate id', seconds: 30 },
      { id: 'bad id!', name: 'x'.repeat(200), seconds: -4 },
      'not a row',
    ],
    loop: true,
    voice: false,
  })
  assert.equal(cleaned.id, 'cfg-a')
  assert.equal(cleaned.name, 'Morning HIIT')
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

test('a configuration without an id gets one, so every configuration is addressable', () => {
  const first = cleanConfig({ name: 'A' })
  const second = cleanConfig({ name: 'B' })
  assert.match(first.id, /^[A-Za-z0-9_-]{1,64}$/)
  assert.notEqual(first.id, second.id)
  assert.equal(cleanConfig({}).name, '')
})

test('the five-second warning switch survives a round trip', () => {
  assert.equal(cleanConfig({ intervals: [{ id: 'a', name: 'A', seconds: 30 }], warn: false }).warn, false)
  assert.equal(cleanConfig({ warn: true }).warn, true)
  // An older saved file has no `warn` field at all: it must come back on.
  assert.equal(cleanConfig({ intervals: [] }).warn, true)
})

test('the per-second beep switch survives a round trip', () => {
  assert.equal(cleanConfig({ secondBeep: false }).secondBeep, false, 'an explicit off must stick')
  assert.equal(cleanConfig({ secondBeep: true }).secondBeep, true)
  assert.equal(cleanConfig({}).secondBeep, true)
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

test('an unknown shape becomes one empty configuration rather than an error', () => {
  for (const input of [null, undefined, 'nonsense', 42, [], { configs: 'no' }, {}]) {
    const cleaned = cleanLibrary(input)
    assert.equal(cleaned.version, 2)
    assert.equal(cleaned.configs.length, 1)
    assert.deepEqual(cleaned.configs[0].intervals, [])
    assert.equal(cleaned.activeId, cleaned.configs[0].id)
    assert.equal(cleaned.configs[0].loop, false)
    assert.equal(cleaned.configs[0].voice, true)
  }
})

test('the version-1 single-series file is read as a one-configuration library', () => {
  const legacy = { version: 1, intervals: [{ id: 'a', name: 'Warm up', seconds: 90 }], loop: true, updatedAt: 1234 }
  const cleaned = cleanLibrary(legacy)
  assert.equal(cleaned.version, 2)
  assert.equal(cleaned.configs.length, 1)
  assert.equal(cleaned.configs[0].intervals[0].name, 'Warm up')
  assert.equal(cleaned.configs[0].loop, true)
  assert.equal(cleaned.activeId, cleaned.configs[0].id)
  assert.equal(cleaned.updatedAt, 1234, 'the old stamp carries over')
})

test('several configurations survive cleaning, with unique ids and a valid active one', () => {
  const cleaned = cleanLibrary({
    activeId: 'cfg-taken',
    configs: [
      { id: 'cfg-taken', name: ' Morning ', intervals: [{ id: 'a', name: 'Warm up', seconds: 60 }] },
      { id: 'cfg-taken', name: 'Evening', intervals: [{ id: 'b', name: 'Sprint', seconds: 30 }], voice: false },
      'not a configuration',
    ],
  })
  assert.equal(cleaned.configs.length, 2)
  assert.notEqual(cleaned.configs[0].id, cleaned.configs[1].id, 'a duplicate configuration id must be replaced')
  assert.equal(cleaned.activeId, 'cfg-taken')
  assert.equal(cleaned.configs[1].name, 'Evening')
  assert.equal(cleaned.configs[1].voice, false, 'each configuration owns its own options')
  assert.equal(cleaned.configs[0].voice, true)
  // An active id that names nothing falls back to the first configuration.
  const fallen = cleanLibrary({ activeId: 'missing', configs: [{ id: 'one' }, { id: 'two' }] })
  assert.equal(fallen.activeId, 'one')
})

test('the library caps at the supported configuration and interval counts', () => {
  const configs = Array.from({ length: MAX_CONFIGS + 5 }, (_, index) => ({
    id: `cfg-${index}`,
    intervals: Array.from({ length: MAX_INTERVALS + 5 }, (_, row) => ({ name: `i${row}`, seconds: 10 })),
  }))
  const cleaned = cleanLibrary({ configs })
  assert.equal(cleaned.configs.length, MAX_CONFIGS)
  assert.equal(cleaned.configs[0].intervals.length, MAX_INTERVALS)
})

test('the library survives a store restart', async () => {
  const directory = join(home, 'store-restart')
  const first = new LibraryStore(directory)
  const saved = await first.update({
    activeId: 'cfg-b',
    configs: [
      { id: 'cfg-a', name: 'Morning', intervals: [{ id: 'a', name: 'Round trip', seconds: 125 }] },
      { id: 'cfg-b', name: 'Evening', intervals: [{ id: 'b', name: 'Sprint', seconds: 30 }], loop: true },
    ],
  })
  assert.equal(saved.configs.length, 2)
  assert.equal(saved.activeId, 'cfg-b')
  assert.ok(saved.updatedAt > 0, 'a save must be stamped so a client can order copies')

  const second = new LibraryStore(directory)
  const reread = second.get()
  assert.equal(reread.configs.length, 2)
  assert.equal(reread.configs[0].intervals[0].seconds, 125)
  assert.equal(reread.configs[1].name, 'Evening')
  assert.equal(reread.configs[1].loop, true)
  assert.equal(reread.updatedAt, saved.updatedAt, 'the stamp must survive the round trip')
  assert.match(await readFile(join(directory, 'library.json'), 'utf8'), /Evening/)
})

test('a saved version-1 series is migrated into the library file', async () => {
  const directory = join(home, 'legacy-migration')
  const legacy = {
    version: 1,
    intervals: [
      { id: 'a', name: 'Warm up', seconds: 90 },
      { id: 'b', name: 'Sprint', seconds: 30 },
    ],
    loop: true,
    voice: true,
    beep: true,
    warn: true,
    secondBeep: true,
    updatedAt: 777,
  }
  await mkdir(directory, { recursive: true })
  await writeFile(join(directory, 'series.json'), JSON.stringify(legacy), 'utf8')
  const store = new LibraryStore(directory)
  const value = store.get()
  assert.equal(value.configs.length, 1)
  assert.equal(value.configs[0].intervals.length, 2)
  assert.equal(value.configs[0].intervals[1].name, 'Sprint')
  assert.equal(value.configs[0].loop, true)
  assert.match(await readFile(join(directory, 'library.json'), 'utf8'), /Sprint/, 'the migration is written through')
  // The old file is kept as a backup, not deleted.
  assert.match(await readFile(join(directory, 'series.json'), 'utf8'), /"version":\s*1/)
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

test('the route serves and saves the whole library', async () => {
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
  await handler(request('GET', '/advanced-timer/api/library'), empty)
  assert.equal(empty.status, 200)
  const emptyValue = JSON.parse(empty.body).value
  assert.equal(emptyValue.version, 2)
  assert.equal(emptyValue.configs.length, 1)
  assert.deepEqual(emptyValue.configs[0].intervals, [])

  const saved = response()
  await handler(
    request('PUT', '/advanced-timer/api/library', {
      library: {
        activeId: 'cfg-b',
        configs: [
          { id: 'cfg-a', name: 'Morning', intervals: [{ name: 'Warm up', seconds: 90 }], loop: true },
          { id: 'cfg-b', name: 'Evening', intervals: [{ name: 'Sprint', seconds: 30 }] },
        ],
      },
    }),
    saved,
  )
  assert.equal(saved.status, 200)
  const value = JSON.parse(saved.body).value
  assert.equal(value.configs.length, 2)
  assert.equal(value.activeId, 'cfg-b')
  assert.equal(value.configs[0].intervals[0].seconds, 90)
  assert.equal(value.configs[1].name, 'Evening')

  const reread = response()
  await handler(request('GET', '/advanced-timer/api/library'), reread)
  const rereadValue = JSON.parse(reread.body).value
  assert.equal(rereadValue.configs.length, 2)
  assert.equal(rereadValue.configs[0].intervals[0].name, 'Warm up')

  const missing = response()
  await handler(request('GET', '/advanced-timer/api/nope'), missing)
  assert.equal(missing.status, 404)

  const refused = response()
  await handler(request('DELETE', '/advanced-timer/api/library'), refused)
  assert.equal(refused.status, 405)
  assert.match(refused.headers.allow, /PUT/)

  assert.equal(dataDir(), join(home, 'advanced-timer'))
})

// Windows can briefly hold a handle on a directory that was just written; the
// OS cleans the temp directory up, so a failed cleanup must not fail the suite.
try {
  await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
} catch {
  /* cleanup is best-effort */
}
