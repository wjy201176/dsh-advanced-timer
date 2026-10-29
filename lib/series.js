/**
 * Advanced Timer — the interval series shape, shared by the Host route and the
 * saved state file.
 *
 * A series is an ordered list of named intervals, each with its own length.
 * The Client runs them back to back; the Host only owns the durable copy, so
 * everything that comes off the wire is cleaned here before it is stored.
 */

import { randomUUID } from 'node:crypto'

/** Bumped when the persisted shape changes in a way older files cannot satisfy. */
export const SERIES_VERSION = 1

/** A series longer than this is not an editor any more. */
export const MAX_INTERVALS = 50

/** Bounds for one interval, in seconds. */
export const MIN_SECONDS = 1
export const MAX_SECONDS = 24 * 60 * 60

/** Length used when a row carries no usable number. */
export const DEFAULT_SECONDS = 60

/** One interval name is a row label, not a paragraph. */
export const MAX_NAME = 80

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/

/**
 * A fresh interval id.
 * @returns {string} an id matching {@link ID_PATTERN}.
 */
export function newIntervalId() {
  return `iv-${randomUUID().slice(0, 8)}`
}

/**
 * One interval name: single line, trimmed, length-capped.
 * @param {unknown} value - whatever the Client sent.
 * @returns {string} the cleaned name, possibly empty.
 */
export function cleanName(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME)
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

/**
 * Normalise a whole series.
 *
 * Unknown shapes become an empty series rather than an error: a state file
 * written by an older or newer version must not stop the timer from opening.
 * @param {unknown} input - whatever the Client sent or the file held.
 * @returns {{version: number, intervals: Array<{id: string, name: string, seconds: number}>, loop: boolean, voice: boolean, beep: boolean, warn: boolean, secondBeep: boolean, updatedAt: number}} the cleaned series.
 */
export function cleanSeries(input) {
  const source = input !== null && typeof input === 'object' && !Array.isArray(input) ? input : {}
  const rows = Array.isArray(source.intervals) ? source.intervals.slice(0, MAX_INTERVALS) : []
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
  const stamp = Number(source.updatedAt)
  return {
    version: SERIES_VERSION,
    intervals,
    loop: source.loop === true,
    voice: source.voice !== false,
    beep: source.beep !== false,
    // Spoken warning five seconds before an interval ends; on unless turned off.
    warn: source.warn !== false,
    // A short tick on every elapsed second; on unless turned off.
    secondBeep: source.secondBeep !== false,
    // When this series was last written, so a client can tell its own newer
    // copy from a stale one instead of guessing by row count.
    updatedAt: Number.isFinite(stamp) && stamp > 0 ? Math.floor(stamp) : 0,
  }
}
