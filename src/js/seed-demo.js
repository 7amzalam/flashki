/* Flashki — seed-demo.js : بذور العرض التجريبي فقط.
   ⚠️ هذا الملف غير مُحمَّل في الإنتاج إطلاقاً — app.js يحقنه ديناميكياً فقط عند وجود ?demo=1 في URL.
   الغرض: عرض التطبيق بأمثلة سريعة (مثلاً لقطة شاشة أو معاينة للصديق) — ثم يُمحى بـ wipe.
   المحتوى عمداً مختلف عن أي بيانات إنتاجية: ألمانية للمتحدث بالعربية، موسومة "Demo". */
(function () {
  'use strict';
  var App = window.App = window.App || {};

  App.store.seedDemo = function () {
    return App.db.kvGet('demoSeeded').then(function (done) {
      if (done) return;
      var now = Date.now();
      var D1 = { id: 'demo-deck-de-vocab', name: 'الألمانية · مفردات (Demo)', desc: 'بيانات تجريبية — احذفها من السلة', icon: '🧪', color: '#8b5cf6', createdAt: now - 20000 };
      var D2 = { id: 'demo-deck-de-phrases', name: 'الألمانية · عبارات (Demo)', desc: 'بيانات تجريبية — احذفها من السلة', icon: '💬', color: '#10b981', createdAt: now - 10000 };
      var mk = function (deck, front, back, tags) {
        return { id: App.util.uid(), deckId: deck.id, front: front, back: back, tags: tags || [], srs: App.srs.newState(now), createdAt: now, updatedAt: now };
      };
      var cards = [
        mk(D1, 'die Wohnung', 'الشقة', ['منزل']),
        mk(D1, 'der Apfel', 'التفاحة', ['طعام']),
        mk(D1, 'die Arbeit', 'العمل', ['عمل']),
        mk(D1, 'das Buch', 'الكتاب', ['دراسة']),
        mk(D1, 'die Zeit', 'الوقت', ['عام']),
        mk(D2, 'Wie geht es dir?', 'كيف حالك؟', ['تحية']),
        mk(D2, 'Ich verstehe nicht', 'لا أفهم', ['محادثة']),
        mk(D2, 'Bis später!', 'إلى اللقاء!', ['تحية'])
      ];
      var ops = [App.db.put('decks', D1), App.db.put('decks', D2)]
        .concat(cards.map(function (c) { return App.db.put('cards', c); }));
      return Promise.all(ops).then(function () { return App.db.kvSet('demoSeeded', 1); });
    });
  };
})();
