/* ═══════════════════════════════════════════════════════════════════
   platform-android.js — طبقة التكامل مع غلاف أندرويد الأصلي
   تُحمَّل قبل app.js وتعمل فقط داخل التطبيق الأصلي (window.FlashkiAndroid).
   على سطح المكتب والويب لا تفعل شيئاً.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var NA = window.FlashkiAndroid;
  if (!NA) return; /* ليس داخل غلاف أندرويد */

  if (window.App) App.platform = 'android';

  /* ─── زر الرجوع الأصلي ─────────────────────────────────────────────
     يعيد true إن عالج الرجوع (أغلق نافذة/عاد لعرض سابق) وإلا false
     فيتعامل معه النظام (إلى الخلفية). الحالة تُدفع للسطح الأصلي كي
     يقرر onBackPressed فوراً دون انتظار جولة JS. */

  function popoverEl() { return document.getElementById('storyWordPopover'); }
  function popoverOpen() {
    var p = popoverEl();
    return !!(p && p.style.display && p.style.display !== 'none');
  }
  function modalOpen() { return !!document.querySelector('.modal-overlay.show'); }
  function currentView() { return (App.state && App.state.lastView) || 'home'; }

  function computeBack() {
    if (popoverOpen() || modalOpen()) return true;
    return currentView() !== 'home';
  }
  function pushBack() {
    try { NA.setBackEnabled(computeBack()); } catch (e) {}
  }

  window.__fkBack = function () {
    try {
      if (popoverOpen()) {
        var p = popoverEl();
        p.style.display = 'none';
        if (App && App.handlers && App.handlers.hideStoryWordPopover) App.handlers.hideStoryWordPopover();
        return true;
      }
      if (modalOpen()) {
        var m = document.querySelector('.modal-overlay.show');
        if (m) m.classList.remove('show');
        return true;
      }
      if (currentView() !== 'home') { App.switchView('home'); return true; }
    } catch (e) {}
    return false;
  };

  /* ─── مراقبة تغيرات الواجهة ودفع حالة الرجوع + الشاشة المضاءة ─── */
  function hookLater() {
    if (!(window.App && App.switchView)) { setTimeout(hookLater, 60); return; }

    var origSwitch = App.switchView;
    App.switchView = function (view) {
      var r = origSwitch.apply(this, arguments);
      try {
        NA.setKeepScreenOn(view === 'study' || view === 'session-end');
      } catch (e) {}
      setTimeout(pushBack, 0);
      return r;
    };

    /* النوافذ المنبثقة والقوائم: مراقبة خفيفة على عناصر محددة */
    var mo = new MutationObserver(function () { pushBack(); });
    function watch() {
      var p = popoverEl();
      if (p) mo.observe(p, { attributes: true, attributeFilter: ['style'] });
      document.querySelectorAll('.modal-overlay').forEach(function (m) {
        mo.observe(m, { attributes: true, attributeFilter: ['class'] });
      });
      pushBack();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch);
    else watch();
    setTimeout(watch, 1200); /* التقاط أي عناصر تنشأ متأخراً */
  }
  hookLater();

  /* ─── HTTP أصلي بلا CORS (طلبات Gemini) ─────────────────────────────
     الويب فيو يحجب أحياناً preflight لطلبات fetch من الأصل الوهمي فيظهر
     "Failed to fetch" والشبكة سليمة — مرور الطلب عبر HttpURLConnection
     الأصلي يتجاوز CORS حتماً. ai.js يستخدم App.androidHttp.post عند توفره.
     البروتوكول: __fkHttpDone(id, status, body) — status>=400 = خطأ HTTP
     بنصه الكامل، status=-1 = فشل شبكة. */
  var httpPending = {};
  window.__fkHttpDone = function (id, status, body) {
    var p = httpPending[id];
    if (!p) return;
    delete httpPending[id];
    clearTimeout(p.timer);
    if (typeof status === 'number' && status >= 200 && status < 400) p.resolve({ status: status, body: body });
    else p.reject({ status: status, body: body });
  };
  App.androidHttp = {
    post: function (url, jsonBody) {
      if (typeof NA.httpPost !== 'function') return null;
      return new Promise(function (resolve, reject) {
        var id = 'h' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
        httpPending[id] = {
          resolve: resolve,
          reject: reject,
          timer: setTimeout(function () {
            delete httpPending[id];
            reject({ status: -1, body: 'timeout' });
          }, 170000)
        };
        try { NA.httpPost(url, jsonBody, id); }
        catch (e) {
          clearTimeout(httpPending[id].timer);
          delete httpPending[id];
          reject({ status: -1, body: String(e) });
        }
      });
    }
  };

  /* ─── أذونات النظام (ميكروفون / إشعارات) عبر الجسر الأصلي ───────────
     __fkPermDone(id, granted) يعود من الأصل بعد رد المستخدم على حوار الإذن */
  var permPending = {};
  window.__fkPermDone = function (id, granted) {
    var f = permPending[id];
    if (!f) return;
    delete permPending[id];
    try { f(!!granted); } catch (e) {}
  };
  function requestSysPerm(bridgeMethod, timeoutMs) {
    return new Promise(function (resolve) {
      if (typeof NA[bridgeMethod] !== 'function') return resolve(true);
      var id = 'p' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
      permPending[id] = resolve;
      try { NA[bridgeMethod](id); } catch (e) { delete permPending[id]; resolve(false); }
      setTimeout(function () {
        if (permPending[id]) { delete permPending[id]; resolve(false); }
      }, timeoutMs || 25000);
    });
  }
  App.androidPerms = {
    mic: function () { return requestSysPerm('ensureMicPermission'); },
    notif: function () { return requestSysPerm('ensureNotifPermission'); }
  };

  /* ─── إشعارات المراجعة: مزامنة حالة البطاقات مع طبقة المنبهات الأصلية ──
     تحسب: عدد المستحق الآن + أقرب استحقاق قادم + آخر فتح — ثم تبرمج منبه
     الاستحقاق (نصه يُبنى هنا بلغة المستخدم) وتترك الفحص اليومي المسائي
     للأصل. تستدعى عند الإقلاع ونهاية كل جلسة مراجعة (بتقريع 30 ثانية). */
  var lastSync = 0;
  var syncTimer = null;
  function computeDueStats() {
    var now = Date.now();
    var due = 0, nextTs = 0;
    var cards = (App.state && App.state.cards) || [];
    for (var i = 0; i < cards.length; i++) {
      var c = cards[i];
      if (!c || c.deletedAt || !c.srs) continue;
      if (c.srs.status === 'new' || !c.srs.due) continue;
      if (c.srs.due <= now) due++;
      else if (!nextTs || c.srs.due < nextTs) nextTs = c.srs.due;
    }
    return { due: due, next: nextTs };
  }
  /* نصوص إشعارات الفحص المسائي — تُخزن في الطبقة الأصلية لأن المنبه قد
     يطلق والتطبيق مغلق، فلا يمكن قراءة i18n حينها. تُرسل بلغة الواجهة
     الحالية عند المزامنة وعند كل تبديل لغة (من applyLang). */
  function sendReminderTexts() {
    try {
      if (typeof NA.saveReminderTexts !== 'function') return;
      NA.saveReminderTexts(JSON.stringify({
        channel:    App.t('notifChannel'),
        dueTitle:   App.t('notifDueTitle'),
        dueText:    App.t('notifDueText'),
        awayTitle:  App.t('notifAwayTitle'),
        awayText:   App.t('notifAwayText'),
        forgotTitle: App.t('notifForgotTitle'),
        forgotText: App.t('notifForgotText') /* {n} يعوّضه الأصلي بعدّاد وقت الإطلاق */
      }));
    } catch (e) {}
  }
  App.sendReminderTexts = sendReminderTexts;
  function syncReminders() {
    try {
      if (typeof NA.updateReminderState !== 'function') return;
      var st = computeDueStats();
      NA.updateReminderState(st.due, st.next, Date.now());
      sendReminderTexts();
      var enabled = !App.state.settings || App.state.settings.notifications !== false;
      if (!enabled) { if (typeof NA.cancelDueAlarm === 'function') NA.cancelDueAlarm(); return; }
      var now = Date.now();
      if (st.next && st.next - now < 7 * 24 * 60 * 60 * 1000) {
        /* نص المنبه بلغة المستخدم — يُمرر جاهزاً للأصل */
        var count = st.due;
        var title = App.t('notifDueTitle');
        var text = (count > 0 ? App.t('notifDueTextCount').replace('{n}', App.util.fmtInt(count))
                              : App.t('notifDueText'));
        NA.scheduleDueAlarm(st.next + 60000, title, text);
      } else if (typeof NA.cancelDueAlarm === 'function') {
        NA.cancelDueAlarm();
      }
    } catch (e) {}
  }
  App.syncReminders = function (force) {
    var now = Date.now();
    if (!force && now - lastSync < 30000) {
      if (!syncTimer) syncTimer = setTimeout(function () { syncTimer = null; App.syncReminders(true); }, 30000);
      return;
    }
    lastSync = now;
    syncReminders();
  };
  App.setNotificationsEnabled = function (enabled) {
    try {
      App.state.settings.notifications = !!enabled;
      App.store.saveSettings(App.state.settings);
      if (typeof NA.setNotificationsEnabled === 'function') NA.setNotificationsEnabled(!!enabled);
      if (enabled) App.syncReminders(true);
      else if (typeof NA.cancelDueAlarm === 'function') NA.cancelDueAlarm();
    } catch (e) {}
  };
  /* طلب إذن الإشعارات عند الإقلاع إن كانت مفعّلة (افتراضيها مفعّلة) */
  setTimeout(function () {
    try {
      var on = !App.state.settings || App.state.settings.notifications !== false;
      if (on) requestSysPerm('ensureNotifPermission');
      App.syncReminders(true);
    } catch (e) {}
  }, 2500);


  /* ─── تحسينات لمس ────────────────────────────────────────────────── */
  /* منع قائمة التحديد الطويلة على أزرار الواجهة (يبقى فعالاً على نص القصص والكلمات) */
  document.addEventListener('contextmenu', function (e) {
    var t = e.target;
    if (t && (t.closest('button, .nav-item, .bottom-nav-item, .deck-card, .btn-primary, .fx-srs-btn'))) {
      e.preventDefault();
    }
  }, true);

  /* نص القصة قابل للنقر — إلغاء التحديد المزدوج المزعج عليه */
  var style = document.createElement('style');
  style.textContent =
    'html{-webkit-tap-highlight-color:rgba(139,92,246,0.25)}' +
    'button,.btn-primary,.btn-ghost,.nav-item,.bottom-nav-item,.fx-srs-btn,.story-word,.story-text-word{touch-action:manipulation;-webkit-user-select:none;user-select:none}' +
    '.story-text{-webkit-user-select:text;user-select:text}';
  (document.head || document.documentElement).appendChild(style);

  console.log('[Flashki] android platform layer active — v' + (typeof NA.getAppInfo === 'function' ? 'ok' : '?'));
})();
