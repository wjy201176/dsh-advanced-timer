# Advanced Timer

A DeepSeek Harness plugin for interval training or any work split into named
segments: **a series of intervals that run back to back, each with its own
name and its own length.**

Add intervals one by one in the order you want them. The timer runs them
continuously — the next interval starts at the exact instant the previous one
ends, with no gap and no restart in between. At the beginning of every interval
the plugin *produces the interval name and "Start"*: it speaks the pair through
the system voice, plays a two-tone chime, shows a banner on the timer page, and
— if you are looking at another panel — drops a frame-wide announcement over the
whole window.

## What you get

- **A sidebar row and a full page.** The page holds the series editor and the
  live clock, side by side.
- **Several saved configurations.** Keep more than one timer — a morning
  workout, an evening routine, a focus session — and switch between them from
  the picker above the interval list. New, rename, duplicate and delete are all
  there; every configuration keeps its own intervals and its own options
  (loop, voice, beeps, warning). A configuration can be duplicated to start a
  variant from a full list, and the last one cannot be deleted.
- **An editor for the series.** Add, rename, re-time (minutes + seconds),
  reorder, and remove intervals. Each row is independent. Editing is paused
  while the timer runs.
- **Every countdown starts after its own name.** An interval begins by showing
  and speaking its name plus "Start"; its clock only starts running when that
  announcement is over. While the name is spoken the status reads **Starting**
  and the clock holds the full interval length.
- **A special tone at each interval's start and end.** A bright ascending
  three-tone marks the moment the countdown begins; a descending three-tone
  marks the moment it reaches zero. Distinguishable by ear alone and from the
  quieter per-second tick. Switch them off with the "Start & end beep" checkbox.
- **Five-second warning.** With five seconds left in an interval the voice says
  "5 seconds left" (「还剩 5 秒」 in Chinese) — once per interval, never twice,
  and never for an interval five seconds or shorter, where it would collide with
  that interval's own start announcement. Turn it off with the "Speak a
  5-second warning" checkbox.
- **A tick on every second.** Each elapsed second of every interval gets a
  short, quiet tone — one per displayed second, not one per 200 ms tick, and a
  tick that jumped several seconds at once is not replayed as a burst. Turn it
  off with the "Tick every second" checkbox.
- **A floating HUD.** While the timer runs and you are on another panel, a
  compact card in the frame's overlay shows the current interval, the
  countdown, and pause / skip / stop.
- **Loop, voice, start/end beep, warning and per-second tick toggles** — per
  configuration.
- **Durable library.** The Host keeps every configuration under
  `$DSH_HOME/advanced-timer/library.json`, so everything survives a restart and
  follows you to another session. A saved single-series file from an earlier
  version is migrated on first read. Every save is stamped, so a browser with
  unsaved newer edits is never rolled back by a stale Host copy.
- **Reload-safe run.** The browser keeps the live run — including which
  configuration was running — so a reload reopens that configuration and
  re-announces the interval it resumes into before its clock restarts.
- **Completion announcement.** When the last interval ends, the voice says
  "All cycles completed" (「全部循环已完成」 in Chinese), once the final end tone
  has rung out. It follows the voice switch; a run that is stopped never claims
  to have completed.
- **Bilingual UI** (English / 简体中文) through the host locale service.

## Install

From the DSH profile, install the package directory as a bundle:

```
plugin_manager action=install_bundle target=D:\Workspace\advanced-timer
```

The bundle patch inserts one row, `advanced-timer`; the Client half adds the
sidebar row, the main panel and two `shell.overlay` entries.

## Using it

1. Open **Advanced Timer** in the left sidebar.
2. Pick or create a configuration in the picker above the list; give it a name.
3. Press **Add interval** and give each interval a name and a length.
4. Press **Start**. The first interval is announced immediately; each following
   one is announced the moment it begins.
5. Switch to any other panel and the HUD keeps counting — it also names the
   configuration that is running. Press pause, skip or stop from the HUD, or
   open the timer page from it.

Use **+**, **⧉** and **×** beside the picker to add, duplicate and delete a
configuration. Deleting asks once; the last remaining configuration cannot be
deleted, so there is always somewhere to keep intervals.

## How the pieces fit

| File | Role |
|---|---|
| `index.js` | Host half: the `/advanced-timer/api/library` route and the durable store. |
| `lib/series.js` | The library and configuration shapes and their cleaning rules, shared with the state file. |
| `client.js` | Client half: the timer engine, the page, the HUD and the announcement. |
| `locale/en.json`, `locale/zh.json` | Display metadata plus the runtime dictionaries. |

The countdown lives in the Client because it is a wall-clock countdown rendered
in the page; the Host owns only the saved library. The engine is a small
observable store, so the page and the overlay are two views over one timer and
switching panels never stops it.

## Test

```
node --test test/client.test.mjs test/host.test.mjs
```

`node --test` spawns a child process per file, which a confined sandbox can
refuse; running each file directly works there too.

## License

MIT.
