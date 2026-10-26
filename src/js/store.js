/* Flashki — store.js : high-level data operations (all local).
   ⚠️ لا بذور إنتاجية: التطبيق يبدأ فارغاً 100% بعد Onboarding.
   بذور العرض التجريبي فقط في js/seed-demo.js — تُحمَّل ديناميكياً عند ?demo=1 في URL فقط. */
(function () {
  'use strict';
  var App = window.App = window.App || {};
  var U = App.util;
  var DAY = 86400000, MIN = 60000;

  var DEFAULT_SETTINGS = {
    lang: 'ar', theme: 'dark', fontSize: 0, animations: true,
    apiKey: '', model: 'gemini-3.8-flash', keyStatus: 'unchecked',
    ttsRate: 1, autoTts: true,
    autoTwoSided: true, dailyNew: 20, aiCount: 'auto',
    cefrLevel: 'B1', translationAutoEnabled: true,
    /* صوت افتراضي لكل لغة (Edge TTS — تحقق حي) */
    tts_voice_ar: 'ar-MA-MounaNeural', tts_voice_en: 'en-US-JennyNeural',
    tts_voice_fr: 'fr-FR-DeniseNeural', tts_voice_es: 'es-ES-ElviraNeural',
    tts_voice_de: 'de-DE-KatjaNeural', tts_voice_tr: 'tr-TR-EmelNeural',
    tts_voice_ru: 'ru-RU-SvetlanaNeural', tts_voice_zh: 'zh-CN-XiaoxiaoNeural',
    tts_voice_ja: 'ja-JP-NanamiNeural', tts_voice_it: 'it-IT-ElsaNeural',
    tts_voice_pt: 'pt-PT-FernandaNeural'
  };

  /* ملف المستخدم — يبنيه الـ Onboarding ويُعدَّل من الإعدادات */
  var DEFAULT_PROFILE = {
    name: '', nativeLang: 'ar', targetLang: 'en', uiLang: 'ar',
    cefrLevel: 'B1', onboardingCompletedAt: null
  };

  function getProfile() {
    return App.db.kvGet('user_profile').then(function (v) {
      var p = Object.assign({}, DEFAULT_PROFILE, v || {});
      p.cefrLevel = p.cefrLevel || 'B1';
      return p;
    });
  }
  function saveProfile(p) { return App.db.kvSet('user_profile', p); }

  function saveAiGeneration(gen) {
    var rec = {
      id: gen.id || U.uid(), deckId: gen.deckId || null, sourceType: gen.sourceType || 'text',
      sourcePreview: gen.sourcePreview || '', cardsCount: gen.cardsCount || 0,
      promptUsed: gen.promptUsed || '', createdAt: gen.createdAt || Date.now()
    };
    return App.db.put('aiGens', rec).then(function () { return rec; });
  }

  var DECK_COLORS = ['#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#6366f1', '#ec4899', '#84cc16'];
  var DECK_EMOJIS = ['📚', '🧠', '💬', '🌍', '🧪', '🎨', '📐', '⚗️', '🎵', '🏛️', '💻', '⚡'];

  function getSettings() {
    return App.db.kvGet('settings').then(function (v) {
      var s = Object.assign({}, DEFAULT_SETTINGS, v || {});
      /* ترحيل fontSize القديم (0/1/2) → بكسلات (16/18/20) — النظام الجديد: px بين 14-24 */
      var fz = Number(s.fontSize);
      if (fz === 0 || fz === 1 || fz === 2) s.fontSize = [16, 18, 20][fz];
      if (!s.fontSize || s.fontSize < 14 || s.fontSize > 24) s.fontSize = 16;
      return s;
    });
  }
  function saveSettings(s) { return App.db.kvSet('settings', s); }

  function getDecks() {
    return App.db.getAll('decks').then(function (d) { return (d || []).filter(function (x) { return !x.deletedAt; }).sort(function (a, b) { return a.createdAt - b.createdAt; }); });
  }
  function getCards() {
    return App.db.getAll('cards').then(function (c) { return (c || []).filter(function (x) { return !x.deletedAt; }).sort(function (a, b) { return a.createdAt - b.createdAt; }); });
  }
  function getReviews() {
    return App.db.getAll('reviews').then(function (r) { return r || []; });
  }

  /* ── السلة (حذف ناعم) — سياسة: deletedAt على البطاقة/القسم، الاستعادة تعيد كل شيء،
     الحذف الفعلي عند التفريغ يدوياً (وفي مرحلة SQLite: تلقائياً بعد 30 يوماً قابلة للتعديل) ── */
  function loadTrash() {
    return Promise.all([
      App.db.getAll('decks').then(function (d) { return (d || []).filter(function (x) { return x.deletedAt; }); }),
      App.db.getAll('cards').then(function (c) { return (c || []).filter(function (x) { return x.deletedAt; }); })
    ]);
  }
  function saveDeck(deck) { return App.db.put('decks', deck); }
  function deleteDeck(id) {
    /* حذف ناعم: القسم + كل بطاقاته معاً (نفس الطابع الزمني لضمان استعادة متسقة) */
    var now = Date.now();
    var ops = [];
    (App.state.cards || []).forEach(function (c) {
      if (c.deckId === id && !c.deletedAt) { c.deletedAt = now; ops.push(App.db.put('cards', c)); }
    });
    var deck = null;
    (App.state.decks || []).forEach(function (d) { if (d.id === id) deck = d; });
    if (deck) { deck.deletedAt = now; ops.push(App.db.put('decks', deck)); }
    return Promise.all(ops);
  }
  function restoreDeck(id) {
    /* ⚠️ البحث في قاعدة البيانات مباشرة — البطاقة/القسم المحذوف ناعماً ليس في App.state */
    return App.db.get('decks', id).then(function (deck) {
      if (!deck) return;
      var trashedAt = deck.deletedAt;
      deck.deletedAt = null;
      var ops = [App.db.put('decks', deck)];
      return App.db.getAll('cards').then(function (all) {
        (all || []).forEach(function (c) {
          if (c.deckId === id && c.deletedAt === trashedAt) { c.deletedAt = null; ops.push(App.db.put('cards', c)); }
        });
        return Promise.all(ops);
      });
    });
  }
  function purgeDeck(id) {
    /* حذف فعلي: القسم + بطاقاته + سجل مراجعاتها (فقدت معناها) */
    return App.db.getAll('cards').then(function (all) {
      var ops = [];
      (all || []).forEach(function (c) {
        if (c.deckId === id) {
          ops.push(App.db.del('cards', c.id));
          (App.state.reviews || []).forEach(function (r) { if (r.cardId === c.id) ops.push(App.db.del('reviews', r.id)); });
        }
      });
      ops.push(App.db.del('decks', id));
      return Promise.all(ops);
    });
  }
  function saveCard(card) { return App.db.put('cards', card); }
  function deleteCard(id) {
    /* حذف ناعم — الصوتيات تبقى مع البطاقة حتى الحذف الفعلي */
    var now = Date.now();
    var card = null;
    (App.state.cards || []).forEach(function (c) { if (c.id === id) card = c; });
    if (card) { card.deletedAt = now; return App.db.put('cards', card); }
    return Promise.resolve();
  }
  function restoreCard(id) {
    return App.db.get('cards', id).then(function (card) {
      if (!card) return;
      card.deletedAt = null;
      return App.db.put('cards', card);
    });
  }
  function purgeCard(id) {
    var ops = [App.db.del('cards', id)];
    (App.state.reviews || []).forEach(function (r) { if (r.cardId === id) ops.push(App.db.del('reviews', r.id)); });
    return Promise.all(ops);
  }

  function logReview(cardId, deckId, rating, durationMs) {
    var r = { cardId: cardId, deckId: deckId, rating: rating, ts: Date.now(), durationMs: durationMs || 0 };
    return App.db.add('reviews', r).then(function (id) { r.id = id; return r; });
  }

  function getNewIntro() {
    return App.db.kvGet('newIntro').then(function (v) {
      var today = U.todayKey();
      if (!v || v.date !== today) return { date: today, count: 0 };
      return v;
    });
  }
  function saveNewIntro(v) { return App.db.kvSet('newIntro', v); }

  function exportData() {
    return Promise.all([getDecks(), getCards(), getReviews(), App.db.kvGet('settings')]).then(function (r) {
      var settings = Object.assign({}, r[3] || {});
      delete settings.apiKey; /* never export the API key */
      return { app: 'Flashki', version: 1, exportedAt: new Date().toISOString(), decks: r[0], cards: r[1], reviews: r[2], settings: settings };
    });
  }

  function exportWithAudio(data) {
    /* cards may hold Blob audio — convert to base64 for JSON export */
    var jobs = data.cards.map(function (c) {
      var out = Object.assign({}, c), p1 = Promise.resolve(), p2 = Promise.resolve();
      if (c.audioFront instanceof Blob) p1 = U.blobToDataURL(c.audioFront).then(function (d) { out.audioFront = d; });
      if (c.audioBack instanceof Blob) p2 = U.blobToDataURL(c.audioBack).then(function (d) { out.audioBack = d; });
      return Promise.all([p1, p2]).then(function () { return out; });
    });
    return Promise.all(jobs).then(function (cards) { data.cards = cards; return data; });
  }

  function importData(json) {
    if (!json || json.app !== 'Flashki' || !Array.isArray(json.decks) || !Array.isArray(json.cards)) {
      return Promise.reject(new Error('invalid'));
    }
    return App.db.clear('decks').then(function () { return App.db.clear('cards'); }).then(function () {
      return App.db.clear('reviews');
    }).then(function () {
      var ops = [];
      json.decks.forEach(function (d) { ops.push(App.db.put('decks', d)); });
      json.cards.forEach(function (c) {
        var card = Object.assign({}, c);
        if (typeof card.audioFront === 'string') card.audioFront = U.dataURLToBlob(card.audioFront) || undefined;
        if (typeof card.audioBack === 'string') card.audioBack = U.dataURLToBlob(card.audioBack) || undefined;
        ops.push(App.db.put('cards', card));
      });
      (json.reviews || []).forEach(function (r) { delete r.id; ops.push(App.db.add('reviews', r)); });
      if (json.settings) {
        return Promise.all(ops).then(function () {
          return getSettings().then(function (cur) {
            var merged = Object.assign({}, cur, json.settings, { apiKey: cur.apiKey });
            return saveSettings(merged);
          });
        });
      }
      return Promise.all(ops);
    });
  }

  function wipeAll() {
    return App.db.clear('decks').then(function () { return App.db.clear('cards'); })
      .then(function () { return App.db.clear('reviews'); })
      .then(function () { return App.db.clear('kv'); });
  }

  /* ⚠️ حُذفت بذور التشغيل الأول نهائياً (كانت 4 أقسام + 20 بطاقة وهمية).
     أول تشغيل = قاعدة بيانات فارغة تماماً — المستخدم ينشئ أول قسم بنفسه.
     وضع التجربة ?demo=1 يحمّل js/seed-demo.js ديناميكياً من app.js (خارج الإنتاج). */

  App.store = {
    DEFAULT_SETTINGS: DEFAULT_SETTINGS, DEFAULT_PROFILE: DEFAULT_PROFILE, DECK_COLORS: DECK_COLORS, DECK_EMOJIS: DECK_EMOJIS,
    getSettings: getSettings, saveSettings: saveSettings,
    getProfile: getProfile, saveProfile: saveProfile, saveAiGeneration: saveAiGeneration,
    getDecks: getDecks, getCards: getCards, getReviews: getReviews,
    saveDeck: saveDeck, deleteDeck: deleteDeck, restoreDeck: restoreDeck, purgeDeck: purgeDeck,
    saveCard: saveCard, deleteCard: deleteCard, restoreCard: restoreCard, purgeCard: purgeCard,
    loadTrash: loadTrash, logReview: logReview,
    getNewIntro: getNewIntro, saveNewIntro: saveNewIntro,
    exportData: exportData, exportWithAudio: exportWithAudio, importData: importData,
    wipeAll: wipeAll
  };
})();
