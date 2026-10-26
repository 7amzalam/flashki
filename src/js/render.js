/* Flashki — render.js : all view rendering + statistics computations */
(function () {
  'use strict';
  var App = window.App = window.App || {};
  var U = App.util;
  var DAY = 86400000;

  function deckById(id) {
    var list = App.state.decks;
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function cardsOf(deckId) {
    return deckId === 'all' ? App.state.cards : App.state.cards.filter(function (c) { return c.deckId === deckId; });
  }

  function dueCardsOf(deckId, now) {
    now = now || Date.now();
    return cardsOf(deckId).filter(function (c) { return c.srs && c.srs.status !== 'new' && c.srs.due <= now; });
  }

  function newCardsOf(deckId) {
    return cardsOf(deckId).filter(function (c) { return !c.srs || c.srs.status === 'new'; });
  }

  function deckLearnedPct(deckId) {
    var all = cardsOf(deckId);
    if (!all.length) return 0;
    var learned = all.filter(function (c) { return c.srs && c.srs.status === 'review' && c.srs.interval >= 21; }).length;
    return Math.round(learned / all.length * 100);
  }

  function accuracyFromReviews(reviews) {
    if (!reviews.length) return null;
    var good = reviews.filter(function (r) { return r.rating === 'good' || r.rating === 'easy'; }).length;
    return Math.round(good / reviews.length * 100);
  }

  function reviewsInDays(days) {
    var from = Date.now() - days * DAY;
    return App.state.reviews.filter(function (r) { return r.ts >= from; });
  }

  function streakDays() {
    var set = {};
    App.state.reviews.forEach(function (r) { set[U.todayKey(r.ts)] = 1; });
    var streak = 0;
    var cursor = U.todayKey();
    if (!set[cursor]) {
      cursor = U.todayKey(Date.now() - DAY);
      if (!set[cursor]) return 0;
    }
    while (set[cursor]) {
      streak++;
      cursor = U.todayKey(new Date(cursor + 'T12:00:00').getTime() - DAY);
    }
    return streak;
  }

  function longestStreak() {
    var days = [];
    var set = {};
    App.state.reviews.forEach(function (r) {
      var k = U.todayKey(r.ts);
      if (!set[k]) { set[k] = 1; days.push(k); }
    });
    days.sort();
    var best = 0, run = 0, prev = null;
    days.forEach(function (d) {
      run = (prev && U.dayDiff(prev, d) === 1) ? run + 1 : 1;
      if (run > best) best = run;
      prev = d;
    });
    return best;
  }

  function totalDueAvailable() {
    var now = Date.now();
    var due = dueCardsOf('all', now).length;
    var ni = App.state.newIntro || { count: 0 };
    var allowed = Math.max(0, (Number(App.state.settings.dailyNew) || 0) - (ni.count || 0));
    return { due: due, fresh: Math.min(newCardsOf('all').length, allowed) };
  }

  /* ---------- HOME ---------- */
  function renderHome() {
    var now = Date.now();
    var avail = totalDueAvailable();
    var dueTotal = avail.due + avail.fresh;
    var heroEl = U.getEl('dueHeroCount');
    if (heroEl) heroEl.textContent = U.fmtInt(dueTotal);
    /* ترحيب شخصي — {name} من الملف الشخصي، والنص من ملف لغة الواجهة */
    var welcomeEl = U.getEl('homeWelcome');
    if (welcomeEl) {
      var nm = ((App.state.profile || {}).name || '').trim();
      welcomeEl.textContent = nm ? App.tf('welcomeName', { name: nm }) : App.t('welcomeAnon');
    }
    var statEls = U.qsa('.view[data-view="home"] .stat .stat-value');
    var acc = accuracyFromReviews(reviewsInDays(30));
    var vals = [U.fmtInt(dueTotal), U.fmtInt(streakDays()), U.fmtInt(App.state.cards.length), (acc == null ? '—' : acc + '%')];
    statEls.forEach(function (el, i) { el.textContent = vals[i] || '0'; });
    var trend = U.qsa('.view[data-view="home"] .stat .stat-trend');
    trend.forEach(function (el) { el.style.display = 'none'; });

    var html = '';
    App.state.decks.forEach(function (d) {
      var total = cardsOf(d.id).length;
      var due = dueCardsOf(d.id, now).length;
      var pct = deckLearnedPct(d.id);
      var meta = '<span>' + U.fmtInt(total) + ' ' + App.t('cardUnit') + '</span><span>·</span>';
      meta += due > 0
        ? '<span class="deck-due">' + U.fmtInt(due) + ' ' + App.t('dueCount') + '</span>'
        : '<span style="color:#6ee7b7">' + App.t('complete') + '</span>';
      html += '<article class="deck-card" style="--accent:' + (d.color || '#8b5cf6') + '" data-deck="' + d.id + '" data-open-session>' +
        '<div class="deck-head"><div class="deck-ring">' + U.ringSvg(pct, d.color || '#8b5cf6') + '</div>' +
        '<button class="picker-edit-btn" data-action="edit-deck" data-id="' + d.id + '" title="' + App.t('editDeckTitle') + '"><svg viewBox="0 0 24 24"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg></button></div>' +
        '<div class="deck-title">' + (d.icon ? d.icon + ' ' : '') + U.esc(d.name) + '</div>' +
        '<div class="deck-meta">' + meta + '</div>' +
        '<div class="deck-progress"><div class="deck-progress-bar" style="width:' + pct + '%;background:' + (d.color || '#8b5cf6') + '"></div></div>' +
        '</article>';
    });
    /* حالة فارغة أنيقة — زر بارز لإنشاء أول قسم */
    if (!App.state.decks.length) {
      html = '<div class="empty-state"><div class="empty-icon">🗂️</div>' +
        '<div class="empty-title">' + App.t('noCardsYet') + '</div>' +
        '<div class="empty-sub">' + App.t('homeEmptySub') + '</div>' +
        '<button class="btn-primary" data-action="new-deck"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg><span>' + App.t('ctaFirstDeck') + '</span></button></div>';
    }
    U.getEl('homeDecks').innerHTML = html;
  }

  /* ---------- DECKS ---------- */
  function renderDecks() {
    var now = Date.now();
    var avail = totalDueAvailable();
    var ready = avail.due + avail.fresh;
    var decksWitDue = {};
    dueCardsOf('all', now).forEach(function (c) { decksWitDue[c.deckId] = 1; });
    var ni = App.state.newIntro || { count: 0 };
    var allowed = Math.max(0, (Number(App.state.settings.dailyNew) || 0) - (ni.count || 0));
    if (allowed > 0) newCardsOf('all').slice(0, allowed).forEach(function (c) { decksWitDue[c.deckId] = 1; });

    var readyEl = U.getEl('todayReady'), decksEl = U.getEl('todayDecks');
    if (readyEl) readyEl.textContent = U.fmtInt(ready);
    if (decksEl) decksEl.textContent = U.fmtInt(Object.keys(decksWitDue).length);

    var html = '';
    /* حالة فارغة: لا توجد أقسام بعد */
    if (!App.state.decks.length) {
      html += '<div class="empty-state"><div class="empty-icon">📭</div>' +
        '<div class="empty-title">' + App.t('noDecksYet') + '</div>' +
        '<div class="empty-sub">' + App.t('newDeckBtnSub') + '</div></div>';
    }
    App.state.decks.forEach(function (d) {
      var total = cardsOf(d.id).length;
      var due = dueCardsOf(d.id, now).length;
      var pct = deckLearnedPct(d.id);
      var acc = accuracyFromReviews(App.state.reviews.filter(function (r) { return r.deckId === d.id; }));
      var dueColor = due > 0 ? 'color:' + (d.color || '#a78bfa') : 'color:#6ee7b7';
      html += '<article class="picker-card" style="--accent:' + (d.color || '#8b5cf6') + '" data-deck="' + d.id + '" data-open-session>' +
        '<div class="picker-head"><div><div class="picker-title">' + (d.icon ? d.icon + ' ' : '') + U.esc(d.name) + '</div><div class="picker-sub">' + U.esc(d.desc || '') + '</div></div>' +
        '<div class="picker-head-actions"><button class="picker-edit-btn" data-action="edit-deck" data-id="' + d.id + '" title="' + App.t('editDeckTitle') + '"><svg viewBox="0 0 24 24"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg></button>' +
        '<div class="deck-ring" style="--accent:' + (d.color || '#8b5cf6') + '">' + U.ringSvg(pct, d.color || '#8b5cf6') + '</div></div></div>' +
        '<div class="picker-stats">' +
        '<div class="picker-stat"><div class="picker-stat-val">' + U.fmtInt(total) + '</div><div class="picker-stat-lbl">' + App.t('cardUnit') + '</div></div>' +
        '<div class="picker-stat"><div class="picker-stat-val" style="' + dueColor + '">' + U.fmtInt(due) + '</div><div class="picker-stat-lbl">' + App.t('dueCount') + '</div></div>' +
        '<div class="picker-stat"><div class="picker-stat-val">' + (acc == null ? '—' : acc + '%') + '</div><div class="picker-stat-lbl">' + App.t('accuracy') + '</div></div>' +
        '</div></article>';
    });
    html += '<button class="picker-card picker-new" data-action="new-deck"><div class="picker-new-icon"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></div><div>' + App.t('newDeck') + '</div><div style="font-size:11.5px;color:var(--text-3);font-weight:400">' + App.t('newDeckBtnSub') + '</div></button>';
    U.getEl('deckPicker').innerHTML = html;
  }

  /* ---------- BROWSE ---------- */
  function cefrBadge(level) {
    if (!level) return '';
    return '<span class="cefr-badge cefr-' + level + '">' + level + '</span>';
  }

  function browseItemHtml(c) {
    var d = deckById(c.deckId);
    var hasAudio = !!(c.audioFront || c.audioBack);
    return '<div class="browse-item">' +
      (c.imagePath ? '<img class="browse-thumb" data-img-path="' + U.esc(c.imagePath) + '" alt="" />' : '') +
      '<button class="browse-tts" data-tts="' + U.esc(c.front) + '" data-tts-side="front"><svg viewBox="0 0 24 24"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14"/></svg></button>' +
      '<div class="browse-q" data-action="edit-card" data-id="' + c.id + '"><div class="browse-q-front">' + U.esc(c.front) + '</div><div class="browse-q-back">' + U.esc(c.back) + '</div></div>' +
      (hasAudio ? '<span class="browse-audio-badge"><svg viewBox="0 0 24 24"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8"/></svg> ' + App.t('yourRec') + '</span>' : '') +
      cefrBadge(c.cefr) +
      (d ? '<span class="browse-tag" style="border-color:' + (d.color || 'var(--border)') + '55">' + U.esc(d.name) + '</span>' : '') +
      '<div class="browse-actions"><button title="' + App.t('edit') + '" data-action="edit-card" data-id="' + c.id + '"><svg viewBox="0 0 24 24"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg></button>' +
      '<button class="del" title="' + App.t('delete') + '" data-action="del-card" data-id="' + c.id + '"><svg viewBox="0 0 24 24"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button></div></div>';
  }

  function chipHtml(label, value, active, scope) {
    return '<button class="filter-chip' + (active ? ' active' : '') + '" data-action="filter-' + scope + '" data-val="' + value + '">' + U.esc(label) + '</button>';
  }

  function renderBrowse() {
    var trashBtn = U.getEl('trashToggle');
    if (App.state.showTrash) {
      if (trashBtn) trashBtn.textContent = App.t('backToBrowse');
      renderTrash();
      return;
    }
    if (trashBtn) trashBtn.textContent = App.t('trash');
    var f = App.state.browseFilter;
    var renameBtn = U.getEl('renameDeckBtn');
    if (renameBtn) renameBtn.style.display = (f && f !== 'all' && !App.state.showTrash) ? '' : 'none';
    var chips = chipHtml(App.t('allDecksShort'), 'all', f === 'all', 'browse');
    App.state.decks.forEach(function (d) { chips += chipHtml(d.name, d.id, f === d.id, 'browse'); });
    U.getEl('browseFilters').innerHTML = chips;

    var list = (f === 'all') ? App.state.cards : App.state.cards.filter(function (c) { return c.deckId === f; });
    var html = list.map(browseItemHtml).join('');
    if (!list.length) html = '<div class="empty-state"><div class="empty-icon">🗂️</div><div class="empty-title">' + App.t('noCardsYet') + '</div><div class="empty-sub">' + App.t('homeEmptySub') + '</div><button class="btn-primary" data-action="new-deck"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg><span>' + App.t('ctaFirstDeck') + '</span></button></div>';
    U.getEl('browseList').innerHTML = html;
    loadBrowseThumbs();
  }

  /* مصغّرات الصور (40×40) في التصفح — تحميل غير معطّل للعرض */
  function loadBrowseThumbs() {
    var host = U.getEl('browseList');
    if (!host) return;
    var imgs = host.querySelectorAll('img[data-img-path]');
    Array.prototype.forEach.call(imgs, function (img) {
      var p = img.getAttribute('data-img-path');
      if (p.indexOf('data:') === 0) { img.src = p; return; }
      App.handlers.imagePathToSrc(p).then(function (src) { if (src) img.src = src; });
    });
  }

  /* ---------- TRASH (السلة) ---------- */
  function renderTrash() {
    var decks = App.state.trashDecks || [], cards = App.state.trashCards || [];
    U.getEl('browseFilters').innerHTML = '';
    var html = '<div class="trash-note">' + App.t('trashView') + '</div>';
    if (!decks.length && !cards.length) html += '<div class="empty-note">' + App.t('trashEmpty') + '</div>';
    decks.forEach(function (d) {
      html += '<div class="browse-item trash-item"><div class="browse-q"><div class="browse-q-front">📁 ' + U.esc(d.name) + '</div><div class="browse-q-back">' + U.esc(d.desc || '') + '</div></div>' +
        '<div class="browse-actions"><button class="ok" data-action="restore-deck" data-id="' + d.id + '">↩ ' + App.t('restore') + '</button>' +
        '<button class="del" data-action="purge-deck" data-id="' + d.id + '">' + App.t('deleteForever') + '</button></div></div>';
    });
    cards.forEach(function (c) {
      var d = deckById(c.deckId);
      html += '<div class="browse-item trash-item"><div class="browse-q"><div class="browse-q-front">' + U.esc(c.front) + '</div><div class="browse-q-back">' + U.esc(c.back) + '</div></div>' +
        (d ? '<span class="browse-tag" style="border-color:' + (d.color || 'var(--border)') + '55">' + U.esc(d.name) + '</span>' : '') +
        '<div class="browse-actions"><button class="ok" data-action="restore-card" data-id="' + c.id + '">↩ ' + App.t('restore') + '</button>' +
        '<button class="del" data-action="purge-card" data-id="' + c.id + '">' + App.t('deleteForever') + '</button></div></div>';
    });
    U.getEl('browseList').innerHTML = html;
  }

  /* ---------- SEARCH ---------- */
  function highlight(text, q) {
    var safe = U.esc(text);
    if (!q) return safe;
    try {
      var re = new RegExp('(' + U.escRe(U.esc(q)) + ')', 'gi');
      return safe.replace(re, '<mark>$1</mark>');
    } catch (e) { return safe; }
  }

  function renderSearch() {
    var q = (App.state.searchQuery || '').trim();
    var f = App.state.searchFilter;
    var chips = chipHtml(App.t('allDecksShort'), 'all', f === 'all', 'search');
    App.state.decks.forEach(function (d) { chips += chipHtml(d.name, d.id, f === d.id, 'search'); });
    U.getEl('searchFilters').innerHTML = chips;

    var pool = (f === 'all') ? App.state.cards : App.state.cards.filter(function (c) { return c.deckId === f; });
    var results = pool;
    if (q) {
      var ql = q.toLowerCase();
      results = pool.filter(function (c) {
        return (c.front || '').toLowerCase().indexOf(ql) >= 0 ||
          (c.back || '').toLowerCase().indexOf(ql) >= 0 ||
          (c.tags || []).join(' ').toLowerCase().indexOf(ql) >= 0;
      });
    }
    var countEl = U.getEl('searchCount');
    if (countEl) countEl.textContent = U.fmtInt(results.length);
    var html = results.map(function (c) {
      var d = deckById(c.deckId);
      return '<div class="browse-item">' +
        '<button class="browse-tts" data-tts="' + U.esc(c.front) + '" data-tts-side="front"><svg viewBox="0 0 24 24"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14"/></svg></button>' +
        '<div class="browse-q" data-action="edit-card" data-id="' + c.id + '"><div class="browse-q-front">' + highlight(c.front, q) + '</div><div class="browse-q-back">' + highlight(c.back, q) + '</div></div>' +
        cefrBadge(c.cefr) +
        (d ? '<span class="browse-tag">' + U.esc(d.name) + '</span>' : '') + '</div>';
    }).join('');
    if (!results.length) {
      html = '<div class="empty-state"><div class="empty-icon">🔍</div><div class="empty-title">' +
        (q ? App.t('noResults') : App.t('noCardsYet')) + '</div>' +
        (q ? '' : '<div class="empty-sub">' + App.t('homeEmptySub') + '</div>') + '</div>';
    }
    U.getEl('searchList').innerHTML = html;
  }

  /* ---------- STATS ---------- */
  function renderStats() {
    /* لا مراجعات بعد → حالة فارغة نظيفة بدل أصفار متناثرة */
    if (!App.state.reviews.length) {
      U.getEl('statsOverview').innerHTML = '<div class="empty-state"><div class="empty-icon">📊</div>' +
        '<div class="empty-title">' + App.t('statsEmpty') + '</div>' +
        '<div class="empty-sub">' + App.t('newDeckBtnSub') + '</div></div>';
      U.getEl('barChart').innerHTML = '';
      U.getEl('deckStatsList').innerHTML = '<div class="empty-note">' + App.t('noCardsYet') + '</div>';
      U.getEl('heatmap').innerHTML = '';
      return;
    }
    var r30 = reviewsInDays(30);
    var acc = accuracyFromReviews(r30);
    var ms30 = r30.reduce(function (s, r) { return s + (r.durationMs || 0); }, 0);
    var h = Math.floor(ms30 / 3600000), m = Math.round((ms30 % 3600000) / 60000);
    var timeStr = h > 0 ? h + ' ' + App.t('hoursShort') + ' ' + m + App.t('minutesShort') : m + ' ' + App.t('minutesShort');
    var cards = [
      [App.t('statReviewed'), U.fmtInt(r30.length), '', ''],
      [App.t('statAccuracy'), acc == null ? '—' : acc + '%', 'color:#6ee7b7', ''],
      [App.t('statLongest'), U.fmtInt(longestStreak()) + ' ' + App.t('days'), 'color:#fbbf24', App.t('currentPrefix') + streakDays() + ' ' + App.t('days')],
      [App.t('statTime'), timeStr, '', App.t('last30')]
    ];
    U.getEl('statsOverview').innerHTML = cards.map(function (c) {
      return '<div class="stats-overview-card"><div class="lbl">' + c[0] + '</div><div class="val" style="' + c[2] + '">' + c[1] + '</div><div class="sub">' + c[3] + '</div></div>';
    }).join('');

    renderBarChart();
    renderDeckStats();
    renderHeatmap();
  }

  function renderBarChart() {
    var range = App.state.chartRange || 30;
    var from = Date.now() - range * DAY;
    var counts = {};
    App.state.reviews.forEach(function (r) { if (r.ts >= from) { var k = U.todayKey(r.ts); counts[k] = (counts[k] || 0) + 1; } });
    var days = [];
    for (var i = range - 1; i >= 0; i--) days.push(U.todayKey(Date.now() - i * DAY));
    var max = 1;
    days.forEach(function (d) { if (counts[d] > max) max = counts[d]; });
    var html = '';
    days.forEach(function (d, idx) {
      var v = counts[d] || 0;
      var h = Math.max(4, Math.round(v / max * 100));
      var cls = 'bar' + (idx === days.length - 1 ? ' today' : '') + (v === 0 ? ' dim' : '');
      html += '<div class="' + cls + '" style="height:' + h + '%"><span class="bar-tooltip">' + U.fmtInt(v) + '</span></div>';
    });
    var chart = U.getEl('barChart');
    chart.innerHTML = html;
    chart.dataset.range = range;
  }

  function renderDeckStats() {
    var html = '';
    App.state.decks.forEach(function (d) {
      var pct = deckLearnedPct(d.id);
      html += '<div class="deck-stat-row"><div class="deck-stat-color" style="background:' + (d.color || '#8b5cf6') + '"></div>' +
        '<div class="deck-stat-info"><div class="deck-stat-name">' + U.esc(d.name) + '</div>' +
        '<div class="deck-stat-bar"><div class="deck-stat-bar-fill" style="width:' + pct + '%;background:' + (d.color || '#8b5cf6') + '"></div></div></div>' +
        '<div class="deck-stat-nums"><b>' + pct + '%</b></div></div>';
    });
    if (!App.state.decks.length) html = '<div class="empty-note">' + App.t('noCardsYet') + '</div>';
    U.getEl('deckStatsList').innerHTML = html;
  }
  function renderHeatmap() {
    var counts = {};
    App.state.reviews.forEach(function (r) { var k = U.todayKey(r.ts); counts[k] = (counts[k] || 0) + 1; });
    var days = [];
    for (var i = 90; i >= 0; i--) days.push(U.todayKey(Date.now() - i * DAY));
    var html = '';
    for (var w = 0; w < 13; w++) {
      html += '<div class="heat-week">';
      for (var d2 = 0; d2 < 7; d2++) {
        var idx = w * 7 + d2;
        var day = days[idx];
        if (!day) { html += '<div class="heat-cell" style="opacity:0"></div>'; continue; }
        var v = counts[day] || 0;
        var lvl = v === 0 ? '' : (v <= 4 ? '1' : (v <= 9 ? '2' : (v <= 19 ? '3' : '4')));
        html += '<div class="heat-cell"' + (lvl ? ' data-level="' + lvl + '"' : '') + ' title="' + day + ' · ' + v + '"></div>';
      }
      html += '</div>';
    }
    U.getEl('heatmap').innerHTML = html;
  }

  /* ---------- STUDY CARD ---------- */
  function intervalLabel(days, minutes) {
    if (minutes) return minutes + ' ' + App.t('minutesShort');
    if (days === 1) return '1 ' + App.t('day');
    if (days < 30) return days + ' ' + App.t('days');
    if (days < 365) return Math.round(days / 30) + ' ' + App.t('month');
    return Math.round(days / 365) + ' ' + App.t('year');
  }

  function renderStudyCard() {
    var s = App.state.session;
    if (!s || !s.queue.length) return;
    var card = s.queue[s.idx];
    var front = s.dir === 'reverse' ? card.back : card.front;
    var back = s.dir === 'reverse' ? card.front : card.back;
    var q = U.getEl('flashQuestion');
    if (s.dir === 'reverse') {
      q.innerHTML = U.esc(front);
    } else if (front.length <= 60) {
      var pre = App.t('qWrapPre'), post = App.t('qWrapPost');
      q.innerHTML = pre + '<br><b>' + U.esc(front) + '</b>' + (post ? ' ' + post : '');
    } else {
      q.innerHTML = U.esc(front);
    }
    U.getEl('flashAnswer').textContent = back;
    var deck = deckById(card.deckId);
    U.getEl('studyDeckName').textContent = deck ? deck.name : (s.deckLabel || '');
    var cefrEl = U.getEl('studyCefr');
    if (cefrEl) {
      if (card.cefr) { cefrEl.textContent = card.cefr; cefrEl.style.display = ''; cefrEl.className = 'cefr-badge cefr-' + card.cefr; }
      else cefrEl.style.display = 'none';
    }
    U.getEl('studyCurrent').textContent = U.fmtInt(s.idx + 1);
    U.getEl('studyTotal').textContent = U.fmtInt(s.queue.length);
    U.getEl('studyProgress').style.width = (s.idx / s.queue.length * 100) + '%';

    var audio = U.getEl('audioBadge');
    var hasAudio = !!(card.audioFront || card.audioBack);
    audio.style.display = hasAudio ? '' : 'none';

    /* صورة البطاقة (v20): أعلى الوجه الأمامي — عرض 60%، object-fit: contain */
    var imgEl = U.getEl('flashImage');
    if (imgEl) {
      if (card.imagePath && s.dir !== 'reverse') {
        var wantPath = card.imagePath;
        imgEl.setAttribute('data-cur-path', wantPath);
        imgEl.style.display = 'none'; /* يظهر عند جاهزية src */
        App.handlers.imagePathToSrc(wantPath).then(function (src) {
          if (src && imgEl.getAttribute('data-cur-path') === wantPath) {
            imgEl.src = src;
            imgEl.style.display = 'block'; /* CSS الافتراضي none — الإظهار صريح */
          }
        });
      } else {
        imgEl.style.display = 'none';
        imgEl.src = '';
        imgEl.setAttribute('data-cur-path', '');
      }
    }
    var exEl = U.getEl('flashExample');
    if (card.example) {
      exEl.innerHTML = '<span class="flash-example-lbl">' + App.t('exampleWord') + '</span>' +
        U.esc(card.example) + (card.exampleTranslation ? '<div class="flash-example-tr">' + U.esc(card.exampleTranslation) + '</div>' : '');
      exEl.style.display = '';
    } else exEl.style.display = 'none';

    /* نصيحة البطاقات المولّدة بالذكاء الاصطناعي: نوع الكلمة + المستوى + تلميح حفظ */
    var tipEl = U.getEl('flashTip');
    if (tipEl) {
      if (card.generatedFrom) {
        var chips = '';
        (card.tags || []).forEach(function (tg) {
          if (tg) chips += '<span class="tip-chip">' + U.esc(tg) + '</span>';
        });
        if (card.cefr) chips += '<span class="tip-chip lv">' + U.esc(card.cefr) + '</span>';
        chips += '<span class="tip-chip ai">✨ ' + App.t('aiMade') + '</span>';
        tipEl.innerHTML = '<div class="tip-chips">' + chips + '</div><div class="tip-text">💡 ' + U.esc(App.t('cardTip')) + '</div>';
        tipEl.style.display = '';
      } else tipEl.style.display = 'none';
    }

    var prev = App.srs.preview(card.srs || App.srs.newState(Date.now()));
    U.getEl('intAgain').textContent = intervalLabel(0, 10);
    U.getEl('intHard').textContent = intervalLabel(prev.hard.days, 0);
    U.getEl('intGood').textContent = intervalLabel(prev.good.days, 0);
    U.getEl('intEasy').textContent = intervalLabel(prev.easy.days, 0);

    var f = U.getEl('flashCard');
    f.classList.remove('flipped');
    U.getEl('rateRow').classList.remove('show');
    U.getEl('showAnswer').style.display = '';
    s.cardShownAt = Date.now();
  }

  function renderSessionEnd(stats) {
    U.getEl('endCards').textContent = U.fmtInt(stats.count);
    U.getEl('endAccuracy').textContent = stats.accuracy + '%';
    U.getEl('endTime').textContent = U.fmtTime(stats.ms);
  }

  /* ---------- FORMS / SELECTS ---------- */
  function deckOptions(selectedId, includeAll) {
    var html = includeAll ? '<option value="all">' + App.t('allDecks') + '</option>' : '';
    App.state.decks.forEach(function (d) {
      html += '<option value="' + d.id + '"' + (selectedId === d.id ? ' selected' : '') + '>' + U.esc(d.name) + '</option>';
    });
    return html;
  }

  function renderDeckSelects() {
    var first = App.state.decks.length ? App.state.decks[0].id : '';
    U.getEl('deckSelect').innerHTML = deckOptions(first, false);
    /* في نافذة حفظ بطاقات AI: الخيار الأول دائماً "قسم جديد بالعنوان المقترح" */
    U.getEl('aiDeckSelect').innerHTML = '<option value="__new__">' + App.t('newDeckOpt') + '</option>' + deckOptions(first, false);
    /* لغة البطاقة (خيارات متقدمة) — الافتراضي تلقائي */
    var cl = U.getEl('cardLangSelect');
    if (cl) {
      var html = '<option value="auto">' + App.t('cardLangAuto') + '</option>';
      Object.keys(U.LANGS).forEach(function (code) {
        var L = U.LANGS[code];
        html += '<option value="' + code + '">' + L.flag + ' ' + U.langName(code, App.state.lang) + '</option>';
      });
      var cur = cl.value || 'auto';
      cl.innerHTML = html;
      cl.value = cur;
    }
  }

  function renderColorRow(selected, containerId) {
    var html = '';
    App.store.DECK_COLORS.forEach(function (c) {
      html += '<button type="button" class="color-swatch' + (c === selected ? ' selected' : '') + '" data-color="' + c + '" style="background:' + c + '"></button>';
    });
    U.getEl(containerId || 'colorRow').innerHTML = html;
  }

  function renderEmojiRow(selected, containerId) {
    var html = '';
    App.store.DECK_EMOJIS.forEach(function (e) {
      html += '<button type="button" class="emoji-opt' + (e === selected ? ' selected' : '') + '" data-emoji="' + e + '">' + e + '</button>';
    });
    U.getEl(containerId || 'emojiRow').innerHTML = html;
  }

  /* ── تسمية حقول الإضافة بلغتي الملف: السؤال (target) / الإجابة (native) ── */
  function updateLangLabels() {
    var p = App.state.profile || { targetLang: 'en', nativeLang: 'ar' };
    var ui = App.state.lang;
    var f = U.getEl('frontLabel');
    var b = U.getEl('backLabel');
    if (f) f.textContent = App.tf('lblFrontLang', { lang: U.langName(p.targetLang, ui) });
    if (b) b.textContent = App.tf('lblBackLang', { lang: U.langName(p.nativeLang, ui) });
  }

  function renderSettings() {
    var s = App.state.settings;
    var p = App.state.profile || {};
    var keyInput = U.getEl('apiKeyInput');
    keyInput.value = s.apiKey || '';
    /* placeholder ديناميكي: مفتاح موجود أو "لم يتم تكوين مفتاح" */
    keyInput.placeholder = s.apiKey ? 'AIza...' : App.t('keyPhEmpty');
    var connected = !!s.apiKey && s.keyStatus !== 'invalid';
    U.getEl('aiStatus').style.display = connected ? '' : 'none';
    var offBadge = U.getEl('aiStatusOff');
    offBadge.style.display = connected ? 'none' : '';
    U.getEl('aiStatusText').textContent = App.t('aiConnected');
    var badge = U.getEl('aiBadge');
    badge.style.background = connected ? '' : 'rgba(239,68,68,0.14)';
    badge.style.borderColor = connected ? '' : 'rgba(239,68,68,0.3)';
    U.getEl('aiBadgeText').textContent = connected ? App.t('aiConnected') : App.t('aiBadgeOff');
    /* تلميح دائم تحت المفتاح — يوضح حالة الحفظ/التحقق (لا يختفي كالتوست) */
    var hint = U.getEl('keyHint');
    if (hint) {
      if (!s.apiKey) {
        hint.style.display = 'none';
      } else {
        var map = { checking: 'keyHintChecking', ok: 'keyHintOk', busy: 'keyHintBusy', geo: 'keyHintGeo', invalid: 'keyHintInvalid' };
        var hk = map[s.keyStatus] || 'keyHintSaved';
        var hcls = s.keyStatus === 'invalid' ? 'err' : ((s.keyStatus === 'busy' || s.keyStatus === 'geo') ? 'warn' : 'ok');
        hint.className = 'key-hint ' + hcls;
        hint.style.display = '';
        hint.textContent = App.t(hk);
      }
    }
    /* قائمة نماذج Gemini — الافتراضي أولاً + البدائل (تجاهل النماذج المتوقفة) */
    var ms = U.getEl('modelSelect');
    if (ms) {
      var models = App.ai.modelList();
      var mopts = '';
      models.forEach(function (m) { mopts += '<option value="' + m + '"' + (m === s.model ? ' selected' : '') + '>' + m + '</option>'; });
      if (s.model && models.indexOf(s.model) < 0 && !(App.ai.isDeadModel && App.ai.isDeadModel(s.model))) mopts += '<option value="' + s.model + '" selected>' + s.model + '</option>';
      ms.innerHTML = mopts;
    }
    updateKeyButtons();
    U.getEl('themeToggle').classList.toggle('on', s.theme === 'light');
    U.getEl('autoTtsToggle').classList.toggle('on', !!s.autoTts);
    U.getEl('animationsToggle').classList.toggle('on', !!s.animations);
    U.getEl('autoTwoSidedToggle').classList.toggle('on', !!s.autoTwoSided);
    U.getEl('dailyNewInput').value = s.dailyNew;
    /* حجم الخط: stepper — القيمة الحالية px */
    var fsz = parseInt(s.fontSize, 10);
    if (!fsz || fsz < 14 || fsz > 24) fsz = 16;
    var fsv = U.getEl('fontSizeVal');
    if (fsv) fsv.textContent = fsz + 'px';
    /* فحص التحديثات: في المتصفح معطّل + tooltip؛ في Tauri مفعّل */
    var ub = U.getEl('checkUpdateBtn');
    if (ub) {
      var isBrowserMode = !(window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke);
      ub.disabled = isBrowserMode;
      ub.title = isBrowserMode ? App.t('updateBrowserHint') : '';
      ub.style.opacity = isBrowserMode ? '0.5' : '';
    }
    var us = U.getEl('updateStatus');
    if (us) us.textContent = App.t('updateSub');
    /* اللغات والمستوى */
    fillLangSelect(U.getEl('nativeLangSelect'), p.nativeLang || 'ar');
    fillLangSelect(U.getEl('targetLangSelect'), p.targetLang || 'en');
    fillUiLangSelect(U.getEl('langSelect'), s.lang || 'ar');
    U.getEl('cefrSelect').value = p.cefrLevel || 'B1';
    /* أصوات TTS لكل لغة */
    fillVoiceSelect(U.getEl('voiceTargetSelect'), p.targetLang || 'en', s['tts_voice_' + (p.targetLang || 'en')]);
    fillVoiceSelect(U.getEl('voiceNativeSelect'), p.nativeLang || 'ar', s['tts_voice_' + (p.nativeLang || 'ar')]);
    /* الملف الشخصي في الشريط الجانبي — الاسم الحقيقي، لا "أحمد" الثابتة */
    var pn = U.qs('.profile-name');
    if (pn) pn.textContent = (p.name || '').trim() || App.t('profileGuest');
    var av = U.qs('.profile .avatar');
    if (av) {
      var letter = ((p.name || '').trim() || '?').charAt(0).toUpperCase();
      av.textContent = letter;
    }
    /* زر الترجمة */
    var tt = U.getEl('translateToggle');
    if (tt) tt.classList.toggle('on', s.translationAutoEnabled !== false);
    updateTranslateBtnVisibility();
    updateLangLabels();
  }

  /* زر حذف المفتاح: معطّل عندما لا يوجد مفتاح محفوظ والحقل فارغ */
  function updateKeyButtons() {
    var delBtn = U.getEl('deleteKeyBtn');
    if (!delBtn) return;
    var hasStored = !!(App.state.settings.apiKey);
    var hasTyped = !!U.getEl('apiKeyInput').value.trim();
    delBtn.disabled = !(hasStored || hasTyped);
  }

  /* قائمة لغة الواجهة — الثماني كاملة بأسمائها الأصلية */
  function fillUiLangSelect(sel, val) {
    if (!sel) return;
    var html = '';
    App.util.UI_LANGS.forEach(function (L) {
      html += '<option value="' + L.code + '">' + L.native + '</option>';
    });
    sel.innerHTML = html;
    sel.value = val;
  }

  function fillLangSelect(sel, val) {
    if (!sel) return;
    var html = '';
    Object.keys(U.LANGS).forEach(function (code) {
      var L = U.LANGS[code];
      html += '<option value="' + code + '">' + L.flag + ' ' + U.langName(code, App.state.lang) + '</option>';
    });
    sel.innerHTML = html;
    sel.value = val;
  }

  function fillVoiceSelect(sel, langCode, current) {
    if (!sel) return;
    var list = App.tts.EDGE_VOICES[langCode] || App.tts.EDGE_VOICES.en;
    var html = '';
    list.forEach(function (v) {
      html += '<option value="' + v + '">' + v.replace('Neural', '') + '</option>';
    });
    sel.innerHTML = html;
    sel.value = (list.indexOf(current) >= 0) ? current : list[0];
  }

  function updateTranslateBtnVisibility() {
    var btn = U.getEl('translateBtn');
    if (btn) btn.style.display = (App.state.settings.translationAutoEnabled === false) ? 'none' : '';
  }

  function renderAll() {
    renderHome();
    renderDecks();
    renderBrowse();
    renderSearch();
    if (U.qs('.view[data-view="stats"]').classList.contains('active')) renderStats();
    renderDeckSelects();
    renderSettings();
    /* sidebar + bottom-nav badges */
    var avail = totalDueAvailable();
    var due = avail.due + avail.fresh;
    U.qsa('.nav-badge').forEach(function (b) { b.textContent = U.fmtInt(due); b.style.display = due > 0 ? '' : 'none'; });
    var st = U.qs('.streak-num');
    var sd = streakDays();
    if (st) st.textContent = U.fmtInt(sd) + ' ' + (sd === 1 ? App.t('day') : App.t('days'));
  }

  App.render = {
    renderAll: renderAll, renderHome: renderHome, renderDecks: renderDecks, renderBrowse: renderBrowse,
    renderSearch: renderSearch, renderStats: renderStats, renderBarChart: renderBarChart,
    renderStudyCard: renderStudyCard, renderSessionEnd: renderSessionEnd, renderDeckSelects: renderDeckSelects,
    renderColorRow: renderColorRow, renderEmojiRow: renderEmojiRow, renderSettings: renderSettings,
    updateLangLabels: updateLangLabels, updateTranslateBtnVisibility: updateTranslateBtnVisibility, fillVoiceSelect: fillVoiceSelect,
    updateKeyButtons: updateKeyButtons, fillUiLangSelect: fillUiLangSelect,
    deckById: deckById, cardsOf: cardsOf, dueCardsOf: dueCardsOf, newCardsOf: newCardsOf,
    streakDays: streakDays, totalDueAvailable: totalDueAvailable, intervalLabel: intervalLabel
  };
})();
