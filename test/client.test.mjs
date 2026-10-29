/**
 * Advanced Timer — Client half smoke test.
 *
 * Evaluates client.js the way the module loader does, runs its factory and
 * `apply`, and records what it registers. Then it drives the timer engine with
 * a fake clock: the engine is where the feature lives — a series that runs
 * back to back, announces each interval start, and keeps no gap when a tick is
 * late or the page was suspended.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = readFileSync(join(root, 'client.js'), 'utf8')

/** A React stand-in: components build elements, hooks keep the last value. */
function fakeReact() {
  return {
    createElement: (type, props, ...children) => ({ type, props, children }),
    useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
    useEffect: () => {},
    useCallback: (fn) => fn,
    useRef: (value) => ({ current: value }),
    useMemo: (fn) => fn(),
  }
}

function loadPlugin(windowExtras = {}) {
  let factory = null
  const sandbox = {
    window: { __ModuleLoader__: { load: (record) => { factory = record.factory } }, ...windowExtras },
    console,
    setInterval,
    clearInterval,
    setTimeout,
    clearTimeout,
    Date,
    JSON,
    Math,
    Number,
    String,
    Object,
    Array,
    Promise,
    fetch: undefined,
  }
  vm.createContext(sandbox)
  vm.runInContext(source, sandbox, { filename: 'client.js' })
  assert.equal(typeof factory, 'function', 'client.js must register a factory with the module loader')
  return factory((request) => {
    if (request === 'react') return fakeReact()
    throw new Error(`unexpected module request: ${request}`)
  })
}

/** Run `apply` against a fake Client context and return what it registered. */
function applyPlugin(body) {
  const registrations = []
  const effects = []
  const dictionaries = []
  const fakeSlots = {
    inject(owner, callback) {
      effects.push(owner)
      return callback()
    },
    register(options, component) {
      registrations.push({ options, component })
      return () => {}
    },
  }
  const fakeLocale = {
    register(namespace, dicts) {
      dictionaries.push({ namespace, dicts })
      return () => {}
    },
    bind(namespace) {
      return (key) => {
        const dictionary = dictionaries.find((entry) => entry.namespace === namespace)
        const table = dictionary?.dicts.en ?? {}
        return Object.hasOwn(table, key) ? table[key] : key
      }
    },
    getLocale: () => ({ active: 'en', locales: [], revision: 1 }),
  }
  const ctx = {
    slots: fakeSlots,
    locale: fakeLocale,
    get: (name) => (name === 'layout' ? { selectPanel() {} } : undefined),
    effect(fn) {
      effects.push(fn())
      return () => {}
    },
    inject(names, callback) {
      callback({})
      return () => {}
    },
  }
  body.apply(ctx)
  return { registrations, effects, dictionaries }
}

test('registers the sidebar row, the main panel and the two overlay entries', () => {
  const body = loadPlugin()
  const { registrations } = applyPlugin(body)
  const slots = registrations.map((entry) => entry.options.name).sort()
  assert.deepEqual(slots, ['main', 'shell.overlay', 'shell.overlay', 'sidebar.panellist'])

  const row = registrations.find((entry) => entry.options.name === 'sidebar.panellist')
  const panel = registrations.find((entry) => entry.options.name === 'main')
  assert.equal(row.options.id, 'advanced-timer')
  assert.equal(panel.options.key, row.options.id, 'the row id must address the main panel key')
  assert.equal(typeof row.options.label, 'function')
  assert.equal(row.options.label(), 'Advanced Timer')
  assert.equal(typeof row.component, 'function')

  // Both overlay entries are additive: fresh ids, never a shipped id.
  const overlayIds = registrations.filter((entry) => entry.options.name === 'shell.overlay').map((entry) => entry.options.id)
  assert.deepEqual(overlayIds, ['advanced-timer-hud', 'advanced-timer-announcement'])
})

test('both locales define the same keys, and the locale files mirror them', () => {
  const body = loadPlugin()
  const { dictionaries } = applyPlugin(body)
  const en = dictionaries[0].dicts.en
  const zh = dictionaries[0].dicts.zh
  assert.ok(Object.keys(en).length > 30)
  assert.deepEqual(Object.keys(en).sort(), Object.keys(zh).sort())
  for (const required of ['panel', 'title', 'addInterval', 'start', 'announcementLabel', 'voice']) {
    assert.ok(Object.hasOwn(en, required), `the English dictionary must define "${required}"`)
  }
  assert.equal(en.start, 'Start')
  assert.equal(zh.start, '开始')

  const metaEn = JSON.parse(readFileSync(join(root, 'locale', 'en.json'), 'utf8'))
  const metaZh = JSON.parse(readFileSync(join(root, 'locale', 'zh.json'), 'utf8'))
  assert.equal(metaEn.meta.title, 'Advanced Timer')
  assert.equal(metaZh.meta.title, '高级计时器')
  assert.ok(metaEn.meta.description.length > 40)
  assert.deepEqual(Object.keys(metaEn).sort(), Object.keys(metaZh).sort())
  assert.deepEqual(
    Object.keys(metaEn).filter((key) => key !== 'meta').sort(),
    Object.keys(en).sort(),
    'the locale file must mirror the runtime dictionary',
  )
})

test('the page scrolls itself: the frame column clips its occupant', () => {
  const css = source.slice(source.indexOf('const CSS = `'), source.indexOf('`\n\n    /**\n     * Install the page stylesheet'))
  const pageRule = /\.at-page\{([^}]*)\}/.exec(css)
  assert.ok(pageRule !== null)
  assert.match(pageRule[1], /overflow:auto/)
  assert.match(pageRule[1], /height:100%/)
  assert.match(pageRule[1], /min-height:0/)
  assert.match(pageRule[1], /box-sizing:border-box/)
})

test('UI colour comes only from theme tokens, shadows included', () => {
  const css = source.slice(source.indexOf('const CSS = `'), source.indexOf('`\n\n    /**\n     * Install the page stylesheet'))
  const colourDeclarations = css.match(/(?:^|[;{])\s*(?:color|background|background-color|border-color|box-shadow|outline-color)\s*:\s*[^;}]*/g) ?? []
  // A token's own fallback (`var(--token,#fff)`) is part of the token reference,
  // not a literal: remove the var() expressions before looking for literals.
  const literal = colourDeclarations
    .map((rule) => rule.replace(/var\([^()]*(?:\([^()]*\)[^()]*)*\)/g, 'var()'))
    .filter((rule) => /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/.test(rule))
  assert.deepEqual(literal, [], `UI colour must come from --dsw-alias-* tokens: ${literal.join(' | ')}`)
})

test('the series runs back to back, announcing each interval start', () => {
  const body = loadPlugin()
  const clock = { now: 0 }
  const announcements = []
  const drive = buildEngine(body, clock, announcements)

  drive.setSeries({
    intervals: [
      { id: 'a', name: 'Warm up', seconds: 3 },
      { id: 'b', name: 'Sprint', seconds: 2 },
      { id: 'c', name: 'Rest', seconds: 1 },
    ],
  })
  drive.start()
  assert.deepEqual(
    announcements.map((entry) => entry.name),
    ['Warm up'],
    'starting the series announces the first interval',
  )
  // The test announcer has no voice, so the countdown starts at once.
  assert.equal(drive.getState().starting, false)
  assert.equal(drive.getState().endsAt, 3000)

  // 2.9 s in: still the first interval, no early announcement.
  clock.now = 2900
  drive.tick()
  assert.equal(drive.getState().index, 0)
  assert.equal(drive.getState().remainingMs, 100)
  assert.equal(announcements.length, 1)

  // 3.0 s: the boundary itself. The next interval is announced and its
  // countdown starts from its own full length.
  clock.now = 3000
  drive.tick()
  assert.equal(drive.getState().index, 1)
  assert.equal(drive.getState().remainingMs, 2000)
  assert.equal(drive.getState().endsAt, 5000)
  assert.deepEqual(announcements.map((entry) => entry.name), ['Warm up', 'Sprint'])

  // 3.4 s in: 1.6 s into the second interval.
  clock.now = 3400
  drive.tick()
  assert.equal(drive.getState().index, 1)
  assert.equal(drive.getState().remainingMs, 1600)

  // A tick that lands after two boundaries consumes only the interval that was
  // running: the next one is announced and begins with its own countdown.
  clock.now = 5200
  drive.tick()
  assert.equal(drive.getState().index, 2)
  assert.equal(drive.getState().remainingMs, 1000)
  assert.equal(drive.getState().endsAt, 6200)
  assert.deepEqual(announcements.map((entry) => entry.name), ['Warm up', 'Sprint', 'Rest'])

  // The end of the series finishes rather than wrapping.
  clock.now = 6200
  drive.tick()
  assert.equal(drive.getState().status, 'finished')
  assert.equal(drive.getState().remainingMs, 0)
  assert.equal(announcements.length, 3, 'finishing is not a new interval start')
})

test('a boundary crossed late begins the next interval with its full countdown', () => {
  const clock = { now: 0 }
  const announcements = []
  const signals = []
  const drive = buildEngine(loadPlugin(), clock, announcements, [], [], signals)
  drive.setSeries({
    intervals: [
      { id: 'a', name: 'A', seconds: 5 },
      { id: 'b', name: 'B', seconds: 5 },
    ],
  })
  drive.start()
  // The tick lands 1.5 s after the boundary. Interval B still gets its whole
  // countdown, because that countdown starts after B's name, not at the boundary.
  clock.now = 6500
  drive.tick()
  assert.equal(drive.getState().index, 1)
  assert.equal(drive.getState().remainingMs, 5000)
  assert.equal(drive.getState().endsAt, 11_500)
  assert.deepEqual(signals, ['start', 'end', 'start'], 'the ended interval is marked before the next begins')
})

test('loop restarts the series instead of finishing', () => {
  const clock = { now: 0 }
  const announcements = []
  const drive = buildEngine(loadPlugin(), clock, announcements)
  drive.setSeries({ loop: true, intervals: [{ id: 'a', name: 'A', seconds: 2 }, { id: 'b', name: 'B', seconds: 1 }] })
  drive.start()
  // Each boundary is crossed by its own tick, so each start is announced.
  clock.now = 2000
  drive.tick()
  assert.equal(drive.getState().index, 1)
  clock.now = 3000
  drive.tick()
  assert.equal(drive.getState().status, 'running')
  assert.equal(drive.getState().index, 0)
  assert.deepEqual(announcements.map((entry) => entry.name), ['A', 'B', 'A'])
})

test('a long sleep does not replay intervals that elapsed while the page was closed', () => {
  const clock = { now: 0 }
  const announcements = []
  const drive = buildEngine(loadPlugin(), clock, announcements)
  drive.setSeries({
    intervals: Array.from({ length: 20 }, (_, index) => ({ id: `i${index}`, name: `Step ${index + 1}`, seconds: 10 })),
  })
  drive.start()
  // The page was suspended for 65 s. Since every countdown is gated on its name,
  // the timer effectively paused; on wake it ends the current interval and begins
  // the next one, rather than replaying six announcements nobody heard.
  clock.now = 65_000
  drive.tick()
  assert.equal(drive.getState().index, 1)
  assert.equal(drive.getState().remainingMs, 10_000)
  assert.deepEqual(announcements.map((entry) => entry.name), ['Step 1', 'Step 2'])
})

test('pause freezes the remaining time and resume continues from it', () => {
  const clock = { now: 0 }
  const announcements = []
  const drive = buildEngine(loadPlugin(), clock, announcements)
  drive.setSeries({ intervals: [{ id: 'a', name: 'A', seconds: 10 }, { id: 'b', name: 'B', seconds: 10 }] })
  drive.start()
  clock.now = 4000
  drive.tick()
  drive.pause()
  assert.equal(drive.getState().status, 'paused')
  clock.now = 9000
  drive.tick()
  assert.equal(drive.getState().remainingMs, 6000, 'a paused timer does not count down')
  drive.resume()
  assert.equal(drive.getState().endsAt, 15000)
  clock.now = 15000
  drive.tick()
  assert.equal(drive.getState().index, 1)
})

test('skip moves on immediately and announces the new interval', () => {
  const clock = { now: 0 }
  const announcements = []
  const drive = buildEngine(loadPlugin(), clock, announcements)
  drive.setSeries({ intervals: [{ id: 'a', name: 'A', seconds: 30 }, { id: 'b', name: 'B', seconds: 30 }] })
  drive.start()
  clock.now = 1000
  drive.skip()
  assert.equal(drive.getState().index, 1)
  assert.equal(drive.getState().remainingMs, 30000)
  assert.deepEqual(announcements.map((entry) => entry.name), ['A', 'B'])
})

test('the editor is read-only while the series runs', () => {
  const clock = { now: 0 }
  const drive = buildEngine(loadPlugin(), clock, [])
  drive.setSeries({ intervals: [{ id: 'a', name: 'A', seconds: 30 }] })
  drive.start()
  drive.addInterval()
  drive.removeInterval('a')
  drive.moveInterval('a', 1)
  drive.updateInterval('a', { name: 'changed' })
  assert.equal(drive.getState().series.intervals.length, 1)
  assert.equal(drive.getState().series.intervals[0].name, 'A')
  drive.stop()
  drive.addInterval()
  assert.equal(drive.getState().series.intervals.length, 2)
})

test('an interval name falls back to its position, never to an empty announcement', () => {
  const clock = { now: 0 }
  const announcements = []
  const drive = buildEngine(loadPlugin(), clock, announcements)
  drive.setSeries({ intervals: [{ id: 'a', name: '   ', seconds: 5 }] })
  drive.start()
  assert.equal(announcements.length, 1)
  assert.equal(announcements[0].name, 'Interval 1')
  assert.equal(announcements[0].word, 'Start')
})

test('clock formatting is MM:SS and rolls to H:MM:SS past an hour', () => {
  const body = loadPlugin()
  assert.equal(body.__test.formatClock(0), '00:00')
  assert.equal(body.__test.formatClock(65_000), '01:05')
  assert.equal(body.__test.formatClock(3_600_000), '1:00:00')
  assert.equal(body.__test.formatClock(3_725_000), '1:02:05')
})

test('warns exactly once, five seconds before each interval ends', () => {
  const clock = { now: 0 }
  const warnings = []
  const drive = buildEngine(loadPlugin(), clock, [], warnings)
  drive.setSeries({
    intervals: [
      { id: 'a', name: 'Warm up', seconds: 10 },
      { id: 'b', name: 'Sprint', seconds: 8 },
    ],
  })
  drive.start()
  assert.equal(warnings.length, 0, 'nothing is said at the start of an interval')

  // 4.8 s in: 5.2 s remain, so it is too early for the warning.
  clock.now = 4800
  drive.tick()
  assert.equal(warnings.length, 0)

  // 5.0 s in: exactly five seconds remain — the boundary that fires it.
  clock.now = 5000
  drive.tick()
  assert.equal(warnings.length, 1)
  assert.equal(warnings[0].text, '5 seconds left')

  // Every later tick is still inside the last five seconds; it must not repeat.
  for (const at of [5200, 6000, 8000, 9900]) {
    clock.now = at
    drive.tick()
  }
  assert.equal(warnings.length, 1, 'the warning is spoken once per interval, not once per tick')

  // The next interval gets its own warning, at its own five-second mark.
  // Interval B starts at 10 s and lasts 8 s, so it ends at 18 s: its warning is
  // due at 13 s.
  clock.now = 10_000
  drive.tick()
  assert.equal(drive.getState().index, 1)
  clock.now = 12_900
  drive.tick()
  assert.equal(warnings.length, 1, 'the new interval is not yet inside its last five seconds')
  clock.now = 13_000
  drive.tick()
  assert.equal(warnings.length, 2, 'each interval warns independently')
  assert.equal(warnings[1].text, '5 seconds left')
})

test('an interval of five seconds or less is not warned about', () => {
  const clock = { now: 0 }
  const warnings = []
  const drive = buildEngine(loadPlugin(), clock, [], warnings)
  drive.setSeries({ intervals: [{ id: 'a', name: 'Blink', seconds: 5 }] })
  drive.start()
  clock.now = 0
  drive.tick()
  clock.now = 4900
  drive.tick()
  assert.equal(warnings.length, 0, 'a warning at its own start would talk over the announcement')
})

test('the warning can be turned off', () => {
  const clock = { now: 0 }
  const warnings = []
  const drive = buildEngine(loadPlugin(), clock, [], warnings)
  drive.setSeries({ warn: false, intervals: [{ id: 'a', name: 'A', seconds: 20 }] })
  drive.start()
  clock.now = 15_000
  drive.tick()
  assert.equal(warnings.length, 0)
})

test('skip does not warn about the interval it leaves', () => {
  const clock = { now: 0 }
  const warnings = []
  const drive = buildEngine(loadPlugin(), clock, [], warnings)
  drive.setSeries({ intervals: [{ id: 'a', name: 'A', seconds: 30 }, { id: 'b', name: 'B', seconds: 30 }] })
  drive.start()
  clock.now = 26_000
  drive.skip()
  assert.equal(drive.getState().index, 1)
  // The new interval is 30 s long, so it is nowhere near its warning point.
  drive.tick()
  assert.equal(warnings.length, 0)
  clock.now = 51_000
  drive.tick()
  assert.equal(warnings.length, 1, 'the interval actually running still warns at its own five-second mark')
})

test('beeps once per elapsed second, not once per 200 ms tick', () => {
  const clock = { now: 0 }
  const beeps = []
  const drive = buildEngine(loadPlugin(), clock, [], [], beeps)
  drive.setSeries({ intervals: [{ id: 'a', name: 'A', seconds: 10 }] })
  drive.start()
  // The first tick only records where the countdown starts: the interval's own
  // start announcement is the sound for that instant.
  clock.now = 0
  drive.tick()
  assert.equal(beeps.length, 0)

  // Four ticks inside the same displayed second must not be four beeps.
  clock.now = 200
  drive.tick()
  clock.now = 400
  drive.tick()
  clock.now = 800
  drive.tick()
  assert.equal(beeps.length, 0, 'the clock has not changed second yet')

  // The displayed second changes: exactly one beep.
  clock.now = 1000
  drive.tick()
  assert.equal(beeps.length, 1)
  clock.now = 1200
  drive.tick()
  clock.now = 1400
  drive.tick()
  assert.equal(beeps.length, 1, 'still the same second')

  clock.now = 2000
  drive.tick()
  clock.now = 3000
  drive.tick()
  assert.equal(beeps.length, 3, 'one beep for each second the clock has counted')
})

test('a late tick does not replay a burst of beeps', () => {
  const clock = { now: 0 }
  const beeps = []
  const drive = buildEngine(loadPlugin(), clock, [], [], beeps)
  drive.setSeries({ intervals: [{ id: 'a', name: 'A', seconds: 60 }] })
  drive.start()
  clock.now = 0
  drive.tick()
  // The tab was throttled for 10 s: five seconds have elapsed at once.
  clock.now = 10_000
  drive.tick()
  assert.equal(beeps.length, 0, 'a jump of several seconds is not five beeps in a row')
  // Normal ticking resumes, one sound per second.
  clock.now = 11_000
  drive.tick()
  assert.equal(beeps.length, 1)
})

test('each interval starts its own beep countdown', () => {
  const clock = { now: 0 }
  const beeps = []
  const drive = buildEngine(loadPlugin(), clock, [], [], beeps)
  drive.setSeries({
    intervals: [
      { id: 'a', name: 'A', seconds: 4 },
      { id: 'b', name: 'B', seconds: 4 },
    ],
  })
  drive.start()
  clock.now = 0
  drive.tick()
  clock.now = 1000
  drive.tick()
  clock.now = 2000
  drive.tick()
  assert.equal(beeps.length, 2)
  // Cross into interval B: its start announcement covers that instant, so its
  // first beep comes one second later.
  clock.now = 4000
  drive.tick()
  assert.equal(drive.getState().index, 1)
  clock.now = 5000
  drive.tick()
  assert.equal(beeps.length, 3, 'interval B ticks on its own second, not on the boundary')
})

test('the per-second beep can be turned off', () => {
  const clock = { now: 0 }
  const beeps = []
  const drive = buildEngine(loadPlugin(), clock, [], [], beeps)
  drive.setSeries({ secondBeep: false, intervals: [{ id: 'a', name: 'A', seconds: 20 }] })
  drive.start()
  for (let second = 0; second <= 8; second += 1) {
    clock.now = second * 1000
    drive.tick()
  }
  assert.equal(beeps.length, 0)
})

test('a paused timer does not beep', () => {
  const clock = { now: 0 }
  const beeps = []
  const drive = buildEngine(loadPlugin(), clock, [], [], beeps)
  drive.setSeries({ intervals: [{ id: 'a', name: 'A', seconds: 30 }] })
  drive.start()
  clock.now = 0
  drive.tick()
  drive.pause()
  clock.now = 5000
  drive.tick()
  assert.equal(beeps.length, 0, 'a frozen clock has no seconds to tick')
})

test('the countdown waits for the interval name to be spoken', () => {
  const clock = { now: 0 }
  const announcements = []
  const signals = []
  let releaseSpeech = null
  const engine = loadPlugin().__test.createTimerEngine({
    autoTick: false,
    now: () => clock.now,
    // Reports "speech started" and hands back the completion callback, so the
    // test decides when the name has been pronounced.
    announce: (announcement, options) => {
      announcements.push({ ...announcement })
      releaseSpeech = options.onDone
      return true
    },
    signal: (kind) => signals.push(kind),
  })
  engine.setTranslate((key) => (key === 'start' ? 'Start' : key === 'fiveSecondsLeft' ? '5 seconds left' : 'Interval {n}'))
  engine.setSeries({ intervals: [{ id: 'a', name: 'Warm up', seconds: 10 }] })
  engine.start()

  assert.equal(engine.getState().starting, true, 'the interval is starting while its name is spoken')
  assert.equal(engine.getState().endsAt, 0, 'no deadline is set before the name is spoken')
  assert.equal(engine.getState().remainingMs, 10_000)
  assert.deepEqual(signals, [], 'the start tone waits for the countdown')

  // Time passes while the name is still being spoken; the clock must not move.
  clock.now = 3000
  engine.tick()
  assert.equal(engine.getState().starting, true)
  assert.equal(engine.getState().remainingMs, 10_000)
  assert.equal(engine.getState().endsAt, 0)

  releaseSpeech()
  assert.equal(engine.getState().starting, false)
  assert.equal(engine.getState().endsAt, 13_000, 'the countdown starts when the name ends')
  assert.deepEqual(signals, ['start'], 'the special start tone marks the counting start')

  clock.now = 12_900
  engine.tick()
  assert.equal(engine.getState().remainingMs, 100)
})

test('the special start and end tones bracket every interval', () => {
  const clock = { now: 0 }
  const signals = []
  const drive = buildEngine(loadPlugin(), clock, [], [], [], signals)
  drive.setSeries({
    intervals: [
      { id: 'a', name: 'A', seconds: 2 },
      { id: 'b', name: 'B', seconds: 2 },
    ],
  })
  drive.start()
  assert.deepEqual(signals, ['start'], 'the first interval is marked at its countdown start')
  clock.now = 2000
  drive.tick()
  assert.deepEqual(signals, ['start', 'end', 'start'], 'the boundary is marked at both sides')
  clock.now = 4000
  drive.tick()
  assert.deepEqual(signals, ['start', 'end', 'start', 'end'], 'the last interval end is marked too')
  assert.equal(drive.getState().status, 'finished')
})

test('the special tones obey the beep switch', () => {
  const clock = { now: 0 }
  const signals = []
  const drive = buildEngine(loadPlugin(), clock, [], [], [], signals)
  drive.setSeries({ beep: false, intervals: [{ id: 'a', name: 'A', seconds: 1 }] })
  drive.start()
  clock.now = 1000
  drive.tick()
  assert.deepEqual(signals, [], 'the switch silences both boundary tones')
})

test('pausing while the name is being spoken re-announces on resume', () => {
  const clock = { now: 0 }
  const announcements = []
  const signals = []
  let releaseSpeech = null
  const engine = loadPlugin().__test.createTimerEngine({
    autoTick: false,
    now: () => clock.now,
    announce: (announcement, options) => {
      announcements.push({ ...announcement })
      releaseSpeech = options.onDone
      return true
    },
    signal: (kind) => signals.push(kind),
  })
  engine.setTranslate((key) => (key === 'start' ? 'Start' : key === 'fiveSecondsLeft' ? '5 seconds left' : 'Interval {n}'))
  engine.setSeries({ intervals: [{ id: 'a', name: 'Warm up', seconds: 10 }] })
  engine.start()
  assert.equal(engine.getState().starting, true)

  engine.pause()
  assert.equal(engine.getState().status, 'paused')
  assert.equal(engine.getState().remainingMs, 10_000)
  // The completion callback of the interrupted announcement must be inert.
  releaseSpeech?.()
  assert.equal(engine.getState().starting, true, 'a paused announcement is not completed by stale speech')

  engine.resume()
  assert.equal(engine.getState().status, 'running')
  assert.equal(engine.getState().starting, true, 'resume re-announces before counting')
  assert.equal(announcements.length, 2, 'the name is spoken again')
  assert.deepEqual(signals, [], 'the countdown still has not begun')
  releaseSpeech?.()
  assert.equal(engine.getState().starting, false)
  assert.deepEqual(signals, ['start'])
  assert.equal(engine.getState().endsAt, 10_000)
})

test('the warning fires five seconds before the countdown ends, not the announcement', () => {
  const clock = { now: 0 }
  const warnings = []
  let releaseSpeech = null
  const engine = loadPlugin().__test.createTimerEngine({
    autoTick: false,
    now: () => clock.now,
    announce: (announcement, options) => {
      releaseSpeech = options.onDone
      return true
    },
    warn: (warning) => warnings.push(warning.text),
  })
  engine.setTranslate((key) => (key === 'start' ? 'Start' : key === 'fiveSecondsLeft' ? '5 seconds left' : 'Interval {n}'))
  engine.setSeries({ intervals: [{ id: 'a', name: 'A', seconds: 12 }] })
  engine.start()
  // Three seconds of announcement time.
  clock.now = 3000
  engine.tick()
  assert.equal(warnings.length, 0)
  releaseSpeech()
  assert.equal(engine.getState().endsAt, 15_000, 'the countdown is measured from the end of the name')
  clock.now = 9900
  engine.tick()
  assert.equal(warnings.length, 0, 'more than five seconds of countdown remain')
  clock.now = 10_000
  engine.tick()
  assert.equal(warnings.length, 1, 'five countdown seconds left')
})

test('the completion is announced exactly when the last interval ends', () => {
  const clock = { now: 0 }
  const completions = []
  const drive = buildEngine(loadPlugin(), clock, [], [], [], [], completions)
  drive.setSeries({
    intervals: [
      { id: 'a', name: 'A', seconds: 2 },
      { id: 'b', name: 'B', seconds: 2 },
    ],
  })
  drive.start()
  // The end of the first interval is not the end of the series.
  clock.now = 2000
  drive.tick()
  assert.equal(drive.getState().index, 1)
  assert.deepEqual(completions, [], 'a boundary between intervals is not a completion')
  clock.now = 3500
  drive.tick()
  assert.deepEqual(completions, [], 'still counting the last interval')

  clock.now = 4000
  drive.tick()
  assert.equal(drive.getState().status, 'finished')
  assert.equal(completions.length, 1, 'the end of the series is announced once')
  assert.equal(completions[0].text, 'All cycles completed')
  assert.equal(completions[0].voice, true)
  assert.equal(completions[0].lang, 'en-US')

  // A later tick must not repeat it.
  clock.now = 5000
  drive.tick()
  assert.equal(completions.length, 1)
})

test('stopping early does not announce completion', () => {
  const clock = { now: 0 }
  const completions = []
  const drive = buildEngine(loadPlugin(), clock, [], [], [], [], completions)
  drive.setSeries({ intervals: [{ id: 'a', name: 'A', seconds: 5 }] })
  drive.start()
  drive.stop()
  assert.deepEqual(completions, [], 'a stopped run is not a completed one')
})

test('the completion sentence respects the voice switch', () => {
  const spoken = []
  const body = loadPlugin({
    speechSynthesis: { speak: (utterance) => spoken.push(utterance.text), cancel() {} },
    SpeechSynthesisUtterance: class {
      constructor(text) { this.text = text }
    },
  })
  const completion = body.__test.announceCompletion

  completion({ text: 'All cycles completed', lang: 'en-US', voice: false })
  completion({ text: '', lang: 'en-US', voice: true })
  return new Promise((resolve) => {
    setTimeout(() => {
      try {
        assert.deepEqual(spoken, [], 'voice off and empty text stay silent')
        completion({ text: 'All cycles completed', lang: 'en-US', voice: true })
        setTimeout(() => {
          try {
            assert.deepEqual(spoken, ['All cycles completed'], 'the sentence is spoken after the end tone')
            resolve()
          } catch (error) {
            resolve(Promise.reject(error))
          }
        }, 600)
      } catch (error) {
        resolve(Promise.reject(error))
      }
    }, 600)
  })
})

test('a new announcement supersedes a pending completion sentence', () => {
  const spoken = []
  const body = loadPlugin({
    speechSynthesis: { speak: (utterance) => spoken.push(utterance.text), cancel() {} },
    SpeechSynthesisUtterance: class {
      constructor(text) { this.text = text }
    },
  })
  const { announceCompletion, announceInterval, hush } = body.__test
  announceCompletion({ text: 'All cycles completed', lang: 'en-US', voice: true })
  // A run is restarted before the sentence gets its turn: it must not cancel the
  // new interval's announcement.
  announceInterval({ name: 'Warm up', word: 'Start' }, { voice: true, lang: 'en-US' })
  // A stop in the same window drops a waiting sentence too.
  announceCompletion({ text: 'All cycles completed', lang: 'en-US', voice: true })
  hush()
  return new Promise((resolve) => {
    setTimeout(() => {
      try {
        assert.deepEqual(spoken, ['Warm up. Start'], 'the idle completion sentence is dropped')
        resolve()
      } catch (error) {
        resolve(Promise.reject(error))
      }
    }, 700)
  })
})

/** Build an engine with test seams, wired the way `apply` wires it. */
function buildEngine(body, clock, announcements, warnings = [], beeps = [], signals = [], completions = []) {
  const engine = body.__test.createTimerEngine({
    autoTick: false,
    now: () => clock.now,
    // No voice in tests: `false` means "nothing spoken", so the countdown starts
    // immediately instead of waiting for a speech completion that never comes.
    announce: (announcement) => {
      announcements.push({ ...announcement })
      return false
    },
    warn: (warning) => warnings.push({ ...warning }),
    secondBeep: () => beeps.push(clock.now),
    signal: (kind) => signals.push(kind),
    complete: (completion) => completions.push({ ...completion }),
    hush: () => {},
  })
  engine.setTranslate((key) => {
    if (key === 'start') return 'Start'
    if (key === 'intervalIndex') return 'Interval {n}'
    if (key === 'fiveSecondsLeft') return '5 seconds left'
    if (key === 'allCyclesCompleted') return 'All cycles completed'
    return key
  })
  return engine
}

console.log('client bundle: factory registered, slots registered, engine runs back to back')
