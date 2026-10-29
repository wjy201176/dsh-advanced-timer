/**
 * Advanced Timer — Host half.
 *
 * Owns exactly one thing the page cannot own: the durable copy of the user's
 * interval series. The timer itself runs in the Client, because it is a
 * wall-clock countdown shown in the page and in a floating HUD; a Host-side
 * timer would have to push frames the browser already renders itself.
 *
 * The state file is written through a temp file and renamed, so a crash
 * mid-write can never leave a truncated series behind. It lives in the
 * plugin's own directory under `$DSH_HOME`, beside — not inside — the profile,
 * so reinstalling the profile never touches the user's series.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

import { cleanSeries, SERIES_VERSION } from './lib/series.js'

export const name = 'dsh-advanced-timer'

/** Without a Web server the panel has nothing to talk to. */
export const inject = ['webServer']

const ROUTE_PREFIX = '/advanced-timer'
const API_PREFIX = `${ROUTE_PREFIX}/api`

/** No interval series: the page starts from an empty editor. */
export function emptySeries() {
  return cleanSeries({ version: SERIES_VERSION, intervals: [] })
}

/**
 * The state directory for the current process.
 * @param {string} [home] - an explicit `$DSH_HOME`, for tests.
 * @returns {string} an absolute directory path.
 */
export function dataDir(home = process.env.DSH_HOME ?? join(homedir(), '.dsh')) {
  return join(home, 'advanced-timer')
}

/**
 * The saved series, kept in memory and mirrored to one JSON file.
 *
 * Reads are synchronous because they happen once at activation and then once
 * per page open; writes are serialised so two quick saves cannot interleave a
 * rename with a temp-file write.
 */
export class SeriesStore {
  /**
   * @param {string} directory - where the state file lives.
   * @param {{info?: Function, warn?: Function}} [logger] - optional Host logger.
   */
  constructor(directory, logger) {
    this.directory = directory
    this.file = join(directory, 'series.json')
    this.logger = logger
    this.pending = Promise.resolve()
    this.state = this.#read()
  }

  /** @returns {ReturnType<typeof cleanSeries>} the current series. */
  get() {
    return this.state
  }

  /**
   * Replace the saved series.
   * @param {unknown} input - whatever the Client sent.
   * @returns {Promise<ReturnType<typeof cleanSeries>>} the cleaned, stored series.
   */
  update(input) {
    // Stamp the write so a Client can tell whether the Host's copy is newer than
    // what it already holds locally.
    const next = cleanSeries({ ...(input ?? {}), updatedAt: Date.now() })
    this.state = next
    const write = this.pending.then(() => this.#write(next))
    // A failed write must not poison the chain for every later save.
    this.pending = write.catch(() => {})
    return write.then(() => next)
  }

  #read() {
    try {
      if (!existsSync(this.file)) return emptySeries()
      const parsed = JSON.parse(readFileSync(this.file, 'utf8'))
      return cleanSeries(parsed)
    } catch (error) {
      this.logger?.warn?.(`advanced-timer: could not read the saved series (${String(error?.message ?? error)}); starting empty`)
      return emptySeries()
    }
  }

  #write(value) {
    try {
      mkdirSync(dirname(this.file), { recursive: true })
      const temp = `${this.file}.tmp-${process.pid}`
      writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
      renameSync(temp, this.file)
    } catch (error) {
      this.logger?.warn?.(`advanced-timer: could not save the series (${String(error?.message ?? error)})`)
      throw error
    }
  }
}

/** Answer with 405 unless the request uses one of the accepted methods. */
function methodRefused(req, res, methods) {
  if (req.method !== undefined && methods.includes(req.method)) return false
  res.writeHead(405, { allow: methods.join(', ') })
  res.end()
  return true
}

/** Write a JSON response. */
function sendJson(res, status, payload) {
  const body = Buffer.from(JSON.stringify(payload))
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(body.length),
    'cache-control': 'no-store',
  })
  res.end(body)
}

/** Collect a request body up to `limit` bytes. */
function readBody(req, limit = 256 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        reject(new Error('request body too large'))
        req.destroy()
        return
      }
      chunks.push(Buffer.from(chunk))
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

/** Collect and parse a JSON request body, tolerating an empty body. */
async function readJsonBody(req) {
  const raw = await readBody(req)
  if (raw.length === 0) return {}
  try {
    return JSON.parse(raw.toString('utf8'))
  } catch {
    throw new Error('invalid JSON body')
  }
}

export function apply(ctx, config) {
  const logger = ctx.logger
  const store = new SeriesStore(dataDir(), logger)

  const register = (webServer) => {
    if (webServer === null || typeof webServer !== 'object' || typeof webServer.register !== 'function') {
      logger?.warn?.('advanced-timer: no webServer service, the panel cannot be served')
      return () => {}
    }

    const routes = []
    const route = (kind, path, handler) => {
      routes.push(webServer.register({ kind, path, handler }))
    }

    /** The same Host/Origin fence the rest of the GUI uses, plus loopback only. */
    const refused = (req, res) => {
      // `strict: false` because a service that is not installed yet must degrade
      // to "no fence" instead of throwing on every request.
      const connection = typeof ctx.get === 'function' ? ctx.get('connection', false) : undefined
      if (typeof connection?.requestRejection === 'function') {
        const rejection = connection.requestRejection(req)
        if (rejection !== undefined) {
          sendJson(res, rejection, { ok: false, error: rejection === 401 ? 'unauthorized' : 'forbidden' })
          return true
        }
      }
      return false
    }

    route('prefix', API_PREFIX, async (req, res) => {
      if (refused(req, res)) return
      const path = new URL(req.url ?? '/', 'http://local').pathname.slice(API_PREFIX.length)
      try {
        switch (path) {
          case '/series': {
            if (methodRefused(req, res, ['GET', 'HEAD', 'POST', 'PUT'])) return
            if (req.method === 'GET' || req.method === 'HEAD') {
              sendJson(res, 200, { ok: true, value: store.get() })
              return
            }
            const body = await readJsonBody(req)
            const saved = await store.update(body?.series ?? body)
            sendJson(res, 200, { ok: true, value: saved })
            return
          }
          default:
            sendJson(res, 404, { ok: false, error: 'unknown route' })
        }
      } catch (error) {
        sendJson(res, 500, { ok: false, error: String(error?.message ?? error) })
      }
    })

    return () => {
      for (const off of routes.splice(0)) {
        try {
          off()
        } catch {
          /* route already gone */
        }
      }
    }
  }

  if (typeof ctx.inject === 'function') {
    ctx.inject(['webServer'], (scope) => register(scope.webServer ?? ctx.get('webServer')))
  } else {
    register(ctx.get('webServer'))
  }
}
