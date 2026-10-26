/* Flashki — db.js : طبقة بيانات SQLite موحدة
   ─ تطبيق Tauri : tauri-plugin-sql → ملف flashki.db واحد (WAL + Foreign Keys)
   ─ معاينة المتصفح: sql.js WASM — نفس استعلامات SQL حرفياً، تُحفظ في localStorage
   ─ ترحيل تلقائي مرة واحدة من IndexedDB القديمة إن وُجدت بيانات
   كل عمليات store.js (getAll/put/kvGet…) تعمل فوق هذا بالواجهة نفسها */
(function () {
  'use strict';
  var App = window.App = window.App || {};
  var U = App.util;

  var LS_KEY = 'flashki_sql_db_v2';
  var backend = null;      /* 'tauri' | 'wasm' */
  var wasmDb = null;       /* sql.js instance */
  var tauriDb = null;      /* plugin-sql Database */
  var persistTimer = null;
  var readyPromise = null;

  /* ═════════ تحويل كائنات JS (شكل store.js) ↔ صفوف SQL (الـ Schema v2) ═════════ */
  var RATING_TO_INT = { again: 1, hard: 2, good: 3, easy: 4 };
  var INT_TO_RATING = { 1: 'again', 2: 'hard', 3: 'good', 4: 'easy' };

  function safeJson(s, fallback) { try { var v = JSON.parse(s); return v == null ? fallback : v; } catch (e) { return fallback; } }

  function deckToRow(d) {
    return { id: d.id, name: d.name, description: d.desc || '', icon: d.icon || '📚', color: d.color || '#8b5cf6',
      position: d.position || 0, created_at: d.createdAt || Date.now(), updated_at: d.updatedAt || d.createdAt || Date.now(), deleted_at: d.deletedAt || null };
  }
  function rowToDeck(r) {
    return { id: r.id, name: r.name, desc: r.description || '', icon: r.icon || '📚', color: r.color || '#8b5cf6',
      position: r.position || 0, createdAt: r.created_at, updatedAt: r.updated_at, deletedAt: r.deleted_at };
  }
  function cardToRow(c) {
    var s = c.srs || {};
    return { id: c.id, deck_id: c.deckId, front: c.front, back: c.back, hint: c.hint || '',
      tags: JSON.stringify(c.tags || []), audio_front: c.audioFront || null, audio_back: c.audioBack || null,
      image_path: c.imagePath || null, generated_from: c.generatedFrom || null,
      lang: c.lang || null, cefr: c.cefr || null, example: c.example || '', example_translation: c.exampleTranslation || '',
      ease_factor: (s.ease != null ? s.ease : 2.5), interval_days: s.interval || 0, repetitions: s.reps || 0, lapses: s.lapses || 0,
      status: s.status || 'new', due_date: s.due || Date.now(),
      suspended_until: c.suspendedUntil || null, last_review_at: c.lastReviewAt || null,
      created_at: c.createdAt || Date.now(), updated_at: c.updatedAt || c.createdAt || Date.now(), deleted_at: c.deletedAt || null };
  }
  function rowToCard(r) {
    return { id: r.id, deckId: r.deck_id, front: r.front, back: r.back, hint: r.hint || '',
      tags: safeJson(r.tags, []), audioFront: r.audio_front || undefined, audioBack: r.audio_back || undefined,
      imagePath: r.image_path, generatedFrom: r.generated_from,
      lang: r.lang, cefr: r.cefr, example: r.example || '', exampleTranslation: r.example_translation || '',
      srs: { ease: r.ease_factor, interval: r.interval_days, reps: r.repetitions, lapses: r.lapses, status: r.status, due: r.due_date },
      suspendedUntil: r.suspended_until, lastReviewAt: r.last_review_at,
      createdAt: r.created_at, updatedAt: r.updated_at, deletedAt: r.deleted_at };
  }
  function reviewToRow(rv) {
    var ts = rv.ts || Date.now();
    return { id: rv.id || null, card_id: rv.cardId, deck_id: rv.deckId, rating: RATING_TO_INT[rv.rating] || 3,
      reviewed_at: ts, reviewed_local_date: U.todayKey(ts), duration_ms: rv.durationMs || 0, session_id: rv.sessionId || null };
  }
  function rowToReview(r) {
    return { id: r.id, cardId: r.card_id, deckId: r.deck_id, rating: INT_TO_RATING[r.rating] || 'good',
      ts: r.reviewed_at, durationMs: r.duration_ms, sessionId: r.session_id, localDate: r.reviewed_local_date };
  }
  function genToRow(g) {
    return { id: g.id, deck_id: g.deckId || null, source_type: g.sourceType || 'text',
      source_preview: (g.sourcePreview || '').slice(0, 200), cards_count: g.cardsCount || 0,
      prompt_used: g.promptUsed || '', created_at: g.createdAt || Date.now() };
  }

  var TABLES = {
    decks:   { name: 'decks', to: deckToRow, from: rowToDeck },
    cards:   { name: 'cards', to: cardToRow, from: rowToCard },
    reviews: { name: 'reviews', to: reviewToRow, from: rowToReview },
    aiGens:  { name: 'ai_generations', to: genToRow, from: function (r) { return { id: r.id, deckId: r.deck_id, sourceType: r.source_type, sourcePreview: r.source_preview, cardsCount: r.cards_count, promptUsed: r.prompt_used, createdAt: r.created_at }; } }
  };

  /* ═════════ محركات التنفيذ ═════════ */
  function sqlAll(sql, params) {
    if (backend === 'tauri') return tauriDb.select(sql, params || []);
    return new Promise(function (resolve, reject) {
      try {
        var stmt = wasmDb.prepare(sql);
        if (params && params.length) stmt.bind(params);
        var rows = [];
        while (stmt.step()) rows.push(stmt.getAsObject());
        stmt.free();
        resolve(rows);
      } catch (e) { reject(e); }
    });
  }
  function sqlRun(sql, params) {
    if (!sql || !sql.replace(/--[^\n]*/g, '').trim()) return Promise.resolve(null); /* تعليقات/فراغ فقط — sql.js: "Nothing to prepare" */
    if (backend === 'tauri') return tauriDb.execute(sql, params || []).then(function () { return null; });
    return new Promise(function (resolve, reject) {
      try { wasmDb.run(sql, params || []); resolve(null); }
      catch (e) { reject(e); }
    });
  }
  function lastId() {
    return sqlAll('SELECT last_insert_rowid() AS id').then(function (rows) { return rows[0] ? rows[0].id : null; });
  }
  function persistWasm() {
    if (backend !== 'wasm') return;
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(function () {
      try {
        var data = wasmDb.export(); /* Uint8Array */
        var bin = '';
        var chunk = 0x8000;
        for (var i = 0; i < data.length; i += chunk) bin += String.fromCharCode.apply(null, data.subarray(i, i + chunk));
        localStorage.setItem(LS_KEY, btoa(bin));
      } catch (e) { console.warn('db: persist failed (quota?)', e); }
    }, 600);
  }

  /* ═════════ الإقلاع ═════════ */
  function fetchSchema() {
    return fetch('schema.sql').then(function (r) { return r.text(); });
  }
  function execSchema(sqlText) {
    /* تقسيم على فواصل الأسطر؛ حذف أسطر التعليقات؛ تخطي الأجزاء الفارغة (sql.js: "Nothing to prepare") */
    var parts = sqlText.split(/;\s*(?:\n|$)/).map(function (s) {
      return s.split('\n').filter(function (l) {
        var t = l.trim();
        return t && t.indexOf('--') !== 0;
      }).join('\n').trim();
    }).filter(function (s) { return s.length > 0; });
    var chain = Promise.resolve();
    parts.forEach(function (stmt) {
      chain = chain.then(function () { return sqlRun(stmt); });
    });
    return chain;
  }

  function initWasm() {
    return new Promise(function (resolve, reject) {
      if (typeof initSqlJs !== 'function') { reject(new Error('sql.js not loaded')); return; }
      initSqlJs({ locateFile: function (f) { return 'vendor/' + f; } }).then(function (SQL) {
        try {
          var raw = localStorage.getItem(LS_KEY);
          if (raw) {
            var bin = atob(raw);
            var bytes = new Uint8Array(bin.length);
            for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            wasmDb = new SQL.Database(bytes);
          } else wasmDb = new SQL.Database();
          resolve();
        } catch (e) { reject(e); }
      }).catch(reject);
    });
  }

  function tableCount(table) {
    return sqlAll('SELECT COUNT(*) AS n FROM ' + table).then(function (rows) { return rows[0] ? rows[0].n : 0; });
  }

  function migrateFromIndexedDB() {
    return tableCount('cards').then(function (n) {
      if (n > 0) return; /* يوجد بيانات SQL — لا ترحيل */
      return new Promise(function (resolve) {
        try {
          var req = indexedDB.open('flashki', 1);
          req.onsuccess = function () {
            var oldDb = req.result;
            if (!oldDb.objectStoreNames.contains('cards')) { oldDb.close(); resolve(); return; }
            var tx = oldDb.transaction(['decks', 'cards', 'reviews', 'kv'], 'readonly');
            var read = function (store) {
              return new Promise(function (res) {
                var r = tx.objectStore(store).getAll();
                r.onsuccess = function () { res(r.result || []); };
                r.onerror = function () { res([]); };
              });
            };
            Promise.all([read('decks'), read('cards'), read('reviews'), read('kv')]).then(function (res) {
              oldDb.close();
              var decks = res[0] || [], cards = res[1] || [], reviews = res[2] || [], kvs = res[3] || [];
              if (!decks.length && !cards.length) { resolve(); return; }
              console.log('db: migrating from IndexedDB →', decks.length, 'decks,', cards.length, 'cards');
              var chain = Promise.resolve();
              decks.forEach(function (d) { chain = chain.then(function () { return put('decks', d); }); });
              cards.forEach(function (c) { chain = chain.then(function () { return put('cards', c); }); });
              reviews.forEach(function (rv) { chain = chain.then(function () { return add('reviews', rv); }); });
              chain.then(resolve).catch(function (e) { console.warn('migrate insert failed', e); resolve(); });
            });
          };
          req.onerror = function () { resolve(); };
        } catch (e) { resolve(); }
      });
    });
  }

  function init() {
    if (readyPromise) return readyPromise;
    readyPromise = new Promise(function (resolve, reject) {
      var isTauri = !!(window.__TAURI__ && window.__TAURI__.sql && window.__TAURI__.sql.Database);
      var start;
      if (isTauri) {
        backend = 'tauri';
        start = window.__TAURI__.sql.Database.load('sqlite:flashki.db').then(function (db) {
          tauriDb = db;
          return sqlRun('PRAGMA journal_mode = WAL');
        }).then(function () { return sqlRun('PRAGMA foreign_keys = ON'); });
      } else {
        backend = 'wasm';
        start = initWasm().then(function () {
          return sqlRun('PRAGMA foreign_keys = ON');
        });
      }
      start.then(fetchSchema).then(execSchema)
        .then(migrateFromIndexedDB)
        .then(function () { persistWasm(); resolve(backend); })
        .catch(function (e) { readyPromise = null; reject(e); });
    });
    return readyPromise;
  }

  /* ═════════ الواجهة العامة (نفس واجهة IndexedDB القديمة — store.js لا يتغير) ═════════ */
  function put(storeName, obj) {
    var T = TABLES[storeName];
    var row = T.to(obj);
    var cols = Object.keys(row).filter(function (k) { return row[k] !== undefined; });
    var vals = cols.map(function (k) { return row[k] === undefined ? null : row[k]; });
    var ph = cols.map(function () { return '?'; }).join(',');
    return sqlRun('INSERT OR REPLACE INTO ' + T.name + ' (' + cols.join(',') + ') VALUES (' + ph + ')', vals)
      .then(persistWasm);
  }
  function add(storeName, obj) {
    if (storeName !== 'reviews') return put(storeName, obj);
    var row = reviewToRow(obj);
    var out = Object.assign({}, obj);
    return sqlRun('INSERT INTO reviews (card_id, deck_id, rating, reviewed_at, reviewed_local_date, duration_ms, session_id) VALUES (?,?,?,?,?,?,?)',
      [row.card_id, row.deck_id, row.rating, row.reviewed_at, row.reviewed_local_date, row.duration_ms, row.session_id])
      .then(lastId).then(function (id) { out.id = id; persistWasm(); return out; });
  }
  function getAll(storeName) {
    var T = TABLES[storeName];
    return sqlAll('SELECT * FROM ' + T.name).then(function (rows) { return rows.map(T.from); });
  }
  function get(storeName, id) {
    var T = TABLES[storeName];
    return sqlAll('SELECT * FROM ' + T.name + ' WHERE id = ?', [id]).then(function (rows) { return rows.length ? T.from(rows[0]) : null; });
  }
  function del(storeName, id) {
    var T = TABLES[storeName];
    return sqlRun('DELETE FROM ' + T.name + ' WHERE id = ?', [id]).then(persistWasm);
  }
  function clear(storeName) {
    /* 'kv' ليس جدولاً مستقلاً — القيم (settings/user_profile/newIntro) في جدول settings */
    var table = (storeName === 'kv') ? 'settings' : TABLES[storeName].name;
    return sqlRun('DELETE FROM ' + table).then(persistWasm);
  }
  /* kv → جدول settings (قيم JSON) */
  function kvGet(key) {
    return sqlAll('SELECT value FROM settings WHERE key = ?', [key]).then(function (rows) {
      return rows.length ? safeJson(rows[0].value, null) : null;
    });
  }
  function kvSet(key, value) {
    return sqlRun('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, JSON.stringify(value)]).then(persistWasm);
  }

  App.db = { init: init, open: init, backend: function () { return backend; },
    getAll: getAll, get: get, put: put, add: add, del: del, clear: clear,
    kvGet: kvGet, kvSet: kvSet };
})();
