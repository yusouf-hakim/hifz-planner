# Hifz Planner

A personal Qur'an memorization and revision planner. It knows what I have memorized, how strong each part is and how much time I have, and turns that into a precise daily plan: new memorization, near revision and far revision, with times placed around my Google Calendar.

It is a planner only. Reading the mushaf, audio and mistake-marking stay in tools like Tarteel.

I am new to programming. Explain what you are doing in plain language, keep changes small, and tell me how to check each one in the browser.

## Files

- `index.html` - the page: layout, styles and the six views (Today, Calendar, Schedule, Progress, Mushaf, Settings). Views switch on the URL hash (`#today`, `#calendar`, ...).
- `engine.js` - all scheduling logic, no DOM. Exposes `window.Hifz`. Pure functions over a state object, so it can be tested with Node.
- `app.js` - rendering, events, saving and the Google Calendar calls. Reads and writes the state through `Hifz`.
- `data.js` - Qur'an reference data for the 604-page Madani mushaf: ayah counts per surah, the first ayah of each page, a per-ayah length weight, and a similar-verse (mutashabihat) list. Exposes `window.HifzData`. Do not hand-edit it.
- `my-progress.json` - my real saved progress, exported from the old version. Needs importing (see First tasks).

Load order matters: `data.js`, then `engine.js`, then `app.js`.

## How the data works

- Ayahs are numbered 1 to 6236 through the whole Qur'an. `Hifz.gOf(surahIndex, ayah)` converts; `Hifz.ref(g)` converts back.
- `state.pages[p]` is `[strength, dateMemorized, spans?]`. Strength 1 = solid, 3 = some hesitation, 2 = weak. Date is `"YYYY-MM-DD"` or 0 for long-memorized. `spans` lists memorized ayah ranges when only part of the page is known.
- `state.day` is today's plan. `Hifz.rollover(state, date)` closes the previous day and builds a new one; `Hifz.rebuild(state, date)` rebuilds today keeping finished rows.
- Plan rows are `{a, b, min, done}`, page range a..b. `done`: 0 not yet, 1 solid, 3 hesitation, 2 weak, 4 didn't get to it.
- `state.extra[p]` counts Solid ratings still needed before extra passes stop. `state.seen[p]` is the date last revised.
- `state.busy[date]` marks light days. `state.debt` and `state.catchup` drive catch-up.
- `state.set` holds the settings.

## Scheduling principle (do not break this)

The far rotation stays whole: everything older is revised in mushaf order on a steady cycle, so a juz is recited as one run. Ratings only add extra passes for weak or hesitant parts; a Solid rating never pushes anything later than its normal turn. Parts do not get their own individual revision dates.

## What was specific to Claude and needs replacing

The page was built to run inside Claude, which provided two things through `window.claude.use(...)` in `app.js`:

1. **Saving** (`use("db")`): progress was saved to Claude's storage. Outside Claude this is unavailable, and the page falls back to `localStorage` in the browser, which works but stays on one browser.
2. **Google Calendar** (`use("mcp")`): calendar reads and event creation went through Claude's Google Calendar connector (`list_events`, `create_event`). Outside Claude these calls fail with a "can't be reached" message. This needs replacing with the Google Calendar API directly (Google sign-in, a Google Cloud project, OAuth in testing mode for personal use).

Everything else runs as plain browser code with no build step.

## Testing

- Open `index.html` in a browser to use the app.
- The engine can be tested in Node: `node -e 'require("./data.js"); require("./engine.js"); const E = globalThis.Hifz; ...'`.

## Roadmap

The full roadmap is in my Claude project as "Quran Revision App - Roadmap". Status when this moved over:

- Built: core plan, ayah-level precision, mutashabihat alerts on new memorization, progress reports, catch-up plans, week calendar with placed sittings, session ratings with extra passes and near-revision graduation, busy-week mode.
- Next: catch-up rework (far revision only, cap of 20-30% extra a day, weakest first, offer a reset), then report and alert refinements, then backup and restore, then tafsir links. Class days are skipped for now.

## First tasks

1. Put the project under git.
2. Add backup and restore (export state to a JSON file, import it back) on the Settings page, then import `my-progress.json`.
3. Make it a website for personal use: hosting, saving that follows me across devices, and a direct Google Calendar connection.
