/* Flashki — precache.js : التوليد المسبق لأصوات Edge TTS في الخلفية
   ─ المشكلة: عند التعلم كان ضغط زر الاستماع ينتظر رحلة ذهاب/إياب للسيرفر كل مرة
   ─ الحل: بمجرد إنشاء بطاقة/قصة يُولَّد صوتها في الخلفية ويُخزَّن في جدول audio_cache
     فعند التعلم يُشغَّل فوراً من الكاش بلا أي انتظار
   ─ الأولوية: البطاقة الجديدة وصوت القصة الكامل يقفزان للمقدمة؛ ملء الناقص عند الإقلاع في الخلف
   ─ الطلبات متتالية مع مهلة لطيفة بينها — Edge TTS مجاني وغير محدود */
(function () {
  'use strict';
  var App = window.App = window.App || {};
  var U = App.util;

  var queue = [];        /* {key, kind, refId, text, voice} */
  var queued = {};       /* key → true — منع التكرار داخل القائمة */
  var running = false;
  var nDone = 0, nFail = 0, nFresh = 0; /* fresh = وُلِّد فعلاً (لم يكن مخزناً) */
  var delayTimer = null;
  var bootDone = false;

  function enabled() {
    return !!(App.state && App.state.settings && App.state.settings.ttsPrecache !== false);
  }

  /* لغة النص: lang على البطاقة يفوز ← كشف Unicode ← لغة الوجه (أمامي=هدف، خلفي=أم) */
  function langFor(text, side, card) {
    if (card && card.lang) return card.lang;
    var d = U.detectTextLang ? U.detectTextLang(text) : null;
    if (d) return d;
    var p = App.state.profile || {};
    if (side === 'back') return p.nativeLang || 'ar';
    return p.targetLang || 'en';
  }

  function makeJob(kind, refId, text, side, card, prio) {
    var t = String(text || '').trim();
    if (!t || t.length > 10000) return null;
    var voice = App.tts.voiceFor(langFor(t, side, card));
    var key = App.tts.cacheKeyFor(t, voice);
    if (!key) return null;
    return { key: key, kind: kind, refId: refId || null, text: t, voice: voice, prio: !!prio };
  }

  function enqueue(kind, refId, text, side, card, prio) {
    if (!enabled()) return;
    var job = makeJob(kind, refId, text, side, card, prio);
    if (!job || queued[job.key]) return;
    queued[job.key] = true;
    if (job.prio) queue.unshift(job); else queue.push(job);
    pump();
  }

  /* بطاقة كاملة: الوجه الأول (أولوية) ← الوجه الثاني ← جملة المثال */
  function enqueueCard(card, prio) {
    if (!card || !App.tts) return;
    var p = prio !== false; /* افتراضياً أولوية */
    enqueue('card', card.id, card.front, 'front', card, p);
    enqueue('card', card.id, card.back, 'back', card, false);
    enqueue('card', card.id, card.example, 'front', card, false);
  }

  /* قصة كاملة: النص الكامل أولاً (أولوية) ثم كلمات المفردات المهمة واحدة واحدة */
  function enqueueStory(story, prio) {
    if (!story) return;
    var sid = story.id || 'last';
    enqueue('story', sid, story.story, 'front', null, prio !== false);
    var vocab = story.vocabulary || [];
    for (var i = 0; i < vocab.length; i++) {
      if (vocab[i] && vocab[i].word) enqueue('word', sid, vocab[i].word, 'front', null, false);
    }
  }

  function pump() {
    if (delayTimer) { clearTimeout(delayTimer); delayTimer = null; }
    if (running || !queue.length || !enabled()) { notifyUi(); return; }
    running = true;
    var job = queue.shift();
    App.tts.ensureCached(job.text, job.voice, job.kind, job.refId).then(function (res) {
      nDone++;
      if (res && res.cached === false) nFresh++;
    }).catch(function () {
      nFail++; /* فشل عابر — يُعاد في الإقلاع القادم */
    }).then(function () {
      delete queued[job.key];
      running = false;
      notifyUi();
      if (queue.length && enabled()) delayTimer = setTimeout(pump, 350);
    });
  }

  function stat() {
    return { pending: queue.length, done: nDone, fresh: nFresh, failed: nFail, running: running, booted: bootDone };
  }

  /* سطر الحالة في الإعدادات — إن كان العنصر ظاهراً */
  function notifyUi() {
    var el = document.getElementById('precacheStatusText');
    if (!el) return;
    var s = stat();
    if (s.pending > 0) {
      el.textContent = '⏳ ' + (App.tf ? App.tf('precacheWorking', { n: U.fmtInt ? U.fmtInt(s.pending) : s.pending }) : ('جاري التوليد المسبق: ' + s.pending));
    } else if (s.done > 0) {
      el.textContent = '✓ ' + (App.tf ? App.tf('precacheReady', { n: U.fmtInt ? U.fmtInt(s.done) : s.done }) : ('الأصوات جاهزة: ' + s.done));
    } else {
      el.textContent = '';
    }
  }

  /* مسح شامل: كل البطاقات غير المحذوفة + القصة الأخيرة — يملأ ما ينقصه في الخلف */
  function scanAndQueue() {
    if (!App.state) return;
    var cards = (App.state.cards || []).filter(function (c) { return !c.deletedAt; });
    cards.forEach(function (c) { enqueueCard(c, false); });
    try {
      var st = JSON.parse(localStorage.getItem('flashki_last_story') || 'null');
      if (st && st.story) enqueueStory(st, false);
    } catch (e) {}
    bootDone = true;
    notifyUi();
  }

  function boot() {
    /* مهلة 4 ثوانٍ بعد الإقلاع: لا تنافس تحميل الواجهة ولا جلسة الدراسة الأولى */
    setTimeout(function () {
      if (enabled()) scanAndQueue();
      else bootDone = true;
    }, 4000);
  }

  /* بعد المسح النهائي أو تغيير الإعداد — تفريغ فوري */
  function reset() {
    if (delayTimer) { clearTimeout(delayTimer); delayTimer = null; }
    queue = [];
    queued = {};
    running = false;
    nDone = 0; nFail = 0; nFresh = 0;
    notifyUi();
  }

  App.precache = {
    boot: boot, scanAndQueue: scanAndQueue, reset: reset,
    enqueueCard: enqueueCard, enqueueStory: enqueueStory, stat: stat, notifyUi: notifyUi
  };
})();
