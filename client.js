/**
 * Advanced Timer — Client half.
 *
 * Adds the "Advanced Timer" row to the left sidebar and the page it selects:
 * an editable series of named intervals, each with its own length, that run
 * back to back with no gap. At the beginning of every interval the timer
 * *produces* the interval name and "Start": it speaks them and shows them, in
 * the page and — while the user is elsewhere — in a floating announcement.
 *
 * The countdown lives in this module, not in the page component, so switching
 * panels does not stop it: the page and the frame-wide HUD are two views over
 * one engine. The Host half only stores the series.
 */

window.__ModuleLoader__.load({
  id: 'dsh-advanced-timer',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const NS = 'advancedTimer'
    const PANEL_ID = 'advanced-timer'
    const STORAGE_KEY = 'dsh-advanced-timer:v1'

    // ---------------------------------------------------------------- locale

    const zh = {
      panel: '高级计时器',
      title: '高级计时器',
      intro: '把训练或工作拆成若干段：每段有自己的名字和时长，按顺序首尾相接连续运行。每段开始时都会播报该段名称与「开始」。',
      seriesTitle: '分段序列',
      seriesHint: '按顺序添加分段，每段独立计时；上一段结束的瞬间下一段立即开始。',
      empty: '还没有分段。点下方「添加分段」开始。',
      addInterval: '添加分段',
      namePlaceholder: '分段名称（例如：热身）',
      minutesShort: '分',
      secondsShort: '秒',
      moveUp: '上移',
      moveDown: '下移',
      remove: '删除这一分段',
      intervalIndex: '第 {n} 段',
      intervalOf: '第 {i} / {n} 段',
      total: '合计 {time}',
      count: '{n} 个分段',
      loop: '循环序列',
      voice: '语音播报',
      beep: '起止提示音',
      warn: '最后 5 秒语音提醒',
      fiveSecondsLeft: '还剩 5 秒',
      secondBeep: '每秒提示音',
      locked: '运行中不能编辑；停止后可修改分段。',
      statusIdle: '就绪',
      statusRunning: '运行中',
      statusStarting: '准备开始',
      statusPaused: '已暂停',
      statusFinished: '已完成',
      start: '开始',
      pause: '暂停',
      resume: '继续',
      skip: '跳到下一段',
      stop: '停止',
      restart: '重新开始',
      noInterval: '没有分段',
      nextUp: '下一段：{name}',
      lastOne: '这是最后一段',
      finishedNote: '序列已完成。',
      allCyclesCompleted: '全部循环已完成',
      announcementLabel: '分段开始',
      saved: '已保存',
      saving: '保存中…',
      saveFailed: '未保存到 Host，已保存在本机',
      voiceHint: '使用系统语音朗读，可在系统设置中更换声音。',
      openPanel: '打开计时器面板',
    }

    const en = {
      panel: 'Advanced Timer',
      title: 'Advanced Timer',
      intro: 'Split a session into intervals: each has its own name and length, and they run back to back with no gap. Every interval start is announced with its name and “Start”.',
      seriesTitle: 'Interval series',
      seriesHint: 'Add intervals in order. Each one counts down on its own; the next starts the instant the previous ends.',
      empty: 'No intervals yet. Press “Add interval” to begin.',
      addInterval: 'Add interval',
      namePlaceholder: 'Interval name (for example: Warm up)',
      minutesShort: 'min',
      secondsShort: 'sec',
      moveUp: 'Move up',
      moveDown: 'Move down',
      remove: 'Remove this interval',
      intervalIndex: 'Interval {n}',
      intervalOf: 'Interval {i} of {n}',
      total: 'Total {time}',
      count: '{n} intervals',
      loop: 'Loop the series',
      voice: 'Speak the announcement',
      beep: 'Start & end beep',
      warn: 'Speak a 5-second warning',
      fiveSecondsLeft: '5 seconds left',
      secondBeep: 'Tick every second',
      locked: 'Editing is paused while the timer runs. Stop it to change intervals.',
      statusIdle: 'Ready',
      statusRunning: 'Running',
      statusStarting: 'Starting',
      statusPaused: 'Paused',
      statusFinished: 'Finished',
      start: 'Start',
      pause: 'Pause',
      resume: 'Resume',
      skip: 'Skip to next interval',
      stop: 'Stop',
      restart: 'Start again',
      noInterval: 'No interval',
      nextUp: 'Next: {name}',
      lastOne: 'Last interval',
      finishedNote: 'The series is complete.',
      allCyclesCompleted: 'All cycles completed',
      announcementLabel: 'Interval start',
      saved: 'Saved',
      saving: 'Saving…',
      saveFailed: 'Not saved to the Host — kept on this device',
      voiceHint: 'Uses the system voice; change it in your OS settings.',
      openPanel: 'Open the timer panel',
    }

    // ------------------------------------------------------------------- css

    const CSS = `
.at-page{box-sizing:border-box;height:100%;min-height:0;display:flex;flex-direction:column;align-items:center;gap:18px;padding:0 clamp(20px,4vw,48px) 48px;overflow:auto;color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.55;--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2)}
.at-page>*{width:100%;max-width:1040px;flex:none}
.at-head{display:flex;flex-direction:column;gap:4px;padding-top:28px}
[data-platform=darwin] .at-head{padding-top:calc(28px + var(--dsh-frame-top-clearance,0px))}
.at-head h1{margin:0;font-size:20px;font-weight:500;line-height:28px}
.at-head p{margin:0;color:var(--dsw-alias-label-secondary)}
.at-grid{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(300px,.9fr);gap:16px;align-items:start}
@media (max-width:860px){.at-grid{grid-template-columns:minmax(0,1fr)}}
.at-card{border:1px solid var(--dsw-alias-border-l2);border-radius:12px;padding:14px 16px;display:flex;flex-direction:column;gap:12px;background:var(--dsw-alias-bg-base);min-width:0}
.at-card-head{display:flex;align-items:baseline;justify-content:space-between;gap:10px;flex-wrap:wrap}
.at-card h2{margin:0;font-size:13px;font-weight:600;letter-spacing:.01em}
.at-meta{color:var(--dsw-alias-label-tertiary);font-size:11px;font-variant-numeric:tabular-nums}
.at-hint{margin:0;color:var(--dsw-alias-label-tertiary);font-size:12px}
.at-rows{display:flex;flex-direction:column;gap:6px}
.at-empty{padding:18px 12px;text-align:center;color:var(--dsw-alias-label-tertiary);border:1px dashed var(--dsw-alias-border-l2);border-radius:10px;font-size:12px}
.at-row{display:flex;align-items:center;gap:6px;min-width:0}
.at-row[data-locked="true"]{opacity:.78}
.at-badge{flex:none;width:22px;height:22px;border-radius:6px;background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary);font-size:11px;font-weight:600;display:inline-flex;align-items:center;justify-content:center}
.at-row[data-active="true"] .at-badge{background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-on-brand,#fff)}
.at-name{flex:1;min-width:80px;font:inherit;padding:6px 10px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary)}
.at-num{width:52px;flex:none;font:inherit;text-align:center;padding:6px 4px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums}
.at-unit{flex:none;color:var(--dsw-alias-label-tertiary);font-size:11px}
.at-name:focus,.at-num:focus{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-1px}
.at-icon-btn{flex:none;width:26px;height:26px;border-radius:6px;border:1px solid transparent;background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer;font-size:13px;line-height:1;display:inline-flex;align-items:center;justify-content:center;padding:0}
.at-icon-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.at-icon-btn:disabled{opacity:.35;cursor:default}
.at-icon-btn[data-tone="danger"]:hover:not(:disabled){color:var(--dsw-alias-state-error-primary)}
.at-add{align-self:stretch;font:inherit;font-size:12px;padding:8px 10px;border-radius:8px;border:1px dashed var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}
.at-add:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.at-add:disabled{opacity:.45;cursor:default}
.at-options{display:flex;flex-wrap:wrap;gap:14px;padding-top:2px;border-top:1px solid var(--dsw-alias-border-l1)}
.at-option{display:inline-flex;align-items:center;gap:6px;color:var(--dsw-alias-label-secondary);font-size:12px;cursor:pointer;user-select:none}
.at-option input{accent-color:var(--dsw-alias-brand-primary);margin:0}
.at-save{font-size:11px;color:var(--dsw-alias-label-tertiary)}
.at-save[data-tone="error"]{color:var(--dsw-alias-state-warn-primary)}
.at-now{position:sticky;top:12px}
.at-now-head{display:flex;align-items:center;justify-content:space-between;gap:10px}
.at-status{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--dsw-alias-label-tertiary)}
.at-status:before{content:"";width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-state-idle-primary)}
.at-status[data-state="running"]:before{background:var(--dsw-alias-state-success-primary)}
.at-status[data-state="paused"]:before{background:var(--dsw-alias-state-warn-primary)}
.at-status[data-state="starting"]:before{background:var(--dsw-alias-brand-primary);animation:at-blink 1s ease-in-out infinite}
.at-status[data-state="finished"]:before{background:var(--dsw-alias-brand-primary)}
.at-clock{font-size:52px;line-height:1.05;font-weight:300;letter-spacing:-.02em;font-variant-numeric:tabular-nums;text-align:center;padding:4px 0 0}
.at-clock[data-warning="true"]{color:var(--dsw-alias-state-warn-primary)}
.at-current{text-align:center;font-size:14px;font-weight:500;min-height:22px;overflow-wrap:anywhere}
.at-current[data-empty="true"]{color:var(--dsw-alias-label-tertiary);font-weight:400}
.at-announce{display:flex;align-items:center;justify-content:center;gap:10px;padding:10px 12px;border-radius:10px;background:var(--dsw-alias-state-success-tertiary,var(--dsw-alias-interactive-bg-hover));animation:at-pop .28s ease-out}
.at-announce-name{font-size:16px;font-weight:600;overflow-wrap:anywhere;text-align:center}
.at-announce-word{flex:none;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--dsw-alias-label-on-brand,#fff);background:var(--dsw-alias-brand-primary);border-radius:999px;padding:2px 9px}
@keyframes at-pop{from{transform:scale(.96);opacity:0}to{transform:scale(1);opacity:1}}
@keyframes at-blink{0%,100%{opacity:1}50%{opacity:.35}}
.at-bar{height:6px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);overflow:hidden}
.at-bar>i{display:block;height:100%;background:var(--dsw-alias-brand-primary);border-radius:999px;transition:width .12s linear}
.at-next{text-align:center;font-size:12px;color:var(--dsw-alias-label-tertiary);min-height:18px;overflow-wrap:anywhere}
.at-controls{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;padding-top:2px}
.at-btn{font:inherit;padding:7px 16px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);cursor:pointer}
.at-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.at-btn[data-kind="primary"]{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-on-brand,#fff)}
.at-btn[data-kind="primary"]:hover:not(:disabled){opacity:.9;background:var(--dsw-alias-brand-primary)}
.at-btn:disabled{opacity:.45;cursor:default}
.at-hint-line{margin:0;font-size:11px;color:var(--dsw-alias-label-tertiary);text-align:center}
.at-hud{position:fixed;top:calc(16px + var(--dsh-frame-top-clearance,0px));right:20px;z-index:40;pointer-events:auto;box-sizing:border-box;width:248px;padding:12px 14px;border-radius:14px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-overlay);box-shadow:0 10px 30px color-mix(in srgb, var(--dsw-alias-label-primary) 18%, transparent);display:flex;flex-direction:column;gap:8px;color:var(--dsw-alias-label-primary);font-size:12px}
.at-hud-top{display:flex;align-items:center;gap:7px;min-width:0}
.at-hud-dot{flex:none;width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-state-success-primary)}
.at-hud[data-state="paused"] .at-hud-dot{background:var(--dsw-alias-state-warn-primary)}
.at-hud-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;font-size:12px}
.at-hud-clock{font-size:30px;line-height:1.1;font-weight:300;font-variant-numeric:tabular-nums;letter-spacing:-.01em;text-align:center}
.at-hud-clock[data-warning="true"]{color:var(--dsw-alias-state-warn-primary)}
.at-hud-foot{display:flex;align-items:center;justify-content:space-between;gap:8px}
.at-hud-actions{display:flex;gap:2px}
.at-hud-actions .at-icon-btn{width:24px;height:24px;font-size:12px}
.at-toast{position:fixed;top:calc(18vh + var(--dsh-frame-top-clearance,0px));left:50%;transform:translateX(-50%);z-index:41;pointer-events:none;max-width:min(560px,calc(100vw - 48px));box-sizing:border-box;display:flex;flex-direction:column;align-items:center;gap:6px;padding:18px 28px;border-radius:16px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-overlay);box-shadow:0 18px 50px color-mix(in srgb, var(--dsw-alias-label-primary) 22%, transparent);animation:at-drop .32s ease-out}
.at-toast-label{font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--dsw-alias-label-tertiary)}
.at-toast-name{font-size:24px;font-weight:600;line-height:1.25;text-align:center;overflow-wrap:anywhere;max-width:100%}
.at-toast-word{font-size:13px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--dsw-alias-label-on-brand,#fff);background:var(--dsw-alias-brand-primary);border-radius:999px;padding:3px 14px}
@keyframes at-drop{from{transform:translate(-50%,-10px);opacity:0}to{transform:translate(-50%,0);opacity:1}}
`

    /**
     * Install the page stylesheet once, under the plugin's own effect.
     *
     * The effect owns the tag: unloading the plugin removes the `<style>`, and a
     * reload therefore re-installs it. A module-level latch would survive the
     * removal and leave the page permanently unstyled.
     * @param {object} ctx - the Client plugin context.
     */
    function installCss(ctx) {
      if (typeof document === 'undefined') return
      ctx.effect(() => {
        const tag = document.createElement('style')
        tag.dataset.plugin = 'dsh-advanced-timer'
        tag.dataset.pluginCss = 'dsh-advanced-timer/page.css'
        tag.textContent = CSS
        document.head.appendChild(tag)
        return () => tag.remove()
      }, 'advanced-timer: page stylesheet')
    }

    // ------------------------------------------------------------- utilities

    /** Fill `{name}` placeholders in one localized string. */
    function fmt(template, vars) {
      let text = String(template ?? '')
      for (const [key, value] of Object.entries(vars ?? {})) text = text.split(`{${key}}`).join(String(value))
      return text
    }

    /** Whole seconds as a clock: `MM:SS`, or `H:MM:SS` past an hour. */
    function formatClock(ms) {
      const total = Math.max(0, Math.ceil(Number(ms) / 1000))
      const hours = Math.floor(total / 3600)
      const minutes = Math.floor((total % 3600) / 60)
      const seconds = total % 60
      const mm = String(minutes).padStart(2, '0')
      const ss = String(seconds).padStart(2, '0')
      return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`
    }

    /** Whole seconds as `M:SS`, the compact form used in totals. */
    function formatShort(seconds) {
      return formatClock(Number(seconds) * 1000)
    }

    /** One interval length in whole seconds, clamped to the supported range. */
    function clampSeconds(value) {
      const parsed = Math.round(Number(value))
      if (!Number.isFinite(parsed) || parsed <= 0) return 1
      return Math.min(86400, Math.max(1, parsed))
    }

    /** A fresh interval id, unique within this page session. */
    let idCounter = 0
    function makeId() {
      idCounter += 1
      return `iv-${Date.now().toString(36)}-${idCounter.toString(36)}`
    }

    /** The comparable part of a series: everything but the write stamp. */
    function stripStamp(series) {
      const { updatedAt: _ignored, ...rest } = series
      return rest
    }

    /** A series shaped the way the Host stores it. */
    function normalizeSeries(input) {
      const source = input !== null && typeof input === 'object' && !Array.isArray(input) ? input : {}
      const rows = Array.isArray(source.intervals) ? source.intervals.slice(0, 50) : []
      const seen = new Set()
      const intervals = []
      for (const row of rows) {
        if (row === null || typeof row !== 'object' || Array.isArray(row)) continue
        let id = typeof row.id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(row.id) ? row.id : makeId()
        while (seen.has(id)) id = makeId()
        seen.add(id)
        intervals.push({
          id,
          name: String(row.name ?? '').replace(/\s+/g, ' ').slice(0, 80),
          seconds: clampSeconds(row.seconds),
        })
      }
      const stamp = Number(source.updatedAt)
      return {
        version: 1,
        intervals,
        loop: source.loop === true,
        voice: source.voice !== false,
        beep: source.beep !== false,
        // The countdown warning is on unless the user turned it off.
        warn: source.warn !== false,
        // A short tick on every elapsed second of every interval.
        secondBeep: source.secondBeep !== false,
        updatedAt: Number.isFinite(stamp) && stamp > 0 ? Math.floor(stamp) : 0,
      }
    }

    /** How long before an interval ends its spoken warning fires. */
    const WARN_LEAD_MS = 5000

    /**
     * A boundary crossed within this window still counts as "on time".
     *
     * Beyond it the page was suspended, so the end-of-interval signal is skipped:
     * a tone for an interval that ended minutes ago would be a lie.
     */
    const CATCH_UP_TOLERANCE_MS = 1500

    /** The name announcement is waited on at most this long, then the clock runs. */
    const ANNOUNCE_TIMEOUT_MS = 8000

    /** Run `fn` at most once, however many completion paths reach it. */
    function once(fn) {
      let called = false
      return (...args) => {
        if (called) return
        called = true
        fn(...args)
      }
    }

    // ---------------------------------------------------------- timer engine

    /**
     * The countdown engine shared by the page and the overlay.
     *
     * Everything is driven by absolute wall-clock timestamps (`endsAt`), so a
     * background tab, a slow frame, or a suspended laptop cannot make the
     * series drift: on every tick the engine catches up to the real clock and
     * carries the overshoot into the next interval, which is what keeps the
     * intervals continuous.
     *
     * @param {object} [options] - test seams: a clock, storage, and announcers.
     * @returns {object} the engine handle.
     */
    function createTimerEngine(options = {}) {
      const now = typeof options.now === 'function' ? options.now : () => Date.now()
      const autoTick = options.autoTick !== false
      const storage = options.storage ?? null
      const announceOut = options.announce ?? null
      const warnOut = options.warn ?? null
      const secondBeepOut = options.secondBeep ?? null
      const signalOut = options.signal ?? null
      const hushOut = options.hush ?? null
      const completeOut = options.complete ?? null

      let listeners = new Set()
      let ticker = null
      let announceTimer = null
      /**
       * Pending "the name is still being spoken" gate.
       *
       * Every interval begins by announcing its name; the countdown may not run
       * until that announcement is over. `startToken` invalidates a completion
       * callback that belongs to an interval the user has already left.
       */
      let startGate = null
      let startToken = 0
      let translate = (key) => key
      let localeId = () => 'en'
      let saver = null
      let saveTimer = null
      let audio = null
      /**
       * The whole second the last tick sound belonged to, so a 200 ms tick cannot
       * fire five sounds per second. Not part of the rendered state: it is an
       * implementation detail of "once per second", never shown.
       */
      let lastBeepSecond = -1
      let state = {
        status: 'idle',
        /**
         * True from the instant an interval begins until its name has been
         * spoken: the clock shows the full interval but does not move.
         */
        starting: false,
        series: normalizeSeries(null),
        index: 0,
        endsAt: 0,
        remainingMs: 0,
        pausedRemaining: 0,
        announcement: null,
        // Whether this interval's end-of-interval warning already fired. Reset
        // whenever a different interval starts, so each one warns exactly once.
        warned: false,
        save: 'idle',
      }

      function notify() {
        for (const listener of [...listeners]) {
          try {
            listener()
          } catch {
            /* one bad subscriber must not stop the timer */
          }
        }
      }

      function subscribe(listener) {
        listeners.add(listener)
        return () => listeners.delete(listener)
      }

      function getState() {
        return state
      }

      function setSeries(next) {
        state.series = normalizeSeries(next)
        state.status = 'idle'
        state.index = 0
        state.endsAt = 0
        state.remainingMs = 0
        stopTicker()
        persist()
        scheduleSave()
        notify()
      }

      /**
       * Adopt the Host's copy, but never over a run in progress, an edit the user
       * made while the fetch was in flight, or a local copy the Host has not
       * caught up with yet.
       * @param {unknown} next - the series the Host returned.
       * @param {string} [pristine] - the series as it looked before any edit.
       * @returns {boolean} whether the Host copy was taken.
       */
      function adoptSeries(next, pristine) {
        if (state.status !== 'idle') return false
        if (typeof pristine === 'string' && JSON.stringify(stripStamp(state.series)) !== pristine) return false
        const incoming = normalizeSeries(next)
        // The local copy is written on every edit and the Host save is debounced,
        // so a Host stamp older than the local one means this browser is ahead —
        // adopting it would roll the user's last edit back.
        if (incoming.updatedAt > 0 && incoming.updatedAt < state.series.updatedAt) return false
        state.series = incoming
        persist()
        notify()
        return true
      }

      function updateInterval(id, patch) {
        if (state.status === 'running' || state.status === 'paused') return
        const index = state.series.intervals.findIndex((row) => row.id === id)
        if (index < 0) return
        const next = state.series.intervals.slice()
        const row = { ...next[index] }
        // Collapse runs of whitespace only. Trimming here would eat the space the
        // user just typed between two words, so the trim belongs to the save
        // boundary (and to the Host), not to every keystroke.
        if (patch.name !== undefined) row.name = String(patch.name).replace(/\s+/g, ' ').slice(0, 80)
        if (patch.seconds !== undefined) row.seconds = clampSeconds(patch.seconds)
        next[index] = row
        state.series = { ...state.series, intervals: next }
        persist()
        scheduleSave()
        notify()
      }

      function addInterval() {
        if (state.status === 'running' || state.status === 'paused') return
        if (state.series.intervals.length >= 50) return
        const intervals = state.series.intervals.concat([{ id: makeId(), name: '', seconds: 60 }])
        state.series = { ...state.series, intervals }
        persist()
        scheduleSave()
        notify()
      }

      function removeInterval(id) {
        if (state.status === 'running' || state.status === 'paused') return
        state.series = { ...state.series, intervals: state.series.intervals.filter((row) => row.id !== id) }
        persist()
        scheduleSave()
        notify()
      }

      function moveInterval(id, direction) {
        if (state.status === 'running' || state.status === 'paused') return
        const rows = state.series.intervals.slice()
        const index = rows.findIndex((row) => row.id === id)
        const target = index + direction
        if (index < 0 || target < 0 || target >= rows.length) return
        const [row] = rows.splice(index, 1)
        rows.splice(target, 0, row)
        state.series = { ...state.series, intervals: rows }
        persist()
        scheduleSave()
        notify()
      }

      function setOption(key, value) {
        if (key !== 'loop' && key !== 'voice' && key !== 'beep' && key !== 'warn' && key !== 'secondBeep') return
        state.series = { ...state.series, [key]: Boolean(value) }
        persist()
        scheduleSave()
        notify()
      }

      /** Drop a pending start gate and invalidate its completion callback. */
      function cancelStartGate() {
        startToken += 1
        if (startGate !== null) {
          clearTimeout(startGate)
          startGate = null
        }
      }

      /** How long to wait for a speech that never reports back. */
      function announceSafetyMs(text) {
        return Math.max(3000, Math.min(15000, 1000 + text.length * 150))
      }

      /**
       * Show and speak one interval's name plus "Start".
       *
       * @param {number} index - the interval to announce.
       * @param {() => void} onSpoken - called exactly once when the announcement
       *   is over, or immediately when there is no speech to wait for.
       */
      function announce(index, onSpoken) {
        const interval = state.series.intervals[index]
        if (interval === undefined) {
          onSpoken()
          return
        }
        const word = translate('start')
        const name = interval.name.trim()
        state.announcement = { id: `${interval.id}-${now()}`, name: name === '' ? translate('intervalIndex').replace('{n}', String(index + 1)) : name, word, at: now() }
        if (announceTimer !== null) clearTimeout(announceTimer)
        announceTimer = setTimeout(() => {
          announceTimer = null
          state.announcement = null
          notify()
        }, 3400)
        const done = once(() => onSpoken())
        try {
          // The announcer reports when its speech ends, so the countdown can wait
          // for the name instead of running underneath it. A `false` return means
          // nothing was spoken (voice off, or no speech engine installed).
          const started = announceOut?.(state.announcement, {
            voice: state.series.voice,
            lang: String(localeId()).startsWith('zh') ? 'zh-CN' : 'en-US',
            onDone: done,
          })
          if (started !== true) done()
        } catch {
          /* announcing is best-effort: a muted or missing voice must not stop the timer */
          done()
        }
      }

      /**
       * The special tone that marks a boundary.
       * @param {'start'|'end'} kind - which end of the interval.
       */
      function signal(kind) {
        if (state.series.beep !== true) return
        try {
          signalOut?.(kind)
        } catch {
          /* audio is optional: a muted context must not stop the countdown */
        }
      }

      /**
       * A short tick for one elapsed second of the current interval.
       *
       * The engine ticks four times a second, so this is driven by the whole
       * second the clock is showing rather than by the tick itself: the sound
       * lands once per displayed second, at the instant the number changes.
       * A tick that jumped several seconds at once (the page was suspended) is
       * not replayed as a burst of beeps — only a normal one-second step sounds.
       * @param {number} secondIndex - the whole seconds still on the clock.
       */
      function beepSecond(secondIndex) {
        const previous = lastBeepSecond
        lastBeepSecond = secondIndex
        if (state.series.secondBeep !== true) return
        // `previous < 0` is the first tick of an interval: the start announcement
        // is the sound for that moment, so the countdown begins one second in.
        if (previous < 0 || secondIndex !== previous - 1) return
        try {
          secondBeepOut?.()
        } catch {
          /* audio is optional: a muted context must not stop the countdown */
        }
      }

      /**
       * Speak the end-of-interval warning for the current interval.
       *
       * Fires once per interval, when five seconds remain. An interval that is
       * five seconds or shorter has no room for a warning that would land on top
       * of its own start announcement, so it is skipped.
       */
      function warn(index) {
        const interval = state.series.intervals[index]
        if (interval === undefined) return
        if (state.warned) return
        state.warned = true
        // The user can turn the warning off; an interval no longer than the lead
        // time would be warned about at the same moment it starts.
        if (state.series.warn !== true) return
        if (interval.seconds * 1000 <= WARN_LEAD_MS) return
        const text = translate('fiveSecondsLeft')
        try {
          warnOut?.({
            text,
            name: interval.name.trim(),
            lang: String(localeId()).startsWith('zh') ? 'zh-CN' : 'en-US',
            voice: state.series.voice,
            beep: state.series.beep,
          })
        } catch {
          /* a missing voice must not stop the countdown */
        }
        notify()
      }

      function startTicker() {
        if (!autoTick || ticker !== null) return
        // 200 ms is four frames per displayed second: the clock never lags by a
        // visible second, and the page does not re-render for nothing.
        ticker = setInterval(tick, 200)
      }

      function stopTicker() {
        if (ticker !== null) {
          clearInterval(ticker)
          ticker = null
        }
      }

      /** The interval after the current one, or -1 when the series is over. */
      function nextIndex() {
        const count = state.series.intervals.length
        if (count === 0) return -1
        const next = state.index + 1
        if (next < count) return next
        return state.series.loop ? 0 : -1
      }

      /**
       * Begin one interval: show and pronounce its name, then count down.
       *
       * This is the only place an interval starts. The countdown is armed by
       * `finishStart` once the announcement is over, which is why the series
       * pauses between the end of one interval and the spoken name of the next:
       * the requirement is that each countdown begins after its own name.
       *
       * @param {number} index - which interval to begin.
       * @param {number} [remainingMs] - countdown time; defaults to the full length.
       * @returns {boolean} whether the interval exists.
       */
      function beginInterval(index, remainingMs) {
        const interval = state.series.intervals[index]
        if (interval === undefined) return false
        cancelStartGate()
        // The clock is not counting while the name is spoken; a ticker left over
        // from the interval being left must not keep firing.
        stopTicker()
        const token = startToken
        state.index = index
        state.starting = true
        state.endsAt = 0
        state.remainingMs = Number.isFinite(remainingMs) && remainingMs > 0 ? Math.min(remainingMs, interval.seconds * 1000) : interval.seconds * 1000
        state.pausedRemaining = 0
        state.warned = false
        lastBeepSecond = -1
        state.announcement = null
        // Safety net: a speech engine that never reports completion must not
        // freeze the interval on its name forever.
        const estimate = announceSafetyMs(`${interval.name.trim()} ${translate('start')}`)
        startGate = setTimeout(() => finishStart(token), estimate)
        announce(index, () => finishStart(token))
        persist()
        notify()
        return true
      }

      /** The announcement is over: run the countdown for this interval. */
      function finishStart(token) {
        if (token !== startToken) return
        if (state.status !== 'running' || state.starting !== true) return
        cancelStartGate()
        state.starting = false
        state.endsAt = now() + state.remainingMs
        // The first tick of this interval only records the starting second; the
        // special start tone is the sound of this moment.
        lastBeepSecond = Math.ceil(state.remainingMs / 1000)
        signal('start')
        startTicker()
        persist()
        notify()
      }

      function start() {
        if (state.series.intervals.length === 0) return
        state.status = 'running'
        state.announcement = null
        beginInterval(0)
        persist()
        notify()
      }

      function pause() {
        if (state.status !== 'running') return
        cancelStartGate()
        hushOut?.()
        if (state.starting) {
          // The name was still being spoken. Resume re-announces it, so the
          // interval's countdown still starts after its own name.
          state.pausedRemaining = state.remainingMs
          state.status = 'paused'
          stopTicker()
          persist()
          notify()
          return
        }
        state.pausedRemaining = Math.max(0, state.endsAt - now())
        state.remainingMs = state.pausedRemaining
        state.status = 'paused'
        stopTicker()
        persist()
        notify()
      }

      function resume() {
        if (state.status !== 'paused') return
        state.status = 'running'
        if (state.starting) {
          // Paused before the countdown ever began: announce the name again so
          // the interval still starts with it.
          beginInterval(state.index, state.pausedRemaining)
          return
        }
        state.endsAt = now() + state.pausedRemaining
        state.pausedRemaining = 0
        startTicker()
        persist()
        notify()
      }

      function stop() {
        if (state.status === 'idle') return
        cancelStartGate()
        hushOut?.()
        state.status = 'idle'
        state.starting = false
        state.index = 0
        state.endsAt = 0
        state.remainingMs = 0
        state.pausedRemaining = 0
        state.announcement = null
        state.warned = false
        stopTicker()
        persist()
        notify()
      }

      function finish() {
        cancelStartGate()
        hushOut?.()
        state.status = 'finished'
        state.starting = false
        state.remainingMs = 0
        state.endsAt = 0
        state.pausedRemaining = 0
        state.announcement = null
        state.warned = false
        stopTicker()
        persist()
        notify()
        // The end of the series is announced too, after the final interval has
        // ended. Best-effort: a muted or missing voice must not affect the state.
        try {
          completeOut?.({
            text: translate('allCyclesCompleted'),
            lang: String(localeId()).startsWith('zh') ? 'zh-CN' : 'en-US',
            voice: state.series.voice,
          })
        } catch {
          /* a missing voice must not undo the finish */
        }
      }

      function skip() {
        if (state.status !== 'running' && state.status !== 'paused') return
        cancelStartGate()
        hushOut?.()
        const next = nextIndex()
        if (next < 0) {
          finish()
          return
        }
        if (state.status === 'paused') {
          // Stay paused, but hold the next interval ready to be announced when
          // the user resumes.
          state.index = next
          state.starting = true
          state.endsAt = 0
          state.remainingMs = state.series.intervals[next].seconds * 1000
          state.pausedRemaining = state.remainingMs
          state.warned = false
          lastBeepSecond = -1
          state.announcement = null
          persist()
          notify()
          return
        }
        beginInterval(next)
      }

      function tick() {
        if (state.status !== 'running' || state.starting) return
        const current = now()
        if (current < state.endsAt) {
          state.remainingMs = Math.max(0, state.endsAt - current)
          // One tick per displayed second. The engine runs four times a second,
          // so the whole second on the clock — not the tick — drives the sound.
          beepSecond(Math.ceil(state.remainingMs / 1000))
          // Five seconds before this interval ends, warn once. `warn` itself
          // dedupes, so the 200 ms tick cannot repeat it.
          if (state.remainingMs <= WARN_LEAD_MS) warn(state.index)
          notify()
          return
        }
        // The countdown reached zero: this interval is over.
        stopTicker()
        state.remainingMs = 0
        // A boundary crossed minutes ago (the page was suspended) gets no end
        // tone: it would announce something that is no longer happening.
        if (current - state.endsAt <= CATCH_UP_TOLERANCE_MS) signal('end')
        const next = nextIndex()
        if (next < 0) {
          finish()
          return
        }
        // The next interval begins with its own name; its countdown starts after
        // that, which is exactly the pause the requirement asks for.
        beginInterval(next)
        notify()
      }

      function setTranslate(fn) {
        if (typeof fn === 'function') translate = fn
      }

      function setLocaleGetter(fn) {
        if (typeof fn === 'function') localeId = fn
      }

      function setSaver(fn) {
        saver = typeof fn === 'function' ? fn : null
      }

      function scheduleSave() {
        if (saver === null) return
        if (saveTimer !== null) clearTimeout(saveTimer)
        state.save = 'saving'
        // Publish the "saving" state before the debounce window: without this the
        // indicator would jump straight from "saved" to "saved" again.
        notify()
        saveTimer = setTimeout(async () => {
          saveTimer = null
          // Trim at the save boundary: the Host trims too, so this is where the
          // local copy and the durable one become the same string.
          const outgoing = {
            ...state.series,
            intervals: state.series.intervals.map((row) => ({ ...row, name: row.name.trim() })),
          }
          try {
            const saved = await saver(outgoing)
            // Take only the Host's write stamp. Replacing the whole local series
            // with the Host's echo would rewrite the input under the caret while
            // the user is still typing in it.
            if (saved !== null && typeof saved === 'object') {
              const stamp = Number(saved.updatedAt)
              if (Number.isFinite(stamp) && stamp > 0) state.series = { ...state.series, updatedAt: Math.floor(stamp) }
            }
            state.save = 'saved'
          } catch {
            state.save = 'error'
          }
          persist()
          notify()
        }, 400)
      }

      function persist() {
        if (storage === null) return
        try {
          storage.setItem(
            STORAGE_KEY,
            JSON.stringify({
              status: state.status,
              starting: state.starting,
              index: state.index,
              endsAt: state.endsAt,
              pausedRemaining: state.pausedRemaining,
              warned: state.warned,
              series: state.series,
              savedAt: now(),
            }),
          )
        } catch {
          /* private mode or quota: the timer still runs in memory */
        }
      }

      /** Resume a run that was live when the page was last closed. */
      function restore() {
        if (storage === null) return
        let saved = null
        try {
          const raw = storage.getItem(STORAGE_KEY)
          if (raw !== null) saved = JSON.parse(raw)
        } catch {
          saved = null
        }
        if (saved === null || typeof saved !== 'object') return
        state.series = normalizeSeries(saved.series)
        const count = state.series.intervals.length
        if (count === 0) return
        const index = Math.min(count - 1, Math.max(0, Math.round(Number(saved.index) || 0)))
        if (saved.status === 'running') {
          const endsAt = Number(saved.endsAt)
          if (!Number.isFinite(endsAt) || endsAt <= 0) return
          // Catch up silently through any intervals that elapsed while the page
          // was closed; only a still-running interval is restored.
          let cursor = index
          let boundary = endsAt
          const current = now()
          let guard = 0
          while (current >= boundary && guard < 1000) {
            guard += 1
            cursor += 1
            if (cursor >= count) {
              if (state.series.loop) cursor = 0
              else return
            }
            boundary += state.series.intervals[cursor].seconds * 1000
          }
          state.status = 'running'
          state.index = cursor
          state.endsAt = 0
          state.remainingMs = Math.max(0, boundary - current)
          state.starting = false
          // A reload must not restart an interval silently: re-announce the
          // interval the user is dropped back into, and let its countdown begin
          // after that name. `beginInterval` also arms the start gate.
          beginInterval(cursor, state.remainingMs)
          // Restoring into the last five seconds is the one case where the start
          // announcement and the warning would overlap: the announcement wins.
          if (state.remainingMs <= WARN_LEAD_MS) state.warned = true
        } else if (saved.status === 'paused') {
          const remaining = Number(saved.pausedRemaining)
          state.status = 'paused'
          state.index = index
          state.pausedRemaining = Number.isFinite(remaining) && remaining > 0 ? remaining : state.series.intervals[index].seconds * 1000
          state.remainingMs = state.pausedRemaining
          state.warned = saved.warned === true
          // A paused run that had not yet started counting must announce the name
          // before its countdown when it resumes.
          state.starting = saved.starting === true
        }
      }

      return {
        subscribe,
        getState,
        setTranslate,
        setLocaleGetter,
        setSaver,
        restore,
        adoptSeries,
        setSeries,
        updateInterval,
        addInterval,
        removeInterval,
        moveInterval,
        setOption,
        start,
        pause,
        resume,
        stop,
        skip,
        tick,
        dispose() {
          cancelStartGate()
          stopTicker()
          if (announceTimer !== null) clearTimeout(announceTimer)
          if (saveTimer !== null) clearTimeout(saveTimer)
          hushOut?.()
          listeners = new Set()
        },
      }
    }

    // ---------------------------------------------------------- announcements

    /** Pending "the series is complete" sentence, if one is waiting for a tone. */
    let completionTimer = null

    /** Drop a scheduled completion sentence and forget its timer. */
    function cancelCompletion() {
      if (completionTimer === null) return
      clearTimeout(completionTimer)
      completionTimer = null
    }

    /**
     * Speak text and report when the speech ends.
     *
     * Any pending completion sentence is dropped first: a new announcement means
     * the series is no longer finishing, and it must not be cancelled by a stale
     * sentence that was waiting for a tone to finish.
     *
     * @param {string} text - what to say.
     * @param {string} lang - BCP-47 language for the utterance.
     * @param {() => void} [onDone] - called once when the utterance ends or fails.
     * @returns {boolean} whether speech was started.
     */
    function speak(text, lang, onDone) {
      cancelCompletion()
      return speakNow(text, lang, onDone)
    }

    /**
     * Start one utterance immediately.
     *
     * The engine waits for the interval name before it runs that interval's
     * countdown, so a `true` return means "an utterance was started — call
     * `onDone` when it finishes". `false` means nothing will speak (no voice, or
     * no speech engine), and the caller starts immediately.
     *
     * @param {string} text - what to say.
     * @param {string} lang - BCP-47 language for the utterance.
     * @param {() => void} [onDone] - called once when the utterance ends or fails.
     * @returns {boolean} whether speech was started.
     */
    function speakNow(text, lang, onDone) {
      if (typeof window === 'undefined') return false
      // `speechSynthesis` is an object and the utterance is a constructor, so the
      // two guards are different shapes; testing the object for "function" would
      // disable the voice everywhere.
      const synthesis = window.speechSynthesis
      const Utterance = window.SpeechSynthesisUtterance
      if (synthesis === undefined || synthesis === null || typeof synthesis.speak !== 'function') return false
      if (typeof Utterance !== 'function') return false
      try {
        const utterance = new Utterance(text)
        utterance.lang = lang
        utterance.rate = 1
        // `end` and `error` are both terminal; whichever arrives first wins.
        const done = typeof onDone === 'function' ? onDone : () => {}
        utterance.onend = done
        utterance.onerror = done
        // Cancel first: a skipped interval must not leave its predecessor's
        // sentence talking over the new one.
        synthesis.cancel()
        synthesis.speak(utterance)
        return true
      } catch {
        /* no voice installed, or the browser refused: stay silent */
        return false
      }
    }

    let audioContext = null

    /**
     * Create and resume the shared audio graph from inside a user gesture.
     *
     * A browser refuses to start audio outside a click/keypress, and both the
     * boundary tone and the countdown ticks arrive later — after the interval
     * name has been spoken, long past that window. Calling this synchronously in
     * the Start/Resume handlers is what makes them audible at all.
     * @returns {boolean} whether an audio graph is available.
     */
    function unlockAudio() {
      return audio() !== null
    }

    /** The shared audio graph, created on first use. */
    function audio() {
      if (typeof window === 'undefined') return null
      const Ctor = window.AudioContext ?? window.webkitAudioContext
      if (typeof Ctor !== 'function') return null
      try {
        if (audioContext === null) audioContext = new Ctor()
        if (audioContext.state === 'suspended') void audioContext.resume()
        return audioContext
      } catch {
        return null
      }
    }

    /** One short tone at `frequency`, starting `at` seconds from now. */
    function tone(context, frequency, at, peak = 0.16, length = 0.18) {
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      oscillator.type = 'sine'
      oscillator.frequency.value = frequency
      gain.gain.setValueAtTime(0.0001, context.currentTime + at)
      gain.gain.exponentialRampToValueAtTime(peak, context.currentTime + at + 0.012)
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + at + length)
      oscillator.connect(gain)
      gain.connect(context.destination)
      oscillator.start(context.currentTime + at)
      oscillator.stop(context.currentTime + at + length + 0.02)
    }

    /**
     * Stop whatever the system voice is saying.
     *
     * Used when the user pauses, skips or stops: the interval that was being
     * announced is no longer current, so its sentence must not keep playing.
     */
    function hush() {
      cancelCompletion()
      if (typeof window === 'undefined') return
      const synthesis = window.speechSynthesis
      if (synthesis === undefined || synthesis === null || typeof synthesis.cancel !== 'function') return
      try {
        synthesis.cancel()
      } catch {
        /* the engine refused; nothing else to do */
      }
    }

    /**
     * The special tone that marks the start and the end of an interval.
     *
     * Ascending at a start and descending at an end, so the two are
     * distinguishable by ear alone and neither is confusable with the quiet
     * per-second tick.
     * @param {'start'|'end'} kind - which boundary this is.
     */
    function boundaryTone(kind) {
      const context = audio()
      if (context === null) return
      try {
        if (kind === 'end') {
          tone(context, 1320, 0, 0.2, 0.12)
          tone(context, 990, 0.13, 0.2, 0.16)
          tone(context, 660, 0.27, 0.22, 0.24)
        } else {
          tone(context, 660, 0, 0.2, 0.12)
          tone(context, 990, 0.13, 0.2, 0.16)
          tone(context, 1320, 0.27, 0.22, 0.24)
        }
      } catch {
        /* audio is optional; the timer keeps running without it */
      }
    }

    /**
     * The per-second countdown tick.
     *
     * Deliberately shorter, quieter and lower than the boundary tones, so a
     * running clock is audible without sounding like an interval change. Kept to
     * one tone: at one beep a second, anything longer would smear into the next.
     */
    function secondTick() {
      const context = audio()
      if (context === null) return
      try {
        tone(context, 620, 0, 0.07, 0.06)
      } catch {
        /* audio is optional */
      }
    }

    /**
     * Announce one interval start: its name plus "Start", spoken and shown.
     *
     * @param {object} announcement - the announcement to speak.
     * @param {object} options - voice on/off, language, and the completion callback.
     * @returns {boolean} whether speech was started (see {@link speak}).
     */
    function announceInterval(announcement, options) {
      if (!options.voice) return false
      return speak(`${announcement.name}. ${announcement.word}`, options.lang, options.onDone)
    }

    /**
     * Warn that the current interval has five seconds left.
     *
     * Spoken as a standalone sentence — the countdown is what the user needs to
     * hear, and the interval name would only delay it. No tone accompanies it:
     * the boundary tones are the interval signature, so reusing one here would
     * make a warning indistinguishable from a new interval.
     */
    function warnFiveSecondsLeft(warning) {
      if (warning.voice) speak(warning.text, warning.lang)
    }

    /**
     * Say that the whole series is over.
     *
     * The final interval's descending end tone is still ringing when `finish`
     * runs, so the sentence waits briefly for it; otherwise the two sounds talk
     * over each other. Voice off means silent, like every other announcement.
     * A new announcement or a stop drops the pending sentence first (see
     * {@link speak} and {@link hush}), so starting a new run right away is never
     * cancelled by this one.
     * @param {{text: string, lang: string, voice: boolean}} completion - what to say.
     */
    function announceCompletion(completion) {
      if (!completion.voice || typeof completion.text !== 'string' || completion.text === '') return
      cancelCompletion()
      const say = () => {
        completionTimer = null
        speakNow(completion.text, completion.lang)
      }
      try {
        completionTimer = setTimeout(say, 450)
      } catch {
        /* no timer available: say it now rather than not at all */
        say()
      }
    }

    // --------------------------------------------------------------- transport

    /** Resolve one of this plugin's Host routes against the page base. */
    function apiUrl(path) {
      const base = typeof document !== 'undefined' ? document.baseURI : 'http://localhost/'
      return new URL(`advanced-timer/api/${path}`.replace(/^\/+/, ''), base).href
    }

    async function fetchSeries() {
      const response = await fetch(apiUrl('series'), { cache: 'no-store' })
      const payload = await response.json()
      if (payload?.ok !== true) throw new Error(payload?.error ?? 'series unavailable')
      return payload.value
    }

    async function saveSeries(series) {
      const response = await fetch(apiUrl('series'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ series }),
      })
      const payload = await response.json()
      if (payload?.ok !== true) throw new Error(payload?.error ?? 'save failed')
      return payload.value
    }

    // ------------------------------------------------------------------ icons

    /**
     * The engine this Client instance is running.
     *
     * Slot entries normally receive it through their `inject` face. The
     * module-level handle is the fallback for a renderer that dispatches a
     * registration without running its inject: a missing `engine` must degrade
     * to the same timer, never to a crashed slot entry.
     */
    let activeEngine = null

    function TimerPanelIcon({ size }) {
      return h(
        'svg',
        {
          width: size ?? 16,
          height: size ?? 16,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.8,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
        },
        h('circle', { cx: 12, cy: 13.5, r: 7.5 }),
        h('path', { d: 'M12 9.6v4.2l2.7 1.6' }),
        h('path', { d: 'M9.4 2.6h5.2M12 2.6v2.2' }),
        h('path', { d: 'M19.6 6.4l1.4-1.4M4.4 6.4L3 5' }),
      )
    }

    // ------------------------------------------------------------------ hooks

    /** Re-render this component whenever the engine state changes. */
    function useTimerState(engine) {
      const [, force] = React.useState(0)
      React.useEffect(() => (engine === null ? undefined : engine.subscribe(() => force((value) => value + 1))), [engine])
      return engine === null ? null : engine.getState()
    }

    /** An empty state, so a component with no engine renders instead of throwing. */
    const IDLE_STATE = {
      status: 'idle',
      starting: false,
      series: { version: 1, intervals: [], loop: false, voice: true, beep: true, warn: true, secondBeep: true },
      index: 0,
      endsAt: 0,
      remainingMs: 0,
      pausedRemaining: 0,
      announcement: null,
      save: 'idle',
    }

    /**
     * `usePanelInfo` is a standard slot prop, but a renderer that dispatches a
     * registration without standard props would pass it as undefined; reading
     * the active panel is an enhancement, so fall back to "not on this panel".
     */
    function panelInfoHook(usePanelInfo) {
      return typeof usePanelInfo === 'function' ? usePanelInfo : () => false
    }

    /** Total length of a series, in whole seconds. */
    function totalSeconds(series) {
      return series.intervals.reduce((sum, row) => sum + row.seconds, 0)
    }

    /**
     * Status label for the active locale.
     *
     * `starting` is the moment an interval's name is being spoken and its
     * countdown has not begun: the timer is running, but the clock is not.
     */
    function statusLabel(t, status, starting) {
      if (starting) return t('statusStarting')
      if (status === 'running') return t('statusRunning')
      if (status === 'paused') return t('statusPaused')
      if (status === 'finished') return t('statusFinished')
      return t('statusIdle')
    }

    // -------------------------------------------------------------------- page

    /**
     * A whole-number field that can be cleared.
     *
     * A controlled `type=number` bound straight to the model cannot be emptied:
     * `Number('')` is 0, which clamps straight back, so the caret fights the
     * user. The draft string is local; the model is only committed for a value
     * the user actually typed, and the field resyncs from the model on blur.
     */
    function NumberField({ value, min, max, disabled, ariaLabel, onCommit }) {
      const [draft, setDraft] = React.useState(String(value))
      const [editing, setEditing] = React.useState(false)
      React.useEffect(() => {
        if (!editing) setDraft(String(value))
      }, [value, editing])
      return h('input', {
        className: 'at-num',
        type: 'number',
        min,
        max,
        value: draft,
        disabled,
        'aria-label': ariaLabel,
        onFocus: () => setEditing(true),
        onBlur: () => {
          setEditing(false)
          setDraft(String(value))
        },
        onChange: (event) => {
          const next = event.target.value
          setDraft(next)
          if (next === '') return
          const parsed = Number(next)
          if (Number.isFinite(parsed)) onCommit(parsed)
        },
      })
    }

    function IntervalRow({ t, row, index, active, locked, last, onName, onMinutes, onSeconds, onMove, onRemove }) {
      const minutes = Math.floor(row.seconds / 60)
      const seconds = row.seconds % 60
      return h(
        'div',
        { className: 'at-row', 'data-locked': locked ? 'true' : 'false', 'data-active': active ? 'true' : 'false' },
        h('span', { className: 'at-badge', title: fmt(t('intervalIndex'), { n: index + 1 }) }, String(index + 1)),
        h('input', {
          className: 'at-name',
          type: 'text',
          value: row.name,
          placeholder: t('namePlaceholder'),
          maxLength: 80,
          disabled: locked,
          'aria-label': fmt(t('intervalIndex'), { n: index + 1 }),
          onChange: (event) => onName(event.target.value),
        }),
        h(NumberField, {
          value: minutes,
          min: 0,
          max: 1440,
          disabled: locked,
          ariaLabel: t('minutesShort'),
          onCommit: onMinutes,
        }),
        h('span', { className: 'at-unit' }, t('minutesShort')),
        h(NumberField, {
          value: seconds,
          min: 0,
          max: 59,
          disabled: locked,
          ariaLabel: t('secondsShort'),
          onCommit: onSeconds,
        }),
        h('span', { className: 'at-unit' }, t('secondsShort')),
        h(
          'button',
          { className: 'at-icon-btn', type: 'button', title: t('moveUp'), 'aria-label': t('moveUp'), disabled: locked || index === 0, onClick: () => onMove(-1) },
          '↑',
        ),
        h(
          'button',
          { className: 'at-icon-btn', type: 'button', title: t('moveDown'), 'aria-label': t('moveDown'), disabled: locked || last, onClick: () => onMove(1) },
          '↓',
        ),
        h(
          'button',
          { className: 'at-icon-btn', type: 'button', title: t('remove'), 'aria-label': t('remove'), disabled: locked, 'data-tone': 'danger', onClick: onRemove },
          '×',
        ),
      )
    }

    function AdvancedTimerPage({ t, engine: injected }) {
      const engine = injected ?? activeEngine
      const state = useTimerState(engine) ?? IDLE_STATE
      const series = state.series
      const locked = state.status === 'running' || state.status === 'paused'
      const count = series.intervals.length
      const current = series.intervals[state.index]
      const total = totalSeconds(series)
      const durationMs = current === undefined ? 0 : current.seconds * 1000
      const running = state.status === 'running' || state.status === 'paused'
      const progress = !running || durationMs === 0 ? 0 : Math.min(1, Math.max(0, 1 - state.remainingMs / durationMs))
      const next = count === 0 ? null : series.intervals[(state.index + 1) % count]
      const clock = state.status === 'idle' ? formatClock((current?.seconds ?? 0) * 1000) : formatClock(state.remainingMs)
      const name = current === undefined ? '' : current.name.trim() || fmt(t('intervalIndex'), { n: state.index + 1 })
      // The same five-second boundary that triggers the voice: the clock turns
      // warning-coloured so the cue is visible when the voice is muted. The
      // countdown is not running yet while the name is being spoken.
      const warning = state.status === 'running' && !state.starting && state.remainingMs <= WARN_LEAD_MS && state.remainingMs > 0

      const saveText = state.save === 'saving' ? t('saving') : state.save === 'error' ? t('saveFailed') : state.save === 'saved' ? t('saved') : ''

      return h(
        'div',
        { className: 'at-page' },
        h('header', { className: 'at-head' }, h('h1', null, t('title')), h('p', null, t('intro'))),
        h(
          'div',
          { className: 'at-grid' },
          h(
            'section',
            { className: 'at-card' },
            h(
              'div',
              { className: 'at-card-head' },
              h('h2', null, t('seriesTitle')),
              h('span', { className: 'at-meta' }, `${fmt(t('count'), { n: count })} · ${fmt(t('total'), { time: formatShort(total) })}`),
            ),
            h('p', { className: 'at-hint' }, locked ? t('locked') : t('seriesHint')),
            h(
              'div',
              { className: 'at-rows' },
              count === 0
                ? h('div', { className: 'at-empty' }, t('empty'))
                : series.intervals.map((row, index) =>
                    h(IntervalRow, {
                      key: row.id,
                      t,
                      row,
                      index,
                      active: locked && index === state.index,
                      locked,
                      last: index === count - 1,
                      onName: (value) => engine.updateInterval(row.id, { name: value }),
                      onMinutes: (value) => engine.updateInterval(row.id, { seconds: clampSeconds((Number(value) || 0) * 60 + (row.seconds % 60)) }),
                      onSeconds: (value) =>
                        engine.updateInterval(row.id, {
                          seconds: clampSeconds(Math.floor(row.seconds / 60) * 60 + Math.min(59, Math.max(0, Number(value) || 0))),
                        }),
                      onMove: (direction) => engine.moveInterval(row.id, direction),
                      onRemove: () => engine.removeInterval(row.id),
                    }),
                  ),
            ),
            h('button', { className: 'at-add', type: 'button', disabled: locked || count >= 50, onClick: () => engine.addInterval() }, `+ ${t('addInterval')}`),
            h(
              'div',
              { className: 'at-options' },
              h(
                'label',
                { className: 'at-option' },
                h('input', { type: 'checkbox', checked: series.loop, disabled: locked, onChange: (event) => engine.setOption('loop', event.target.checked) }),
                t('loop'),
              ),
              h(
                'label',
                { className: 'at-option' },
                h('input', { type: 'checkbox', checked: series.voice, onChange: (event) => engine.setOption('voice', event.target.checked) }),
                t('voice'),
              ),
              h(
                'label',
                { className: 'at-option' },
                h('input', { type: 'checkbox', checked: series.beep, onChange: (event) => engine.setOption('beep', event.target.checked) }),
                t('beep'),
              ),
              h(
                'label',
                { className: 'at-option' },
                h('input', { type: 'checkbox', checked: series.warn, onChange: (event) => engine.setOption('warn', event.target.checked) }),
                t('warn'),
              ),
              h(
                'label',
                { className: 'at-option' },
                h('input', { type: 'checkbox', checked: series.secondBeep, onChange: (event) => engine.setOption('secondBeep', event.target.checked) }),
                t('secondBeep'),
              ),
            ),
            h('div', { className: 'at-save', 'data-tone': state.save === 'error' ? 'error' : 'ok' }, saveText),
          ),
          h(
            'section',
            { className: 'at-card at-now' },
            h(
              'div',
              { className: 'at-now-head' },
              h('span', { className: 'at-status', 'data-state': state.starting ? 'starting' : state.status }, statusLabel(t, state.status, state.starting)),
              count > 0 ? h('span', { className: 'at-meta' }, fmt(t('intervalOf'), { i: state.index + 1, n: count })) : null,
            ),
            h('div', { className: 'at-clock', 'data-warning': warning ? 'true' : 'false' }, clock),
            h('div', { className: 'at-current', 'data-empty': name === '' ? 'true' : 'false' }, name === '' ? t('noInterval') : name),
            state.announcement === null
              ? null
              : h(
                  'div',
                  { className: 'at-announce', role: 'status' },
                  h('span', { className: 'at-announce-name' }, state.announcement.name),
                  h('span', { className: 'at-announce-word' }, state.announcement.word),
                ),
            h('div', { className: 'at-bar' }, h('i', { style: { width: `${Math.round(progress * 100)}%` } })),
            h(
              'div',
              { className: 'at-next' },
              state.status === 'finished'
                ? t('finishedNote')
                : count === 0
                  ? ''
                  : state.index === count - 1 && !series.loop
                    ? t('lastOne')
                    : fmt(t('nextUp'), { name: next?.name.trim() || fmt(t('intervalIndex'), { n: ((state.index + 1) % count) + 1 }) }),
            ),
            h(
              'div',
              { className: 'at-controls' },
              state.status === 'idle' || state.status === 'finished'
                ? h(
                    'button',
                    {
                      className: 'at-btn',
                      type: 'button',
                      'data-kind': 'primary',
                      disabled: count === 0,
                      onClick: () => {
                        // Unlock audio inside the click itself: a browser refuses
                        // to start sound from the timer that runs a second later.
                        unlockAudio()
                        engine.start()
                      },
                    },
                    state.status === 'finished' ? t('restart') : t('start'),
                  )
                : null,
              state.status === 'running' ? h('button', { className: 'at-btn', type: 'button', onClick: () => engine.pause() }, t('pause')) : null,
              state.status === 'paused'
                ? h(
                    'button',
                    {
                      className: 'at-btn',
                      type: 'button',
                      'data-kind': 'primary',
                      onClick: () => {
                        unlockAudio()
                        engine.resume()
                      },
                    },
                    t('resume'),
                  )
                : null,
              state.status === 'running' || state.status === 'paused'
                ? h('button', { className: 'at-btn', type: 'button', disabled: count < 2, onClick: () => engine.skip() }, t('skip'))
                : null,
              state.status === 'running' || state.status === 'paused' ? h('button', { className: 'at-btn', type: 'button', onClick: () => engine.stop() }, t('stop')) : null,
            ),
            h('p', { className: 'at-hint-line' }, t('voiceHint')),
          ),
        ),
      )
    }

    // -------------------------------------------------------------------- HUD

    function TimerHud({ t, engine: injected, openPanel, usePanelInfo }) {
      const engine = injected ?? activeEngine
      const state = useTimerState(engine) ?? IDLE_STATE
      const usePanel = panelInfoHook(usePanelInfo)
      const onTimerPanel = usePanel((info) => info.activePanelId === PANEL_ID)
      if (onTimerPanel || state.status !== 'running' && state.status !== 'paused') return null
      const count = state.series.intervals.length
      const current = state.series.intervals[state.index]
      const durationMs = current === undefined ? 0 : current.seconds * 1000
      const progress = durationMs === 0 ? 0 : Math.min(1, Math.max(0, 1 - state.remainingMs / durationMs))
      const name = current === undefined ? '' : current.name.trim() || fmt(t('intervalIndex'), { n: state.index + 1 })
      const warning = state.status === 'running' && state.remainingMs <= WARN_LEAD_MS && state.remainingMs > 0
      return h(
        'div',
        { className: 'at-hud', 'data-state': state.status, role: 'status' },
        h(
          'div',
          { className: 'at-hud-top' },
          h('span', { className: 'at-hud-dot' }),
          h('span', { className: 'at-hud-name' }, name),
          h('button', { className: 'at-icon-btn', type: 'button', title: t('openPanel'), 'aria-label': t('openPanel'), onClick: () => openPanel?.() }, '⤢'),
        ),
        h('div', { className: 'at-hud-clock', 'data-warning': warning ? 'true' : 'false' }, formatClock(state.remainingMs)),
        h('div', { className: 'at-bar' }, h('i', { style: { width: `${Math.round(progress * 100)}%` } })),
        h(
          'div',
          { className: 'at-hud-foot' },
          h('span', { className: 'at-meta' }, `${state.index + 1}/${count}`),
          h(
            'div',
            { className: 'at-hud-actions' },
            state.status === 'running'
              ? h('button', { className: 'at-icon-btn', type: 'button', title: t('pause'), 'aria-label': t('pause'), onClick: () => engine.pause() }, '⏸')
              : h(
                  'button',
                  {
                    className: 'at-icon-btn',
                    type: 'button',
                    title: t('resume'),
                    'aria-label': t('resume'),
                    onClick: () => {
                      unlockAudio()
                      engine.resume()
                    },
                  },
                  '▶',
                ),
            h('button', { className: 'at-icon-btn', type: 'button', title: t('skip'), 'aria-label': t('skip'), disabled: count < 2, onClick: () => engine.skip() }, '⏭'),
            h('button', { className: 'at-icon-btn', type: 'button', title: t('stop'), 'aria-label': t('stop'), 'data-tone': 'danger', onClick: () => engine.stop() }, '■'),
          ),
        ),
      )
    }

    /** The interval-start announcement, shown wherever the user is. */
    function TimerAnnouncement({ t, engine: injected, usePanelInfo }) {
      const engine = injected ?? activeEngine
      const state = useTimerState(engine) ?? IDLE_STATE
      const usePanel = panelInfoHook(usePanelInfo)
      const onTimerPanel = usePanel((info) => info.activePanelId === PANEL_ID)
      if (onTimerPanel || state.announcement === null) return null
      return h(
        'div',
        { className: 'at-toast', role: 'status', 'aria-live': 'polite' },
        h('span', { className: 'at-toast-label' }, t('announcementLabel')),
        h('span', { className: 'at-toast-name' }, state.announcement.name),
        h('span', { className: 'at-toast-word' }, state.announcement.word),
      )
    }

    // ------------------------------------------------------------------ export

    return {
      inject: ['slots', 'locale'],
      // Engine and helpers are exported for tests only; the Host never calls them.
      __test: { createTimerEngine, normalizeSeries, formatClock, clampSeconds, totalSeconds, announceCompletion, announceInterval, hush },
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'advanced-timer: dictionaries')
        const t = ctx.locale.bind(NS)

        installCss(ctx)

        const engine = createTimerEngine({
          storage: typeof localStorage === 'undefined' ? null : localStorage,
          announce: announceInterval,
          warn: warnFiveSecondsLeft,
          complete: announceCompletion,
          secondBeep: secondTick,
          signal: boundaryTone,
          hush,
        })
        engine.setTranslate(t)
        engine.setLocaleGetter(() => ctx.locale.getLocale().active)
        engine.setSaver(saveSeries)
        engine.restore()
        activeEngine = engine

        // The Host's copy is the durable one, but it must not overwrite a run
        // restored from this browser or an edit made while the fetch was in
        // flight; `pristine` is the series as it stood before either. Comparing
        // against it (rather than against "is it non-empty") is what lets a user
        // who deleted every row keep the deletion instead of having the Host's
        // copy resurrect it on the next load.
        const pristine = JSON.stringify(stripStamp(engine.getState().series))
        if (typeof fetch === 'function') {
          void fetchSeries()
            .then((series) => engine.adoptSeries(series, pristine))
            .catch(() => {})
        }

        const layout = () => (typeof ctx.get === 'function' ? ctx.get('layout') : undefined)
        const openPanel = () => {
          try {
            // Resolved on click, not at activation: the layout service may not be
            // installed yet while this plugin's `apply` is running.
            layout()?.selectPanel?.(PANEL_ID)
          } catch {
            /* navigation is a convenience: the sidebar row still works */
          }
        }

        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register(
            {
              name: 'sidebar.panellist',
              id: PANEL_ID,
              // Below Plugins (0) and the news digest (0.5), above the older rows.
              order: 0.6,
              locale: NS,
              label: () => t('panel'),
            },
            TimerPanelIcon,
          ),
        )

        ctx.slots.inject('main', () =>
          ctx.slots.register(
            {
              name: 'main',
              key: PANEL_ID,
              locale: NS,
              inject: () => ({ engine }),
            },
            AdvancedTimerPage,
          ),
        )

        ctx.slots.inject('shell.overlay', () =>
          ctx.slots.register(
            {
              name: 'shell.overlay',
              id: 'advanced-timer-hud',
              order: 40,
              locale: NS,
              inject: () => ({ engine, openPanel }),
            },
            TimerHud,
          ),
        )

        ctx.slots.inject('shell.overlay', () =>
          ctx.slots.register(
            {
              name: 'shell.overlay',
              id: 'advanced-timer-announcement',
              order: 41,
              locale: NS,
              inject: () => ({ engine }),
            },
            TimerAnnouncement,
          ),
        )

        ctx.effect(() => () => {
          engine.dispose()
          if (activeEngine === engine) activeEngine = null
        }, 'advanced-timer: engine')
      },
    }
  },
})
