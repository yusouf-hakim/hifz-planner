# Quran Revision App — Roadmap

Revised Nov 16, 2026, after reviewing the original brainstorm against what is built. Updated Nov 17, 2026 with the catch-up rework.

## What the app is

The app is a planner: it decides exactly what to memorize and revise each day, and when. The reciting happens elsewhere.

- **Recitation, listening and mistake-marking stay in dedicated tools like Tarteel.** The app does not try to compete with them.
- **The app's job** is to know what is memorized, how strong each part is and how much time you have, then turn that into a precise daily plan.
- **The only thing it asks after a session** is a one-tap rating of how each part went.

## Scheduling principle

The far rotation stays whole. Everything older is revised in mushaf order on a steady cycle, so a juz is always recited as one run. Ratings only add visits: a part rated Weak or Some hesitation gets extra passes between its turns in the cycle, and a Solid rating never pushes anything later than its normal turn. Each part does not get its own revision date, because that would break a juz into fragments revised on different days.

## Status

| Feature | Status |
| --- | --- |
| Core: daily plan, marking what is memorized, pace and time, separate pages | Built |
| Ayah-level precision | Built. Portions do not yet end at natural stopping points. |
| Mutashabihat alerts | Built for new memorization. Uses a list derived by comparing ayah wording, not a curated source. |
| Progress reports | Built. Still to align with this roadmap (see step 4). |
| Catch-up plans | Reworked (step 3 below). Written and tested; waiting to be published to the app. |
| Week calendar with placed sittings | Built |
| Session ratings | Built (step 1 below) |

## Build order from here

### 1. Session ratings (built)

- Four ratings per part: **Solid**, **Some hesitation**, **Weak**, **Didn't get to it**.
- Long portions are split into quarter-juz parts (5 pages) so neighbouring sections can be rated differently. "Rate all Solid" covers the common case in one tap.
- **Weak:** an extra pass every few days (default 3) until rated Solid twice in a row.
- **Some hesitation:** an extra pass less often (default 6 days) until rated Solid once.
- **Didn't get to it:** not counted as weak. A far part moves to the catch-up backlog (step 3).
- Extra passes take at most 40% of the daily time; the rest stay due for the next day.
- Extra passes come with a short lead-in from the page before, to practise the join.
- **Near-revision graduation:** a page leaves near revision after the set number of days only once it has been rated Solid, or after twice that long at most.

### 2. Busy-week mode

Spot heavy days in the calendar ahead of time and suggest a lighter plan for them.

- A day is busy when its free time is shorter than the full plan or below a set threshold. A stretch can also be marked busy by hand, such as finals week.
- Priority on busy days: near revision first, then the weakest far portions, then reduced or paused new memorization. Far revision shrinks to the minimum that still covers everything within the longest allowed cycle.
- The light plan is a suggestion to accept or adjust.
- Ramp back up over a few days afterward.
- Limit: the planner can only read the calendar when it is open and the calendar has been loaded.

### 3. Catch-up rework (written, waiting to be published)

- **Backlog holds far revision only.** Near revision repeats daily, so a missed day leaves nothing to make up. Extra passes left undone are simply still due.
- **The rotation keeps its place.** Far parts left undone, and each fully skipped day's far share, go into a backlog of pages. The cycle moves on as if the day had been done.
- **Automatic catch-up time:** at most 25% of the daily minutes (adjustable from 10% to 50% in Settings), shown as a Catch-up list under far revision. Scaled down while ramping up after busy days; none on light days.
- **Weakest runs first.** The backlog is grouped into runs within each juz, read in mushaf order. Runs with more Weak or hesitant pages go first; among equals, the one whose next normal turn is furthest away.
- **No double reading.** Backlog pages whose normal turn comes tomorrow are left to the rotation. A backlog page also leaves the backlog whenever it is revised for any reason.
- **Reset:** if the backlog can't be cleared within a week (counting both catch-up and the rotation reaching it), a reset is offered: drop the backlog and carry on from the current place in the cycle, so missed parts come round on their normal turn. It can be turned down; it is offered again only if the backlog grows. A small "clear it and carry on" link is always available.
- Replaces the earlier choice between adding time, pausing new memorization or carrying on. Older saves have their owed minutes converted into backlog pages.

### 4. Report and alert refinements

- Reports: add trends (parts that improved, parts rated Weak more than once) and cycle progress. Show strength on the existing Mushaf page map instead of a second map. Replace the "days in a row" count with plain "5 of 7 days".
- Alerts: also check near revision and far parts rated Weak, but not all far revision. Let a mastered pair be dismissed.
- Portions end at natural stopping points (page end or rub' al-hizb) where possible.

### 5. Backup and restore

Export and import all progress data. Also makes the move to a standalone website painless.

### 6. Class days (skipped for now)

Know which days there is a Qur'an class, show what is due to present, and arrange the day's plan to finish it before class.

### 7. Tafsir links

A link from each day's new portion to its tafsir. A built-in tafsir card needs licensed text and a server, so it waits for the website.

## After the planner is finished

Move to Claude Code to build the standalone website: hosting, accounts and a database, and a direct Google Calendar connection. Start with a version for personal use, since everything in it carries over to a public one.

## Out of scope

These stay with dedicated recitation tools such as Tarteel:

- Reading the mushaf inside the app.
- Listening to reciters or recording yourself.
- Marking mistakes or logging them ayah by ayah.
