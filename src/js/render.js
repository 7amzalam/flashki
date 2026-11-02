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
      var fresh = newCardsOf(d.id).length;
      var ready = due + fresh;
      var pct = deckLearnedPct(d.id);
      var acc = accuracyFromReviews(App.state.reviews.filter(function (r) { return r.deckId === d.id; }));
      var dueColor = ready > 0 ? 'color:' + (d.color || '#a78bfa') : 'color:#6ee7b7';
      html += '<article class="picker-card" style="--accent:' + (d.color || '#8b5cf6') + '" data-deck="' + d.id + '" data-open-session>' +
        '<div class="picker-head"><div><div class="picker-title">' + (d.icon ? d.icon + ' ' : '') + U.esc(d.name) + '</div><div class="picker-sub">' + U.esc(d.desc || '') + '</div></div>' +
        '<div class="picker-head-actions"><button class="picker-edit-btn" data-action="edit-deck" data-id="' + d.id + '" title="' + App.t('editDeckTitle') + '"><svg viewBox="0 0 24 24"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg></button>' +
        '<div class="deck-ring" style="--accent:' + (d.color || '#8b5cf6') + '">' + U.ringSvg(pct, d.color || '#8b5cf6') + '</div></div></div>' +
        '<div class="picker-stats">' +
        '<div class="picker-stat"><div class="picker-stat-val">' + U.fmtInt(total) + '</div><div class="picker-stat-lbl">' + App.t('cardUnit') + '</div></div>' +
        '<div class="picker-stat"><div class="picker-stat-val" style="' + dueColor + '">' + U.fmtInt(ready) + '</div><div class="picker-stat-lbl">' + App.t('dueCount') + '</div></div>' +
        '<div class="picker-stat"><div class="picker-stat-val">' + (acc == null ? '—' : acc + '%') + '</div><div class="picker-stat-lbl">' + App.t('accuracy') + '</div></div>' +
        '</div>' +
        '<div class="picker-footer">' +
        '<button type="button" class="picker-manage-btn" data-action="manage-deck-cards" data-id="' + d.id + '" title="' + App.t('deckWordsTitle') + '">' +
        '<svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>' +
        '<span>' + App.t('editDeckWords') + ' (' + U.fmtInt(total) + ')</span>' +
        '</button>' +
        '</div>' +
        '</article>';
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

  /* ---------- STUDY CARD (تصميم v21 الزجاجي ثلاثي الأبعاد) ---------- */
  /* ألوان أدوات التعريف الألمانية — من التصميم الجديد؛ للغات الأخرى لون محايد */
  var FX_COLORS = {
    der: { text: '#2563eb', soft: '#bfdbfe', glow: 'rgba(37,99,235,.20)' },
    die: { text: '#db2777', soft: '#fbcfe8', glow: 'rgba(219,39,119,.18)' },
    das: { text: '#059669', soft: '#a7f3d0', glow: 'rgba(5,150,105,.18)' }
  };
  var FX_NEUTRAL = { text: '#a78bfa', soft: 'rgba(139,92,246,.45)', glow: 'rgba(139,92,246,.22)' };
  var AR_RE = /[\u0600-\u06FF]/;

  function intervalLabel(days, minutes) {
    if (minutes) return minutes + ' ' + App.t('minutesShort');
    if (days === 1) return '1 ' + App.t('day');
    if (days < 30) return days + ' ' + App.t('days');
    if (days < 365) return Math.round(days / 30) + ' ' + App.t('month');
    return Math.round(days / 365) + ' ' + App.t('year');
  }

  /* تمييز الكلمة داخل الجملة بلونها (من التصميم الجديد) — على نص مُهرَّب */
  function highlightExample(sentence, word, color) {
    var safe = U.esc(sentence);
    if (!word) return safe;
    var w = U.esc(word);
    var idx = safe.toLowerCase().indexOf(w.toLowerCase());
    if (idx === -1) return safe;
    return safe.slice(0, idx) +
      '<span style="color:' + color + '; font-weight:900;">' + safe.slice(idx, idx + w.length) + '</span>' +
      safe.slice(idx + w.length);
  }

  /* ملاءمة حجم الكلمة الأمامية تلقائياً مع مساحة البطاقة (من التصميم الجديد) */
  function fitFrontWord() {
    var wordArea = U.getEl('wordArea'), wordH2 = U.getEl('wordH2');
    if (!wordArea || !wordH2) return;
    wordH2.style.fontSize = '';
    var maxH = wordArea.clientHeight;
    var maxW = wordArea.clientWidth;
    if (!maxH || !maxW) return;
    var fontSize = parseFloat(getComputedStyle(wordH2).fontSize) || 48;
    var guard = 0;
    var MIN_SIZE = 14;
    while ((wordH2.scrollHeight > maxH + 1 || wordH2.scrollWidth > maxW + 1) && fontSize > MIN_SIZE && guard < 180) {
      fontSize -= 1;
      wordH2.style.fontSize = fontSize + 'px';
      guard++;
    }
  }

  function renderStudyCard() {
    var s = App.state.session;
    if (!s || !s.queue.length) return;

    /* إرجاع البطاقة فوراً للوجه الأمامي بدون أنيميشن لمنع رؤية إجابة البطاقة التالية */
    var f = U.getEl('flashCard');
    if (f) {
      f.style.transition = 'none';
      f.classList.remove('flipped');
      void f.offsetHeight; /* فرض تطبيق التغيير فوراً */
      f.style.transition = '';
    }
    var rateRow = U.getEl('rateRow');
    if (rateRow) rateRow.classList.remove('show');
    App.tts.cancel();

    var card = s.queue[s.idx];
    var front = s.dir === 'reverse' ? card.back : card.front;
    var back = s.dir === 'reverse' ? card.front : card.back;

    /* التقدم — بنمط التصميم "1 / 6" */
    U.getEl('progressText').textContent = U.fmtInt(s.idx + 1) + ' / ' + U.fmtInt(s.queue.length);
    U.getEl('progressBar').style.width = ((s.idx + 1) / s.queue.length * 100) + '%';

    /* الكلمة الأمامية (بلغة التعلم) + أداة التعريف الملونة إن وُجدت */
    var articleEl = U.getEl('articleEl'), wordEl = U.getEl('wordEl'), wordH2 = U.getEl('wordH2');
    var col = FX_NEUTRAL;
    var m = /^(der|die|das)\s+(.+)$/i.exec((front || '').trim());
    if (m) {
      col = FX_COLORS[m[1].toLowerCase()] || FX_NEUTRAL;
      articleEl.textContent = m[1];
      articleEl.style.display = '';
      articleEl.style.color = col.text;
      wordEl.textContent = m[2];
    } else {
      articleEl.style.display = 'none';
      wordEl.textContent = front;
    }
    wordH2.setAttribute('dir', AR_RE.test((front || '').charAt(0)) ? 'rtl' : 'ltr');
    U.getEl('frontGlow').style.setProperty('--glow', col.glow);
    var ttsBtnEl = U.getEl('ttsBtn');
    ttsBtnEl.style.color = col.text;
    ttsBtnEl.style.borderColor = col.soft;

    /* الشارات: مستوى CEFR + أول وسم */
    var lv = U.getEl('levelBadge');
    if (card.cefr) {
      var g = card.cefr.charAt(0).toUpperCase();
      lv.className = 'fx-badge lv-' + (g === 'A' ? 'A' : (g === 'C' ? 'C' : 'B'));
      lv.textContent = card.cefr;
      lv.style.display = '';
    } else lv.style.display = 'none';
    var tp = U.getEl('typeBadge');
    var tg = (card.tags || [])[0];
    if (tg) { tp.textContent = tg; tp.style.display = ''; }
    else tp.style.display = 'none';

    var deck = deckById(card.deckId);
    U.getEl('studyDeckName').textContent = deck ? deck.name : (s.deckLabel || '');
    var cefrEl = U.getEl('studyCefr');
    if (cefrEl) {
      if (card.cefr) { cefrEl.textContent = card.cefr; cefrEl.style.display = ''; cefrEl.className = 'cefr-badge cefr-' + card.cefr; }
      else cefrEl.style.display = 'none';
    }

    /* الوجه الخلفي (بلغة المستخدم): الترجمة + المثال + تذييل البطاقة */
    U.getEl('translationEl').textContent = back;
    var exBlock = U.getEl('exampleBlock');
    if (card.example) {
      var exWord = m ? m[2] : (front.length <= 40 ? front : '');
      U.getEl('exampleEl').innerHTML = highlightExample(card.example, exWord, col.text);
      var exTr = U.getEl('exampleTranslation');
      if (card.exampleTranslation) { exTr.textContent = card.exampleTranslation; exTr.style.display = ''; }
      else exTr.style.display = 'none';
      exBlock.style.display = '';
    } else exBlock.style.display = 'none';

    var fw = U.getEl('fullWordEl');
    if (m) fw.innerHTML = '<span style="color:' + col.text + '">' + U.esc(m[1]) + '</span> <span>' + U.esc(m[2]) + '</span>';
    else fw.textContent = front;

    var st = card.srs;
    var statusKey = st && st.status === 'new' ? 'newTag' : (st && st.status === 'learning' ? 'learningTag' : 'reviewTag');
    U.getEl('repInfoEl').textContent = (st && st.reps)
      ? App.tf('repInfo', { n: U.fmtInt(st.reps) }) + ' · ' + App.t(statusKey)
      : App.t('newTag');

    /* تسجيل صوتي للمستخدم على الوجه الخلفي */
    var audio = U.getEl('audioBadge');
    if (audio) audio.style.display = 'none';

    /* صورة البطاقة: تظهر كخلفية للبطاقة مع تعتيم أنيق */
    var bgEl = U.getEl('flashCardBg');
    var fxFront = U.qs('.fx-front');
    var imgEl = U.getEl('flashImage');
    if (imgEl) { imgEl.style.display = 'none'; imgEl.src = ''; }

    if (card.imagePath && s.dir !== 'reverse') {
      var wantPath = card.imagePath;
      if (bgEl) bgEl.setAttribute('data-cur-path', wantPath);
      App.handlers.imagePathToSrc(wantPath).then(function (src) {
        if (src && bgEl && bgEl.getAttribute('data-cur-path') === wantPath) {
          bgEl.style.backgroundImage = 'url("' + src.replace(/"/g, '\\"') + '")';
          bgEl.style.display = 'block';
          if (fxFront) fxFront.classList.add('has-bg-image');
        }
      });
    } else {
      if (bgEl) {
        bgEl.style.display = 'none';
        bgEl.style.backgroundImage = '';
        bgEl.setAttribute('data-cur-path', '');
      }
      if (fxFront) fxFront.classList.remove('has-bg-image');
    }

    /* فترات التكرار المتوقعة على أزرار التقييم (منطق SM-2 كما هو) */
    var prev = App.srs.preview(card.srs || App.srs.newState(Date.now()));
    U.getEl('intAgain').textContent = intervalLabel(0, 10);
    U.getEl('intHard').textContent = intervalLabel(prev.hard.days, 0);
    U.getEl('intGood').textContent = intervalLabel(prev.good.days, 0);
    U.getEl('intEasy').textContent = intervalLabel(prev.easy.days, 0);

    s.cardShownAt = Date.now();
    requestAnimationFrame(fitFrontWord);
  }

  function renderSessionEnd(stats) {
    U.getEl('endCards').textContent = U.fmtInt(stats.count);
    U.getEl('endAccuracy').textContent = stats.accuracy + '%';
    U.getEl('endTime').textContent = U.fmtTime(stats.ms);
  }

  /* ---------- FORMS / SELECTS ---------- */
  function deckOptions(selectedId, includeAll, includeNew) {
    var html = '';
    if (includeNew) {
      html += '<option value="__new__">➕ ' + (App.t('newDeck') || 'إنشاء قسم جديد...') + '</option>';
    }
    if (includeAll) {
      html += '<option value="all">' + App.t('allDecks') + '</option>';
    }
    App.state.decks.forEach(function (d) {
      html += '<option value="' + d.id + '"' + (selectedId === d.id ? ' selected' : '') + '>' + U.esc(d.name) + '</option>';
    });
    return html;
  }

  function renderDeckSelects() {
    var first = App.state.decks.length ? App.state.decks[0].id : '';
    var ds = U.getEl('deckSelect');
    if (ds) {
      var curVal = ds.value;
      ds.innerHTML = deckOptions(curVal || first, false, true);
      if (curVal && curVal !== '__new__') ds.value = curVal;
      else if (first) ds.value = first;
    }
    /* في نافذة حفظ بطاقات AI: الخيار الأول دائماً "قسم جديد بالعنوان المقترح" */
    var ads = U.getEl('aiDeckSelect');
    if (ads) {
      ads.innerHTML = '<option value="__new__">' + App.t('newDeckOpt') + '</option>' + deckOptions(first, false, false);
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
    fillLangSelect(U.getEl('aiTargetLangSelect'), p.targetLang || 'de');
    renderStoriesCefrSelect();
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
      var curModel = (s.model && !(App.ai.isDeadModel && App.ai.isDeadModel(s.model))) ? s.model : (models[0] || 'gemini-3.6-flash');
      var mopts = '';
      models.forEach(function (m) { mopts += '<option value="' + m + '"' + (m === curModel ? ' selected' : '') + '>' + m + '</option>'; });
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
    /* سرعة النطق — تُطبَّق على نطق لغة الهدف: البطاقات والقصص (ratePct في tts.js) */
    var rr = U.getEl('ttsRate');
    if (rr) {
      var r0 = Number(s.ttsRate);
      if (!r0 || r0 < 0.5 || r0 > 2) r0 = 1;
      rr.value = r0;
      var rv = rr.parentElement.querySelector('.range-value');
      if (rv) rv.textContent = r0 + 'x';
    }
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

  /* ═════════ عرض واجهة القصص المستقلة (Stories View) ═════════ */
  function splitIntoSentences(text) {
    if (!text) return [];
    var raw = String(text).replace(/\r\n/g, '\n').split(/(?<=[.!?؟])\s+|\n+/);
    return raw.map(function (s) { return s.trim(); }).filter(function (s) { return s.length > 0; });
  }

  function pairStorySentences(story) {
    if (!story) return [];
    if (Array.isArray(story.sentences) && story.sentences.length) {
      return story.sentences;
    }
    var tArr = splitIntoSentences(story.story || '');
    var nArr = splitIntoSentences(story.translation || '');
    var pairs = [];
    for (var i = 0; i < tArr.length; i++) {
      var n = (i < nArr.length) ? nArr[i] : (i === tArr.length - 1 ? nArr.slice(i).join(' ') : '');
      pairs.push({ target: tArr[i], native: n });
    }
    return pairs;
  }

  /* ═════════ CEFR select for Stories creator ═════════ */
  function renderStoriesCefrSelect() {
    var sel = U.getEl('storiesCefrSelect');
    if (!sel) return;
    var levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
    var cur = (App.state.profile && App.state.profile.cefrLevel) || 'B1';
    sel.innerHTML = levels.map(function (lv) {
      var label = App.t('cefr' + lv) || lv;
      return '<option value="' + lv + '"' + (lv === cur ? ' selected' : '') + '>' + lv + ' - ' + label + '</option>';
    }).join('');
  }

  function renderStoriesView() {
    var p = App.state.profile || { nativeLang: 'ar', targetLang: 'de', cefrLevel: 'B1' };
    var targetName = U.langName(p.targetLang, App.state.lang);
    var nativeName = U.langName(p.nativeLang, App.state.lang);

    var targetBadge = U.getEl('storiesTargetLangBadge');
    if (targetBadge) targetBadge.textContent = targetName;
    var targetLabel = U.getEl('storiesTargetLangLabel');
    if (targetLabel) targetLabel.textContent = (App.t('story') || 'القصة') + ' (' + targetName + ')';
    var nativeLabel = U.getEl('storiesNativeLangLabel');
    if (nativeLabel) nativeLabel.textContent = (App.t('translation') || 'الترجمة') + ' (' + nativeName + ')';

    renderStoriesCefrSelect();

    var story = App.state.lastStory;
    var readerEl = U.getEl('viewStoriesReader');
    var creatorEl = U.getEl('viewStoriesCreator');
    var emptyEl = U.getEl('viewStoriesEmpty');
    var newBtn = U.getEl('viewStoriesNewBtn');

    if (!story || !story.story) {
      if (readerEl) readerEl.style.display = 'none';
      if (creatorEl) creatorEl.style.display = 'block';
      if (emptyEl) emptyEl.style.display = 'none';
      if (newBtn) newBtn.style.display = 'none';
      return;
    }

    if (creatorEl) creatorEl.style.display = 'none';
    if (emptyEl) emptyEl.style.display = 'none';
    if (readerEl) readerEl.style.display = 'block';
    if (newBtn) newBtn.style.display = 'inline-flex';

    var wc = (story.story || '').split(/\s+/).filter(Boolean).length;
    var titleEl = U.getEl('storiesViewTitle');
    if (titleEl) titleEl.textContent = story.title || 'قصة قصيرة';
    var subEl = U.getEl('storiesViewSub');
    if (subEl) subEl.textContent = targetName + ' · ' + U.fmtInt(wc) + ' ' + App.t('wordsUnit') + ' · ' + (p.cefrLevel || 'B1');

    var isInterlinear = !!App.state.interlinearStoryMode;
    var toggleBtn = U.getEl('storiesToggleInterlinearBtn');
    var toggleLabel = U.getEl('interlinearBtnLabel');
    if (toggleBtn) {
      toggleBtn.classList.toggle('active', isInterlinear);
      if (toggleLabel) toggleLabel.textContent = isInterlinear ? App.t('interlinearHide') : App.t('interlinearToggle');
    }

    var nativeWrap = U.getEl('storiesNativeWrapper');
    if (nativeWrap) {
      nativeWrap.style.display = isInterlinear ? 'none' : 'block';
    }

    var textEl = U.getEl('storiesViewText');
    if (textEl) {
      var isTargetRtl = (p.targetLang === 'ar' || p.targetLang === 'ur' || p.targetLang === 'fa');
      textEl.setAttribute('dir', isTargetRtl ? 'rtl' : 'ltr');
      textEl.style.direction = isTargetRtl ? 'rtl' : 'ltr';
      textEl.style.textAlign = isTargetRtl ? 'right' : 'left';

      if (isInterlinear) {
        var pairs = pairStorySentences(story);
        var fmt = App.handlers && App.handlers.formatStoryWithWords;
        var isNativeRtl = (p.nativeLang === 'ar' || p.nativeLang === 'ur' || p.nativeLang === 'fa');
        textEl.innerHTML = pairs.map(function (pair) {
          var targetHtml = fmt ? fmt(pair.target) : U.esc(pair.target);
          return '<div class="story-interlinear-item">' +
            '<div class="story-sentence-target" dir="' + (isTargetRtl ? 'rtl' : 'ltr') + '">' + targetHtml + '</div>' +
            (pair.native ? '<div class="story-sentence-native" dir="' + (isNativeRtl ? 'rtl' : 'ltr') + '">💬 ' + U.esc(pair.native) + '</div>' : '') +
          '</div>';
        }).join('');
      } else {
        if (App.handlers && App.handlers.formatStoryWithWords) {
          textEl.innerHTML = App.handlers.formatStoryWithWords(story.story || '');
        } else {
          textEl.textContent = story.story || '';
        }
      }
    }

    var trEl = U.getEl('storiesViewTranslation');
    if (trEl && !isInterlinear) {
      var isNativeRtl = (p.nativeLang === 'ar' || p.nativeLang === 'ur' || p.nativeLang === 'fa');
      trEl.setAttribute('dir', isNativeRtl ? 'rtl' : 'ltr');
      trEl.style.direction = isNativeRtl ? 'rtl' : 'ltr';
      trEl.style.textAlign = isNativeRtl ? 'right' : 'left';
      trEl.textContent = story.translation || '';
    }

    var vocabSection = U.getEl('storiesVocabSection');
    var vocabContainer = U.getEl('storiesViewVocab');
    if (story.vocabulary && story.vocabulary.length) {
      if (vocabSection) vocabSection.style.display = 'block';
      if (vocabContainer) {
        var isTargetRtlVocab = (p.targetLang === 'ar' || p.targetLang === 'ur' || p.targetLang === 'fa');
        var isNativeRtlVocab = (p.nativeLang === 'ar' || p.nativeLang === 'ur' || p.nativeLang === 'fa');
        vocabContainer.innerHTML = story.vocabulary.map(function (w) {
          return '<div class="story-vocab-card">' +
            '<div class="vocab-word-target" dir="' + (isTargetRtlVocab ? 'rtl' : 'ltr') + '"><strong>' + U.esc(w.word) + '</strong></div>' +
            '<div class="vocab-word-meaning" dir="' + (isNativeRtlVocab ? 'rtl' : 'ltr') + '">' + U.esc(w.meaning || '') + '</div>' +
          '</div>';
        }).join('');
      }
    } else {
      if (vocabSection) vocabSection.style.display = 'none';
    }

    if (App.handlers && App.handlers.applyStoriesViewFontSize) {
      App.handlers.applyStoriesViewFontSize();
    }
  }

  /* ═════════ عرض وتعديل كلمات القسم المختار (Deck Cards Modal) ═════════ */
  function renderDeckCardsList(deckId, search) {
    var listEl = U.getEl('deckCardsList');
    if (!listEl) return;
    var d = deckById(deckId);
    if (!d) return;

    var modalTitle = U.getEl('deckCardsModalTitle');
    var modalSub = U.getEl('deckCardsModalSub');
    var allCards = cardsOf(deckId).filter(function (c) { return !c.deletedAt; });
    var query = (search || '').trim().toLowerCase();

    var filtered = query ? allCards.filter(function (c) {
      return (c.front || '').toLowerCase().indexOf(query) >= 0 ||
             (c.back || '').toLowerCase().indexOf(query) >= 0 ||
             (c.example || '').toLowerCase().indexOf(query) >= 0 ||
             (c.exampleTranslation || '').toLowerCase().indexOf(query) >= 0;
    }) : allCards;

    if (modalTitle) modalTitle.textContent = (App.t('deckWordsTitle') || 'تعديل كلمات القسم') + ': ' + (d.icon ? d.icon + ' ' : '') + d.name;
    if (modalSub) {
      var totalText = (App.t('totalWords') || 'إجمالي الكلمات') + ': ' + U.fmtInt(allCards.length);
      var matchText = query ? ' (' + (App.t('matchingWords') || 'المطابقة') + ': ' + filtered.length + ')' : '';
      modalSub.textContent = totalText + matchText;
    }

    if (!filtered.length) {
      listEl.innerHTML = '<div class="empty-state" style="padding:24px 0;"><div class="empty-icon">🔍</div><div class="empty-title">' +
        (query ? (App.t('noResults') || 'لا نتائج') : (App.t('noCardsYet') || 'لا توجد بطاقات بعد')) +
        '</div></div>';
      return;
    }

    var html = '';
    filtered.forEach(function (c) {
      var thumbHtml = c.imagePath
        ? '<div class="deck-card-thumb-wrap"><img class="deck-card-thumb" data-img-path="' + U.esc(c.imagePath) + '" alt="" /></div>'
        : '';
      html += '<div class="deck-card-item" id="deckCardItem_' + c.id + '" data-card-id="' + c.id + '">' +
        '<div class="deck-card-row">' +
          thumbHtml +
          '<div class="deck-card-info">' +
            '<div class="deck-card-front">' + U.esc(c.front) + '</div>' +
            '<div class="deck-card-back">' + U.esc(c.back) + '</div>' +
            (c.example ? '<div class="deck-card-ex" dir="ltr">💬 ' + U.esc(c.example) + (c.exampleTranslation ? '<div class="deck-card-ex-tr" dir="rtl">' + U.esc(c.exampleTranslation) + '</div>' : '') + '</div>' : '') +
          '</div>' +
          '<div class="deck-card-actions">' +
            '<button type="button" class="deck-card-btn" data-action="edit-inline-card" data-id="' + c.id + '" title="' + App.t('edit') + '">' +
              '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>' +
              '<span>' + App.t('edit') + '</span>' +
            '</button>' +
            '<button type="button" class="deck-card-btn del" data-action="del-deck-card" data-id="' + c.id + '" title="' + App.t('delete') + '">' +
              '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>' +
            '</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    });

    listEl.innerHTML = html;
    loadDeckCardsThumbs();
  }

  function loadDeckCardsThumbs() {
    var host = U.getEl('deckCardsList');
    if (!host) return;
    var imgs = host.querySelectorAll('img[data-img-path]');
    Array.prototype.forEach.call(imgs, function (img) {
      var p = img.getAttribute('data-img-path');
      if (!p) return;
      if (p.indexOf('data:') === 0) { img.src = p; return; }
      App.handlers.imagePathToSrc(p).then(function (src) { if (src) img.src = src; });
    });
  }

  function renderAll() {
    renderHome();
    renderDecks();
    renderBrowse();
    renderSearch();
    if (U.qs('.view[data-view="stats"]').classList.contains('active')) renderStats();
    if (U.qs('.view[data-view="stories"]').classList.contains('active')) renderStoriesView();
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
    renderStoriesView: renderStoriesView, renderDeckCardsList: renderDeckCardsList,
    fitFrontWord: fitFrontWord,
    renderColorRow: renderColorRow, renderEmojiRow: renderEmojiRow, renderSettings: renderSettings,
    updateLangLabels: updateLangLabels, updateTranslateBtnVisibility: updateTranslateBtnVisibility, fillVoiceSelect: fillVoiceSelect,
    updateKeyButtons: updateKeyButtons, fillUiLangSelect: fillUiLangSelect,
    deckById: deckById, cardsOf: cardsOf, dueCardsOf: dueCardsOf, newCardsOf: newCardsOf,
    streakDays: streakDays, totalDueAvailable: totalDueAvailable, intervalLabel: intervalLabel,
    pairStorySentences: pairStorySentences
  };
})();
