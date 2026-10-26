/* Flashki — util.js : helpers shared by all modules */
(function () {
  'use strict';
  var App = window.App = window.App || {};

  function getEl(id) { return document.getElementById(id); }
  function qsa(sel, root) { return (root || document).querySelectorAll(sel); }
  function qs(sel, root) { return (root || document).querySelector(sel); }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  function fmtInt(n) {
    // أرقام لاتينية 0-9 في كل اللغات (بما فيها العربية) — لا أرقام هندية ٠١٢٣
    try { return Number(n || 0).toLocaleString('en-US'); }
    catch (e) { return String(n || 0); }
  }

  function fmtTime(ms) {
    var t = Math.max(0, Math.round(ms / 1000));
    var m = Math.floor(t / 60), s = t % 60;
    return m + ':' + String(s).padStart(2, '0');
  }

  function todayKey(ts) {
    var d = new Date(ts || Date.now());
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function dayDiff(a, b) { // a,b = 'YYYY-MM-DD' → whole days
    var da = new Date(a + 'T12:00:00'), db = new Date(b + 'T12:00:00');
    return Math.round((db - da) / 86400000);
  }

  var toastTimer = null;
  function toast(msg, type, duration) {
    var el = getEl('toast');
    if (!el) { return; }
    el.textContent = msg;
    el.style.borderColor = type === 'error' ? 'rgba(239,68,68,0.55)' : (type === 'success' ? 'rgba(16,185,129,0.55)' : (type === 'warn' ? 'rgba(245,158,11,0.6)' : ''));
    el.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, duration || 2800);
  }

  function uid() {
    return 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function debounce(fn, ms) {
    var t = null;
    return function () {
      var args = arguments, self = this;
      if (t) clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms || 250);
    };
  }

  function ringSvg(pct, color) {
    var C = 106.8;
    var p = Math.max(0, Math.min(100, Math.round(pct || 0)));
    var off = (C * (1 - p / 100)).toFixed(1);
    return '<svg viewBox="0 0 40 40"><circle class="ring-bg" cx="20" cy="20" r="17"/>' +
      '<circle class="ring-fg" cx="20" cy="20" r="17" stroke-dasharray="' + C + '" stroke-dashoffset="' + off + '" style="stroke:' + color + '"/></svg><span>' + p + '%</span>';
  }

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  function blobToDataURL(blob) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { res(r.result); };
      r.onerror = rej;
      r.readAsDataURL(blob);
    });
  }

  function dataURLToBlob(dataURL) {
    try {
      var parts = dataURL.split(',');
      var mime = (parts[0].match(/data:(.*?);/) || [])[1] || 'audio/webm';
      var bin = atob(parts[1]);
      var buf = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
      return new Blob([buf], { type: mime });
    } catch (e) { return null; }
  }

  /* ═════════ اللغات المدعومة + كشف اللغة التلقائي + CEFR ═════════
     كل اسم لغة متوفر بثماني لغات الواجهة (ar/en/fr/es/de/tr/ur/fa) — لا نص إنجليزي/عربي ثابت */
  var LANGS = {
    ar: { ar: 'العربية', en: 'Arabic', fr: 'arabe', es: 'árabe', de: 'Arabisch', tr: 'Arapça', ur: 'عربی', fa: 'عربی', flag: '🇸🇦' },
    en: { ar: 'الإنجليزية', en: 'English', fr: 'anglais', es: 'inglés', de: 'Englisch', tr: 'İngilizce', ur: 'انگریزی', fa: 'انگلیسی', flag: '🇬🇧' },
    fr: { ar: 'الفرنسية', en: 'French', fr: 'français', es: 'francés', de: 'Französisch', tr: 'Fransızca', ur: 'فرانسیسی', fa: 'فرانسوی', flag: '🇫🇷' },
    es: { ar: 'الإسبانية', en: 'Spanish', fr: 'espagnol', es: 'español', de: 'Spanisch', tr: 'İspanyolca', ur: 'ہسپانوی', fa: 'اسپانیایی', flag: '🇪🇸' },
    de: { ar: 'الألمانية', en: 'German', fr: 'allemand', es: 'alemán', de: 'Deutsch', tr: 'Almanca', ur: 'جرمن', fa: 'آلمانی', flag: '🇩🇪' },
    tr: { ar: 'التركية', en: 'Turkish', fr: 'turc', es: 'turco', de: 'Türkisch', tr: 'Türkçe', ur: 'ترکش', fa: 'ترکی', flag: '🇹🇷' },
    ru: { ar: 'الروسية', en: 'Russian', fr: 'russe', es: 'ruso', de: 'Russisch', tr: 'Rusça', ur: 'روسی', fa: 'روسی', flag: '🇷🇺' },
    zh: { ar: 'الصينية', en: 'Chinese', fr: 'chinois', es: 'chino', de: 'Chinesisch', tr: 'Çince', ur: 'چینی', fa: 'چینی', flag: '🇨🇳' },
    ja: { ar: 'اليابانية', en: 'Japanese', fr: 'japonais', es: 'japonés', de: 'Japanisch', tr: 'Japonca', ur: 'جاپانی', fa: 'ژاپنی', flag: '🇯🇵' },
    it: { ar: 'الإيطالية', en: 'Italian', fr: 'italien', es: 'italiano', de: 'Italienisch', tr: 'İtalyanca', ur: 'اطالوی', fa: 'ایتالیایی', flag: '🇮🇹' },
    pt: { ar: 'البرتغالية', en: 'Portuguese', fr: 'portugais', es: 'portugués', de: 'Portugiesisch', tr: 'Portekizce', ur: 'پرتگالی', fa: 'پرتغالی', flag: '🇵🇹' }
  };

  /* لغات الواجهة الثماني (ملفات i18n كاملة) — ur/fa اتجاهها RTL */
  var UI_LANGS = [
    { code: 'ar', native: 'العربية', dir: 'rtl' },
    { code: 'en', native: 'English', dir: 'ltr' },
    { code: 'fr', native: 'Français', dir: 'ltr' },
    { code: 'es', native: 'Español', dir: 'ltr' },
    { code: 'de', native: 'Deutsch', dir: 'ltr' },
    { code: 'tr', native: 'Türkçe', dir: 'ltr' },
    { code: 'ur', native: 'اردو', dir: 'rtl' },
    { code: 'fa', native: 'فارسی', dir: 'rtl' }
  ];

  /* كشف Unicode — أول مطابقة تفوز. Latin وحدها غامضة → null (تُحل بالسياق) */
  function detectTextLang(text) {
    var s = String(text || '');
    if (/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(s)) return 'ar';
    if (/[\u0400-\u04FF]/.test(s)) return 'ru';
    if (/[\u4E00-\u9FFF]/.test(s)) return 'zh';
    if (/[\u3040-\u30FF]/.test(s)) return 'ja';
    if (/[\uAC00-\uD7AF]/.test(s)) return 'ko';
    if (/[A-Za-z\u00C0-\u024F]/.test(s)) return null; /* لاتيني — يحتاج سياق (target/native) */
    return null;
  }

  function uiLangInfo(code) {
    for (var i = 0; i < UI_LANGS.length; i++) if (UI_LANGS[i].code === code) return UI_LANGS[i];
    return UI_LANGS[0];
  }

  function langName(code, uiLang) {
    var L = LANGS[code];
    if (!L) return code || '';
    if (uiLang && L[uiLang]) return L[uiLang];
    return L.en; /* fallback آمن */
  }

  var CEFR_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  function cefrDistance(cardCefr, userCefr) {
    var ci = CEFR_ORDER.indexOf(cardCefr || userCefr || 'B1');
    var ui = CEFR_ORDER.indexOf(userCefr || 'B1');
    if (ci < 0) ci = ui;
    if (ui < 0) ui = 2;
    return Math.abs(ci - ui);
  }

  App.util = {
    getEl: getEl, qsa: qsa, qs: qs, esc: esc, escRe: escRe, fmtInt: fmtInt, fmtTime: fmtTime,
    todayKey: todayKey, dayDiff: dayDiff, toast: toast, uid: uid, debounce: debounce,
    ringSvg: ringSvg, shuffle: shuffle, blobToDataURL: blobToDataURL, dataURLToBlob: dataURLToBlob,
    LANGS: LANGS, UI_LANGS: UI_LANGS, uiLangInfo: uiLangInfo, detectTextLang: detectTextLang, langName: langName,
    CEFR_ORDER: CEFR_ORDER, cefrDistance: cefrDistance
  };
})();
