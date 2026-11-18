# Hifz Planner

A personal Qur'an memorization and revision planner. It knows what I have memorized, how strong each part is and how much time I have, and turns that into a precise daily plan: new memorization, near revision and far revision, with times placed around my Google Calendar.

It is a planner only. Reading the mushaf, audio and mistake-marking stay in tools like Tarteel.

I am new to programming. Explain what you are doing in plain language, keep changes small, and tell me how to check each one in the browser.

## Files

- `index.html` - the page: layout, styles and the six views (Today, Calendar, Schedule, Progress, Mushaf, Settings). Views switch on the URL hash (`#today`, `#calendar`, ...).
- `engine.js` - all scheduling logic, no DOM. Exposes `window.Hifz`. Pure functions over a state object, so it can be tested with Node.
- `app.js` - rendering, events and saving. Reads and writes the state through `Hifz`, and talks to Google through `HifzGoogle`.
- `google.js` - Google sign-in (token model), Google Calendar reads and event creation, and saving to one JSON file in the Drive app folder. Exposes `window.HifzGoogle`. No page drawing.
- `data.js` - Qur'an reference data for the 604-page Madani mushaf: ayah counts per surah, the first ayah of each page, a per-ayah length weight, and a similar-verse (mutashabihat) list. Exposes `window.HifzData`. Do not hand-edit it.
- `my-progress.json` - my real saved progress. Personal: it is in `.gitignore` and must never be committed or pushed. Import it with Settings > Restore from file.

Load order matters: `data.js`, then `engine.js`, then Google's script, `google.js`, then `app.js`.

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

## Hosting, saving and Google (done)

- Live at `https://yusouf-hakim.github.io/hifz-planner/` (GitHub Pages, deployed from the `main` branch root). Pushing to `main` updates the site after about a minute.
- Saving: every change goes to the browser's `localStorage` and, once signed in, to a hidden file in my personal Google Drive app folder (`hifz-state.json`, scope `drive.appdata`). The newer `rev` wins when connecting. Backup and restore on the Settings page is the emergency copy.
- Calendar: reads every calendar that is switched on in my personal Google account (including my school calendar, which is shared to it) and adds sittings to the primary calendar.
- Google Cloud project is in testing mode with only my personal account as a test user. Sign-in only works on the github.io address, and my school account is not a test user and should not be used. Google may ask me to sign in again; the sidebar button handles that.
- The public repository holds no personal data: `my-progress.json` and `hifz-backup-*.json` are ignored, and commits use the GitHub noreply email.

## Testing

- Open `index.html` in a browser to use the app. Google sign-in only works on the live address, so test Google features after pushing.
- Node is not installed on this Mac. A quick JavaScript syntax check works with macOS's built-in engine (`osascript -l JavaScript`).

## Roadmap

The full roadmap is in my Claude project as "Quran Revision App - Roadmap". Status when this moved over:

- Built: core plan, ayah-level precision, mutashabihat alerts on new memorization, progress reports, catch-up plans, week calendar with placed sittings, session ratings with extra passes and near-revision graduation, busy-week mode.
- Also done since the move: git, backup and restore, hosting, Google sign-in, Drive saving, direct Google Calendar.
- Next: catch-up rework (far revision only, cap of 20-30% extra a day, weakest first, offer a reset), then report and alert refinements, then tafsir links. Class days are skipped for now.
