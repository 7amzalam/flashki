/* Flashki — app.js : state, boot, view switching, study session engine */
(function () {
  'use strict';
  var App = window.App = window.App || {};
  var U = App.util;

  /* ---------- global state ---------- */
  App.state = {
    lang: 'ar',
    lastView: 'home',
    pendingDeck: 'all',
    editingCardId: null,
    editingDeckId: null,
    showTrash: false,
    trashDecks: [],
    trashCards: [],
    browseFilter: 'all',
    searchFilter: 'all',
    searchQuery: '',
    chartRange: 30,
    aiOptions: { count: 'auto', twosided: true, context: false },
    aiMode: 'cards',
    lastStory: null,
    aiResults: [],
    session: null,
    settings: {},
    decks: [],
    cards: [],
    reviews: [],
    newIntro: { date: U.todayKey(), count: 0 }
  };

  App.debouncedSearch = U.debounce(function () {
    App.state.searchQuery = U.getEl('searchInput').value;
    App.render.renderSearch();
  }, 200);

  /* ---------- view switching ---------- */
  App.switchView = function (view) {
    App.state.lastView = view;
    U.qsa('.view').forEach(function (v) {
      if (v.getAttribute('data-view') === view) v.classList.add('active');
      else v.classList.remove('active');
    });
    U.qsa('.nav-item, .bottom-nav-item').forEach(function (b) {
      if (b.getAttribute('data-view') === view) b.classList.add('active');
      else b.classList.remove('active');
    });
    var isStudy = (view === 'study' || view === 'session-end');
    var app = U.getEl('app');
    if (isStudy) app.classList.add('studying');
    else app.classList.remove('studying');
    App.i18n.updateTitle(view);
    var content = U.getEl('content');
    if (content) content.scrollTop = 0;

    if (view === 'study') { if (App.state.session) App.render.renderStudyCard(); }
    else if (view === 'stats') App.render.renderStats();
    else if (view === 'decks') App.render.renderDecks();
    else if (view === 'home') App.render.renderHome();
    else if (view === 'browse') App.render.renderBrowse();
    else if (view === 'search') App.render.renderSearch();
    else if (view === 'add') App.render.renderDeckSelects();
  };

  /* ---------- study session engine ---------- */
  /* سياسة v1.1: لا نافذة إعداد — عند اختيار أي قسم تدخل الجلسة فوراً:
     المستحقة الآن أولاً (مخلّطة) ثم الجديدة (مخلّطة) — اتجاه عادي سؤال ← إجابة */
  App.study = {
    start: function (deckId) {
      var now = Date.now();
      var pool = (deckId === 'all') ? App.state.cards : App.state.cards.filter(function (c) { return c.deckId === deckId && !c.deletedAt; });
      if (!pool.length) { U.toast(App.t('noCardsYet')); return; }

      var due = pool.filter(function (c) { return c.srs && c.srs.status !== 'new' && c.srs.due <= now; });
      var fresh = pool.filter(function (c) { return !c.srs || c.srs.status === 'new'; });

      App.store.getNewIntro().then(function (ni) {
        App.state.newIntro = ni;
        var allowed = Math.max(0, (Number(App.state.settings.dailyNew) || 0) - (ni.count || 0));
        fresh = fresh.slice(0, allowed);
        var queue = U.shuffle(due).concat(U.shuffle(fresh));
        if (!queue.length) { U.toast(App.t('noDue')); return; }

        /* ترتيب CEFR: الأقرب لمستوى المتعلم أولاً (ضمن المستحقة والجديدة معاً) */
        var userCefr = (App.state.profile && App.state.profile.cefrLevel) || (App.state.settings.cefrLevel) || 'B1';
        queue = queue.slice().sort(function (a, b) {
          return U.cefrDistance(a.cefr, userCefr) - U.cefrDistance(b.cefr, userCefr);
        });

        ni.count = (ni.count || 0) + fresh.length;
        App.store.saveNewIntro(ni);

        App.state.session = {
          queue: queue, idx: 0, dir: 'normal',
          startedAt: now, cardShownAt: now,
          ratings: [], durations: [],
          deckLabel: (deckId === 'all') ? App.t('allDecks') : (App.render.deckById(deckId) || {}).name || ''
        };
        App.switchView('study');
      });
    },

    flip: function () {
      var f = U.getEl('flashCard');
      var s = App.state.session;
      if (!f || !s) return;
      /* قلب غير محدود في الاتجاهين: الوجه الخلفي ← الأمامي ← الخلفي... */
      if (f.classList.contains('flipped')) {
        f.classList.remove('flipped');
        U.getEl('rateRow').classList.remove('show');
        U.getEl('showAnswer').style.display = '';
        App.tts.cancel(); /* أوقف نطق الإجابة عند العودة للسؤال */
        return;
      }
      f.classList.add('flipped');
      U.getEl('rateRow').classList.add('show');
      U.getEl('showAnswer').style.display = 'none';
      var card = s.queue[s.idx];
      if (App.state.settings.autoTts && App.tts.supported()) {
        var back = s.dir === 'reverse' ? card.front : card.back;
        if (back && back.length < 200) App.tts.speak(back, s.dir === 'reverse' ? 'front' : 'back');
      }
    },

    rate: function (rating) {
      var s = App.state.session;
      if (!s) return;
      var card = s.queue[s.idx];
      if (!card) return;
      var now = Date.now();
      card.srs = App.srs.apply(card.srs || App.srs.newState(now), rating, now);
      card.updatedAt = now;
      var dur = now - (s.cardShownAt || now);
      s.ratings.push(rating);
      s.durations.push(dur);
      App.store.saveCard(card).catch(function (e) {
        U.toast(App.t('saveFailed') + (e && e.message ? ' — ' + e.message : ''), 'error');
      });
      App.store.logReview(card.id, card.deckId, rating, dur).then(function (r) {
        App.state.reviews.push(r);
      }).catch(function (e) {
        /* المراجعة لا تضيع بصمت — تنبيه واضح (كان الفشل الصامت يجعل الإحصائيات فارغة) */
        U.toast(App.t('reviewLogFailed') + (e && e.message ? ' — ' + e.message : ''), 'error');
      });
      s.idx++;
      if (s.idx >= s.queue.length) App.study.finish();
      else App.render.renderStudyCard();
    },

    finish: function () {
      var s = App.state.session;
      if (!s) { App.switchView('decks'); return; }
      var count = s.ratings.length;
      var good = s.ratings.filter(function (r) { return r === 'good' || r === 'easy'; }).length;
      var stats = {
        count: count,
        accuracy: count ? Math.round(good / count * 100) : 0,
        ms: s.durations.reduce(function (a, b) { return a + b; }, 0)
      };
      App.render.renderSessionEnd(stats);
      App.state.session = null;
      App.render.renderAll();
      App.switchView('session-end');
    },

    exit: function () {
      App.state.session = null;
      App.tts.cancel();
      App.switchView('decks');
    }
  };

  /* ---------- boot ---------- */
  /* بذور العرض التجريبي: تُحمَّل ديناميكياً فقط عند ?demo=1 — الإنتاج يبدأ فارغاً 100% */
  function maybeSeedDemo() {
    if (location.search.indexOf('demo=1') < 0) return Promise.resolve();
    return new Promise(function (resolve) {
      var s = document.createElement('script');
      s.src = 'js/seed-demo.js';
      s.onload = function () {
        (App.store.seedDemo ? App.store.seedDemo() : Promise.resolve()).then(resolve, resolve);
      };
      s.onerror = function () { console.warn('demo seed failed to load'); resolve(); };
      document.head.appendChild(s);
    });
  }

  /* ── تنظيف بذور النسخة القديمة: متصفحات جرّبت بنيات سابقة ما زالت تحمل بياناتها
     (Ephemeral / Resilient / Closure + قسم "مصطلحات إنجليزية"). نحذف الأقسام المطابقة
     نهائياً (بطاقاتها + مراجعاتها) — لا يمس بيانات المستخدم الحقيقية أبداً ── */
  function cleanupLegacySeeds() {
    var SIG = ['ephemeral', 'resilient', 'closure'];
    var seedCardIds = {}, seedDeckIds = {};
    (App.state.cards || []).forEach(function (c) {
      var f = String(c.front || '').trim().toLowerCase();
      if (SIG.indexOf(f) >= 0) { seedCardIds[c.id] = 1; if (c.deckId) seedDeckIds[c.deckId] = 1; }
    });
    (App.state.decks || []).forEach(function (d) {
      if (/مصطلحات إنجليزية/.test(d.name || '')) seedDeckIds[d.id] = 1;
    });
    var ids = Object.keys(seedDeckIds);
    if (!ids.length) return Promise.resolve();
    return Promise.all(ids.map(function (id) { return App.store.purgeDeck(id); })).then(function () {
      App.state.decks = (App.state.decks || []).filter(function (d) { return !seedDeckIds[d.id]; });
      App.state.cards = (App.state.cards || []).filter(function (c) { return !seedDeckIds[c.deckId]; });
      App.state.reviews = (App.state.reviews || []).filter(function (r) { return !seedCardIds[r.cardId]; });
      console.info('[flashki] legacy seed data purged:', ids.length, 'deck(s)');
      U.toast(App.t('oldDataCleaned'), 'success');
    });
  }

  function boot() {
    App.i18n.ready.then(function () {
      /* تطبيق فوري من كاش localStorage قبل فتح قاعدة البيانات — لغة المستخدم تظهر مباشرة بلا وميض عربي */
      var cached = null;
      try { cached = localStorage.getItem('flashki.ui'); } catch (e) {}
      if (cached && App.util.uiLangInfo(cached).code === cached && cached !== 'ar') App.i18n.applyLang(cached);
      return App.db.open();
    })
      .then(function () { return maybeSeedDemo(); })
      .then(function () { return App.store.getSettings(); })
      .then(function (settings) {
        App.state.settings = settings;
        /* شفاء النماذج المتوقفة (حسابات جديدة 2026): 2.5/2.0 ترجع 404 */
        if (settings.model && App.ai.isDeadModel && App.ai.isDeadModel(settings.model)) {
          settings.model = '';
          App.store.saveSettings(settings);
        }
      })
      .then(function () { return App.store.getProfile(); })
      .then(function (profile) {
        App.state.profile = profile;
        App.state.settings.cefrLevel = profile.cefrLevel || App.state.settings.cefrLevel || 'B1';
      })
      .then(function () {
        return Promise.all([App.store.getDecks(), App.store.getCards(), App.store.getReviews(), App.store.getNewIntro()]);
      })
      .then(function (r) {
        App.state.decks = r[0];
        App.state.cards = r[1];
        App.state.reviews = r[2];
        App.state.newIntro = r[3];
      })
      .then(function () { return cleanupLegacySeeds(); })
      .then(function () {
        App.handlers.applyTheme();
        App.i18n.applyLang(App.state.settings.lang || 'ar');
        if (App.state.settings.aiCount) App.state.aiOptions.count = App.state.settings.aiCount;
        App.render.renderAll();
        App.handlers.init();
        App.tts.loadVoices();
        App.switchView('home');
        /* Onboarding أول مرة فقط */
        if (!App.state.profile.onboardingCompletedAt) {
          setTimeout(function () { App.handlers.openOnboarding(); }, 350);
        }
      })
      .catch(function (e) {
        console.error('boot failed', e);
        var b = document.getElementById('jsErrorBanner');
        if (b) { b.style.display = 'block'; b.textContent = 'Boot error: ' + (e && e.message ? e.message : e); }
      });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
