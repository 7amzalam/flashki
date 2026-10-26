/* Flashki — i18n.js : dictionaries live in i18n/*.json — 8 UI languages
   (ar, en, fr, es, de, tr, ur, fa). Boot waits for App.i18n.ready.
   ur/fa = RTL. A tiny emergency dict keeps the app usable if files fail to load. */
(function () {
  'use strict';
  var App = window.App = window.App || {};

  var EMERGENCY = {
    brandTag: 'Flashki', navHome: 'الرئيسية', navReview: 'مراجعة', navBrowse: 'تصفح', navSearch: 'بحث',
    navStats: 'الإحصائيات', navAdd: 'إضافة', navSettings: 'الإعدادات', pageHome: 'بطاقاتي',
    noCardsYet: 'لا توجد بطاقات بعد', save: 'حفظ', cancel: 'إلغاء', delete: 'حذف'
  };

  var UI_CODES = ['ar', 'en', 'fr', 'es', 'de', 'tr', 'ur', 'fa'];
  var dicts = {};
  UI_CODES.forEach(function (c) { dicts[c] = {}; });
  var readyResolve = null;
  var ready = new Promise(function (res) { readyResolve = res; });

  function loadJson(code) {
    return fetch('i18n/' + code + '.json').then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (json) { dicts[code] = json || {}; })
      .catch(function (e) { console.warn('i18n: failed to load ' + code + '.json — falling back', e); });
  }

  Promise.all(UI_CODES.map(loadJson)).then(function () { readyResolve(); });

  function dict() {
    var lang = App.state && App.state.lang;
    if (lang && dicts[lang] && Object.keys(dicts[lang]).length) return dicts[lang];
    if (dicts.ar._loaded || Object.keys(dicts.ar).length) return dicts.ar;
    return EMERGENCY;
  }

  function t(key) {
    var d = dict();
    if (d[key] != null) return d[key];
    /* سلسلة احتياط: اللغة الحالية → عربي → إنجليزي → طوارئ → اسم المفتاح */
    for (var i = 0; i < UI_CODES.length; i++) {
      var v = dicts[UI_CODES[i]][key];
      if (v != null) return v;
    }
    return (EMERGENCY[key] != null) ? EMERGENCY[key] : key;
  }

  /* template: tf('lblFrontLang', { lang: 'German' }) → replaces {lang} */
  function tf(key, vars) {
    var s = t(key);
    Object.keys(vars || {}).forEach(function (k) { s = s.split('{' + k + '}').join(vars[k]); });
    return s;
  }

  function applyLang(lang) {
    var info = App.util.uiLangInfo(lang); /* لغة غير معروفة → عربي */
    App.state.lang = info.code;
    document.documentElement.lang = info.code;
    document.documentElement.dir = info.dir;
    /* كاش متزامن: الإقلاع التالي يقرأه قبل أول رسم (بلا وميض عربي) + كشف الانتظار */
    try { localStorage.setItem('flashki.ui', info.code); } catch (e) {}
    document.documentElement.classList.remove('boot-wait');
    var title = App.t('appTitle');
    if (title && title !== 'appTitle') document.title = title;
    App.util.qsa('[data-i18n]').forEach(function (el) {
      var k = el.getAttribute('data-i18n');
      if (t(k) !== k) el.innerHTML = t(k);
    });
    App.util.qsa('[data-i18n-html]').forEach(function (el) {
      var k = el.getAttribute('data-i18n-html');
      if (t(k) !== k) el.innerHTML = t(k);
    });
    App.util.qsa('[data-i18n-placeholder]').forEach(function (el) {
      var k = el.getAttribute('data-i18n-placeholder');
      if (t(k) !== k) el.setAttribute('placeholder', t(k));
    });
    App.util.qsa('[data-i18n-title]').forEach(function (el) {
      var k = el.getAttribute('data-i18n-title');
      if (t(k) !== k) {
        el.setAttribute('title', t(k));
        if (el.hasAttribute('aria-label')) el.setAttribute('aria-label', t(k));
      }
    });
    updateTitle(App.state.lastView || 'home');
    if (App.updateAiModeUi) App.updateAiModeUi(); /* مزامنة وضع بطاقات/قصة بعد تغيير لغة الواجهة */
  }

  function updateTitle(view) {
    var keyMap = { home: 'pageHome', decks: 'pageDecks', study: 'pageStudy', browse: 'pageBrowse', search: 'pageSearch', stats: 'pageStats', add: 'pageAdd', settings: 'pageSettings', 'session-end': 'pageSessionEnd' };
    var key = keyMap[view] || 'pageHome';
    var el = App.util.getEl('pageTitle');
    if (el) el.innerHTML = t(key);
  }

  App.i18n = { t: t, tf: tf, applyLang: applyLang, updateTitle: updateTitle, ready: ready, dicts: dicts, UI_CODES: UI_CODES };
  App.t = t;
  App.tf = tf;
})();
