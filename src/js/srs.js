/* Flashki — srs.js : SM-2 spaced repetition algorithm (Anki-style, 4 ratings) */
(function () {
  'use strict';
  var App = window.App = window.App || {};
  var MIN = 60000, DAY = 86400000;

  function newState(now) {
    return { ease: 2.5, interval: 0, due: now || Date.now(), reps: 0, lapses: 0, status: 'new' };
  }

  /* rating: 'again' | 'hard' | 'good' | 'easy' — returns a NEW srs state */
  function apply(srs, rating, now) {
    now = now || Date.now();
    var s = {
      ease: (srs && srs.ease) || 2.5,
      interval: (srs && srs.interval) || 0,
      due: (srs && srs.due) || now,
      reps: ((srs && srs.reps) || 0) + 1,
      lapses: (srs && srs.lapses) || 0,
      status: (srs && srs.status) || 'new'
    };
    if (rating === 'again') {
      s.lapses++;
      s.ease = Math.max(1.3, s.ease - 0.20);
      s.interval = 0;
      s.due = now + 10 * MIN;
      s.status = 'learning';
    } else if (rating === 'hard') {
      s.ease = Math.max(1.3, s.ease - 0.15);
      s.interval = s.interval > 0 ? Math.max(1, Math.round(s.interval * 1.2)) : 1;
      s.due = now + s.interval * DAY;
      s.status = 'review';
    } else if (rating === 'good') {
      s.interval = s.interval > 0 ? Math.round(s.interval * s.ease) : 1;
      s.due = now + s.interval * DAY;
      s.status = 'review';
    } else { /* easy */
      s.ease = Math.min(3.2, s.ease + 0.15);
      s.interval = s.interval > 0 ? Math.max(2, Math.round(s.interval * s.ease * 1.25)) : 4;
      s.due = now + s.interval * DAY;
      s.status = 'review';
    }
    return s;
  }

  /* projected next intervals (in days; again = minutes) for the rate buttons */
  function preview(srs) {
    var now = Date.now();
    var p = {};
    ['again', 'hard', 'good', 'easy'].forEach(function (r) {
      var s = apply(srs, r, now);
      if (r === 'again') p[r] = { minutes: 10, days: 0 };
      else p[r] = { minutes: 0, days: s.interval };
    });
    return p;
  }

  App.srs = { newState: newState, apply: apply, preview: preview };
})();
