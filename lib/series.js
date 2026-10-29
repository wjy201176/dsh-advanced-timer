/**
 * Advanced Timer — the saved-library shape, shared by the Host route and the
 * saved state file.
 *
 * A library holds several named configurations. Each configuration is an
 * ordered list of named intervals plus its own audio options, and the Client
 * runs whichever configuration is active. The Host only owns the durable copy,
 * so everything that comes off the wire is cleaned here before it is stored.
 */

import { randomUUID } from 'node:crypto'

/** Bumped when the persisted shape changes in a way older files cannot satisfy. */
export const LIBRARY_VERSION = 2

/** A library longer than this is not a picker any more. */
export const MAX_CONFIGS = 20

/** A configuration longer than this is not an editor any more. */
export const MAX_INTERVALS = 50

/** Bounds for one interval, in seconds. */
export const MIN_SECONDS = 1
export const MAX_SECONDS = 24 * 60 * 60

/** Length used when a row carries no usable number. */
export const DEFAULT_SECONDS = 60

/** One interval name is a row label, not a paragraph. */
export const MAX_NAME = 80

/** A configuration name is a picker label, so it is shorter than a row label. */
export const MAX_CONFIG_NAME = 60

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/

/**
 * A fresh interval id.
 * @returns {string} an id matching {@link ID_PATTERN}.
 */
export function newIntervalId() {
  return `iv-${randomUUID().slice(0, 8)}`
}

/**
 * A fresh configuration id.
 * @returns {string} an id matching {@link ID_PATTERN}.
 */
export function newConfigId() {
  return `cfg-${randomUUID().slice(0, 8)}`
}

/**
 * One name: single line, trimmed, length-capped.
 * @param {unknown} value - whatever the Client sent.
 * @param {number} [max] - the field's limit.
 * @returns {string} the cleaned name, possibly empty.
 */
export function cleanName(value, max = MAX_NAME) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

/**
 * One interval length in whole seconds, clamped to the supported range.
 *
 * An absent or non-numeric value takes the fallback; a *number* that is out of
 * range is clamped, so a row the user emptied comes back as one second rather
 * than silently becoming a minute.
 * @param {unknown} value - whatever the Client sent.
 * @param {number} [fallback] - used when the value is not a number at all.
 * @returns {number} an integer between {@link MIN_SECONDS} and {@link MAX_SECONDS}.
 */
export function clampSeconds(value, fallback = DEFAULT_SECONDS) {
  if (value === null || value === undefined || value === '') return fallback
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, Math.round(parsed)))
}

/** Clean one interval list, replacing missing or duplicate ids. */
function cleanIntervals(input) {
  const rows = Array.isArray(input) ? input.slice(0, MAX_INTERVALS) : []
  const seen = new Set()
  const intervals = []
  for (const row of rows) {
    if (row === null || typeof row !== 'object' || Array.isArray(row)) continue
    let id = typeof row.id === 'string' ? row.id.trim() : ''
    if (!ID_PATTERN.test(id) || seen.has(id)) {
      id = newIntervalId()
      while (seen.has(id)) id = newIntervalId()
    }
    seen.add(id)
    intervals.push({ id, name: cleanName(row.name), seconds: clampSeconds(row.seconds) })
  }
  return intervals
}

/**
 * Normalise one configuration.
 *
 * Unknown shapes become an empty configuration rather than an error: a state
 * file written by an older or newer version must not stop the timer from
 * opening. A missing id is generated, so every configuration in a library can
 * be addressed even when the Client left it out.
 * @param {unknown} input - whatever the Client sent or the file held.
 * @returns {{id: string, name: string, intervals: Array<{id: string, name: string, seconds: number}>, loop: boolean, voice: boolean, beep: boolean, warn: boolean, secondBeep: boolean}} the cleaned configuration.
 */
export function cleanConfig(input) {
  const source = input !== null && typeof input === 'object' && !Array.isArray(input) ? input : {}
  let id = typeof source.id === 'string' ? source.id.trim() : ''
  if (!ID_PATTERN.test(id)) id = newConfigId()
  return {
    id,
    name: cleanName(source.name, MAX_CONFIG_NAME),
    intervals: cleanIntervals(source.intervals),
    loop: source.loop === true,
    voice: source.voice !== false,
    beep: source.beep !== false,
    // Spoken warning five seconds before an interval ends; on unless turned off.
    warn: source.warn !== false,
    // A short tick on every elapsed second; on unless turned off.
    secondBeep: source.secondBeep !== false,
  }
}

/** A configuration with no intervals. */
export function emptyConfig() {
  return cleanConfig({ intervals: [] })
}

/** The write stamp of a library, in whole milliseconds (0 when unstamped). */
function readStamp(value) {
  const stamp = Number(value)
  return Number.isFinite(stamp) && stamp > 0 ? Math.floor(stamp) : 0
}

/**
 * Wrap the single-series shape written by version 1 into a library.
 * @param {unknown} series - an old `{version:1, intervals, ...}` series.
 * @returns {{version: number, activeId: string, configs: Array<object>, updatedAt: number}} the library.
 */
export function libraryFromSeries(series) {
  const config = cleanConfig(series)
  return {
    version: LIBRARY_VERSION,
    activeId: config.id,
    configs: [config],
    updatedAt: readStamp(series !== null && typeof series === 'object' ? series.updatedAt : 0),
  }
}

/** A library with one empty, unnamed configuration. */
export function emptyLibrary() {
  return libraryFromSeries({})
}

/**
 * Normalise a whole library, including the version-1 single-series shape.
 *
 * @param {unknown} input - whatever the Client sent or the file held.
 * @returns {{version: number, activeId: string, configs: Array<object>, updatedAt: number}} the cleaned library.
 */
export function cleanLibrary(input) {
  const source = input !== null && typeof input === 'object' && !Array.isArray(input) ? input : {}
  // A version-1 file (and an old Client) posts the series itself: its tell is an
  // `intervals` array and no `configs` array.
  if (!Array.isArray(source.configs)) return libraryFromSeries(source)
  const rows = source.configs.slice(0, MAX_CONFIGS)
  const seen = new Set()
  const configs = []
  for (const row of rows) {
    if (row === null || typeof row !== 'object' || Array.isArray(row)) continue
    const config = cleanConfig(row)
    while (seen.has(config.id)) config.id = newConfigId()
    seen.add(config.id)
    configs.push(config)
  }
  if (configs.length === 0) return emptyLibrary()
  const requested = typeof source.activeId === 'string' ? source.activeId : ''
  const activeId = configs.some((config) => config.id === requested) ? requested : configs[0].id
  return { version: LIBRARY_VERSION, activeId, configs, updatedAt: readStamp(source.updatedAt) }
}
