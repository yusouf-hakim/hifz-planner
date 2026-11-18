/* Hifz planner page: rendering, saving, calendar. Scheduling logic lives in engine.js. */
(function () {
  "use strict";
  var E = window.Hifz, G = window.HifzGoogle, KEY = "hifz-planner-v1";
  var state = E.defaults(), today = E.today();
  var docRef = null, dbState = "loading", saveTimer = null, inflight = false, dirty = false;
  var brush = "solid", cells = {}, editTimer = null, mouseDown = false, lastPointer = "";
  var cal = { loaded: false, at: 0, ev: {}, allday: {}, sel: today, mode: "earliest", sits: [], gaps: [], sig: "", pick: -1, busy: false, msg: "", hint: "", count: 0 };
  var aheadDays = [], HH = 48;

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function mins(m) {
    m = Math.max(1, Math.round(m));
    if (m < 60) return m + " min";
    return Math.floor(m / 60) + " h" + (m % 60 ? " " + (m % 60) + " min" : "");
  }
  function hm(s) { var p = String(s).split(":"); return (+p[0]) * 60 + (+p[1] || 0); }
  function hhmm(m) { return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0"); }
  function clock(m) { var h = Math.floor(m / 60) % 24, x = m % 60; return ((h + 11) % 12 + 1) + ":" + String(x).padStart(2, "0") + (h < 12 ? " AM" : " PM"); }
  function localDate(s) { var p = s.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function pg(x) { return Math.abs(x - Math.round(x)) < 0.05 ? String(Math.round(x)) : x.toFixed(1); }
  function pgs(x) { var t = pg(x); return t + (t === "1" ? " page" : " pages"); }
  function plural(n, w) { return n + " " + w + (n === 1 ? "" : "s"); }

  /* ---------- saving ---------- */
  function setStatus(t) { $("save").textContent = t; }
  function persist() {
    state.rev = Date.now();
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* storage may be unavailable */ }
    if (!docRef) { setStatus(dbState === "connecting" ? "Connecting to Google" : "Saved on this device only"); return; }
    dirty = true; setStatus("Saving");
    clearTimeout(saveTimer); saveTimer = setTimeout(flush, 700);
  }
  function flush() {
    if (!docRef || inflight || !dirty) return;
    inflight = true; dirty = false;
    docRef.set(JSON.parse(JSON.stringify(state))).then(function () {
      inflight = false;
      if (dirty) flush(); else setStatus("Saved to Google Drive");
    }, function (e) {
      inflight = false; dirty = true; // keep it pending so the next sign-in or change retries
      if (e && e.code === "needs_reauth") { setStatus("Sign in again to sync. Changes are kept on this device."); showSignIn(true); }
      else setStatus("Couldn't save to Google Drive. Changes are kept on this device.");
    });
  }
  function showSignIn(on) { $("g-btn").hidden = !on; }
  function ensureDay() {
    today = E.today();
    if (!state.day || state.day.date !== today) { E.rollover(state, today); return true; }
    if (state.day.stale) { delete state.day.stale; E.rebuild(state, today); return true; }
    return false;
  }
  // Connect saving to the Google Drive app folder. interactive = true is only for a click (it may open Google's sign-in popup).
  function connect(interactive) {
    if (dbState === "connecting") return;
    dbState = "connecting"; setStatus("Connecting to Google");
    G.token(interactive).then(function () { return G.driveGet(); }).then(function (snap) {
      dbState = "on"; docRef = { set: G.driveSet }; showSignIn(false);
      var remote = snap.exists ? snap.data() : null, push = false;
      if (remote && remote.pages && (remote.rev || 0) >= (state.rev || 0)) state = E.normalize(JSON.parse(JSON.stringify(remote)));
      else if (state.rev) push = true;
      var rolled = ensureDay();
      if (push || rolled && state.rev || dirty) persist(); else setStatus("Saved to Google Drive");
      renderAll();
    }).catch(function (e) {
      dbState = "off"; showSignIn(true);
      setStatus(e && e.code === "needs_reauth" ? "Saved on this device only. Sign in with Google to sync."
        : e && e.code === "google_unavailable" ? "Couldn't load Google sign-in. Saved on this device only."
        : e && e.code === "access_denied" ? "Google sign-in was cancelled. Saved on this device only."
        : "Couldn't reach Google Drive. Saved on this device only.");
    });
  }

  /* ---------- header and stats ---------- */
  function renderHead() {
    var d = localDate(today), g = d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" }), h = "";
    try { h = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", { day: "numeric", month: "long", year: "numeric" }).format(d); } catch (e) { h = ""; }
    $("dates").textContent = g + (h ? " \u00b7 " + h : "");
  }
  function doneMin(day) {
    var m = day.nw && day.nw.done ? day.nw.min : 0;
    ["near", "weak", "far", "catch"].forEach(function (t) { (day[t] || []).forEach(function (r) { if (E.isDone(r)) m += r.min; }); });
    return m;
  }
  function renderStats() {
    var m = state.day.meta, c = m.counts, s = E.streak(state, today);
    var tiles = [
      [pg(c.mem), "pages memorized, " + (c.mem / 20).toFixed(1) + " juz"],
      [mins(m.total), "planned today, budget " + mins(m.budget)],
      [m.cycle ? m.cycle + (m.cycle === 1 ? " day" : " days") : "\u2013", m.cycle ? "to get through all far revision" : "far cycle starts once pages are older"],
      [s, (s === 1 ? "day" : "days") + " in a row"]
    ];
    $("stats").innerHTML = tiles.map(function (t) { return '<div class="stat"><b>' + esc(t[0]) + "</b><span>" + esc(t[1]) + "</span></div>"; }).join("");
  }

  /* ---------- similar verses ---------- */
  function ayahLink(g) {
    var r = E.ref(g);
    return '<a href="https://quran.com/' + (r[0] + 1) + "/" + r[1] + '" target="_blank" rel="noopener">' + esc(E.spanLabel(g, g)) + "</a>";
  }
  function similarHTML(nw) {
    var list = E.similarIn(state, nw); if (!list.length) return "";
    var known = list.filter(function (x) { return x.known; }).length;
    return '<div class="sim"><div class="sub">Similar verses</div><p>' + plural(list.length, "ayah") + " in this portion closely " +
      (list.length === 1 ? "resembles" : "resemble") + " others" + (known ? ", " + known + " of them ones you have already memorized" : "") +
      ". Read each pair side by side before you start, so they don't blur together.</p><ul>" +
      list.map(function (x) {
        return "<li>" + ayahLink(x.g) + ' <span class="muted">resembles</span> ' + x.others.map(function (o) {
          return ayahLink(o.g) + (o.known ? ' <span class="chip weak">memorized</span>' : o.same ? ' <span class="chip">also today</span>' : "");
        }).join(", ") + "</li>";
      }).join("") + "</ul></div>";
  }

  /* ---------- catch-up ---------- */
  // Far revision missed on earlier days is caught up in extra time, weakest parts first. If that would take
  // more than a week, a reset is offered: drop the backlog and carry on from the current place in the cycle.
  var clearCache = { sig: "", n: 0 };
  function clearDays() {
    var sig = today + "|" + state.rev + "|" + Object.keys(state.backlog).length;
    if (clearCache.sig !== sig) clearCache = { sig: sig, n: E.clearIn(state, today, 7) };
    return clearCache.n;
  }
  function catchupHTML() {
    var m = state.day.meta, n = m.backlogPages;
    if (!n) return state.caughtUp === today ? '<p class="note info">You are caught up on far revision. The plan is back to normal.</p>' : "";
    var days = clearDays(), cap = mins(m.catchCap), owed = mins(m.backlog) + " of far revision (" + plural(n, "page") + ")";
    if (days || n <= state.cuKeep) {
      return '<p class="note info">' + owed + " was missed on earlier days. Up to " + cap + " a day is added to catch up, weakest parts first" +
        (days ? ", so it should be cleared " + (days === 1 ? "tomorrow" : "in about " + plural(days, "day")) + " if each day gets finished."
          : ". It will take more than a week.") +
        ' <button type="button" class="link" data-act="cu-reset">Clear it and carry on</button></p>';
    }
    return '<div class="catch"><h3>Catching up would take more than a week</h3><p>' + owed + " was missed. At up to " + cap +
      " extra a day it can’t be cleared within a week. You can start fresh from your current place in the cycle instead: the missed parts come round again on their normal turn, and nothing extra is added.</p>" +
      '<div class="acts" style="display:flex;flex-wrap:wrap;gap:10px"><button type="button" class="btn" data-act="cu-reset">Start fresh from here</button>' +
      '<button type="button" class="btn ghost" data-act="cu-keep">Keep catching up</button></div></div>';
  }

  /* ---------- today's plan ---------- */
  function rowHTML(t, i, r) {
    var n = r.b - r.a + 1, acts;
    var RATED = { 1: ["solid", "Solid"], 3: ["hes", "Some hesitation"], 2: ["weak", "Weak"], 4: ["skip", "Didn\u2019t get to it"] };
    function b(v, label, cls) { return '<button type="button" class="' + cls + '" data-act="rate" data-r="' + v + '" data-tier="' + t + '" data-i="' + i + '">' + label + "</button>"; }
    if (r.done) {
      acts = '<span class="chip ' + RATED[r.done][0] + '">' + RATED[r.done][1] + "</span>" +
        '<button type="button" class="link" data-act="undo" data-tier="' + t + '" data-i="' + i + '">Undo</button>';
    } else {
      acts = b(1, "Solid", "btn") + b(3, "Some hesitation", "btn ghost") + b(2, "Weak", "btn ghost") + b(4, "Didn\u2019t get to it", "link");
    }
    var lead = r.lead ? " \u00b7 begin a few lines early, on p. " + r.lead + ", to practise the join" : "";
    return '<li class="row' + (E.isDone(r) ? " done" : r.done ? " skipped" : "") + '"><div class="what"><strong>' + esc(E.rangeLabel(r.a, r.b)) + "</strong><span>" +
      esc(E.rowRef(state, r.a, r.b)) + " \u00b7 " + pgs(E.rowPages(state, r.a, r.b)) + esc(lead) + '</span></div><span class="t">' + mins(r.min) +
      '</span><div class="acts">' + acts + "</div></li>";
  }
  function allSolid(t) {
    var n = state.day[t].filter(function (r) { return !r.done; }).length;
    return n > 1 ? '<div class="allrow"><button type="button" class="btn ghost" data-act="rateall" data-tier="' + t + '">Rate all ' + n + " Solid</button><span>or rate each part below</span></div>" : "";
  }
  function tierHTML(cls, title, ar, min, body) {
    return '<article class="tier ' + cls + '"><header><h3>' + title + '</h3><span class="ar" lang="ar" dir="rtl">' + ar +
      '</span><span class="t">' + (min > 0 ? mins(min) : "") + "</span></header>" + body + "</article>";
  }
  function renderToday() {
    var d = state.day, m = d.meta, set = state.set, body, notes = "";

    // new
    if (d.nw) {
      body = '<ul class="rows"><li class="row' + (d.nw.done ? " done" : "") + '"><div class="what"><strong>' + esc(E.newLabel(d.nw)) +
        "</strong><span>" + esc(E.newPages(d.nw)) + (d.nw.spans.length ? " \u00b7 about " + pgs(d.nw.pages) : "") + '</span></div><span class="t">' + mins(d.nw.min) +
        '</span><div class="acts">' + (d.nw.done
          ? '<span class="chip solid">Memorized</span><button type="button" class="link" data-act="undonew">Undo</button>'
          : '<button type="button" class="btn" data-act="donenew">Mark as memorized</button>') + "</div></li></ul>" +
        (d.nw.spans.length ? similarHTML(d.nw) : "");
    } else {
      body = '<p class="empty">' + (m.light ? "New memorization is paused on a light day."
        : !(set.pace > 0) ? "New memorization is switched off. Today is revision only."
        : !set.memDays[E.dow(today)] ? "Today is a rest day for new memorization."
          : "Every page is marked as memorized.") + "</p>";
    }
    var html = tierHTML("new", "New", "الحفظ الجديد", m.newMin, body);

    // near
    if (d.near.length) {
      body = '<p class="why">Memorized in the last ' + set.nearDays + " days. " + (m.nearCycle > 1
        ? "Too much for one day, so it rotates over " + m.nearCycle + " days." : "Revise all of it every day.") + "</p>" + allSolid("near") +
        '<ul class="rows">' + d.near.map(function (r, i) { return rowHTML("near", i, r); }).join("") + "</ul>";
    } else {
      body = '<p class="empty">Nothing memorized in the last ' + set.nearDays + " days yet. New pages land here the day after you memorize them.</p>";
    }
    html += tierHTML("near", "Near revision", "المراجعة القريبة", m.nearMin, body);

    // far + weak
    if (d.far.length || d.weak.length || d.catch.length) {
      body = '<p class="why">Today\'s share of everything older. The full cycle takes ' + plural(m.cycle, "day") + ". Read it straight through, then rate each part. Anything you don\u2019t get to moves to catch-up.</p>" + allSolid("far") +
        '<ul class="rows">' + d.far.map(function (r, i) { return rowHTML("far", i, r); }).join("") + "</ul>";
      if (d.catch.length) {
        body += '<div class="sub">Catch-up</div><p class="why">Far revision missed on earlier days, weakest parts first, in up to ' + mins(m.catchCap) +
          " extra a day. Each part is read in order within its juz.</p>" + allSolid("catch") + '<ul class="rows">' +
          d.catch.map(function (r, i) { return rowHTML("catch", i, r); }).join("") + "</ul>";
      }
      if (d.weak.length) {
        body += '<div class="sub">Extra passes</div><p class="why">Pages you rated Weak or Some hesitation, back for another pass before their next turn in the cycle.</p><ul class="rows">' +
          d.weak.map(function (r, i) { return rowHTML("weak", i, r); }).join("") + "</ul>";
      }
    } else {
      body = '<p class="empty">' + (m.counts.mem ? "No older pages yet. Pages move here after " + set.nearDays + " days in near revision."
        : "Mark what you have memorized in the map below to start the rotation.") + "</p>";
    }
    html += tierHTML("far", "Far revision", "المراجعة البعيدة", m.farMin + m.weakMin + m.catchMin, body);
    $("tiers").innerHTML = html;

    var done = doneMin(d);
    $("plan-bar").style.width = (m.total > 0 ? Math.min(100, done / m.total * 100) : 0) + "%";
    $("plan-sum").textContent = m.total > 0 ? (done < 0.5 ? "0 min" : mins(done)) + " done of " + mins(m.total) : "";
    if (!m.counts.mem) notes += '<p class="note info">Start in <a href="#mushaf">Mushaf</a>: mark your pages and today\'s revision appears here.</p>';
    if (m.light) notes += '<div class="catch light"><h3>Light day</h3><p>Today is cut down to ' + mins(m.total) + ": near revision, the weakest extra passes and the smallest far share that still keeps the cycle within " + plural(set.maxCycle, "day") +
      '. New memorization is paused. Nothing done today counts as falling behind.</p><div class="acts"><button type="button" class="btn ghost" data-act="busy-off" data-v="' + today + '">Use the full plan today</button></div></div>';
    else if (m.ramp < 1) notes += '<p class="note info">Ramping back up after your busy days: today is at about ' + Math.round(m.ramp * 100) + "% of the normal load.</p>";
    notes += catchupHTML();
    if (m.total - m.catchMin > m.budget + 2) {
      notes += '<p class="note">Today runs ' + mins(m.total - m.budget) + " over your " + mins(m.budget) +
        ' budget. To make it fit, raise the daily minutes, slow the new-memorization pace, or allow a longer far cycle in <a href="#pace">Settings</a>.</p>';
    }
    if (d.far.length || d.near.length) notes += '<p class="muted" style="font-size:14.5px">After each portion, rate how it went. Weak pages return every ' + plural(set.weakEvery, "day") + " until rated Solid twice, hesitant ones every " + plural(set.hesEvery, "day") + " until rated Solid once. Nothing is ever pushed later than its normal turn.</p>";
    $("plan-notes").innerHTML = notes;
  }

  /* ---------- coming up ---------- */
  function dayName(date, long) {
    return date === today ? "Today" : localDate(date).toLocaleDateString(undefined, long ? { weekday: "long", day: "numeric", month: "short" } : { weekday: "short", day: "numeric", month: "short" });
  }
  function renderAhead() {
    aheadDays = E.preview(state, today, 6);
    var days = [state.day].concat(aheadDays);
    function list(rs) {
      return rs.length ? rs.map(function (r) {
        return esc(E.rangeLabel(r.a, r.b)) + ' <span class="muted">' + esc(E.rowRef(state, r.a, r.b)) + "</span>";
      }).join("<br>") : "\u2013";
    }
    function merged(rs) { // the table shows whole runs, not the parts they are rated in
      var out = []; rs.forEach(function (r) { var l = out[out.length - 1]; if (l && l.b + 1 === r.a) l.b = r.b; else out.push({ a: r.a, b: r.b }); }); return out;
    }
    $("ahead-table").innerHTML = "<thead><tr><th>Day</th><th>New</th><th>Near</th><th>Far, extra passes and catch-up</th><th>Time</th><th>Load</th></tr></thead><tbody>" +
      days.map(function (d) {
        var np = 0, m = d.meta; d.near.forEach(function (r) { np += r.b - r.a + 1; });
        var load = m.light ? '<span class="chip hes">Light</span> <button type="button" class="link" data-act="busy-off" data-v="' + d.date + '">Make full</button>'
          : (m.ramp < 1 ? '<span class="chip">Ramping up</span> ' : "") + '<button type="button" class="link" data-act="busy-on" data-v="' + d.date + '">Make light</button>';
        return "<tr" + (m.light ? ' class="lightday"' : "") + "><td>" + esc(dayName(d.date)) + "</td><td>" +
          (d.nw ? esc(E.newLabel(d.nw)) + (d.nw.spans.length && E.similarIn(state, d.nw).length ? '<br><span class="muted">' + plural(E.similarIn(state, d.nw).length, "similar verse") + "</span>" : "") : m.light ? '<span class="muted">Paused</span>' : "\u2013") + "</td><td>" + (np ? plural(np, "page") : "\u2013") + "</td><td>" +
          list(merged(d.far).concat(merged(d.weak))) + (d.catch && d.catch.length ? '<br><span class="muted">Catch-up:</span> ' + list(merged(d.catch)) : "") + "</td><td>" + (m.total > 0 ? mins(m.total) : "\u2013") + "</td><td>" + load + "</td></tr>";
      }).join("") + "</tbody>";
    var b = Object.keys(state.busy).filter(function (k) { return k >= today; }).sort();
    $("busy-list").textContent = b.length ? "Light days set: " + b.map(function (k) { return shortDate(k, true); }).join(", ") + "." : "No light days set.";
    if (!$("bz-a").value) { $("bz-a").value = E.addDays(today, 1); $("bz-a").min = $("bz-b").min = today; }
  }

  /* ---------- progress ---------- */
  var period = 7;
  function shortDate(s, withDay) { return localDate(s).toLocaleDateString(undefined, withDay ? { weekday: "short", day: "numeric", month: "short" } : { day: "numeric", month: "short" }); }
  function longDate(s) { return localDate(s).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }); }
  function chartSVG(rep) {
    var W = Math.max(300, $("pr-chart").clientWidth || 760), H = 240, L = 44, R = 12, T = 12, B = 30, n = rep.days.length, max = 10;
    rep.days.forEach(function (d) { max = Math.max(max, d.m, d.t); });
    var step = max <= 40 ? 10 : max <= 90 ? 30 : max <= 240 ? 60 : 120; max = Math.ceil(max / step) * step;
    var pw = (W - L - R) / n, bw = Math.min(34, pw * 0.56), y = function (v) { return T + (H - T - B) * (1 - v / max); }, h = "";
    for (var v = 0; v <= max; v += step) {
      h += '<line class="grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '"/><text class="ax" x="' + (L - 8) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + (v >= 60 && v % 60 === 0 ? v / 60 + " h" : v) + "</text>";
    }
    rep.days.forEach(function (d, i) {
      var cx = L + pw * (i + 0.5), x = cx - bw / 2, yt = y(d.t), ym = y(d.m), base = y(0);
      var lab = n <= 7 ? localDate(d.date).toLocaleDateString(undefined, { weekday: "short" }) : (i % 7 === 0 ? shortDate(d.date) : "");
      h += '<g class="day" data-i="' + i + '">';
      if (d.t > 0) h += '<path class="plan" d="M' + x + " " + base + "V" + (yt + 4) + "a4 4 0 0 1 4 -4H" + (x + bw - 4) + "a4 4 0 0 1 4 4V" + base + 'Z"/>';
      if (d.m > 0) { var r = Math.min(4, (base - ym) / 2); h += '<path class="done" d="M' + (x + 2) + " " + base + "V" + (ym + r) + "a" + r + " " + r + " 0 0 1 " + r + " -" + r + "H" + (x + bw - 2 - r) + "a" + r + " " + r + " 0 0 1 " + r + " " + r + "V" + base + 'Z"/>'; }
      h += '<rect class="hit" x="' + (cx - pw / 2) + '" y="' + T + '" width="' + pw + '" height="' + (H - T - B) + '"/>';
      if (lab) h += '<text class="ax" x="' + cx + '" y="' + (H - 10) + '" text-anchor="middle">' + esc(lab) + "</text>";
      h += "</g>";
    });
    return '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Minutes done and planned per day">' + h + "</svg>";
  }
  function summaryText(rep, fc, weak) {
    var worst = E.juzTable(state, today).filter(function (r) { return r.weak + r.hes > 0; }).sort(function (a, b) { return (b.weak * 2 + b.hes) - (a.weak * 2 + a.hes); })[0];
    return ["Hifz progress, " + shortDate(rep.from) + " to " + shortDate(rep.to),
      "Active days: " + rep.active + " of " + rep.counted,
      "Time: " + (rep.min ? mins(rep.min) : "0 min") + (rep.plan ? " (" + Math.round(rep.planMin / rep.plan * 100) + "% of plan)" : ""),
      "Revised: " + pgs(rep.rev) + (rep.rev ? " (" + pg(rep.solid) + " solid, " + pg(rep.hes) + " some hesitation, " + pg(rep.weak) + " weak)" : ""),
      "New: " + pgs(rep.nw),
      "Memorized in total: " + pgs(fc.mem) + " (" + (fc.mem / 20).toFixed(1) + " juz)",
      "Weakest juz: " + (worst ? "Juz " + worst.j + " (" + pg(worst.weak) + " weak, " + pg(worst.hes) + " hesitant pages)" : "none"),
      "Weak spots: " + (weak.length ? weak.map(function (r) { return E.rowRef(state, r.a, r.b); }).join("; ") : "none")].join("\n");
  }
  var lastSummary = "";
  function renderProgress() {
    var rep = E.report(state, today, period), fc = E.forecast(state, today), weak = E.weakRanges(state), jt = E.juzTable(state, today);
    lastSummary = summaryText(rep, fc, weak);
    $("pr-7").setAttribute("aria-pressed", period === 7 ? "true" : "false");
    $("pr-28").setAttribute("aria-pressed", period === 28 ? "true" : "false");
    $("pr-range").textContent = shortDate(rep.from) + " to " + shortDate(rep.to) + (rep.counted < period ? ". You started " + (rep.counted === 1 ? "today" : rep.counted + " days ago") + ", so earlier days aren't counted." : "");
    var tiles = [
      [rep.active + " of " + rep.counted, "days with any revision or memorization"],
      [rep.min ? mins(rep.min) : "0 min", rep.plan ? Math.round(rep.planMin / rep.plan * 100) + "% of the " + mins(rep.plan) + " planned" : "no plan recorded yet"],
      [pg(rep.rev), "pages revised"],
      [pg(rep.nw), "new pages memorized"]
    ];
    $("pr-stats").innerHTML = tiles.map(function (t) { return '<div class="stat"><b>' + esc(t[0]) + "</b><span>" + esc(t[1]) + "</span></div>"; }).join("");
    $("pr-chart").innerHTML = chartSVG(rep);
    $("pr-chart").dataset.days = JSON.stringify(rep.days);
    $("pr-daily").innerHTML = "<thead><tr><th>Day</th><th>Done</th><th>Planned</th><th>Revised</th><th>New</th></tr></thead><tbody>" + rep.days.filter(function (d) { return d.scope; }).map(function (d) {
      return "<tr><td>" + esc(shortDate(d.date, true)) + "</td><td>" + (d.m ? mins(d.m) : "\u2013") + "</td><td>" + (d.t ? mins(d.t) : "\u2013") + "</td><td>" + (d.r ? pgs(d.r) : "\u2013") + "</td><td>" + (d.n ? pgs(d.n) : "\u2013") + "</td></tr>";
    }).join("") + "</tbody>";

    var rated = rep.solid + rep.hes + rep.weak, q = "";
    if (rated > 0) {
      var pc = function (v) { return Math.round(v / rated * 100); };
      q = '<div class="split" role="img" aria-label="' + pc(rep.solid) + " percent solid, " + pc(rep.hes) + " percent some hesitation, " + pc(rep.weak) + ' percent weak">' +
        (rep.solid ? '<i class="ok" style="flex:' + rep.solid + '"></i>' : "") + (rep.hes ? '<i class="mid" style="flex:' + rep.hes + '"></i>' : "") + (rep.weak ? '<i class="bad" style="flex:' + rep.weak + '"></i>' : "") + "</div>" +
        '<div class="legend"><span><i class="sw recent"></i>Solid: ' + pgs(rep.solid) + " (" + pc(rep.solid) + '%)</span><span><i class="sw hes"></i>Some hesitation: ' + pgs(rep.hes) + " (" + pc(rep.hes) +
        '%)</span><span><i class="sw weak"></i>Weak: ' + pgs(rep.weak) + " (" + pc(rep.weak) + "%)</span></div>";
    } else q = '<p class="muted">No portions rated in this period yet. Rate portions on the Today page and the split appears here.</p>';
    $("pr-quality").innerHTML = q;

    var m = '<dl class="facts"><div><dt>Memorized</dt><dd>' + pgs(fc.mem) + " of 604, " + (fc.mem / 20).toFixed(1) + " juz (" + Math.round(fc.mem / 604 * 100) + "%)</dd></div>" +
      "<div><dt>Recent pace</dt><dd>" + (fc.perWeek > 0 ? pg(fc.perWeek) + " pages a week over the last " + plural(fc.days, "day") : "No new memorization logged in the last " + plural(fc.days, "day")) + "</dd></div>" +
      "<div><dt>Finish date at this pace</dt><dd>" + (fc.left <= 0 ? "Complete" : fc.at ? longDate(fc.at) : "\u2013") + "</dd></div>" +
      "<div><dt>Finish date at your set pace</dt><dd>" + (fc.left <= 0 ? "Complete" : fc.setAt ? longDate(fc.setAt) + " (" + pg(fc.setPerWeek) + " pages a week)" : "New memorization is switched off") + "</dd></div></dl>";
    $("pr-mem").innerHTML = m;

    var started = jt.filter(function (r) { return r.mem > 0.01; });
    $("pr-juz").innerHTML = started.length ? "<thead><tr><th>Juz</th><th>Memorized</th><th>Needs work</th><th>In near revision</th><th>Last revised</th></tr></thead><tbody>" + started.map(function (r) {
      return "<tr><td>Juz " + r.j + '</td><td><span class="meter"><i style="width:' + Math.round(r.mem / r.pages * 100) + '%"></i></span>' + pg(r.mem) + " of " + r.pages + "</td><td>" +
        ((r.weak > 0.01 ? '<span class="chip weak">' + pg(r.weak) + " weak</span> " : "") + (r.hes > 0.01 ? '<span class="chip hes">' + pg(r.hes) + " hesitant</span>" : "") || "\u2013") + "</td><td>" + (r.near > 0.01 ? pgs(r.near) : "\u2013") + "</td><td>" + (r.last ? esc(shortDate(r.last)) : "\u2013") + "</td></tr>";
    }).join("") + "</tbody>" : "";
    $("pr-juz-note").textContent = started.length ? (started.length < 30 ? (30 - started.length) + " juz not started. " : "") + "Last revised is recorded from today onward, when you mark a portion Solid or Shaky." : "Nothing memorized yet. Mark your pages on the Mushaf page.";

    $("pr-weak").innerHTML = weak.length ? '<ul class="rows" style="padding:0">' + weak.map(function (r) {
      return '<li class="row" style="grid-template-columns:1fr auto"><div class="what"><strong>' + esc(E.rowRef(state, r.a, r.b)) + "</strong><span>" + esc(E.rangeLabel(r.a, r.b)) + " \u00b7 " + pgs(E.rowPages(state, r.a, r.b)) + '</span></div><span class="chip ' + (r.level === 2 ? "weak" : "hes") + '">' + (r.level === 2 ? "Weak" : "Some hesitation") + "</span></li>";
    }).join("") + "</ul>" : '<p class="muted">Nothing needs extra work. Anything you rate Weak or Some hesitation is listed here until it is rated Solid again.</p>';
  }

  /* ---------- mushaf map ---------- */
  function buildMap() {
    var h = "", j, p;
    for (j = 1; j <= 30; j++) {
      h += '<div class="jrow"><button type="button" class="jlab" data-act="juz" data-j="' + j + '" title="Apply the brush to all of juz ' + j + '">' + j + '</button><div class="cells">';
      for (p = E.juzStart(j); p <= E.juzEnd(j); p++) {
        h += '<button type="button" class="pg" tabindex="-1" data-p="' + p + '" title="Page ' + p + " \u00b7 " + esc(E.spanLabel(E.pFirst(p), E.pLast(p))) + '"></button>';
      }
      h += "</div></div>";
    }
    $("map").innerHTML = h;
    Array.prototype.forEach.call($("map").querySelectorAll(".pg"), function (el) { cells[el.dataset.p] = el; });
    $("sr").innerHTML = $("sr-b").innerHTML = E.NAMES.map(function (n, i) { return '<option value="' + i + '">' + (i + 1) + ". " + esc(n) + "</option>"; }).join("");
  }
  // A partly memorized page is drawn filled only where its memorized ayahs sit, top to bottom.
  function cellBg(p, color) {
    var tot = E.pageWeight(p), parts = [], last = 0;
    E.spansOf(state, p).forEach(function (s) {
      var x = 0, y, g;
      for (g = E.pFirst(p); g < s[0]; g++) x += E.ayahWeight(g);
      y = x; for (g = s[0]; g <= s[1]; g++) y += E.ayahWeight(g);
      x = Math.round(x / tot * 100); y = Math.round(y / tot * 100);
      parts.push("transparent " + last + "% " + x + "%", color + " " + x + "% " + y + "%"); last = y;
    });
    parts.push("transparent " + last + "% 100%");
    return "linear-gradient(180deg," + parts.join(",") + ")";
  }
  function renderMap() {
    var due = {}, d = state.day, solid = 0, shaky = 0, hes = 0, recent = 0, p;
    ["near", "weak", "far", "catch"].forEach(function (t) { (d[t] || []).forEach(function (r) { if (!r.done) for (var q = r.a; q <= r.b; q++) due[q] = 1; }); });
    for (p = 1; p <= E.LAST; p++) {
      var e = state.pages[p], c = "pg", bg = "", tip = "Page " + p + " \u00b7 " + E.spanLabel(E.pFirst(p), E.pLast(p));
      if (e) {
        var nr = E.isNear(state, p, today), f = E.cov(state, p);
        if (nr) { c += " nr"; recent += f; } else if (e[0] === 2) shaky += f; else if (e[0] === 3) hes += f; else solid += f;
        c += e[0] === 2 ? " s2" : e[0] === 3 ? " s3" : " s1";
        if (e[2]) {
          c += " part"; bg = cellBg(p, nr ? "var(--near)" : e[0] === 2 ? "var(--weak)" : e[0] === 3 ? "var(--new)" : "var(--far)");
          tip += " \u00b7 memorized: " + E.spansLabel(e[2]);
        }
      }
      if (due[p]) c += " due";
      if (cells[p].className !== c) cells[p].className = c;
      if (cells[p].style.background !== bg) cells[p].style.background = bg;
      if (cells[p].title !== tip) cells[p].title = tip;
    }
    var n = solid + shaky + hes + recent;
    $("map-sum").textContent = n > 0.01 ? pgs(n) + " (" + (n / 20).toFixed(1) + " juz): " + pg(solid) + " solid, " + pg(hes) + " hesitant, " + pg(shaky) + " weak, " + pg(recent) + " recent. Outlined pages are due for revision today."
      : "Nothing marked yet.";
    Array.prototype.forEach.call(document.querySelectorAll(".brush"), function (b) { b.setAttribute("aria-pressed", b.dataset.v === brush ? "true" : "false"); });
  }
  function paint(p) { E.setAyahs(state, E.pFirst(p), E.pLast(p), brush, today); }
  function paintRange(a, b) {
    a = Math.max(1, Math.min(a, b)); b = Math.min(E.LAST, Math.max(a, b));
    E.setAyahs(state, E.pFirst(a), E.pLast(b), brush, today);
    edited();
  }
  function edited() {
    renderMap(); // instant feedback on the squares; the plan follows
    clearTimeout(editTimer);
    editTimer = setTimeout(function () { E.rebuild(state, today); persist(); renderAll(); }, 250);
  }

  /* ---------- settings ---------- */
  var NUMS = { minNew: [5, 240], budget: [10, 720], perJuz: [20, 40], nearDays: [3, 120], maxCycle: [1, 60], weakEvery: [1, 14], hesEvery: [2, 30], lightMin: [5, 240], busyBelow: [0, 600], maxSession: [15, 180], catchPct: [10, 50] };
  function buildSettings() {
    $("set-days").innerHTML = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(function (n, i) {
      return '<label for="set-d' + i + '"><input type="checkbox" id="set-d' + i + '">' + n + "</label>";
    }).join("");
  }
  function fillSettings() {
    var s = state.set, k;
    $("set-pace").value = String(s.pace); $("set-order").value = s.order;
    for (k in NUMS) $("set-" + k).value = s[k];
    $("out-perJuz").textContent = s.perJuz + " min";
    $("set-dayStart").value = s.dayStart; $("set-dayEnd").value = s.dayEnd;
    s.memDays.forEach(function (v, i) { $("set-d" + i).checked = !!v; });
  }
  function readSettings() {
    var s = state.set, k, v;
    s.pace = parseFloat($("set-pace").value) || 0;
    s.order = $("set-order").value === "front" ? "front" : "back";
    for (k in NUMS) { v = parseFloat($("set-" + k).value); if (isFinite(v)) s[k] = Math.max(NUMS[k][0], Math.min(NUMS[k][1], Math.round(v))); }
    if (/^\d\d:\d\d/.test($("set-dayStart").value)) s.dayStart = $("set-dayStart").value.slice(0, 5);
    if (/^\d\d:\d\d/.test($("set-dayEnd").value)) s.dayEnd = $("set-dayEnd").value.slice(0, 5);
    s.memDays = s.memDays.map(function (_, i) { return $("set-d" + i).checked; });
    E.rebuild(state, today); persist(); renderAll();
  }

  /* ---------- calendar ---------- */
  function calError(e) {
    var c = e && e.code;
    if (c === "needs_reauth" || c === "interaction_required" || c === "login_required") return "Sign in with Google again (the button at the bottom of the sidebar), then try again.";
    if (c === "access_denied" || c === "popup_closed" || c === "popup_failed_to_open") return "Google sign-in didn't finish. Press the button again and allow access when Google asks. If nothing opens, allow pop-ups for this site.";
    if (c === "google_unavailable") return "Google sign-in couldn't load. Check your internet connection or ad blocker, then reload the page.";
    if (c === "server_unavailable") return "Google Calendar didn't answer. Try again in a moment.";
    if (c === "http_403") return "Google refused access to the calendar. Make sure the Calendar API is switched on and that you allowed calendar access at sign-in." + (e.message ? " (" + e.message + ")" : "");
    return "Something went wrong reaching the calendar" + (e && e.message ? ": " + e.message : "") + ". Try again.";
  }
  function storeEvents(evs) {
    cal.ev = {}; cal.allday = {}; cal.count = 0;
    var base = localDate(today).getTime();
    function put(map, date, v) { (map[date] = map[date] || []).push(v); }
    evs.forEach(function (ev) {
      if (!ev || ev.status === "cancelled" || !ev.start || !ev.end) return;
      var me = (ev.attendees || []).filter(function (x) { return x.self; })[0];
      if (me && me.responseStatus === "declined") return;
      var title = String(ev.summary || "(No title)"), i, d;
      if (!ev.start.dateTime || !ev.end.dateTime) { // all-day: shown at the top, doesn't block time
        if (!ev.start.date) return;
        var last = ev.end.date ? E.addDays(ev.end.date, -1) : ev.start.date;
        for (i = 0; i < 7; i++) { d = E.addDays(today, i); if (d >= ev.start.date && d <= last) put(cal.allday, d, title); }
        cal.count++; return;
      }
      var s = (new Date(ev.start.dateTime).getTime() - base) / 60000, e = (new Date(ev.end.dateTime).getTime() - base) / 60000;
      if (!(e > s)) return;
      cal.count++;
      for (i = 0; i < 7; i++) {
        var a = Math.max(s, i * 1440), b = Math.min(e, (i + 1) * 1440);
        if (b > a) put(cal.ev, E.addDays(today, i), { s: Math.round(a - i * 1440), e: Math.round(b - i * 1440), title: title, own: title.indexOf("Qur'an \u00b7") === 0 });
      }
    });
  }
  function updateCal() {
    if (cal.busy) return;
    cal.busy = true; cal.msg = ""; renderCal();
    var all = [];
    function page(calId, token, n) {
      return G.listEvents(calId, today + "T00:00:00", E.addDays(today, 7) + "T00:00:00", token).then(function (pl) {
        if (!pl || !Array.isArray(pl.items)) throw { code: "upstream_error", message: "the calendar's answer couldn't be read" };
        all = all.concat(pl.items);
        return pl.nextPageToken && n < 4 ? page(calId, pl.nextPageToken, n + 1) : all;
      });
    }
    // Read every calendar that is switched on. One that can't be read (for example, no permission) is skipped, not fatal.
    G.token(true).then(G.listCalendars).then(function (ids) {
      var chain = Promise.resolve();
      ids.forEach(function (id) {
        chain = chain.then(function () {
          return page(id, "", 0).catch(function (e) { if (e && (e.code === "http_403" || e.code === "http_404")) return all; throw e; });
        });
      });
      return chain.then(function () { return all; });
    }).then(function (evs) {
      storeEvents(evs); cal.loaded = true; cal.at = Date.now(); cal.busy = false; renderCal();
    }).catch(function (e) { cal.busy = false; cal.msg = calError(e); renderCal(); });
  }
  // Days in the loaded week where free time is short: less than the full plan needs, or under the threshold in Settings.
  function busyDays() {
    if (!cal.loaded) return [];
    var out = [], set = state.set;
    for (var i = 0; i < 7; i++) {
      var d = E.addDays(today, i), day = dayPlan(d);
      if (!day || state.busy[d] || state.busyNo[d] || !(day.meta.total > 0)) continue;
      var free = 0, left = 0;
      E.freeGaps(cal.ev[d] || [], hm(set.dayStart), hm(set.dayEnd), i === 0 ? nowMin() + 10 : 0, 10).forEach(function (g) { free += g.e - g.s; });
      E.queueUnits(day).forEach(function (u) { left += u.min; });
      if (i === 0 && left < 1) continue; // today's plan is already finished
      var need = i === 0 ? left : day.meta.total;
      if (free < need || free < set.busyBelow) out.push({ date: d, free: free, need: need, m: Math.max(5, Math.min(set.lightMin, Math.floor(free / 5) * 5)) });
    }
    return out;
  }
  function dayPlan(date) { var i = E.diffDays(date, today); return i <= 0 ? state.day : aheadDays[i - 1] || null; }
  function nowMin() { var n = new Date(); return n.getHours() * 60 + n.getMinutes(); }
  // Work out the sittings for the selected day and where they go. Kept until the day, plan, calendar or arrangement changes.
  function computeSits() {
    var date = cal.sel, day = dayPlan(date), evs = cal.ev[date] || [];
    var sig = [date, cal.mode, cal.at, state.set.dayStart, state.set.dayEnd, state.set.maxSession, day ? JSON.stringify([day.nw && [day.nw.done, day.nw.min], day.near, day.weak, day.far, day.catch]) : ""].join("|");
    if (sig === cal.sig) return;
    cal.sig = sig; cal.pick = -1; cal.hint = "";
    var sits = day ? E.sittings(day, state.set.maxSession) : [], own = 0;
    evs.forEach(function (ev) { if (ev.own) own += ev.e - ev.s; });
    cal.covered = 0;
    while (sits.length && own >= sits[0].min - 0.5) { own -= sits[0].min; cal.covered += sits.shift().min; } // already on the calendar
    cal.gaps = E.freeGaps(evs, hm(state.set.dayStart), hm(state.set.dayEnd), date === today ? nowMin() + 10 : 0, 10);
    var starts = E.arrange(cal.gaps, sits, cal.mode, 10);
    cal.sits = sits.map(function (x, i) {
      return { tier: x.tier, dur: x.dur, min: x.min, s: starts[i], on: starts[i] >= 0, title: E.sessionTitle(x.units, state), desc: E.sessionDesc(x.units, state), st: "", bad: false, added: false, link: "" };
    });
  }
  function tryMove(i, s) {
    var x = cal.sits[i]; if (!x || x.added) return;
    s = Math.max(0, Math.min(1440 - x.dur, Math.round(s / 5) * 5));
    var e = s + x.dur, clash = "";
    if (cal.sel === today && s < nowMin()) clash = "That time has already passed.";
    (cal.ev[cal.sel] || []).forEach(function (ev) { if (!clash && s < ev.e && e > ev.s) clash = "That overlaps \u201c" + ev.title + "\u201d. Pick another time."; });
    cal.sits.forEach(function (o, k) { if (!clash && k !== i && o.s >= 0 && s < o.s + o.dur && e > o.s) clash = "That overlaps another sitting. Pick another time."; });
    if (clash) { cal.hint = clash; renderCal(); return; }
    x.s = s; x.on = true; x.st = ""; x.bad = false; cal.pick = -1; cal.hint = ""; renderCal();
  }
  function addSelected() {
    if (cal.busy) return;
    var todo = cal.sits.filter(function (s) { return s.on && s.s >= 0 && !s.added; }), date = cal.sel;
    if (!todo.length) return;
    cal.busy = true; cal.msg = ""; renderCal();
    G.token(true).then(function () {
      var chain = Promise.resolve();
      todo.forEach(function (s) {
        chain = chain.then(function () {
          return G.createEvent({
            summary: s.title, description: s.desc + "\n\nPlanned with Hifz Planner.",
            start: date + "T" + hhmm(s.s) + ":00", end: date + "T" + hhmm(s.s + s.dur) + ":00"
          }).then(function (pl) {
            s.st = "Added to your calendar"; s.bad = false; s.added = true;
            s.link = pl && typeof pl.htmlLink === "string" && pl.htmlLink.indexOf("https://") === 0 ? pl.htmlLink : "";
          }, function (e) {
            var c = e && e.code; s.bad = true;
            // A timeout doesn't prove the event wasn't created, so a write is never retried automatically.
            s.st = c === "server_unavailable" || c === "upstream_error"
              ? "Couldn't confirm this one. Press Update to check your calendar before adding it again." : calError(e);
          }).then(renderCal);
        });
      });
      return chain;
    }).catch(function (e) { cal.msg = calError(e); }).then(function () { cal.busy = false; renderCal(); });
  }
  // Side-by-side lanes for events that overlap.
  function lanes(evs) {
    var list = evs.slice().sort(function (a, b) { return a.s - b.s || b.e - a.e; }), out = [], group = [], ends = [], gEnd = -1;
    function flush() { group.forEach(function (g) { g.n = ends.length; out.push(g); }); group = []; ends = []; }
    list.forEach(function (ev) {
      if (group.length && ev.s >= gEnd) flush();
      var k = 0; while (k < ends.length && ends[k] > ev.s) k++;
      ends[k] = ev.e; gEnd = Math.max(gEnd, ev.e); group.push({ ev: ev, k: k });
    });
    flush(); return out;
  }
  function renderCal() {
    if (cal.sel < today || E.diffDays(cal.sel, today) > 6) cal.sel = today;
    computeSits();
    var set = state.set, days = [], i, h = "", lo = hm(set.dayStart), hi = hm(set.dayEnd);
    for (i = 0; i < 7; i++) days.push(E.addDays(today, i));
    days.forEach(function (d) { (cal.ev[d] || []).forEach(function (ev) { lo = Math.min(lo, ev.s); hi = Math.max(hi, ev.e); }); });
    cal.sits.forEach(function (x) { if (x.s >= 0) { lo = Math.min(lo, x.s); hi = Math.max(hi, x.s + x.dur); } });
    var h0 = Math.max(0, Math.floor(lo / 60)), h1 = Math.min(24, Math.ceil(hi / 60));
    cal.h0 = h0;
    function y(m) { return Math.round((m - h0 * 60) * HH / 60); }
    function box(s, e) { return "top:" + y(s) + "px;height:" + Math.max(16, y(e) - y(s) - 1) + "px"; }

    $("cal-go").disabled = cal.busy;
    $("cal-go").textContent = cal.busy && !cal.loaded ? "Loading" : cal.busy ? "Working" : cal.loaded ? "Update" : "Load my Google Calendar";
    $("cal-at").textContent = cal.loaded ? "Updated " + new Date(cal.at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) + " \u00b7 " + plural(cal.count, "event") + " in the next 7 days"
      : "Not loaded yet. Until you load it, suggestions assume your days are empty.";
    Array.prototype.forEach.call(document.querySelectorAll("[data-act=calmode]"), function (b) { b.setAttribute("aria-pressed", b.dataset.v === cal.mode ? "true" : "false"); });
    var bz = busyDays(), bh = "";
    if (bz.length) {
      bh = '<div class="catch light"><h3>' + (bz.length === 1 ? "A busy day ahead" : plural(bz.length, "busy day") + " ahead") + "</h3><p>These days have less free time than the plan needs, or less than the " + mins(state.set.busyBelow) +
        " you set as your limit. A light plan keeps near revision and the weakest pages, pauses new memorization and shrinks far revision to its minimum.</p><div class=\"opts\">" +
        bz.map(function (x) {
          return '<div class="opt"><div><strong>' + esc(dayName(x.date, true)) + "</strong><span>" + (x.free > 0 ? mins(x.free) : "No time") + " free, the " + (x.date === today ? "rest of the plan" : "full plan") + " needs " + mins(x.need) + '.</span></div><button type="button" class="btn ghost" data-act="busy-on" data-v="' + x.date + '" data-m="' + x.m + '">Use a light plan</button></div>';
        }).join("") + '</div><div class="acts">' + (bz.length > 1 ? '<button type="button" class="btn" data-act="busy-all">Use light plans on all ' + bz.length + "</button> " : "") + '<button type="button" class="link" data-act="busy-no">Keep the full plan on these days</button></div></div>';
    }
    $("cal-msg").innerHTML = (cal.msg ? '<p class="note">' + esc(cal.msg) + "</p>" : "") + bh;

    // header
    h = '<div class="wk-head"><span class="wk-corner"></span>' + days.map(function (d) {
      var dt = localDate(d), ad = cal.allday[d] || [];
      return '<button type="button" class="wk-day' + (d === cal.sel ? " sel" : "") + (d === today ? " now" : "") + '" data-act="calday" data-v="' + d + '"' + (d === cal.sel ? ' aria-current="date"' : "") + ">" +
        "<span>" + esc(dt.toLocaleDateString(undefined, { weekday: "short" })) + "</span><b>" + dt.getDate() + "</b>" +
        ad.slice(0, 2).map(function (t) { return '<i title="' + esc(t) + '">' + esc(t) + "</i>"; }).join("") + (ad.length > 2 ? "<i>+" + (ad.length - 2) + " more</i>" : "") + "</button>";
    }).join("") + "</div>";
    // body
    h += '<div class="wk-body" style="height:' + ((h1 - h0) * HH + 1) + 'px"><div class="wk-hours">';
    for (i = h0; i <= h1; i++) h += '<span style="top:' + ((i - h0) * HH) + 'px">' + (i === h0 ? "" : clock(i * 60).replace(":00", "")) + "</span>";
    h += "</div>";
    days.forEach(function (d) {
      var sel = d === cal.sel;
      h += '<div class="wk-col' + (sel ? " sel" : "") + (sel && cal.pick >= 0 ? " picking" : "") + '" data-date="' + d + '">';
      if (sel) cal.gaps.forEach(function (g) { h += '<div class="free" style="' + box(g.s, g.e) + '"></div>'; });
      lanes(cal.ev[d] || []).forEach(function (L) {
        var ev = L.ev, w = 100 / L.n;
        h += '<div class="ev' + (ev.own ? " own" : "") + '" style="' + box(ev.s, ev.e) + ";left:" + (L.k * w) + "%;width:calc(" + w + '% - 3px)" title="' + esc(ev.title + ", " + clock(ev.s) + " to " + clock(ev.e)) + '"><b>' + esc(ev.title) + "</b><span>" + clock(ev.s) + "</span></div>";
      });
      if (sel) cal.sits.forEach(function (x, k) {
        if (x.s < 0) return;
        h += '<button type="button" class="sit t-' + x.tier + (k === cal.pick ? " pick" : "") + (x.added ? " added" : "") + (x.on ? "" : " off") + (x.dur < 30 ? " short" : "") + '" data-act="calpick" data-i="' + k + '" style="' + box(x.s, x.s + x.dur) + '" title="' + esc(x.title) + '"' + (x.added ? " disabled" : "") + "><b>" +
          esc(E.TIER_NAME[x.tier]) + "</b><span>" + clock(x.s) + " \u2013 " + clock(x.s + x.dur) + "</span></button>";
      });
      if (d === today && nowMin() >= h0 * 60 && nowMin() <= h1 * 60) h += '<div class="nowline" style="top:' + y(nowMin()) + 'px"></div>';
      h += "</div>";
    });
    h += "</div>";
    $("cal-grid").innerHTML = h;

    // suggestions for the selected day
    var label = cal.sel === today ? "today" : localDate(cal.sel).toLocaleDateString(undefined, { weekday: "long" });
    var out = "<h2>Sittings for " + esc(label) + "</h2>";
    if (cal.pick >= 0) out += '<p class="note info">Click a time in ' + esc(label === "today" ? "today's" : label + "'s") + " column to move \u201c" + esc(E.TIER_NAME[cal.sits[cal.pick].tier]) + '\u201d there. <button type="button" class="link" data-act="calpick" data-i="-1">Cancel</button></p>';
    if (cal.hint) out += '<p class="note">' + esc(cal.hint) + "</p>";
    if (cal.covered > 0.5) out += '<p class="muted">' + mins(cal.covered) + " of this day's plan is already on your calendar, so only the rest is suggested.</p>";
    if (!cal.sits.length) {
      out += '<p class="muted">' + (cal.covered > 0.5 ? "Everything left in the plan is already on your calendar." : cal.sel === today ? "Everything in today's plan is done. Nothing left to schedule." : "Nothing is planned for this day.") + "</p>";
    } else {
      out += '<p class="muted">The shaded bands on the calendar are your free time, with 10 minutes left around each event. Sittings are placed in them for you. To change one, press Move and click a free time, or type a start time.' +
        (cal.sel !== today ? " Later days assume each day before them gets finished, so their portions can shift." : "") + '</p><ul class="sess">' +
        cal.sits.map(function (s, k) {
          var lock = s.added || cal.busy;
          return '<li><input type="checkbox" id="cal-ck-' + k + '" data-i="' + k + '" aria-label="Include this sitting"' + (s.on && s.s >= 0 ? " checked" : "") + (lock || s.s < 0 ? " disabled" : "") + ">" +
            '<input type="time" id="cal-t-' + k + '" data-i="' + k + '" step="300" aria-label="Start time" value="' + (s.s >= 0 ? hhmm(s.s) : "") + '"' + (lock ? " disabled" : "") + ">" +
            '<div class="what"><strong><i class="dot t-' + s.tier + '"></i>' + esc(s.title) + "</strong><span>" + (s.s >= 0 ? clock(s.s) + " to " + clock(s.s + s.dur) + " \u00b7 " : "No free time fits this one. Press Move and pick a time, or widen your hours in Settings. \u00b7 ") + mins(s.dur) + "</span><span>" + esc(s.desc) + "</span></div>" +
            '<div class="st' + (s.bad ? " bad" : "") + '">' + (s.st ? esc(s.st) + (s.link ? ' \u00b7 <a href="' + esc(s.link) + '" target="_blank" rel="noopener">Open in Google Calendar</a>' : "") : "") +
            (lock ? "" : ' <button type="button" class="link" data-act="calpick" data-i="' + k + '">' + (k === cal.pick ? "Cancel move" : "Move") + "</button>") + "</div></li>";
        }).join("") + "</ul>";
      var n = cal.sits.filter(function (s) { return s.on && s.s >= 0 && !s.added; }).length;
      out += '<button type="button" class="btn" data-act="addcal"' + (cal.busy || !n ? " disabled" : "") + ">" + (cal.busy ? "Working" : n ? "Add " + plural(n, "sitting") + " to Google Calendar" : "Nothing to add") + "</button>";
    }
    $("cal-out").innerHTML = out;
  }

  var VIEWS = ["today", "calendar", "schedule", "progress", "mushaf", "pace"];
  function route() {
    var v = location.hash.slice(1); if (VIEWS.indexOf(v) < 0) v = "today";
    VIEWS.forEach(function (n) { $("v-" + n).hidden = n !== v; });
    Array.prototype.forEach.call(document.querySelectorAll("nav a"), function (l) {
      if (l.getAttribute("href") === "#" + v) l.setAttribute("aria-current", "page"); else l.removeAttribute("aria-current");
    });
    window.scrollTo(0, 0);
    if (v === "progress") renderProgress(); // the chart is sized to the visible panel
  }
  window.addEventListener("resize", function () { if (!$("v-progress").hidden) renderProgress(); });
  window.addEventListener("hashchange", route);
  function renderAll() { renderHead(); renderStats(); renderToday(); renderAhead(); renderProgress(); renderMap(); fillSettings(); renderCal(); }

  /* ---------- events ---------- */
  function changed() { persist(); renderAll(); }
  document.addEventListener("click", function (ev) {
    var pg = ev.target.closest(".pg");
    if (pg) { if (lastPointer !== "mouse") { paint(+pg.dataset.p); edited(); } return; }
    var el = ev.target.closest("[data-act]"); if (!el) return;
    var a = el.dataset.act, t = el.dataset.tier, i = +el.dataset.i;
    if (a === "rate") { E.rate(state, t, i, +el.dataset.r); E.rebuild(state, today); changed(); }
    else if (a === "rateall") { state.day[t].forEach(function (r, k) { if (!r.done) E.rate(state, t, k, 1); }); E.rebuild(state, today); changed(); }
    else if (a === "undo") { E.rate(state, t, i, 0); E.rebuild(state, today); changed(); }
    else if (a === "donenew") { E.applyNew(state); E.recordHist(state); changed(); }
    else if (a === "undonew") { E.undoNew(state); E.rebuild(state, today); changed(); }
    else if (a === "brush") { brush = el.dataset.v; renderMap(); }
    else if (a === "juz") { paintRange(E.juzStart(+el.dataset.j), E.juzEnd(+el.dataset.j)); }
    else if (a === "calday") { cal.sel = el.dataset.v; renderCal(); }
    else if (a === "calmode") { cal.mode = el.dataset.v; renderCal(); }
    else if (a === "calpick") { var k = +el.dataset.i; cal.pick = k === cal.pick ? -1 : k; cal.hint = ""; renderCal(); }
    else if (a === "busy-on") { E.setBusy(state, el.dataset.v, +el.dataset.m || 0); E.rebuild(state, today); changed(); }
    else if (a === "busy-off") { E.clearBusy(state, el.dataset.v); state.busyNo[el.dataset.v] = 1; E.rebuild(state, today); changed(); }
    else if (a === "busy-all") { busyDays().forEach(function (x) { E.setBusy(state, x.date, x.m); }); E.rebuild(state, today); changed(); }
    else if (a === "busy-no") { busyDays().forEach(function (x) { state.busyNo[x.date] = 1; }); changed(); }
    else if (a === "cu-reset") { E.resetBacklog(state); E.rebuild(state, today); changed(); }
    else if (a === "cu-keep") { state.cuKeep = state.day.meta.backlogPages; changed(); }
    else if (a === "period") { period = +el.dataset.v; renderProgress(); }
    else if (a === "copysum") {
      var done = function (t) { el.textContent = t; setTimeout(function () { el.textContent = "Copy summary"; }, 2000); };
      try { navigator.clipboard.writeText(lastSummary).then(function () { done("Copied"); }, function () { done("Couldn't copy"); }); } catch (e) { done("Couldn't copy"); }
    }
    else if (a === "calupdate") updateCal();
    else if (a === "addcal") addSelected();
  });
  document.addEventListener("pointerdown", function (ev) {
    lastPointer = ev.pointerType;
    var pg = ev.target.closest && ev.target.closest(".pg");
    if (pg && ev.pointerType === "mouse" && ev.button === 0) { mouseDown = true; paint(+pg.dataset.p); edited(); ev.preventDefault(); }
  });
  document.addEventListener("pointerover", function (ev) {
    if (!mouseDown) return;
    var pg = ev.target.closest && ev.target.closest(".pg");
    if (pg) { paint(+pg.dataset.p); edited(); }
  });
  document.addEventListener("pointerup", function () { mouseDown = false; });
  $("f-range").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var a = parseInt($("rg-a").value, 10), b = parseInt($("rg-b").value, 10);
    if (!isFinite(a)) return; if (!isFinite(b)) b = a;
    paintRange(Math.min(a, b), Math.max(a, b));
  });
  $("f-surah").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var i = +$("sr").value, k = +$("sr-b").value;
    var a = parseInt($("sr-a").value, 10), b = parseInt($("sr-b-a").value, 10);
    var g0 = E.gOf(i, isFinite(a) ? a : 1), g1 = E.gOf(k, isFinite(b) ? b : E.COUNTS[k]);
    E.setAyahs(state, Math.min(g0, g1), Math.max(g0, g1), brush, today);
    edited();
  });
  function ayahHints() {
    $("sr-a").max = E.COUNTS[+$("sr").value]; $("sr-b-a").max = E.COUNTS[+$("sr-b").value];
    $("sr-b-a").placeholder = String(E.COUNTS[+$("sr-b").value]);
  }
  $("sr").addEventListener("change", function () { if (+$("sr-b").value < +this.value) $("sr-b").value = this.value; ayahHints(); });
  $("sr-b").addEventListener("change", ayahHints);
  $("f-busy").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var x = $("bz-a").value, y = $("bz-b").value || x; if (!x) return;
    if (y < x) { var t = x; x = y; y = t; }
    if (x < today) x = today;
    for (var d = x, n = 0; d <= y && n < 60; d = E.addDays(d, 1), n++) E.setBusy(state, d, 0);
    E.rebuild(state, today); changed();
  });
  /* ---------- backup and restore ---------- */
  $("bk-export").addEventListener("click", function () {
    var blob = new Blob([JSON.stringify(state, null, 1)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "hifz-backup-" + E.today() + ".json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    $("bk-msg").textContent = "Backup downloaded as " + a.download + ". Keep it somewhere safe.";
  });
  $("bk-import").addEventListener("click", function () { $("bk-file").click(); });
  $("bk-file").addEventListener("change", function () {
    var f = this.files[0], input = this; if (!f) return;
    var rd = new FileReader();
    rd.onload = function () {
      var data;
      try { data = JSON.parse(rd.result); } catch (e) { data = null; }
      if (!data || typeof data !== "object" || !data.pages || typeof data.pages !== "object" || !data.set) {
        $("bk-msg").textContent = "That file isn't a Hifz Planner backup, so nothing was changed.";
      } else if (confirm("Replace your current progress with the contents of " + f.name + "? This can't be undone, so download a backup first if you aren't sure.")) {
        state = E.normalize(data);
        ensureDay(); persist(); renderAll();
        $("bk-msg").textContent = "Restored from " + f.name + ".";
      } else {
        $("bk-msg").textContent = "Cancelled. Nothing was changed.";
      }
      input.value = "";
    };
    rd.readAsText(f);
  });
  $("f-set").addEventListener("submit", function (ev) { ev.preventDefault(); });
  $("f-set").addEventListener("change", readSettings);
  $("set-perJuz").addEventListener("input", function () { $("out-perJuz").textContent = this.value + " min"; });
  $("cal-out").addEventListener("change", function (ev) {
    var k = +ev.target.dataset.i, s = cal.sits[k]; if (!s) return;
    if (ev.target.type === "checkbox") { s.on = ev.target.checked; renderCal(); }
    else if (/^\d\d:\d\d/.test(ev.target.value)) tryMove(k, hm(ev.target.value));
  });
  // Clicking the calendar: another day's column selects that day; with a sitting picked, a click moves it there.
  $("cal-grid").addEventListener("click", function (ev) {
    if (ev.target.closest("[data-act]")) return;
    var col = ev.target.closest(".wk-col"); if (!col) return;
    if (col.dataset.date !== cal.sel) { cal.sel = col.dataset.date; renderCal(); return; }
    if (cal.pick < 0) return;
    var m = cal.h0 * 60 + (ev.clientY - col.getBoundingClientRect().top) / HH * 60;
    tryMove(cal.pick, m - cal.sits[cal.pick].dur / 2 > cal.h0 * 60 ? Math.floor(m / 15) * 15 : m);
  });

  // chart hover
  $("pr-chart").addEventListener("pointermove", function (ev) {
    var g = ev.target.closest && ev.target.closest(".day"), tip = $("pr-tip");
    if (!g) { tip.hidden = true; return; }
    var d = JSON.parse(this.dataset.days)[+g.dataset.i], box = this.getBoundingClientRect();
    tip.innerHTML = "<b>" + esc(shortDate(d.date, true)) + "</b>" + (d.scope ? "Done: " + (d.m ? mins(d.m) : "0 min") + "<br>Planned: " + (d.t ? mins(d.t) : "not recorded") +
      (d.r ? "<br>Revised: " + pgs(d.r) : "") + (d.n ? "<br>New: " + pgs(d.n) : "") : "Before you started");
    tip.hidden = false;
    var x = ev.clientX - box.left + 14; if (x + tip.offsetWidth > box.width) x = ev.clientX - box.left - tip.offsetWidth - 14;
    tip.style.left = Math.max(0, x) + "px"; tip.style.top = Math.max(0, ev.clientY - box.top - 20) + "px";
  });
  $("pr-chart").addEventListener("pointerleave", function () { $("pr-tip").hidden = true; });
  function tick() { if (document.visibilityState !== "hidden" && E.today() !== today) { ensureDay(); persist(); cal.loaded = false; cal.ev = {}; cal.allday = {}; cal.at = 0; renderAll(); } }

  /* ---------- boot ---------- */
  try { var raw = localStorage.getItem(KEY); if (raw) state = E.normalize(JSON.parse(raw)); } catch (e) { state = E.defaults(); }
  buildMap(); buildSettings(); ayahHints(); route();
  ensureDay(); renderAll();
  $("g-btn").addEventListener("click", function () {
    if (docRef) G.token(true).then(function () { showSignIn(false); flush(); }).catch(function (e) { setStatus(calError(e)); });
    else connect(true);
  });
  if (G.wasSignedIn()) connect(false); // try to reconnect quietly if you signed in before
  else setStatus("Saved on this device only. Sign in with Google to sync.");
  setInterval(tick, 60000);
  document.addEventListener("visibilitychange", tick);
})();