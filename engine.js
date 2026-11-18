/* Hifz planner engine. Pure logic, no DOM: mushaf data, daily plan, calendar slotting.
   Pages are those of the 15-line Madani mushaf (604 pages, 20 per juz). */
(function (root) {
  "use strict";

  var NAMES = "Al-Fatihah|Al-Baqarah|Ali 'Imran|An-Nisa|Al-Ma'idah|Al-An'am|Al-A'raf|Al-Anfal|At-Tawbah|Yunus|Hud|Yusuf|Ar-Ra'd|Ibrahim|Al-Hijr|An-Nahl|Al-Isra|Al-Kahf|Maryam|Ta-Ha|Al-Anbiya|Al-Hajj|Al-Mu'minun|An-Nur|Al-Furqan|Ash-Shu'ara|An-Naml|Al-Qasas|Al-'Ankabut|Ar-Rum|Luqman|As-Sajdah|Al-Ahzab|Saba|Fatir|Ya-Sin|As-Saffat|Sad|Az-Zumar|Ghafir|Fussilat|Ash-Shura|Az-Zukhruf|Ad-Dukhan|Al-Jathiyah|Al-Ahqaf|Muhammad|Al-Fath|Al-Hujurat|Qaf|Adh-Dhariyat|At-Tur|An-Najm|Al-Qamar|Ar-Rahman|Al-Waqi'ah|Al-Hadid|Al-Mujadilah|Al-Hashr|Al-Mumtahanah|As-Saff|Al-Jumu'ah|Al-Munafiqun|At-Taghabun|At-Talaq|At-Tahrim|Al-Mulk|Al-Qalam|Al-Haqqah|Al-Ma'arij|Nuh|Al-Jinn|Al-Muzzammil|Al-Muddaththir|Al-Qiyamah|Al-Insan|Al-Mursalat|An-Naba|An-Nazi'at|'Abasa|At-Takwir|Al-Infitar|Al-Mutaffifin|Al-Inshiqaq|Al-Buruj|At-Tariq|Al-A'la|Al-Ghashiyah|Al-Fajr|Al-Balad|Ash-Shams|Al-Layl|Ad-Duha|Ash-Sharh|At-Tin|Al-'Alaq|Al-Qadr|Al-Bayyinah|Az-Zalzalah|Al-'Adiyat|Al-Qari'ah|At-Takathur|Al-'Asr|Al-Humazah|Al-Fil|Quraysh|Al-Ma'un|Al-Kawthar|Al-Kafirun|An-Nasr|Al-Masad|Al-Ikhlas|Al-Falaq|An-Nas".split("|");
  var D = root.HifzData;
  var COUNTS = D.counts.split(",").map(Number), PSTART = D.pages.split(",").map(Number);
  var LAST = 604, TOTAL = 6236, SBASE = [], W = [0], PW = [0], STARTS = [];

  function num(a, b) { return a - b; }
  function sum(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  /* ---------- mushaf: ayahs are numbered 1..6236 through the whole Qur'an ---------- */
  function pFirst(p) { return PSTART[p - 1]; }
  function pLast(p) { return p === LAST ? TOTAL : PSTART[p] - 1; }
  function pageOf(g) { var lo = 1, hi = LAST; while (lo < hi) { var m = (lo + hi + 1) >> 1; if (PSTART[m - 1] <= g) lo = m; else hi = m - 1; } return lo; }
  function gOf(si, a) { return SBASE[si] + clamp(a, 1, COUNTS[si]); }
  function ref(g) { var i = 0; while (i < 113 && g > SBASE[i] + COUNTS[i]) i++; return [i, g - SBASE[i]]; }
  (function () {
    var i, g, p, b = 0;
    for (i = 0; i < 114; i++) { SBASE.push(b); b += COUNTS[i]; }
    for (g = 0; g < TOTAL; g++) { var v = parseInt(D.w.charAt(g), 36) / 1.5; W.push(v * v); }
    for (p = 1; p <= LAST; p++) { var t = 0; for (g = pFirst(p); g <= pLast(p); g++) t += W[g]; PW.push(t); }
    for (i = 0; i < 114; i++) STARTS.push(pageOf(SBASE[i] + 1));
  })();
  function juzStart(j) { return j === 1 ? 1 : (j - 1) * 20 + 2; }
  function juzEnd(j) { return j === 30 ? LAST : juzStart(j + 1) - 1; }
  function juzOf(p) { return p <= 21 ? 1 : Math.min(30, Math.floor((p - 2) / 20) + 1); }
  function spanLabel(g0, g1) {
    var a = ref(g0), b = ref(g1);
    if (a[0] === b[0]) return NAMES[a[0]] + " " + a[1] + (a[1] === b[1] ? "" : "–" + b[1]);
    return NAMES[a[0]] + " " + a[1] + " – " + NAMES[b[0]] + " " + b[1];
  }
  function spansLabel(sp) { return sp.map(function (x) { return spanLabel(x[0], x[1]); }).join("; "); }
  function pagesLabel(a, b) { return a === b ? "p. " + a : "p. " + a + "–" + b; }
  function rangeLabel(a, b) {
    var ja = juzOf(a), jb = juzOf(b);
    return "Juz " + (ja === jb ? ja : ja + "–" + jb) + " · " + pagesLabel(a, b);
  }

  /* ---------- what is memorized: a page entry is [strength, date] or [strength, date, spans] ---------- */
  function addSpan(list, a, b) {
    var out = [], i;
    for (i = 0; i < list.length; i++) {
      var x = list[i];
      if (x[1] < a - 1 || x[0] > b + 1) out.push([x[0], x[1]]);
      else { a = Math.min(a, x[0]); b = Math.max(b, x[1]); }
    }
    out.push([a, b]);
    return out.sort(function (x, y) { return x[0] - y[0]; });
  }
  function subSpan(list, a, b) {
    var out = [];
    list.forEach(function (x) {
      if (x[1] < a || x[0] > b) { out.push([x[0], x[1]]); return; }
      if (x[0] < a) out.push([x[0], a - 1]);
      if (x[1] > b) out.push([b + 1, x[1]]);
    });
    return out;
  }
  function spansOf(st, p) { var e = st.pages[p]; return e ? (e[2] || [[pFirst(p), pLast(p)]]) : []; }
  function cov(st, p) {
    var e = st.pages[p]; if (!e) return 0; if (!e[2]) return 1;
    var t = 0; e[2].forEach(function (x) { for (var g = x[0]; g <= x[1]; g++) t += W[g]; });
    return t / PW[p];
  }
  function putPage(st, p, s, d, spans) {
    if (!spans.length) { delete st.pages[p]; return; }
    if (spans.length === 1 && spans[0][0] <= pFirst(p) && spans[0][1] >= pLast(p)) st.pages[p] = [s, d];
    else st.pages[p] = [s, d, spans];
  }
  // Mark ayahs g0..g1. mode: solid | shaky | recent | erase | new (keeps strength, stamps the date).
  function setAyahs(st, g0, g1, mode, date) {
    g0 = clamp(g0, 1, TOTAL); g1 = clamp(g1, g0, TOTAL);
    for (var p = pageOf(g0); p <= pageOf(g1); p++) {
      var a = Math.max(g0, pFirst(p)), b = Math.min(g1, pLast(p)), e = st.pages[p], cur = spansOf(st, p);
      if (mode === "erase") { if (e) putPage(st, p, e[0], e[1], subSpan(cur, a, b)); if (!st.pages[p] && st.extra) delete st.extra[p]; if (!st.pages[p] && st.backlog) delete st.backlog[p]; continue; }
      if (st.extra && mode === "shaky") st.extra[p] = 2;
      if (st.extra && (mode === "solid" || mode === "recent")) delete st.extra[p];
      var s = mode === "shaky" ? 2 : mode === "new" && e ? e[0] : 1;
      var d = mode === "solid" ? 0 : mode === "shaky" ? (e ? e[1] : 0) : mode === "recent" ? addDays(date, -1) : date;
      putPage(st, p, s, d, addSpan(cur, a, b));
    }
  }
  // Memorized ayah spans across pages a..b, merged where they run on.
  function rowSpans(st, a, b) {
    var out = [];
    for (var p = a; p <= b; p++) spansOf(st, p).forEach(function (x) {
      var l = out[out.length - 1];
      if (l && l[1] + 1 === x[0]) l[1] = x[1]; else out.push([x[0], x[1]]);
    });
    return out;
  }
  function rowRef(st, a, b) { return spansLabel(rowSpans(st, a, b)); }
  function rowPages(st, a, b) { var t = 0; for (var p = a; p <= b; p++) t += cov(st, p); return t; }

  /* ---------- dates (YYYY-MM-DD, local calendar days) ---------- */
  function ymd(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function today() { return ymd(new Date()); }
  function utc(s) { var p = s.split("-"); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
  function addDays(s, n) {
    var d = new Date(utc(s) + n * 864e5);
    return d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0") + "-" + String(d.getUTCDate()).padStart(2, "0");
  }
  function diffDays(a, b) { return Math.round((utc(a) - utc(b)) / 864e5); }
  function dow(s) { return new Date(utc(s)).getUTCDay(); }

  /* ---------- state ---------- */
  function defaults() {
    return {
      v: 1, rev: 0,
      pages: {},            // page -> [strength 1 solid | 2 shaky, date memorized or 0, optional ayah spans]
      ptr: { near: 1, weak: 1, far: 1 },
      day: null,
      hist: {},             // date -> {m minutes done, t minutes planned, r pages revised, n new pages, s rated solid, k rated shaky}
      seen: {},             // page -> date last revised
      extra: {},            // page -> Solid ratings still needed before its extra passes stop (weak 2, hesitant 1)
      start: null,          // first day the planner was used
      backlog: {},          // page -> date its far revision was missed; cleared once the page is revised
      caughtUp: null,       // date the backlog was last cleared
      cuKeep: 0,            // backlog size when a reset was turned down; offered again only if it grows
      busy: {},             // date -> {m: minutes available} for days on a light plan
      busyNo: {},           // date -> 1 for days where a light-plan suggestion was turned down
      set: {
        order: "back", pace: 0.5, memDays: [true, true, true, true, true, true, true],
        minNew: 40, perJuz: 28, budget: 60, nearDays: 30, maxCycle: 10, weakEvery: 3, hesEvery: 6, lightMin: 30, busyBelow: 60, catchPct: 25,
        dayStart: "06:00", dayEnd: "22:30", maxSession: 45
      }
    };
  }
  function normalize(st) {
    var d = defaults(), k;
    st = st && typeof st === "object" ? st : {};
    for (k in d) if (st[k] === undefined || st[k] === null && k !== "day") st[k] = d[k];
    for (k in d.set) if (st.set[k] === undefined) st.set[k] = d.set[k];
    for (k in d.ptr) if (!st.ptr[k]) st.ptr[k] = 1;
    if (!st.start) st.start = Object.keys(st.hist).sort()[0] || null;
    Object.keys(st.pages).forEach(function (p) { if (st.pages[p][0] === 2 && !st.extra[p]) st.extra[p] = 2; }); // older saves: shaky pages are weak
    // Older saves tracked a half-finished page as a fraction. Convert it to the ayahs it covered.
    if (st.partial && st.partial.p && !st.pages[st.partial.p]) {
      var p = st.partial.p, acc = 0, g = pFirst(p), end = g - 1;
      for (; g <= pLast(p); g++) { if (acc + W[g] / PW[p] / 2 > st.partial.f) break; acc += W[g] / PW[p]; end = g; }
      if (end >= pFirst(p)) setAyahs(st, pFirst(p), end, "new", st.day ? st.day.date : today());
    }
    delete st.partial;
    // Older saves owed far revision as minutes, with the rotation held back. Turn that into the pages it covers.
    if (st.debt > 0.5 && st.day && st.day.date) {
      var pool = farPool(st, st.day.date).filter(function (p) { return !st.backlog[p]; });
      var ch = chunk(pool, st.ptr.far, st.debt, function (p) { return farMin(st, p); });
      ch.pages.forEach(function (p) { st.backlog[p] = st.day.date; });
      if (ch.pages.length) st.ptr.far = ch.next;
    }
    delete st.debt; delete st.catchup;
    if (st.day && !st.day.catch) st.day.catch = [];
    if (st.day && st.day.nw && st.day.nw.segs) {
      if (st.day.nw.done) st.day.nw = { spans: [], pages: st.day.nw.pages, min: st.day.nw.min, done: 1, undo: {} };
      else { st.day.nw = null; st.day.stale = 1; }
    }
    return st;
  }

  /* ---------- new memorization ---------- */
  function memOrder(order) {
    var out = [], j, p;
    if (order === "front") { for (p = 1; p <= LAST; p++) out.push(p); return out; }
    for (j = 30; j >= 1; j--) for (p = juzStart(j); p <= juzEnd(j); p++) out.push(p);
    return out;
  }
  // Next portion: the first unmemorized ayahs in memorization order, about `pace` pages' worth.
  function planNew(st, date, factor) {
    var set = st.set, pace = set.pace * (factor || 1);
    if (!(set.pace > 0) || !set.memDays[dow(date)]) return null;
    var order = memOrder(set.order), spans = [], acc = 0, n = 0, i, k, g;
    outer: for (i = 0; i < order.length; i++) {
      var p = order[i], e = st.pages[p];
      if (e && !e[2]) continue;
      var free = [[pFirst(p), pLast(p)]];
      spansOf(st, p).forEach(function (x) { free = subSpan(free, x[0], x[1]); });
      for (k = 0; k < free.length; k++) for (g = free[k][0]; g <= free[k][1]; g++) {
        var w = W[g] / PW[p];
        if (n && acc + w / 2 > pace + 1e-6) break outer;
        spans = addSpan(spans, g, g); acc += w; n++;
      }
    }
    if (!n) return null;
    return { spans: spans, pages: Math.round(acc * 100) / 100, min: Math.max(1, Math.round(acc * set.minNew)), done: 0 };
  }
  function newLabel(nw) { return nw.spans.length ? spansLabel(nw.spans) : "Today's portion"; }
  function newPages(nw) {
    if (!nw.spans.length) return "";
    return rangeLabel(pageOf(nw.spans[0][0]), pageOf(nw.spans[nw.spans.length - 1][1]));
  }
  function applyNew(st) {
    var nw = st.day.nw; if (!nw || nw.done) return;
    nw.undo = {};
    nw.spans.forEach(function (x) {
      for (var p = pageOf(x[0]); p <= pageOf(x[1]); p++) if (!(p in nw.undo)) nw.undo[p] = st.pages[p] ? JSON.parse(JSON.stringify(st.pages[p])) : 0;
      setAyahs(st, x[0], x[1], "new", st.day.date);
    });
    nw.done = 1;
  }
  function undoNew(st) {
    var nw = st.day.nw; if (!nw || !nw.done) return;
    Object.keys(nw.undo || {}).forEach(function (p) { if (nw.undo[p]) st.pages[p] = nw.undo[p]; else delete st.pages[p]; });
    nw.done = 0; delete nw.undo;
  }

  /* ---------- similar verses (mutashabihat) ---------- */
  var SIM = {};
  (D.sim || "").split(".").forEach(function (grp) {
    var ids = []; for (var i = 0; i + 3 <= grp.length; i += 3) ids.push(parseInt(grp.substr(i, 3), 36));
    for (var k = 1; k < ids.length; k++) {
      (SIM[ids[0]] = SIM[ids[0]] || []).push(ids[k]);
      (SIM[ids[k]] = SIM[ids[k]] || []).push(ids[0]);
    }
  });
  function isMem(st, g) {
    return spansOf(st, pageOf(g)).some(function (x) { return g >= x[0] && g <= x[1]; });
  }
  // For a new portion: each ayah that closely resembles others, and whether those are already memorized.
  function similarIn(st, nw) {
    var out = [];
    function inPortion(g) { return nw.spans.some(function (x) { return g >= x[0] && g <= x[1]; }); }
    nw.spans.forEach(function (x) {
      for (var g = x[0]; g <= x[1]; g++) {
        if (!SIM[g]) continue;
        var others = SIM[g].filter(function (o) { return !(inPortion(o) && o < g); }).map(function (o) {
          var same = inPortion(o);
          return { g: o, same: same, known: !same && isMem(st, o) };
        }).sort(function (a, b) { return (b.known - a.known) || (a.g - b.g); });
        if (others.length) out.push({ g: g, others: others, known: others.some(function (o) { return o.known; }) });
      }
    });
    return out;
  }

  /* ---------- revision ---------- */
  // Consecutive pages form one row only where the memorized ayahs run on across the page break.
  function toRanges(pages, st) {
    var out = [];
    pages.forEach(function (p) {
      var l = out[out.length - 1], ok = l && p === l.b + 1;
      if (ok && st) {
        var prev = spansOf(st, l.b), cur = spansOf(st, p);
        ok = prev.length && cur.length && prev[prev.length - 1][1] === pLast(l.b) && cur[0][0] === pFirst(p);
      }
      if (ok) l.b = p; else out.push({ a: p, b: p });
    });
    return out;
  }
  // Take pages from a sorted pool, starting at the pointer and wrapping, until the time target is met.
  function chunk(pool, ptr, target, m) {
    var n = pool.length;
    if (!n || !(target > 0)) return { pages: [], next: ptr };
    var i0 = 0, k;
    for (k = 0; k < n; k++) if (pool[k] >= ptr) { i0 = k; break; }
    var out = [], acc = 0;
    for (k = 0; k < n; k++) {
      var p = pool[(i0 + k) % n], c = m(p);
      if (out.length && acc + c / 2 > target + 1e-6) break;
      out.push(p); acc += c;
    }
    return { pages: out, next: pool[(i0 + out.length) % n] };
  }

  // Rows are rated one at a time, so a long run is cut into quarter-juz pieces (5 pages), lined up with the juz.
  function splitRows(ranges) {
    var out = [];
    ranges.forEach(function (r) {
      var a = r.a;
      for (var p = r.a + 1; p <= r.b; p++) if ((p - juzStart(juzOf(p))) % 5 === 0 && p - juzStart(juzOf(p)) < 20) { out.push({ a: a, b: p - 1 }); a = p; }
      out.push({ a: a, b: r.b });
    });
    return out;
  }
  // Strength: 1 solid, 3 some hesitation, 2 weak. A row's done value: 1, 3, 2, or 4 for "didn't get to it".
  function mult(s) { return s === 2 ? 1.6 : s === 3 ? 1.3 : 1; }
  function isDone(r) { return !!r.done && r.done !== 4; }
  // A page stays in near revision for nearDays, and after that until it has been rated Solid (up to twice nearDays).
  function isNear(st, p, date) {
    var e = st.pages[p]; if (!e || !e[1]) return false;
    var age = diffDays(date, e[1]), n = st.set.nearDays;
    if (age < 0) return false; if (age < n) return true;
    return age < 2 * n && !(e[0] === 1 && st.seen[p] && st.seen[p] >= e[1]);
  }
  // A weak or hesitant page is due an extra pass when it hasn't been revised for its interval.
  function extraDue(st, p, date) {
    if (!st.extra[p] || !st.pages[p]) return false;
    var every = st.pages[p][0] === 2 ? st.set.weakEvery : st.set.hesEvery, last = st.seen[p];
    return !last || diffDays(date, last) >= every;
  }

  function farMin(st, p) { return st.set.perJuz / 20 * mult(st.pages[p][0]) * cov(st, p); }
  // Pages in far revision on a given day, in mushaf order.
  function farPool(st, date) {
    return Object.keys(st.pages).map(Number).sort(num).filter(function (p) { var e = st.pages[p]; return e[1] !== date && !isNear(st, p, date); });
  }
  // How weak a run is: weak pages count 2, hesitant 1, averaged over the run.
  function weakness(st, a, b) {
    var t = 0, n = 0;
    for (var p = a; p <= b; p++) { var e = st.pages[p]; if (!e) continue; n++; t += e[0] === 2 ? 2 : e[0] === 3 ? 1 : 0; }
    return n ? t / n : 0;
  }

  /* Build the plan for one day. `carry` is the same day's earlier plan: finished items are kept. */
  function buildDay(st, date, carry) {
    var set = st.set, P = st.pages;
    carry = carry && carry.date === date ? carry : {};
    var mem = Object.keys(P).map(Number).sort(num);
    var near = [], far = [], weak = [];
    mem.forEach(function (p) {
      var e = P[p];
      if (e[1] === date) return; // memorized today: starts near revision tomorrow
      if (isNear(st, p, date)) near.push(p);
      else { far.push(p); if (extraDue(st, p, date)) weak.push(p); }
    });
    var per = set.perJuz / 20;
    function mNear(p) { return per * 1.4 * mult(P[p][0]) * cov(st, p); }
    function mFar(p) { return per * mult(P[p][0]) * cov(st, p); }

    // Busy days run a light plan: near revision, the weakest extra passes, the minimum far share, no new memorization.
    // After a busy stretch of two days or more, the load ramps back up over two days.
    function wasBusy(n) { return !!st.busy[addDays(date, -n)]; }
    var light = st.busy[date] || null;
    var ramp = light ? 1 : wasBusy(1) && wasBusy(2) ? 0.6 : !wasBusy(1) && wasBusy(2) && wasBusy(3) ? 0.8 : 1;
    var budget = light ? light.m : set.budget;

    var nw = carry.nw && carry.nw.done ? carry.nw : light ? null : planNew(st, date, ramp);
    var newMin = nw ? nw.min : 0;

    function tier(pages, ptr, target, m, carried, exclude) {
      var items = (carried || []).filter(function (r) { return r.done; }); // rated or skipped rows stay as they are
      var skip = {}, doneMin = 0;
      items.forEach(function (r) { for (var p = r.a; p <= r.b; p++) skip[p] = 1; doneMin += r.min; });
      var pool = pages.filter(function (p) { return !skip[p] && !(exclude && exclude[p]); });
      var ch = chunk(pool, ptr, target - doneMin, m);
      splitRows(toRanges(ch.pages, st)).forEach(function (r) {
        var t = 0; for (var p = r.a; p <= r.b; p++) t += m(p);
        items.push({ a: r.a, b: r.b, min: t, done: 0 });
      });
      var next = ch.next;
      if (!ch.pages.length && items.length) { // today's share is already done: resume after it
        var after = items[items.length - 1].b;
        next = pool.filter(function (p) { return p > after; })[0] || pool[0] || ptr;
      }
      return { items: items, next: next };
    }

    var avail = Math.max(budget - newMin, 0);
    if (light && weak.some(function (p) { return P[p][0] === 2; })) weak = weak.filter(function (p) { return P[p][0] === 2; }); // weakest first
    var nearTotal = sum(near.map(mNear)), farTotal = sum(far.map(mFar)), weakTotal = sum(weak.map(mFar));
    var nearShare = Math.max(avail * (far.length ? 0.7 : 1), 5);
    var nearCycle = nearTotal <= nearShare ? 1 : clamp(Math.ceil(nearTotal / nearShare), 2, 7);
    var nearT = tier(near, st.ptr.near, nearCycle === 1 ? Infinity : nearTotal / nearCycle, mNear, carry.near);
    var nearMin = sum(nearT.items.map(function (r) { return r.min; }));

    // The far cycle is sized around the time left after new, near and today's extra passes.
    var weakCap = Math.max(10, budget * 0.4); // extra passes take at most this much of a day; the rest stay due
    weakTotal = sum(weak.map(mFar));
    var cycleNew = newMin; // while ramping, size the cycle around a full new portion so far revision isn't inflated
    if (ramp < 1) { var full = planNew(st, date, 1); cycleNew = full ? full.min : newMin; }
    var farAvail = budget - cycleNew - nearMin - Math.min(weakTotal, weakCap), C = 0;
    if (far.length) C = light ? set.maxCycle : clamp(Math.ceil(farTotal / Math.max(farAvail, 1) - 1e-6), 1, set.maxCycle);
    var share = C ? farTotal / C : 0, minShare = far.length ? farTotal / set.maxCycle : 0;
    if (ramp < 1) share = minShare + (share - minShare) * ramp;
    var farT = tier(far, st.ptr.far, share, mFar, carry.far);
    var inFar = {};
    farT.items.forEach(function (r) { for (var p = r.a; p <= r.b; p++) inFar[p] = 1; });
    // Extra passes: every due weak or hesitant page that today's far share doesn't already cover, with a short lead-in.
    var weakT = tier(weak, st.ptr.weak, weakCap, mFar, carry.weak, inFar);
    weakT.items.forEach(function (r) {
      if (r.done || r.lead !== undefined) return;
      r.lead = P[r.a - 1] && !inFar[r.a - 1] ? r.a - 1 : 0;
      if (r.lead) r.min += per * 0.25;
    });
    var farMin = sum(farT.items.map(function (r) { return r.min; }));
    var weakMin = sum(weakT.items.map(function (r) { return r.min; }));

    // Catch-up: far revision missed on earlier days, in extra time capped at a share of the budget, weakest runs first.
    // Each run stays whole within its juz and is read in mushaf order. None on light days; scaled down while ramping up.
    var bl = st.backlog || {}, owedPages = far.filter(function (p) { return bl[p]; });
    var backlogMin = sum(owedPages.map(mFar)), fullCap = set.budget * set.catchPct / 100;
    var cap = light ? 0 : fullCap * ramp, busyHere = {};
    farT.items.concat(weakT.items).forEach(function (r) { for (var p = r.a; p <= r.b; p++) busyHere[p] = 1; });
    var cItems = (carry.catch || []).filter(function (r) { return r.done; }), cDone = 0, cSkip = {};
    cItems.forEach(function (r) { for (var p = r.a; p <= r.b; p++) cSkip[p] = 1; cDone += r.min; });
    // Pages whose normal turn comes tomorrow are left to the rotation.
    var soon = {}, fi = far.indexOf(farT.next), sAcc = 0;
    for (var q = 0; fi >= 0 && q < far.length && sAcc < share; q++) { var fp = far[(fi + q) % far.length]; soon[fp] = 1; sAcc += mFar(fp); }
    function wait(p) { var i = far.indexOf(p); return fi < 0 ? 0 : (i - fi + far.length) % far.length; }
    var cPool = owedPages.filter(function (p) { return !busyHere[p] && !cSkip[p] && !soon[p]; }), groups = [];
    toRanges(cPool, st).forEach(function (r) { // cut at juz boundaries so each group is part of one juz
      var a = r.a;
      for (var p = r.a + 1; p <= r.b; p++) if (juzOf(p) !== juzOf(p - 1)) { groups.push({ a: a, b: p - 1 }); a = p; }
      groups.push({ a: a, b: r.b });
    });
    // Weakest first; among equals, the run whose next normal turn is furthest away.
    groups.forEach(function (g) { g.w = weakness(st, g.a, g.b); g.wait = wait(g.a); });
    groups.sort(function (x, y) { return (y.w - x.w) || (y.wait - x.wait); });
    var room = cap - cDone, acc = 0, taken = [];
    outer: for (var gi = 0; gi < groups.length; gi++) {
      var pick = [];
      for (var p = groups[gi].a; p <= groups[gi].b; p++) {
        var c = mFar(p);
        if (acc + c / 2 > room + 1e-6) { if (pick.length) taken.push(pick); break outer; }
        pick.push(p); acc += c;
      }
      taken.push(pick);
    }
    taken.forEach(function (pick) {
      splitRows(toRanges(pick, st)).forEach(function (r) {
        var t = 0; for (var p = r.a; p <= r.b; p++) t += mFar(p);
        cItems.push({ a: r.a, b: r.b, min: t, done: 0 });
      });
    });
    var catchMin = sum(cItems.map(function (r) { return r.min; }));

    return {
      date: date, nw: nw, near: nearT.items, weak: weakT.items, far: farT.items, "catch": cItems,
      next: { near: nearT.next, weak: weakT.next, far: farT.next },
      meta: {
        cycle: C, nearCycle: nearCycle, budget: budget, light: light ? light.m : 0, ramp: ramp,
        owed: share, farTotal: farTotal,
        backlog: backlogMin, backlogPages: owedPages.length, catchCap: fullCap,
        newMin: newMin, nearMin: nearMin, weakMin: weakMin, farMin: farMin, catchMin: catchMin,
        total: newMin + nearMin + weakMin + farMin + catchMin,
        counts: { mem: rowPages(st, 1, LAST), near: near.length, far: far.length, weak: weak.length }
      }
    };
  }

  // Move to a new day. Anything left undone is where the rotation resumes.
  function rollover(st, date) {
    var d = st.day;
    if (d && d.meta && d.meta.counts) recordHist(st); // log the day being closed, even if nothing was done
    if (!st.start) st.start = Object.keys(st.hist).sort()[0] || date;
    var bl = st.backlog, had = Object.keys(bl).length > 0;
    if (d) {
      // Far revision left undone goes to the backlog and the rotation moves on, so the cycle keeps its place.
      // Extra passes aren't owed: an undone one is simply still due. Near revision repeats daily, so nothing is owed.
      (d.far || []).forEach(function (r) { if (!isDone(r)) for (var p = r.a; p <= r.b; p++) if (st.pages[p] && !bl[p]) bl[p] = d.date; });
      ["near", "weak", "far", "catch"].forEach(function (t) {
        (d[t] || []).forEach(function (r) { if (isDone(r)) for (var p = r.a; p <= r.b; p++) delete bl[p]; });
      });
      ["near", "weak"].forEach(function (t) {
        var und = (d[t] || []).filter(function (r) { return !isDone(r); })[0];
        st.ptr[t] = und ? und.a : (d.next && d.next[t]) || st.ptr[t];
      });
      if (d.next && d.next.far) st.ptr.far = d.next.far;
      // Days skipped entirely: each one's far share joins the backlog, as it would have been read that day.
      var gap = Math.min(diffDays(date, d.date) - 1, 60), owed = d.meta && d.meta.owed || 0;
      for (var k = 1; k <= gap && owed > 0; k++) {
        var day = addDays(d.date, k), pool = farPool(st, day).filter(function (p) { return !bl[p]; });
        if (!pool.length) break;
        var ch = chunk(pool, st.ptr.far, owed, function (p) { return farMin(st, p); });
        ch.pages.forEach(function (p) { bl[p] = day; });
        st.ptr.far = ch.next;
      }
    }
    Object.keys(bl).forEach(function (p) { if (!st.pages[p]) delete bl[p]; });
    if (had && !Object.keys(bl).length) st.caughtUp = date;
    if (!Object.keys(bl).length) st.cuKeep = 0;
    st.day = buildDay(st, date, null);
    recordHist(st);
    var old = addDays(date, -4); // busy days are only needed for the ramp just after them
    [st.busy, st.busyNo].forEach(function (m) { Object.keys(m).forEach(function (k) { if (k < old) delete m[k]; }); });
    var keep = addDays(date, -120);
    Object.keys(st.hist).forEach(function (k) { if (k < keep) delete st.hist[k]; });
  }
  function rebuild(st, date) { st.day = buildDay(st, date, st.day); recordHist(st); }

  // rating: 1 solid, 3 some hesitation, 2 weak, 4 didn't get to it, 0 undo.
  function rate(st, tierName, i, rating) {
    var r = st.day[tierName][i], p, hadBacklog = Object.keys(st.backlog).length > 0; if (!r) return;
    if (r.prev) { // undo whatever the last rating changed
      Object.keys(r.prev).forEach(function (k) {
        var v = r.prev[k]; if (st.pages[k]) st.pages[k][0] = v[0];
        if (v[1]) st.extra[k] = v[1]; else delete st.extra[k];
        if (v[2]) st.seen[k] = v[2]; else delete st.seen[k];
        if (v[3]) st.backlog[k] = v[3];
      });
      delete r.prev;
    }
    r.done = rating;
    if (rating === 1 || rating === 2 || rating === 3) {
      r.prev = {};
      for (p = r.a; p <= r.b; p++) {
        var e = st.pages[p]; if (!e) continue;
        r.prev[p] = [e[0], st.extra[p] || 0, st.seen[p] || "", st.backlog[p] || ""];
        delete st.backlog[p];
        if (rating === 1) {
          var need = (st.extra[p] || 0) - 1;
          if (need > 0) st.extra[p] = need; else { delete st.extra[p]; e[0] = 1; }
        } else if (rating === 3) { e[0] = 3; st.extra[p] = 1; }
        else { e[0] = 2; st.extra[p] = 2; }
        st.seen[p] = st.day.date;
      }
    }
    if (hadBacklog && !Object.keys(st.backlog).length) st.caughtUp = st.day.date;
    recordHist(st);
  }
  function recordHist(st) {
    var d = st.day, m = 0, r = 0, n = 0, s = 0, k = 0, hz = 0;
    ["near", "weak", "far", "catch"].forEach(function (t) {
      (d[t] || []).forEach(function (x) {
        if (!isDone(x)) return;
        var c = rowPages(st, x.a, x.b);
        m += x.min; r += c; if (x.done === 2) k += c; else if (x.done === 3) hz += c; else s += c;
      });
    });
    if (d.nw && d.nw.done) { m += d.nw.min; n = d.nw.pages; }
    var t = d.meta && d.meta.total || 0;
    function r1(v) { return Math.round(v * 10) / 10; }
    if (m > 0 || t > 0) st.hist[d.date] = { m: Math.round(m), t: Math.round(t), r: r1(r), n: n, s: r1(s), h: r1(hz), k: r1(k) };
    else delete st.hist[d.date];
  }
  function streak(st, date) {
    function on(d) { return st.hist[d] && st.hist[d].m > 0; }
    var n = 0, d = on(date) ? date : addDays(date, -1);
    while (on(d)) { n++; d = addDays(d, -1); }
    return n;
  }

  /* ---------- catch-up ---------- */
  // Drop the backlog and carry on from the current place in the cycle. Missed parts come round again on their next turn.
  function resetBacklog(st) { st.backlog = {}; st.caughtUp = null; st.cuKeep = 0; }
  // Days until the backlog is cleared, by catch-up or by the rotation reaching it, if each day gets finished. 0 if over max.
  function clearIn(st, date, max) {
    if (!Object.keys(st.backlog || {}).length) return 0;
    var c = JSON.parse(JSON.stringify(st));
    if (!c.day || c.day.date !== date) rollover(c, date);
    for (var i = 1; i <= max; i++) {
      ["near", "weak", "far", "catch"].forEach(function (t) { c.day[t].forEach(function (r) { r.done = 1; }); });
      applyNew(c);
      date = addDays(date, 1);
      rollover(c, date);
      if (!Object.keys(c.backlog).length) return i;
    }
    return 0;
  }

  /* ---------- busy days ---------- */
  function setBusy(st, date, minutes) { st.busy[date] = { m: clamp(Math.round(minutes || st.set.lightMin), 5, 600) }; delete st.busyNo[date]; }
  function clearBusy(st, date) { delete st.busy[date]; }

  /* ---------- progress reports ---------- */
  function report(st, date, n) {
    var start = st.start || date;
    var out = { days: [], from: addDays(date, -(n - 1)), to: date, counted: 0, active: 0, min: 0, plan: 0, planMin: 0, rev: 0, nw: 0, solid: 0, hes: 0, weak: 0 };
    for (var i = n - 1; i >= 0; i--) {
      var d = addDays(date, -i), h = st.hist[d] || {}, scope = d >= start;
      out.days.push({ date: d, m: h.m || 0, t: h.t || 0, r: h.r || 0, n: h.n || 0, scope: scope });
      if (!scope) continue;
      out.counted++; if (h.m > 0) out.active++;
      out.min += h.m || 0; out.rev += h.r || 0; out.nw += h.n || 0; out.solid += h.s || 0; out.hes += h.h || 0; out.weak += h.k || 0;
      if (h.t) { out.plan += h.t; out.planMin += Math.min(h.m || 0, h.t); }
    }
    return out;
  }
  function juzTable(st, date) {
    var rows = [];
    for (var j = 1; j <= 30; j++) {
      var row = { j: j, pages: juzEnd(j) - juzStart(j) + 1, mem: 0, weak: 0, hes: 0, near: 0, last: "" };
      for (var p = juzStart(j); p <= juzEnd(j); p++) {
        var e = st.pages[p]; if (!e) continue;
        var c = cov(st, p); row.mem += c;
        if (e[0] === 2) row.weak += c; else if (e[0] === 3) row.hes += c;
        if (isNear(st, p, date)) row.near += c;
        if (st.seen[p] && st.seen[p] > row.last) row.last = st.seen[p];
      }
      rows.push(row);
    }
    return rows;
  }
  // Runs of pages that share a rating other than Solid.
  function weakRanges(st) {
    var out = [];
    [2, 3].forEach(function (lv) {
      var pages = Object.keys(st.pages).map(Number).filter(function (p) { return st.pages[p][0] === lv; }).sort(num);
      toRanges(pages, st).forEach(function (r) { r.level = lv; out.push(r); });
    });
    return out.sort(function (a, b) { return a.a - b.a; });
  }
  // When the whole Qur'an would be finished: at the pace of the last 28 days, and at the pace set in Settings.
  function forecast(st, date) {
    var mem = rowPages(st, 1, LAST), left = LAST - mem, recent = 0, days = 0, start = st.start || date;
    for (var i = 0; i < 28; i++) { var d = addDays(date, -i); if (d < start) break; days++; recent += (st.hist[d] || {}).n || 0; }
    var perDay = days ? recent / days : 0;
    var setPerDay = st.set.pace * st.set.memDays.filter(Boolean).length / 7;
    return {
      mem: mem, left: left, perWeek: perDay * 7, days: days,
      at: perDay > 0 && left > 0 ? addDays(date, Math.ceil(left / perDay)) : "",
      setPerWeek: setPerDay * 7, setAt: setPerDay > 0 && left > 0 ? addDays(date, Math.ceil(left / setPerDay)) : ""
    };
  }

  // The next n days, assuming each day's plan gets finished.
  function preview(st, date, n) {
    var c = JSON.parse(JSON.stringify(st)), out = [];
    if (!c.day || c.day.date !== date) rollover(c, date);
    for (var i = 0; i < n; i++) {
      ["near", "weak", "far", "catch"].forEach(function (t) { c.day[t].forEach(function (r) { r.done = 1; }); });
      applyNew(c);
      date = addDays(date, 1);
      rollover(c, date);
      out.push(JSON.parse(JSON.stringify(c.day))); // a copy: the next pass marks this day done
    }
    return out;
  }

  /* ---------- calendar slotting (times are minutes from midnight) ---------- */
  function queueUnits(day) {
    var u = [];
    if (day.nw && !day.nw.done) u.push({ tier: "new", min: day.nw.min, label: newLabel(day.nw), sub: newPages(day.nw) });
    ["near", "weak", "far", "catch"].forEach(function (t) {
      (day[t] || []).forEach(function (r) {
        if (r.done) return; // rated, or set aside as "didn't get to it"
        var each = r.min / (r.b - r.a + 1);
        for (var p = r.a; p <= r.b; p++) u.push({ tier: t, p: p, min: each });
      });
    });
    return u;
  }
  function freeGaps(busy, ws, we, from, buf) {
    var b = busy.map(function (x) { return { s: x.s - buf, e: x.e + buf }; }).sort(function (x, y) { return x.s - y.s; });
    var out = [], t = Math.max(ws, from);
    function push(s, e) { s = Math.ceil(s / 5) * 5; e = Math.floor(e / 5) * 5; if (e - s >= 10) out.push({ s: s, e: e }); }
    b.forEach(function (x) { if (x.s > t) push(t, Math.min(x.s, we)); t = Math.max(t, x.e); });
    if (t < we) push(t, we);
    return out;
  }
  function fillGaps(gaps, units, maxS, brk) {
    var q = units.slice(), out = [];
    gaps.forEach(function (g) {
      var t = g.s;
      while (q.length && g.e - t >= 10) {
        var room = g.e - t, cap = Math.min(maxS, room), i = -1, k;
        for (k = 0; k < q.length; k++) if (q[k].min <= (q[k].tier === "new" ? room : cap) + 0.01) { i = k; break; }
        if (i < 0) break;
        var take = [q.splice(i, 1)[0]], acc = take[0].min;
        while (i < q.length && acc + q[i].min <= cap + 0.01) { acc += q[i].min; take.push(q.splice(i, 1)[0]); }
        var dur = Math.min(Math.max(10, Math.ceil(acc / 5 - 0.02) * 5), room);
        out.push({ s: t, e: t + dur, min: acc, units: take });
        t += dur + brk;
      }
    });
    return { sessions: out, left: q };
  }
  // The day's work as separate sittings: new memorization, near revision, far revision (with weak spots).
  // A block longer than maxS is split into even parts.
  function sittings(day, maxS) {
    var units = queueUnits(day), out = [];
    function push(us, tier) {
      if (!us.length) return;
      var m = sum(us.map(function (u) { return u.min; }));
      out.push({ tier: tier, units: us, min: m, dur: Math.max(10, Math.ceil(m / 5 - 0.02) * 5) });
    }
    push(units.filter(function (u) { return u.tier === "new"; }), "new");
    [["near"], ["weak", "catch", "far"]].forEach(function (grp) {
      var us = units.filter(function (u) { return grp.indexOf(u.tier) >= 0; }); if (!us.length) return;
      var total = sum(us.map(function (u) { return u.min; })), n = Math.max(1, Math.ceil(total / maxS - 0.01)), target = total / n, cur = [], acc = 0, made = 0;
      us.forEach(function (u) {
        if (cur.length && made < n - 1 && acc + u.min / 2 > target) { push(cur, grp[grp.length - 1]); cur = []; acc = 0; made++; }
        cur.push(u); acc += u.min;
      });
      push(cur, grp[grp.length - 1]);
    });
    return out;
  }
  function fitAfter(gaps, t, dur) {
    for (var i = 0; i < gaps.length; i++) { var s = Math.max(gaps[i].s, Math.ceil(t / 5) * 5); if (s + dur <= gaps[i].e) return s; }
    return -1;
  }
  function fitBefore(gaps, t, dur) {
    for (var i = gaps.length - 1; i >= 0; i--) { var e = Math.min(gaps[i].e, Math.floor(t / 5) * 5); if (e - dur >= gaps[i].s) return e - dur; }
    return -1;
  }
  // Start time for each sitting, kept in order through the day. mode: earliest | spread | latest. -1 = no room.
  function arrange(gaps, sits, mode, brk) {
    var n = sits.length, out = [], i, t, s;
    function early() {
      var r = [], c = -1e9;
      for (var k = 0; k < n; k++) { var x = fitAfter(gaps, c, sits[k].dur); r.push(x); if (x >= 0) c = x + sits[k].dur + brk; }
      return r;
    }
    if (!gaps.length || !n) return sits.map(function () { return -1; });
    if (mode === "latest") {
      t = 1e9;
      for (i = n - 1; i >= 0; i--) { s = fitBefore(gaps, t, sits[i].dur); out[i] = s; if (s >= 0) t = s - brk; }
    } else if (mode === "spread") {
      var lo = gaps[0].s, hi = gaps[gaps.length - 1].e; t = lo;
      for (i = 0; i < n; i++) {
        s = fitAfter(gaps, Math.max(lo + (hi - lo) * i / n, t), sits[i].dur);
        if (s < 0) s = fitAfter(gaps, t, sits[i].dur);
        out[i] = s; if (s >= 0) t = s + sits[i].dur + brk;
      }
    } else return early();
    var e = early(), miss = function (r) { return r.filter(function (x) { return x < 0; }).length; };
    return miss(out) > miss(e) ? e : out;
  }
  var TIER_NAME = { "new": "New memorization", near: "Near revision", weak: "Weak spots", "catch": "Catch-up", far: "Far revision" };
  function sessionParts(units, st) {
    var parts = [];
    ["new", "near", "weak", "catch", "far"].forEach(function (t) {
      var us = units.filter(function (u) { return u.tier === t; });
      if (!us.length) return;
      if (t === "new") { parts.push({ tier: t, text: us[0].label, sub: us[0].sub }); return; }
      toRanges(us.map(function (u) { return u.p; }), st).forEach(function (r) {
        parts.push({ tier: t, text: rangeLabel(r.a, r.b), sub: rowRef(st, r.a, r.b) });
      });
    });
    return parts;
  }
  function sessionTitle(units, st) {
    var parts = sessionParts(units, st), tiers = [];
    parts.forEach(function (p) { if (tiers.indexOf(p.tier) < 0) tiers.push(p.tier); });
    if (tiers.length === 1) {
      return "Qur'an \u00b7 " + TIER_NAME[tiers[0]] + ": " + parts.map(function (p) { return p.text; }).join(", ");
    }
    return "Qur'an \u00b7 " + tiers.map(function (t) { return TIER_NAME[t]; }).join(" + ");
  }
  function sessionDesc(units, st) {
    return sessionParts(units, st).map(function (p) {
      return TIER_NAME[p.tier] + ": " + p.text + (p.sub ? " (" + p.sub + ")" : "");
    }).join("\n");
  }

  root.Hifz = {
    NAMES: NAMES, COUNTS: COUNTS, STARTS: STARTS, LAST: LAST, TOTAL: TOTAL, TIER_NAME: TIER_NAME,
    juzStart: juzStart, juzEnd: juzEnd, juzOf: juzOf, pFirst: pFirst, pLast: pLast, pageOf: pageOf, gOf: gOf, ref: ref,
    spanLabel: spanLabel, spansLabel: spansLabel, rangeLabel: rangeLabel, pagesLabel: pagesLabel,
    similarIn: similarIn, similar: function (g) { return SIM[g] || []; }, isMem: isMem,
    spansOf: spansOf, cov: cov, setAyahs: setAyahs, rowRef: rowRef, rowPages: rowPages,
    pageWeight: function (p) { return PW[p]; }, ayahWeight: function (g) { return W[g]; },
    today: today, addDays: addDays, diffDays: diffDays, dow: dow,
    defaults: defaults, normalize: normalize, memOrder: memOrder, newLabel: newLabel, newPages: newPages,
    applyNew: applyNew, undoNew: undoNew, buildDay: buildDay, rollover: rollover, rebuild: rebuild,
    isDone: isDone, isNear: isNear, rate: rate, recordHist: recordHist, streak: streak, preview: preview,
    setBusy: setBusy, clearBusy: clearBusy, resetBacklog: resetBacklog, clearIn: clearIn,
    report: report, juzTable: juzTable, weakRanges: weakRanges, forecast: forecast,
    queueUnits: queueUnits, freeGaps: freeGaps, fillGaps: fillGaps, sittings: sittings, arrange: arrange,
    sessionTitle: sessionTitle, sessionDesc: sessionDesc, sessionParts: sessionParts
  };
})(typeof window !== "undefined" ? window : globalThis);