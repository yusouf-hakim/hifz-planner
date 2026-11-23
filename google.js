/* Google sign-in, Google Calendar and Google Drive saving. No page drawing here; app.js uses window.HifzGoogle. */
(function () {
  "use strict";
  var CLIENT_ID = "1018859683183-kkpkg4i9u03ddum3ds0cvvo674nd6qh4.apps.googleusercontent.com";
  var SCOPES = "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/drive.appdata";
  var FILE = "hifz-state.json", HINT = "hifz-google-signed-in";
  var tok = null, exp = 0, pending = null, lastSilentFail = 0, fileId = null;

  function have() { return tok && Date.now() < exp - 60000; }
  function ready() { return !!(window.google && google.accounts && google.accounts.oauth2); }
  function wasSignedIn() { try { return localStorage.getItem(HINT) === "1"; } catch (e) { return false; } }

  // Get a valid access token. interactive = true may open Google's sign-in popup, so only call it from a click.
  function token(interactive) {
    if (have()) return Promise.resolve(tok);
    if (pending) return pending;
    if (!interactive && Date.now() - lastSilentFail < 60000) return Promise.reject({ code: "needs_reauth" });
    pending = new Promise(function (res, rej) {
      if (!ready()) return rej({ code: "google_unavailable" });
      function fail(code) { if (!interactive) lastSilentFail = Date.now(); rej({ code: code }); }
      var client = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID, scope: SCOPES,
        callback: function (r) {
          if (r.error) return fail(r.error);
          tok = r.access_token; exp = Date.now() + (+r.expires_in || 3600) * 1000;
          try { localStorage.setItem(HINT, "1"); } catch (e) { /* ignore */ }
          res(tok);
        },
        error_callback: function (e) { fail(e && e.type ? e.type : "popup_failed"); }
      });
      client.requestAccessToken({ prompt: interactive ? "" : "none" });
    });
    var clear = function () { pending = null; };
    pending.then(clear, clear);
    return pending;
  }

  // One call to a Google API with the token attached. Errors carry a short code that app.js turns into plain words.
  function api(url, opts) {
    return token(false).then(function (t) {
      opts = opts || {};
      opts.headers = Object.assign({ Authorization: "Bearer " + t }, opts.headers || {});
      return fetch(url, opts).catch(function () { throw { code: "server_unavailable" }; });
    }).then(function (r) {
      if (r.ok) return r;
      if (r.status === 401) { tok = null; throw { code: "needs_reauth" }; }
      return r.text().then(function (txt) {
        var msg = ""; try { msg = JSON.parse(txt).error.message || ""; } catch (e) { /* ignore */ }
        throw { code: r.status === 429 || r.status >= 500 ? "server_unavailable" : "http_" + r.status, message: msg, status: r.status };
      });
    });
  }

  /* ----- Calendar ----- */
  // The calendars you have switched on in Google Calendar (yours plus any shared with you), minus birthdays.
  function listCalendars() {
    return api("https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=freeBusyReader&maxResults=250")
      .then(function (r) { return r.json(); }).then(function (j) {
        return (j.items || []).filter(function (c) {
          return (c.selected || c.primary) && !/#contacts@group\.v\.calendar\.google\.com$/.test(c.id);
        }).map(function (c) { return { id: c.id, name: c.summaryOverride || c.summary || c.id }; });
      });
  }
  // Where new sittings go: a calendar someone shared with you that you can edit (such as a school calendar), else your own main one.
  // Calendars you own are not chosen here, only ones shared with edit access, so an extra personal calendar is never picked by accident.
  function writeCalendar() {
    return api("https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=writer&maxResults=250")
      .then(function (r) { return r.json(); }).then(function (j) {
        var shared = (j.items || []).filter(function (c) { return c.accessRole === "writer" && !c.primary && !/@group\.v\.calendar\.google\.com$/.test(c.id); });
        return shared.length ? { id: shared[0].id, name: shared[0].summaryOverride || shared[0].summary || shared[0].id } : { id: "primary", name: "your calendar" };
      });
  }
  function listEvents(calendarId, fromLocal, toLocal, pageToken) {
    var u = "https://www.googleapis.com/calendar/v3/calendars/" + encodeURIComponent(calendarId) + "/events?singleEvents=true&orderBy=startTime&maxResults=250" +
      "&timeMin=" + encodeURIComponent(new Date(fromLocal).toISOString()) + "&timeMax=" + encodeURIComponent(new Date(toLocal).toISOString()) +
      (pageToken ? "&pageToken=" + encodeURIComponent(pageToken) : "");
    return api(u).then(function (r) { return r.json(); });
  }
  function createEvent(calendarId, ev) {
    var tz = ""; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { tz = ""; }
    var body = {
      summary: ev.summary, description: ev.description,
      start: { dateTime: ev.start }, end: { dateTime: ev.end }
    };
    if (tz) { body.start.timeZone = tz; body.end.timeZone = tz; }
    if (ev.colorId) body.colorId = String(ev.colorId);
    return api("https://www.googleapis.com/calendar/v3/calendars/" + encodeURIComponent(calendarId) + "/events", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
    }).then(function (r) { return r.json(); });
  }

  /* ----- Drive: one JSON file in the app's hidden folder (appDataFolder) ----- */
  function driveGet() {
    return api("https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&fields=files(id)&q=" + encodeURIComponent("name='" + FILE + "'"))
      .then(function (r) { return r.json(); }).then(function (j) {
        var f = j.files && j.files[0];
        if (!f) { fileId = null; return { exists: false, data: function () { return null; } }; }
        fileId = f.id;
        return api("https://www.googleapis.com/drive/v3/files/" + f.id + "?alt=media").then(function (r) { return r.json(); })
          .then(function (d) { return { exists: true, data: function () { return d; } }; });
      });
  }
  function driveCreate(obj) {
    var b = "hifzb" + Date.now();
    var body = "--" + b + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify({ name: FILE, parents: ["appDataFolder"] }) +
      "\r\n--" + b + "\r\nContent-Type: application/json\r\n\r\n" + JSON.stringify(obj) + "\r\n--" + b + "--";
    return api("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id", {
      method: "POST", headers: { "Content-Type": "multipart/related; boundary=" + b }, body: body
    }).then(function (r) { return r.json(); }).then(function (j) { fileId = j.id; });
  }
  function driveSet(obj) {
    if (!fileId) return driveCreate(obj);
    return api("https://www.googleapis.com/upload/drive/v3/files/" + fileId + "?uploadType=media", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(obj)
    }).then(function () {}, function (e) {
      if (e && e.status === 404) { fileId = null; return driveCreate(obj); }
      throw e;
    });
  }

  window.HifzGoogle = { token: token, wasSignedIn: wasSignedIn, listCalendars: listCalendars, writeCalendar: writeCalendar, listEvents: listEvents, createEvent: createEvent, driveGet: driveGet, driveSet: driveSet };
})();
