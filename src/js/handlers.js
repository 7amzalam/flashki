/* Flashki — handlers.js : all user interaction wiring (event delegation) */
(function () {
  'use strict';
  var App = window.App = window.App || {};
  var U = App.util;
  var D = App.db;

  function getEl(id) { return U.getEl(id); }

  function showModal(id) { getEl(id).classList.add('show'); }
  function closeModal(el) {
    if (typeof el === 'string') el = getEl(el);
    if (el && el.classList) {
      el.classList.remove('show');
      if (el.id === 'storyResultModal') {
        if (App.tts && App.tts.cancel) App.tts.cancel();
        if (typeof hideStoryWordPopover === 'function') hideStoryWordPopover();
      }
      if (el.id === 'createDeckModal') {
        var ds = getEl('deckSelect');
        if (ds && ds.value === '__new__') {
          ds.value = App.state.decks.length ? App.state.decks[0].id : '';
        }
      }
    }
  }

  /* ---------- deck editing (v1.1) ---------- */
  function openEditDeck(id) {
    var d = App.render.deckById(id);
    if (!d) return;
    App.state.editingDeckId = id;
    getEl('editDeckName').value = d.name;
    getEl('editDeckDesc').value = d.desc || '';
    App.render.renderEmojiRow(d.icon || '📚', 'emojiRow');
    App.render.renderColorRow(d.color || App.store.DECK_COLORS[0], 'colorRowEdit');
    showModal('editDeckModal');
  }

  function confirmSaveDeck() {
    var d = App.render.deckById(App.state.editingDeckId);
    if (!d) return;
    var name = getEl('editDeckName').value.trim();
    if (!name) { U.toast(App.t('deckNameRequired'), 'error'); return; }
    var emoji = getEl('emojiRow').querySelector('.emoji-opt.selected');
    var sel = getEl('colorRowEdit').querySelector('.color-swatch.selected');
    d.name = name;
    d.desc = getEl('editDeckDesc').value.trim();
    if (emoji) d.icon = emoji.getAttribute('data-emoji');
    if (sel) d.color = sel.getAttribute('data-color');
    d.updatedAt = Date.now();
    App.store.saveDeck(d).then(function () {
      closeModal('editDeckModal');
      U.toast(App.t('deckSaved'), 'success');
      App.render.renderAll();
    });
  }

  function confirmDeleteDeck() {
    var id = App.state.editingDeckId;
    if (!id) return;
    if (!confirm(App.t('confirmDeleteDeck'))) return;
    App.store.deleteDeck(id).then(function () {
      App.state.decks = App.state.decks.filter(function (x) { return x.id !== id; });
      App.state.cards = App.state.cards.filter(function (x) { return x.deckId !== id; });
      closeModal('editDeckModal');
      U.toast(App.t('deckTrashed'), 'success');
      App.render.renderAll();
    });
  }

  /* ---------- deck creation ---------- */
  /* اسم مقترح ديناميكي: "{لغة الهدف بلغة الواجهة} · {كلمة مفردات بلغة الواجهة}"
     مثال: target=de, ui=ar → "الألمانية · مفردات" / target=de, ui=en → "German · Vocabulary" */
  function suggestedDeckName() {
    var p = App.state.profile || { targetLang: 'en' };
    return App.tf('deckSuggestName', { lang: U.langName(p.targetLang, App.state.lang) });
  }

  /* ── حماية فقدان البيانات (خلل حرج): لو لم يوجد قسم ننشئه تلقائياً بالاسم المقترح.
     كانت البطاقات تُدفع للذاكرة بلا deckId وتفشل كتابة SQLite بصمت
     (NOT NULL cards.deck_id) → تظهر بالواجهة ثم تختفي بعد إعادة التشغيل ── */
  function ensureDeck(preferredId) {
    if (preferredId && preferredId !== '__new__') return Promise.resolve(preferredId);
    if (App.state.decks && App.state.decks.length) return Promise.resolve(App.state.decks[0].id);
    var deck = { id: U.uid(), name: suggestedDeckName(), desc: '', icon: '📚', color: App.store.DECK_COLORS[0], createdAt: Date.now() };
    return App.store.saveDeck(deck).then(function () {
      App.state.decks.push(deck);
      App.render.renderAll();
      U.toast(App.tf('autoDeckCreated', { name: deck.name }), 'success');
      return deck.id;
    });
  }

  function openCreateDeck() {
    getEl('newDeckName').value = suggestedDeckName();
    getEl('newDeckDesc').value = '';
    App.render.renderColorRow(App.store.DECK_COLORS[0]);
    showModal('createDeckModal');
    setTimeout(function () { getEl('newDeckName').focus(); getEl('newDeckName').select(); }, 120);
  }

  function confirmCreateDeck() {
    var name = getEl('newDeckName').value.trim();
    if (!name) { U.toast(App.t('deckNameRequired'), 'error'); return; }
    var sel = getEl('colorRow').querySelector('.color-swatch.selected');
    var deck = {
      id: U.uid(), name: name, desc: getEl('newDeckDesc').value.trim(),
      color: sel ? sel.getAttribute('data-color') : App.store.DECK_COLORS[0],
      createdAt: Date.now()
    };
    App.store.saveDeck(deck).then(function () {
      App.state.decks.push(deck);
      closeModal('createDeckModal');
      U.toast(App.t('deckCreated'), 'success');
      App.render.renderAll();
      var ds = getEl('deckSelect');
      if (ds) ds.value = deck.id;
    });
  }

  /* ═════════ إعادة تسمية القسم (من داخل التصفح) ═════════ */
  var renameDeckId = null;
  function openRenameDeck() {
    var f = App.state.browseFilter;
    var deck = null;
    App.state.decks.forEach(function (d) { if (d.id === f) deck = d; });
    if (!deck) return;
    renameDeckId = deck.id;
    getEl('renameDeckInput').value = deck.name;
    showModal('renameDeckModal');
    setTimeout(function () { getEl('renameDeckInput').focus(); getEl('renameDeckInput').select(); }, 120);
  }

  function confirmRenameDeck() {
    var name = (getEl('renameDeckInput').value || '').trim();
    if (!name) { U.toast(App.t('deckNameRequired'), 'error'); return; }
    var deck = null;
    App.state.decks.forEach(function (d) { if (d.id === renameDeckId) deck = d; });
    if (!deck || name === deck.name) { closeModal('renameDeckModal'); return; }
    deck.name = name;
    deck.updatedAt = Date.now();
    App.store.saveDeck(deck).then(function () {
      closeModal('renameDeckModal');
      U.toast(App.t('deckRenamed'), 'success');
      App.render.renderAll();
    }, function (err) {
      U.toast(App.t('saveFailed') + (err && err.message ? ' — ' + err.message : ''), 'error');
    });
  }

  /* ---------- manual card ---------- */
  function parseTags(v) {
    return String(v || '').split(/[,،]/).map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 4);
  }

  /* ═════════ صور البطاقات (v20): رفع → معاينة → حفظ → عرض ═════════
     Desktop: حفظ في {app_data}/images/{card_id}.{ext} عبر أمر Rust، والمسار في عمود image_path.
     المتصفح (معاينة wasm): dataURL في imagePath مباشرة. */
  var pendingImage = null;   /* {dataUrl, b64, ext} — الصورة المختارة قبل الحفظ */
  var imageRemoved = false;  /* وضع التعديل: أزال المستخدم الصورة الموجودة */
  var _imgCache = {};

  function isTauri() { return !!(window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke); }

  function showImagePreview(src) {
    var prev = getEl('cardImagePreview'), img = getEl('cardImageImg'), zone = getEl('cardUploadZone'), up = getEl('imageUploadBtn');
    if (!prev || !img) return;
    img.src = src;
    prev.style.display = 'inline-flex';
    if (zone) zone.style.display = 'none';
    if (up) up.style.display = 'none';
  }

  function resetImageUI() {
    pendingImage = null; imageRemoved = false;
    var prev = getEl('cardImagePreview'); if (prev) prev.style.display = 'none';
    var img = getEl('cardImageImg'); if (img) img.src = '';
    var zone = getEl('cardUploadZone'); if (zone) zone.style.display = '';
    var up = getEl('imageUploadBtn'); if (up) up.style.display = '';
    var inp = getEl('imageFileInput'); if (inp) inp.value = '';
  }

  function pickCardImage(file) {
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp|gif|bmp)$/i.test(file.type)) { U.toast(App.t('imageBadType'), 'error'); return; }
    U.compressImage(file, 1080, 0.82).then(function (res) {
      pendingImage = res;
      imageRemoved = false;
      showImagePreview(res.dataUrl);
      var kb = Math.round((res.approxBytes || 0) / 1024);
      U.toast('✓ تم ضغط الصورة وتجهيزها (' + kb + ' KB)', 'success');
    }).catch(function (err) {
      U.toast('تعذر معالجة الصورة: ' + (err && err.message ? err.message : ''), 'error');
    });
  }

  /* يعيد {path} عند الحفظ، {cleared} عند الإزالة، null عند لا تغيير */
  function persistCardImage(cardId) {
    if (pendingImage) {
      if (!isTauri()) return Promise.resolve({ path: pendingImage.dataUrl }); /* معاينة المتصفح */
      return window.__TAURI__.core.invoke('save_card_image', { cardId: cardId, dataBase64: pendingImage.dataUrl })
        .then(function (rel) { return { path: rel }; })
        .catch(function (e) {
          U.toast(App.t('imageSaveFailed') + (e && e.message ? ' — ' + e.message : ''), 'error', 6000);
          return null; /* البطاقة تُحفظ بلا صورة بدل فشل الحفظ كاملاً */
        });
    }
    if (imageRemoved) return Promise.resolve({ cleared: true });
    return Promise.resolve(null);
  }

  function imagePathToSrc(path) {
    if (!path) return Promise.resolve('');
    if (path.indexOf('data:') === 0) return Promise.resolve(path);
    if (_imgCache[path]) return Promise.resolve(_imgCache[path]);
    if (!isTauri()) return Promise.resolve('');
    return window.__TAURI__.core.invoke('load_card_image', { path: path }).then(function (src) {
      _imgCache[path] = src;
      return src;
    }).catch(function () { return ''; });
  }

  /* ═════════ فحص التحديثات (v20): حالات واضحة — جارٍ / لا تحديثات / متاح / فشل ═════════ */
  function checkAppUpdate() {
    var btn = getEl('checkUpdateBtn'), st = getEl('updateStatus');
    if (!btn) return;
    if (!isTauri()) {
      U.toast(App.t('updateBrowserHint'), 'warn', 5000);
      return;
    }
    var old = btn.textContent;
    btn.disabled = true;
    btn.textContent = App.t('updateChecking');
    if (st) st.textContent = App.t('updateChecking');
    window.__TAURI__.core.invoke('plugin:updater|check').then(function (update) {
      if (update && update.version) {
        var msg = App.t('updateAvailable') + ' — v' + update.version;
        if (st) st.textContent = msg;
        U.toast(msg, 'success', 7000);
      } else {
        if (st) st.textContent = App.t('updateNoUpdates');
        U.toast(App.t('updateNoUpdates'), 'success');
      }
    }).catch(function (e) {
      var msg = (e && (e.message || e)) || '';
      var out = App.t('updateCheckFailed') + (msg ? ' — ' + msg : '');
      if (st) st.textContent = out;
      U.toast(out, 'error', 7000);
    }).then(function () {
      btn.disabled = false;
      btn.textContent = old;
    });
  }

  function saveManualCard() {
    var front = getEl('frontInput').value.trim();
    var back = getEl('backInput').value.trim();
    var example = (getEl('exampleInput') ? getEl('exampleInput').value.trim() : '');
    var exampleTranslation = (getEl('exampleTranslationInput') ? getEl('exampleTranslationInput').value.trim() : '');
    if (!front || !back) { U.toast(App.t('needFrontBack'), 'error'); return; }

    var ds = getEl('deckSelect');
    var rawDeckVal = ds ? ds.value : '';
    if (rawDeckVal === '__new__') {
      openCreateDeck();
      U.toast('يرجى إنشاء القسم أولاً أو اختياره من القائمة', 'info');
      return;
    }
    var deckId = rawDeckVal || (App.state.decks[0] && App.state.decks[0].id);
    var tags = parseTags(getEl('tagsInput').value);
    var cardLang = (App.state.profile && App.state.profile.targetLang) || 'de';
    var cardCefr = (App.state.profile && App.state.profile.cefrLevel) || 'B1';
    var now = Date.now();

    var recF = document.querySelector('.voice-recorder[data-recorder="front"]');
    var getAudioFront = (recF && recF._blob)
      ? (typeof recF._blob === 'string' ? Promise.resolve(recF._blob) : U.blobToDataURL(recF._blob))
      : Promise.resolve(null);

    /* ── وضع التعديل: نفس النموذج + قاعدة تصفير SM-2 ── */
    if (App.state.editingCardId) {
      var c = null;
      App.state.cards.forEach(function (x) { if (x.id === App.state.editingCardId) c = x; });
      if (!c) { exitEditMode(); return; }
      var contentChanged = (c.front !== front) || (c.back !== back);
      ensureDeck(deckId).then(function (resolvedDeckId) {
        return getAudioFront.then(function (audioDataUrl) {
          c.front = front; c.back = back; c.tags = tags; c.deckId = resolvedDeckId;
          c.example = example; c.exampleTranslation = exampleTranslation;
          c.lang = cardLang; c.cefr = cardCefr;
          c.updatedAt = now;
          if (contentChanged) c.srs = App.srs.newState(now); /* تعديل front/back = تصفير؛ الوسوم/الصوت فقط = لا تصفير */
          if (imageRemoved) c.imagePath = null; /* أزال المستخدم الصورة */
          if (recF && recF._blob) {
            c.audioFront = audioDataUrl;
          } else if (recF && !recF._blob && recF.classList.contains('del-clicked')) {
            c.audioFront = null;
          }
          return persistCardImage(c.id).then(function (res) {
            if (res && res.path) c.imagePath = res.path;
            return App.store.saveCard(c);
          }).then(function () {
            U.toast(contentChanged ? App.t('srsReset') : App.t('savedOk'), 'success');
            exitEditMode();
            App.render.renderAll();
          }, function (err) {
            U.toast(App.t('saveFailed') + (err && err.message ? ' — ' + err.message : ''), 'error');
          });
        });
      });
      return;
    }

    ensureDeck(deckId).then(function (resolvedDeckId) {
      return getAudioFront.then(function (audioDataUrl) {
        var card = {
          id: U.uid(),
          deckId: resolvedDeckId,
          front: front,
          back: back,
          example: example,
          exampleTranslation: exampleTranslation,
          tags: tags,
          lang: cardLang,
          cefr: cardCefr,
          srs: App.srs.newState(now),
          createdAt: now,
          updatedAt: now,
          audioFront: audioDataUrl || null,
          audioBack: null
        };
        return persistCardImage(card.id).then(function (res) {
          if (res && res.path) card.imagePath = res.path;
          App.state.cards.push(card);
          return App.store.saveCard(card);
        }).then(function () {
          U.toast(App.t('savedOk'), 'success');
          getEl('frontInput').value = ''; getEl('backInput').value = ''; getEl('tagsInput').value = '';
          if (getEl('exampleInput')) getEl('exampleInput').value = '';
          if (getEl('exampleTranslationInput')) getEl('exampleTranslationInput').value = '';
          if (recF) App.audio.clear(recF);
          resetImageUI();
          updatePreview();
          App.render.renderAll();
        }, function (err) {
          App.state.cards = App.state.cards.filter(function (x) { return x.id !== card.id; });
          App.render.renderAll();
          U.toast(App.t('saveFailed') + (err && err.message ? ' — ' + err.message : ''), 'error');
        });
      });
    });
  }

  function updatePreview() {
    var pv = document.querySelector('.preview-card');
    if (!pv) return;
    var blocks = pv.querySelectorAll('div[style]');
    var qEl = blocks[1], aEl = blocks[3];
    var front = getEl('frontInput').value.trim();
    var back = getEl('backInput').value.trim();
    if (qEl) qEl.textContent = front || App.t('qPreview');
    if (aEl) aEl.textContent = back || App.t('aPreview');
  }

  /* ---------- edit card via the add form (v1.1) ---------- */
  function enterEditMode(card) {
    App.state.editingCardId = card.id;
    App.switchView('add');
    var manualTab = document.querySelector('.add-tab[data-tab="manual"]');
    if (manualTab && !manualTab.classList.contains('active')) manualTab.click();
    getEl('frontInput').value = card.front;
    getEl('backInput').value = card.back;
    if (getEl('exampleInput')) getEl('exampleInput').value = card.example || '';
    if (getEl('exampleTranslationInput')) getEl('exampleTranslationInput').value = card.exampleTranslation || '';
    getEl('tagsInput').value = (card.tags || []).join('، ');
    getEl('deckSelect').value = card.deckId;
    var langSel = getEl('cardLangSelect');
    var cefrSel = getEl('cardCefrSelect');
    if (langSel) langSel.value = card.lang || 'auto';
    if (cefrSel) cefrSel.value = card.cefr || 'auto';
    var recF = document.querySelector('.voice-recorder[data-recorder="front"]');
    var recB = document.querySelector('.voice-recorder[data-recorder="back"]');
    if (recF) App.audio.clear(recF);
    if (recB) App.audio.clear(recB);
    getEl('twoSidedRow').style.display = 'none';
    getEl('cancelEditCardBtn').style.display = '';
    var lbl = getEl('saveCardBtn').querySelector('span');
    if (lbl) lbl.textContent = App.t('saveChanges');
    /* الصورة الحالية (إن وجدت) — تظهر في المعاينة ويمكن إزالتها أو استبدالها */
    resetImageUI();
    if (card.imagePath) {
      imagePathToSrc(card.imagePath).then(function (src) { if (src) showImagePreview(src); });
    }
    updatePreview();
    setTimeout(function () { getEl('frontInput').focus(); }, 160);
  }

  function exitEditMode() {
    App.state.editingCardId = null;
    getEl('frontInput').value = ''; getEl('backInput').value = ''; getEl('tagsInput').value = '';
    if (getEl('exampleInput')) getEl('exampleInput').value = '';
    if (getEl('exampleTranslationInput')) getEl('exampleTranslationInput').value = '';
    getEl('twoSidedRow').style.display = '';
    getEl('cancelEditCardBtn').style.display = 'none';
    var lbl = getEl('saveCardBtn').querySelector('span');
    if (lbl) lbl.textContent = App.t('saveCard');
    var recF = document.querySelector('.voice-recorder[data-recorder="front"]');
    var recB = document.querySelector('.voice-recorder[data-recorder="back"]');
    if (recF) App.audio.clear(recF);
    if (recB) App.audio.clear(recB);
    resetImageUI();
    updatePreview();
  }

  function openEditCard(id) {
    var c = null;
    App.state.cards.forEach(function (x) { if (x.id === id) c = x; });
    if (!c) return;
    enterEditMode(c);
  }

  /* ---------- AI flow ---------- */
  function updateAiCount() {
    var t = getEl('aiText').value;
    getEl('aiCharCount').textContent = U.fmtInt(t.length) + ' / 10,000';
  }

  /* ═════════ وضع AI: بطاقات / قصة ═════════ */
  function setAiMode(mode) {
    App.state.aiMode = (mode === 'story') ? 'story' : 'cards';
    document.querySelectorAll('.ai-mode-opt').forEach(function (o) {
      o.classList.toggle('on', o.getAttribute('data-ai-mode') === App.state.aiMode);
    });
    updateAiModeUi();
  }

  function updateAiModeUi() {
    var story = App.state.aiMode === 'story';
    var opts = getEl('aiOptions');
    if (opts) opts.style.display = story ? 'none' : '';
    var ta = getEl('aiText');
    if (ta) {
      ta.setAttribute('placeholder', App.t(story ? 'storyPh' : 'aiPh'));
      var phKey = ta.getAttribute('data-i18n-placeholder');
      if (phKey) ta.setAttribute('data-i18n-placeholder', story ? 'storyPh' : 'aiPh');
    }
    var hint = getEl('aiHint');
    if (hint) hint.textContent = App.t(story ? 'storyHint' : 'aiHint');
    var label = getEl('generateBtnLabel');
    if (label) label.textContent = App.t(story ? 'generateStory' : 'generateCards');
  }

  function generateAi() {
    var text = getEl('aiText').value.trim();
    if (!text) { U.toast(App.t('aiNeedText'), 'error'); return; }
    if (!App.state.settings.apiKey) { U.toast(App.t('aiNoKey'), 'error'); switchView('settings'); return; }
    if (text.length > 10000) text = text.slice(0, 10000);
    /* عدد البطاقات: 5 / 10 / تلقائي (استخراج غني من النص بالكامل) */
    var count = App.state.aiOptions.count;
    if (count === 'auto') {
      var words = (text.match(/[\p{L}\p{N}]+/gu) || []).length;
      if (words < 25) count = Math.min(words, 6);
      else if (words < 60) count = 10;
      else if (words < 120) count = 14;
      else if (words < 250) count = 18;
      else count = Math.min(25, Math.max(16, Math.ceil(words / 12)));
    }
    var opts = Object.assign({}, App.state.aiOptions, { count: count });
    var btn = getEl('generateBtn');
    btn.disabled = true;
    btn.style.opacity = '0.6';
    getEl('aiCost').textContent = App.t('aiGenerating');
    App.ai.generate(text, opts).then(function (cards) {
      App.state.aiResults = cards.map(function (c) { return { front: c.front, back: c.back, example: c.example, exampleTranslation: c.exampleTranslation, tags: c.tags, cefr: c.cefr, checked: true }; });
      App.state.aiGenInfo = { text: text, prompt: App.lastPrompt || '', count: count };
      aiEditIdx = -1;
      renderAiResults();
      fillAiDeckModal();
      showModal('aiResultModal');
    }).catch(function (e) {
      var m = e && e.message ? String(e.message) : '';
      var msg = (App.ai && App.ai.isBusyError && App.ai.isBusyError(m))
        ? App.t('aiBusy') + (m ? ' — ' + m : '')
        : ((e && e.message) ? App.t('aiFailed') + e.message : App.t('aiFailed'));
      U.toast(msg, 'error', 6000);
    }).then(function () {
      btn.disabled = false;
      btn.style.opacity = '';
      getEl('aiCost').textContent = '';
    });
  }

  /* ═════════ توليد قصة ═════════ */
  function generateStoryAi() {
    var text = getEl('aiText').value.trim();
    if (!text) { U.toast(App.t('aiNeedText'), 'error'); return; }
    if (!App.state.settings.apiKey) { U.toast(App.t('aiNoKey'), 'error'); switchView('settings'); return; }
    if (text.length > 10000) text = text.slice(0, 10000);
    var btn = getEl('generateBtn');
    btn.disabled = true;
    btn.style.opacity = '0.6';
    getEl('aiCost').textContent = App.t('storyGenerating');
    App.ai.generateStory(text).then(function (story) {
      App.state.lastStory = story;
      renderStoryResult(story);
      showModal('storyResultModal');
    }).catch(function (e) {
      var m = e && e.message ? String(e.message) : '';
      var msg = (App.ai && App.ai.isBusyError && App.ai.isBusyError(m))
        ? App.t('aiBusy') + (m ? ' — ' + m : '')
        : ((e && e.message) ? App.t('aiFailed') + e.message : App.t('aiFailed'));
      U.toast(msg, 'error', 6000);
    }).then(function () {
      btn.disabled = false;
      btn.style.opacity = '';
      getEl('aiCost').textContent = '';
    });
  }

  var storyFontSizePct = 100;
  var isStoryPlaying = false;
  var currentSelectedWord = '';
  var currentSelectedSentence = '';
  var currentWordElement = null;

  function formatStoryWithWords(storyText) {
    if (!storyText) return '';
    var paragraphs = String(storyText).split(/\n+/);
    var p = App.state.profile;
    var isTargetRtl = (p && (p.targetLang === 'ar' || p.targetLang === 'ur' || p.targetLang === 'fa'));
    var dir = isTargetRtl ? 'rtl' : 'ltr';
    return paragraphs.map(function (item) {
      var clean = item.trim();
      if (!clean) return '';
      var html = clean.replace(/([\p{L}\p{N}_-]+)/gu, function (match) {
        return '<span class="story-word" data-word="' + U.esc(match) + '">' + U.esc(match) + '</span>';
      });
      return '<p class="story-para" dir="' + dir + '">' + html + '</p>';
    }).join('');
  }

  function applyStoryFontSize() {
    var sz = (19 * storyFontSizePct / 100);
    var targetEl = getEl('storiesViewText');
    if (targetEl) {
      targetEl.style.setProperty('--story-font-size', sz + 'px');
      targetEl.style.fontSize = sz + 'px';
      targetEl.style.lineHeight = (2.0 * Math.max(0.9, storyFontSizePct / 100));
    }
    var trEl = getEl('storiesViewTranslation');
    if (trEl) {
      trEl.style.fontSize = (sz * 0.88) + 'px';
    }
    var modalText = getEl('storyText');
    if (modalText) {
      modalText.style.fontSize = sz + 'px';
      modalText.style.lineHeight = (2.0 * Math.max(0.9, storyFontSizePct / 100));
    }
    document.querySelectorAll('.story-sentence-target').forEach(function (el) {
      el.style.fontSize = sz + 'px';
    });
    document.querySelectorAll('.story-sentence-native').forEach(function (el) {
      el.style.fontSize = (sz * 0.84) + 'px';
    });

    var valEl = getEl('storyFontVal');
    if (valEl) valEl.textContent = storyFontSizePct + '%';
    var valEl2 = getEl('storiesFontPercent');
    if (valEl2) valEl2.textContent = storyFontSizePct + '%';
  }

  function changeStoryFontSize(delta) {
    storyFontSizePct = Math.min(160, Math.max(80, storyFontSizePct + delta));
    applyStoryFontSize();
  }

  function updateStoryTtsBtnState(state) {
    var btns = [getEl('storyTtsBtn'), getEl('storiesTtsBtn')];
    var labels = [getEl('storyTtsBtnText'), getEl('storiesTtsBtnText')];
    btns.forEach(function (btn) {
      if (!btn) return;
      btn.classList.remove('loading', 'speaking');
      if (state === 'loading') btn.classList.add('loading');
      else if (state === 'speaking') btn.classList.add('speaking');
    });
    if (state === 'loading') {
      labels.forEach(function (l) { if (l) l.textContent = App.t('ttsLoading') || 'جاري التحميل...'; });
    } else if (state === 'speaking') {
      labels.forEach(function (l) { if (l) l.textContent = App.t('ttsStop') || 'إيقاف'; });
    } else {
      isStoryPlaying = false;
      labels.forEach(function (l) { if (l) l.textContent = App.t('listen') || 'استمع'; });
    }
  }

  function stopStoryAudio() {
    storySession++; /* يُبطل أي أحداث صوت قديمة قيد الطريق */
    isStoryPlaying = false;
    if (App.tts && App.tts.cancel) App.tts.cancel();
    updateStoryTtsBtnState('idle');
  }

  /* كاش صوت القصة الحالية: إعادة الاستماع فورية من الذاكرة بلا طلب Edge TTS جديد */
  var storyAudioCache = { text: '', blob: null };
  var storySession = 0;

  function toggleStoryAudio() {
    var st = App.state.lastStory;
    if (!st || !st.story) return;

    var fullText = String(st.story).trim();
    if (!fullText) return;

    /* التبديل يعتمد على حالة القصة فقط — isSpeaking العام قد يعلق true في
       WebKitGTK (speechSynthesis.speaking) وكان يحجب إعادة الاستماع نهائياً.
       speak()/playAudioBlob() توقف أي صوت آخر تلقائياً قبل البدء */
    if (isStoryPlaying) { stopStoryAudio(); return; }

    storySession++;
    var mySession = storySession;
    isStoryPlaying = true;
    updateStoryTtsBtnState('loading');

    function onEv(ev) {
      if (mySession !== storySession) return; /* حدث من جلسة أُوقفت — تجاهل */
      if (ev === 'play') {
        updateStoryTtsBtnState('speaking');
      } else if (ev === 'end' || ev === 'error') {
        stopStoryAudio();
      }
    }

    /* إعادة استماع: نفس القصة نصياً → شغّل النسخة المخبأة مباشرة */
    if (storyAudioCache.blob && storyAudioCache.text === fullText) {
      App.tts.playAudioBlob(storyAudioCache.blob, onEv);
      return;
    }

    App.tts.speak(fullText, 'front', onEv, function (blob) {
      if (blob && mySession === storySession) storyAudioCache = { text: fullText, blob: blob };
    });
  }

  function findBestSentencePair(vocabWord, pairs) {
    if (!pairs || !pairs.length || !vocabWord) return null;

    var clean = vocabWord.replace(/^(die|der|das|den|dem|des|ein|eine|einen|einem|einer|the|a|an|le|la|les|un|une|el|los|las)\s+/i, '').trim();
    var stems = new Set([clean]);
    var tokens = clean.split(/[\s\-_/]+/);
    tokens.forEach(function (tok) {
      if (!tok) return;
      stems.add(tok);
      if (tok.length >= 4) {
        stems.add(tok.slice(0, -1));
        stems.add(tok.slice(0, -2));
        stems.add(tok.slice(0, -3));
        var m = tok.match(/^(aus|auf|ab|an|bei|ein|mit|vor|zu|ent|ver|zer|be)(.+)$/i);
        if (m && m[2].length >= 3) {
          var root = m[2];
          stems.add(root);
          stems.add(root.slice(0, -1));
          stems.add(root.slice(0, -2));
          stems.add(m[1] + 'ge' + root.slice(0, -2));
        }
      }
    });

    var stemList = Array.from(stems).filter(function (s) { return s.length >= 3; });
    stemList.sort(function (a, b) { return b.length - a.length; });

    for (var j = 0; j < stemList.length; j++) {
      var stm = stemList[j].toLowerCase();
      for (var i = 0; i < pairs.length; i++) {
        var p = pairs[i];
        if (p && p.target && p.target.toLowerCase().indexOf(stm) >= 0) {
          return p;
        }
      }
    }

    return null;
  }

  function findSentenceForWord(storyText, word) {
    if (!storyText || !word) return '';
    var sentences = storyText.split(/(?<=[.!?])\s+/);
    for (var i = 0; i < sentences.length; i++) {
      if (sentences[i].indexOf(word) >= 0) return sentences[i].trim();
    }
    return '';
  }

  function hideStoryWordPopover() {
    var pop = getEl('storyWordPopover');
    if (pop) pop.style.display = 'none';
    currentWordElement = null;
  }

  function openStoryWordPopover(wordEl) {
    var word = (wordEl.getAttribute('data-word') || wordEl.textContent || '').trim();
    if (!word || word.length < 2) return;
    currentSelectedWord = word;
    currentWordElement = wordEl;
    var st = App.state.lastStory;
    currentSelectedSentence = st ? findSentenceForWord(st.story, word) : '';

    var pop = getEl('storyWordPopover');
    if (!pop) return;

    var exists = App.state.cards.some(function (c) {
      return (c.front || '').toLowerCase().indexOf(word.toLowerCase()) >= 0;
    });

    var knownMeaning = '';
    if (st && st.vocabulary) {
      var match = st.vocabulary.filter(function (v) {
        var vw = (v.word || '').toLowerCase();
        var w = word.toLowerCase();
        return vw === w || w.indexOf(vw) >= 0 || vw.indexOf(w) >= 0;
      })[0];
      if (match) knownMeaning = match.meaning;
    }

    pop.innerHTML =
      '<div class="story-pop-head">' +
        '<span class="story-pop-word">' + U.esc(word) + '</span>' +
        '<button type="button" class="story-pop-close" id="closeStoryPopBtn">×</button>' +
      '</div>' +
      '<div id="storyPopBody">' +
        (knownMeaning
          ? '<div class="story-pop-meaning">💡 <b>' + (App.t('translationLbl') || 'الترجمة') + ':</b> ' + U.esc(knownMeaning) + '</div>'
          : '<div id="storyPopAiTranslate" class="story-pop-loading"><span class="spin"></span> <span>' + (App.t('extractingTranslation') || 'جاري استخراج الترجمة...') + '</span></div>') +
        (exists ? '<div class="story-pop-success">✓ ' + (App.t('cardAlreadyExists') || 'موجودة مسبقاً في بطاقاتك') + '</div>' : '') +
        '<button type="button" class="story-pop-btn" id="createWordCardBtn">' +
          '<svg viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>' +
          '<span>' + (App.t('convertWordToCardBtn') || 'تحويل إلى بطاقة بالذكاء الاصطناعي') + '</span>' +
        '</button>' +
      '</div>';

    pop.style.display = 'block';

    var rect = wordEl.getBoundingClientRect();
    var popWidth = 280;
    var popHeight = 170;

    var top = rect.bottom + 8;
    var left = rect.left;

    if (left + popWidth > window.innerWidth - 16) {
      left = Math.max(16, window.innerWidth - popWidth - 16);
    }
    if (left < 16) left = 16;

    if (top + popHeight > window.innerHeight - 16) {
      top = Math.max(16, rect.top - popHeight - 8);
    }

    pop.style.top = top + 'px';
    pop.style.left = left + 'px';

    if (!knownMeaning && App.ai && App.ai.translate && App.state.settings.apiKey) {
      var askedWord = word; /* لعزل السباق: ترجمة كلمة قديمة لا تغلب الكلمة المعروضة حالياً */
      App.ai.translate(word).then(function (trans) {
        if (askedWord !== currentSelectedWord || !trans) return;
        var el = getEl('storyPopAiTranslate');
        if (el) {
          el.outerHTML = '<div class="story-pop-meaning">💡 <b>' + (App.t('translationLbl') || 'الترجمة') + ':</b> ' + U.esc(trans) + '</div>';
        }
      }).catch(function () {
        if (askedWord !== currentSelectedWord) return;
        var el2 = getEl('storyPopAiTranslate');
        if (el2) {
          el2.outerHTML = '<div class="story-pop-meaning" style="color:#f59e0b;">⚠ ' +
            (App.t('popTranslateFailed') || 'تعذر الحصول على الترجمة — أعد النقر على الكلمة') + '</div>';
        }
      });
    }
  }

  /* بعد تحويل كلمة إلى بطاقة: علّم كل مواضعها في نص القصة (العرض يعيد بناءه renderAll) */
  function markStoryWordSaved(word) {
    if (!word || word.length < 2) return;
    var w = word.toLowerCase();
    document.querySelectorAll('.story-word').forEach(function (el) {
      if ((el.getAttribute('data-word') || '').toLowerCase() === w) el.classList.add('saved-card');
    });
  }

  function ensureStoryDeck(storyTitle) {
    var title = (storyTitle || '').trim() || (App.t('storiesTitle') || 'قصة تفاعلية');
    var existing = App.state.decks.filter(function (d) {
      return (d.name || '').trim().toLowerCase() === title.toLowerCase();
    })[0];
    if (existing) return Promise.resolve(existing.id);

    var newDeck = {
      id: U.uid(),
      name: title,
      desc: title,
      icon: '📖',
      color: '#8b5cf6',
      createdAt: Date.now()
    };
    App.state.decks.push(newDeck);
    return App.store.saveDeck(newDeck).then(function () {
      App.render.renderDecks();
      return newDeck.id;
    });
  }

  function convertWordToCard() {
    var word = currentSelectedWord;
    var sentence = currentSelectedSentence;
    var body = getEl('storyPopBody');
    if (!body || !word) return;

    body.innerHTML = '<div class="story-pop-loading"><span class="spin"></span> <span>' + (App.t('creatingAndTranslating') || 'جاري الإنشاء والترجمة...') + '</span></div>';

    var st = App.state.lastStory;
    var storyTitle = (st && st.title) ? st.title.trim() : (App.t('storiesTitle') || 'قصة تفاعلية');

    var pairs = (st && st.sentences && st.sentences.length) ? st.sentences : (App.render && App.render.pairStorySentences && st ? App.render.pairStorySentences(st) : []);
    var matchPair = findBestSentencePair(word, pairs);
    var fallbackSentence = matchPair ? matchPair.target : sentence;
    var fallbackTrans = matchPair ? matchPair.native : '';

    App.ai.createCardFromWord(word, sentence).then(function (res) {
      var now = Date.now();
      return ensureStoryDeck(storyTitle).then(function (resolvedDeckId) {
        var card = {
          id: U.uid(),
          deckId: resolvedDeckId,
          front: res.front || word,
          back: res.back || '',
          example: res.example || fallbackSentence || sentence || '',
          exampleTranslation: res.exampleTranslation || fallbackTrans || '',
          tags: ['story', storyTitle],
          cefr: res.cefr || (App.state.profile && App.state.profile.cefrLevel) || 'B1',
          srs: App.srs.newState(now),
          createdAt: now,
          updatedAt: now
        };

        App.state.cards.push(card);
        return App.store.saveCard(card).then(function () {
          if (currentWordElement) currentWordElement.classList.add('saved-card');
          body.innerHTML =
            '<div class="story-pop-success">✓ ' + (App.t('cardAddedOk') || 'تمت إضافة البطاقة بنجاح!') + '</div>' +
            '<div class="story-pop-res">' +
              '<div><b>' + U.esc(card.front) + '</b></div>' +
              '<div class="story-pop-res-back">' + U.esc(card.back) + '</div>' +
              '<div style="font-size:11.5px;color:var(--text-3);margin-top:4px;">' + (App.t('inDeck') || 'في قسم:') + ' <b>' + U.esc(storyTitle) + '</b></div>' +
            '</div>';
          U.toast((App.t('cardAddedOk') || 'تمت إضافة البطاقة بنجاح!') + ': ' + card.front + ' ' + (App.t('inDeck') || 'في قسم:') + ' "' + storyTitle + '"', 'success');
          App.render.renderAll();
          /* renderAll يعيد بناء نص القصة — أعد تعليم الكلمة كمحفوظة */
          markStoryWordSaved(card.front);
          markStoryWordSaved(word);
        });
      });
    }).catch(function (err) {
      body.innerHTML =
        '<div style="color:#ef4444;font-size:12px;margin-bottom:8px;">' + (App.t('generationFailed') || 'فشل التوليد: ') + U.esc(err && err.message ? err.message : 'خطأ') + '</div>' +
        '<button type="button" class="story-pop-btn" id="createWordCardBtn"><span>' + (App.t('retry') || 'إعادة المحاولة') + '</span></button>';
    });
  }

  function renderStoryResult(story) {
    var p = App.state.profile || { nativeLang: 'ar', targetLang: 'en', cefrLevel: 'B1' };
    var sel = getEl('aiTargetLangSelect');
    if (sel && sel.value) p.targetLang = sel.value;

    getEl('storyTitleText').textContent = story.title || App.t('storyResultTitle');
    var wc = (story.story || '').split(/\s+/).filter(Boolean).length;
    getEl('storySub').textContent = U.langName(p.targetLang, App.state.lang) + ' · ' + U.fmtInt(wc) + ' ' + App.t('wordsUnit') + ' · ' + (p.cefrLevel || 'B1');
    getEl('storyTargetLabel').textContent = U.langName(p.targetLang, App.state.lang);
    getEl('storyNativeLabel').textContent = U.langName(p.nativeLang, App.state.lang);

    var storyTextEl = getEl('storyText');
    /* ضبط اتجاه لغة القصة: الألمانية/الإنجليزية = LTR من اليسار لليمين */
    var isTargetRtl = (p.targetLang === 'ar' || p.targetLang === 'ur' || p.targetLang === 'fa');
    storyTextEl.setAttribute('dir', isTargetRtl ? 'rtl' : 'ltr');
    storyTextEl.style.direction = isTargetRtl ? 'rtl' : 'ltr';
    storyTextEl.style.textAlign = isTargetRtl ? 'right' : 'left';
    storyTextEl.innerHTML = formatStoryWithWords(story.story || '');

    /* تكبير وتصغير الخط */
    applyStoryFontSize();

    var tr = getEl('storyTranslation');
    tr.textContent = story.translation || '';
    tr.parentElement.style.display = story.translation ? '' : 'none';
    var isNativeRtl = (p.nativeLang === 'ar' || p.nativeLang === 'ur' || p.nativeLang === 'fa');
    tr.setAttribute('dir', isNativeRtl ? 'rtl' : 'ltr');
    tr.style.direction = isNativeRtl ? 'rtl' : 'ltr';
    tr.style.textAlign = isNativeRtl ? 'right' : 'left';

    var wrap = getEl('storyVocabWrap');
    var v = getEl('storyVocab');
    if (story.vocabulary && story.vocabulary.length) {
      wrap.style.display = '';
      v.innerHTML = story.vocabulary.map(function (w) {
        return '<span class="story-vocab-chip"><b>' + U.esc(w.word) + '</b>' + (w.meaning ? ' — ' + U.esc(w.meaning) : '') + '</span>';
      }).join('');
    } else { wrap.style.display = 'none'; v.innerHTML = ''; }

    /* إعادة تعيين زر الاستماع وحالة النافذة المنبثقة */
    updateStoryTtsBtnState('idle');
    hideStoryWordPopover();
  }

  /* تحويل مفردات القصة إلى بطاقات تحت عنوان القصة مباشرة */
  function storyToCards() {
    var story = App.state.lastStory;
    if (!story || !story.story) { U.toast(App.t('aiNeedText'), 'error'); return; }

    var p = App.state.profile || {};
    var storyTitle = (story.title || '').trim() || (App.t('storiesTitle') || 'قصة تفاعلية');

    if (story.vocabulary && story.vocabulary.length > 0) {
      var btn = getEl('storiesExtractAllCardsBtn');
      var oldHtml = btn ? btn.innerHTML : '';
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spin"></span> <span>' + (App.t('creatingAndTranslating') || 'جاري الإنشاء...') + '</span>';
      }

      ensureStoryDeck(storyTitle).then(function (resolvedDeckId) {
        var now = Date.now();
        var existingFronts = {};
        App.state.cards.forEach(function (c) {
          if (c.deckId === resolvedDeckId && !c.deletedAt) {
            existingFronts[(c.front || '').toLowerCase().trim()] = true;
          }
        });

        // Get sentence pairs from story.sentences or split them
        var pairs = (story.sentences && story.sentences.length) ? story.sentences : (App.render && App.render.pairStorySentences ? App.render.pairStorySentences(story) : []);

        var newCards = [];
        story.vocabulary.forEach(function (v) {
          if (!v || !v.word) return;
          var cleanWord = v.word.trim();
          if (existingFronts[cleanWord.toLowerCase()]) return;

          var matchPair = findBestSentencePair(cleanWord, pairs);

          var card = {
            id: U.uid(),
            deckId: resolvedDeckId,
            front: cleanWord,
            back: (v.meaning || '').trim(),
            example: matchPair ? (matchPair.target || '').trim() : '',
            exampleTranslation: matchPair ? (matchPair.native || '').trim() : '',
            tags: ['story', storyTitle],
            lang: p.targetLang || 'de',
            cefr: p.cefrLevel || 'B1',
            srs: App.srs.newState(now),
            createdAt: now,
            updatedAt: now
          };
          newCards.push(card);
          existingFronts[cleanWord.toLowerCase()] = true;
        });

        if (!newCards.length) {
          U.toast(App.t('cardAlreadyExists'), 'info');
          if (btn) { btn.disabled = false; btn.innerHTML = oldHtml; }
          return;
        }

        var saveOps = newCards.map(function (c) {
          App.state.cards.push(c);
          return App.store.saveCard(c);
        });

        return Promise.all(saveOps).then(function () {
          App.render.renderAll();
          closeModal('storyResultModal');
          U.toast(App.tf('storyVocabConverted', { count: newCards.length, deck: storyTitle }), 'success', 5000);
          if (btn) { btn.disabled = false; btn.innerHTML = oldHtml; }
        });
      }).catch(function (err) {
        U.toast(App.t('saveFailed') + ': ' + (err && err.message ? err.message : ''), 'error');
        if (btn) { btn.disabled = false; btn.innerHTML = oldHtml; }
      });
      return;
    }

    /* Fallback if story has no vocabulary array */
    closeModal('storyResultModal');
    switchView('add');
    setAiMode('cards');
    getEl('aiText').value = story.story;
    updateAiCount();
    if (story.title) {
      if (!App.aiResultMeta) App.aiResultMeta = {};
      App.aiResultMeta.deckTitle = story.title;
    }
    generateAi();
  }

  /* ═════════ واجهة القصص المستقلة (Stories View Handlers) ═════════ */
  function generateStoriesViewAi() {
    var input = getEl('storiesPromptInput');
    var text = input ? input.value.trim() : '';
    if (!text) { U.toast(App.t('aiNeedText') || 'يرجى كتابة موضوع للقصة', 'error'); return; }
    if (!App.state.settings.apiKey) { U.toast(App.t('aiNoKey'), 'error'); switchView('settings'); return; }

    var btn = getEl('storiesDoGenerateBtn');
    var lbl = getEl('storiesGenBtnLabel');
    if (btn) btn.disabled = true;
    if (lbl) lbl.textContent = 'جاري كتابة القصة وتوليد المفردات...';

    var cefrSel = getEl('storiesCefrSelect');
    if (cefrSel && App.state.profile) {
      App.state.profile.cefrLevel = cefrSel.value;
      App.store.saveProfile(App.state.profile);
    }

    App.ai.generateStory(text).then(function (story) {
      App.state.lastStory = story;
      try { localStorage.setItem('flashki_last_story', JSON.stringify(story)); } catch (err) {}
      App.render.renderStoriesView();
      U.toast('✓ تم توليد القصة بنجاح!', 'success');
      var creator = getEl('viewStoriesCreator');
      if (creator) creator.style.display = 'none';
      if (input) input.value = '';
    }).catch(function (e) {
      var m = e && e.message ? String(e.message) : '';
      var msg = (App.ai && App.ai.isBusyError && App.ai.isBusyError(m))
        ? App.t('aiBusy') + (m ? ' — ' + m : '')
        : ((e && e.message) ? App.t('aiFailed') + e.message : App.t('aiFailed'));
      U.toast(msg, 'error', 6000);
    }).then(function () {
      if (btn) btn.disabled = false;
      if (lbl) lbl.textContent = App.t('storiesGenBtn');
    });
  }

  function openStoryCreator() {
    var creator = getEl('viewStoriesCreator');
    var reader = getEl('viewStoriesReader');
    var empty = getEl('viewStoriesEmpty');
    if (creator) {
      creator.style.display = 'block';
      var sInp = getEl('storiesPromptInput');
      if (sInp) { sInp.focus(); sInp.select(); }
    }
    if (reader) reader.style.display = 'none';
    if (empty) empty.style.display = 'none';
  }

  /* ═════════ إدارة وتعديل كلمات القسم المختار (Deck Cards Modal) ═════════ */
  function openDeckCardsModal(deckId) {
    if (!deckId) return;
    App.state.managingDeckId = deckId;
    var searchInput = getEl('deckCardsSearchInput');
    if (searchInput) searchInput.value = '';
    App.render.renderDeckCardsList(deckId, '');
    showModal('deckCardsModal');
  }

  var inlineCardImages = {};

  function enterInlineCardEdit(cardId) {
    var item = getEl('deckCardItem_' + cardId);
    if (!item) return;
    var c = App.state.cards.filter(function (x) { return x.id === cardId; })[0];
    if (!c) return;
    delete inlineCardImages[cardId];

    var p = App.state.profile || {};
    var targetName = U.langName(c.lang || p.targetLang || 'de', App.state.lang);
    var nativeName = U.langName(p.nativeLang || 'ar', App.state.lang);

    item.innerHTML =
      '<div class="deck-card-inline-edit">' +
        '<div class="deck-card-image-edit-row">' +
          '<div class="deck-card-thumb-wrap" id="inlineThumbWrap_' + c.id + '">' +
            (c.imagePath ? '<img class="deck-card-thumb" id="inlineImg_' + c.id + '" data-img-path="' + U.esc(c.imagePath) + '" alt="" />' : '<div class="deck-card-no-img">' + App.t('noImageYet') + '</div>') +
          '</div>' +
          '<div class="deck-card-image-edit-actions">' +
            '<label class="btn-ghost btn-sm" style="cursor:pointer;display:inline-flex;align-items:center;gap:6px">' +
              '<span>📷 ' + (c.imagePath ? App.t('changeImage') : App.t('addImage')) + '</span>' +
              '<input type="file" id="inlineImgInput_' + c.id + '" accept="image/png,image/jpeg,image/webp,image/gif" style="display:none" />' +
            '</label>' +
            (c.imagePath ? '<button type="button" class="btn-ghost btn-sm text-danger" id="inlineRemoveImg_' + c.id + '">' + App.t('removeImageBtn') + '</button>' : '') +
          '</div>' +
        '</div>' +
        '<div class="deck-card-edit-grid">' +
          '<div class="field">' +
            '<label>' + U.esc(App.tf('lblFrontLang', { lang: targetName })) + ':</label>' +
            '<input type="text" class="deck-edit-input" id="editFront_' + c.id + '" value="' + U.esc(c.front || '') + '" />' +
          '</div>' +
          '<div class="field">' +
            '<label>' + U.esc(App.tf('lblBackLang', { lang: nativeName })) + ':</label>' +
            '<input type="text" class="deck-edit-input" id="editBack_' + c.id + '" value="' + U.esc(c.back || '') + '" />' +
          '</div>' +
        '</div>' +
        '<div class="deck-card-edit-grid">' +
          '<div class="field">' +
            '<label>' + U.esc(App.t('lblContextEx')) + ':</label>' +
            '<input type="text" class="deck-edit-input" id="editEx_' + c.id + '" value="' + U.esc(c.example || '') + '" placeholder="' + U.esc(App.t('examplePh')) + '" />' +
          '</div>' +
          '<div class="field">' +
            '<label>' + U.esc(App.t('lblContextExTr')) + ':</label>' +
            '<input type="text" class="deck-edit-input" id="editExTr_' + c.id + '" value="' + U.esc(c.exampleTranslation || '') + '" placeholder="' + U.esc(App.t('exampleTranslationPh')) + '" />' +
          '</div>' +
        '</div>' +
        '<div class="deck-card-edit-actions">' +
          '<button type="button" class="btn-primary btn-sm" data-action="save-inline-card" data-id="' + c.id + '">💾 ' + U.esc(App.t('saveChanges')) + '</button>' +
          '<button type="button" class="btn-ghost btn-sm" data-action="cancel-inline-card" data-id="' + c.id + '">' + U.esc(App.t('cancel')) + '</button>' +
        '</div>' +
      '</div>';

    if (c.imagePath) {
      var thumbImg = getEl('inlineImg_' + c.id);
      if (thumbImg) {
        if (c.imagePath.indexOf('data:') === 0) thumbImg.src = c.imagePath;
        else App.handlers.imagePathToSrc(c.imagePath).then(function (src) { if (src) thumbImg.src = src; });
      }
    }

    var inp = getEl('inlineImgInput_' + c.id);
    if (inp) {
      inp.addEventListener('change', function () {
        var file = this.files && this.files[0];
        if (!file) return;
        U.compressImage(file, 1080, 0.82).then(function (res) {
          inlineCardImages[cardId] = res;
          var wrap = getEl('inlineThumbWrap_' + cardId);
          if (wrap) wrap.innerHTML = '<img class="deck-card-thumb" src="' + res.dataUrl + '" alt="" />';
          U.toast('✓ تم ضغط وتحديث الصورة', 'success');
        });
      });
    }

    var remBtn = getEl('inlineRemoveImg_' + c.id);
    if (remBtn) {
      remBtn.addEventListener('click', function (e) {
        e.preventDefault();
        inlineCardImages[cardId] = 'removed';
        var wrap = getEl('inlineThumbWrap_' + cardId);
        if (wrap) wrap.innerHTML = '<div class="deck-card-no-img">' + App.t('noImageYet') + '</div>';
        this.style.display = 'none';
      });
    }

    var fInput = getEl('editFront_' + c.id);
    if (fInput) fInput.focus();
  }

  function saveInlineCard(cardId) {
    var c = App.state.cards.filter(function (x) { return x.id === cardId; })[0];
    if (!c) return;
    var frontVal = (getEl('editFront_' + c.id) || {}).value || '';
    var backVal = (getEl('editBack_' + c.id) || {}).value || '';
    var exVal = (getEl('editEx_' + c.id) || {}).value || '';
    var exTrVal = (getEl('editExTr_' + c.id) || {}).value || '';

    if (!frontVal.trim() || !backVal.trim()) {
      U.toast(App.t('needFrontBack') || 'يجب ملء الوجه الأول والوجه الثاني', 'error');
      return;
    }

    c.front = frontVal.trim();
    c.back = backVal.trim();
    c.example = exVal.trim();
    c.exampleTranslation = exTrVal.trim();
    c.updatedAt = Date.now();

    var imgAction = inlineCardImages[cardId];
    var imgPromise = Promise.resolve();
    if (imgAction === 'removed') {
      c.imagePath = null;
    } else if (imgAction && imgAction.dataUrl) {
      if (!isTauri()) {
        c.imagePath = imgAction.dataUrl;
      } else {
        imgPromise = window.__TAURI__.core.invoke('save_card_image', { cardId: c.id, dataBase64: imgAction.dataUrl })
          .then(function (rel) { c.imagePath = rel; })
          .catch(function (e) {
            U.toast(App.t('imageSaveFailed') + (e && e.message ? ' — ' + e.message : ''), 'error');
          });
      }
    }

    imgPromise.then(function () {
      delete inlineCardImages[cardId];
      return App.store.saveCard(c);
    }).then(function () {
      U.toast(App.t('savedOk') || '✓ تم حفظ التعديل بنجاح', 'success');
      var search = (getEl('deckCardsSearchInput') || {}).value || '';
      App.render.renderDeckCardsList(App.state.managingDeckId, search);
      App.render.renderAll();
    }).catch(function (err) {
      U.toast(App.t('saveFailed') + ': ' + (err && err.message ? err.message : ''), 'error');
    });
  }

  function deleteDeckCard(cardId) {
    if (!cardId) return;
    App.store.deleteCard(cardId).then(function () {
      App.state.cards = App.state.cards.filter(function (c) { return c.id !== cardId; });
      U.toast('✓ تم حذف الكلمة من القسم', 'info');
      var search = (getEl('deckCardsSearchInput') || {}).value || '';
      App.render.renderDeckCardsList(App.state.managingDeckId, search);
      App.render.renderAll();
    });
  }

  function addEmptyDeckCard() {
    var deckId = App.state.managingDeckId;
    if (!deckId) return;
    var now = Date.now();
    var p = App.state.profile || {};
    var card = {
      id: U.uid(),
      deckId: deckId,
      front: '',
      back: '',
      example: '',
      exampleTranslation: '',
      tags: [],
      cefr: p.cefrLevel || 'B1',
      srs: App.srs.newState(now),
      createdAt: now,
      updatedAt: now
    };
    App.state.cards.unshift(card);
    var searchInput = getEl('deckCardsSearchInput');
    if (searchInput) searchInput.value = '';
    App.render.renderDeckCardsList(deckId, '');
    enterInlineCardEdit(card.id);
  }

  /* فهرس البطاقة قيد التعديل داخل نافذة النتائج (قبل الحفظ — لا علاقة له بقاعدة البيانات) */
  var aiEditIdx = -1;

  function renderAiResults() {
    var list = getEl('aiResultsList');
    var n = App.state.aiResults.filter(function (c) { return c.checked; }).length;
    var meta = App.aiResultMeta || {};
    var sub = U.fmtInt(n) + ' / ' + App.state.aiResults.length;
    if (meta.skippedDuplicates) sub += ' · ' + App.t('skippedDupes') + ': ' + U.fmtInt(meta.skippedDuplicates);
    if (meta.sourceAnalysis) sub += ' — ' + meta.sourceAnalysis;
    getEl('aiResultSub').textContent = sub;
    getEl('saveAiCardsBtn').textContent = App.t('saveSelected') + ' (' + n + ')';
    getEl('saveAiCardsBtn').disabled = !App.state.aiResults.some(function (c) { return c.checked; });
    /* المستخدم أزال كل البطاقات — حالة فارغة واضحة */
    if (!App.state.aiResults.length) {
      list.innerHTML = '<div class="ai-results-empty">' + App.t('aiAllRemoved') + '</div>';
      return;
    }
    list.innerHTML = App.state.aiResults.map(function (c, i) {
      /* وضع التعديل: حقول مباشرة داخل البطاقة */
      if (i === aiEditIdx) {
        return '<div class="ai-result-item editing" data-ai-index="' + i + '">' +
          '<div class="ai-edit-form">' +
          '<div class="field"><label>' + App.t('aiEditFrontLbl') + '</label><input id="aiEditFront" value="' + U.esc(c.front) + '"></div>' +
          '<div class="field"><label>' + App.t('aiEditBackLbl') + '</label><input id="aiEditBack" value="' + U.esc(c.back) + '"></div>' +
          (c.example ? '<div class="field"><label>' + App.t('aiEditExampleLbl') + '</label><input id="aiEditExample" value="' + U.esc(c.example) + '"></div>' : '') +
          '<div class="ai-edit-actions">' +
          '<button type="button" class="btn-ghost" data-ai-edit-cancel="1">' + App.t('cancel') + '</button>' +
          '<button type="button" class="btn-primary" data-ai-edit-save="1">' + App.t('save') + '</button>' +
          '</div></div></div>';
      }
      return '<div class="ai-result-item' + (c.checked ? '' : ' unchecked') + '" data-ai-index="' + i + '">' +
        '<input type="checkbox" data-ai-check="' + i + '"' + (c.checked ? ' checked' : '') + '>' +
        '<div><div class="ai-result-front">' + (c._edited ? '<span class="ai-edited-mark" title="' + App.t('aiCardUpdated') + '">✏️</span> ' : '') + U.esc(c.front) + (c.cefr ? ' <span class="cefr-badge cefr-' + c.cefr + '">' + c.cefr + '</span>' : '') + '</div><div class="ai-result-back">' + U.esc(c.back) + '</div>' +
        (c.example ? '<div class="ai-result-example">' + U.esc(c.example) + (c.exampleTranslation ? ' — <i>' + U.esc(c.exampleTranslation) + '</i>' : '') + '</div>' : '') +
        ((c.tags && c.tags.length) ? '<span class="ai-result-tick">' + U.esc(c.tags.join(' · ')) + '</span>' : '') +
        '<div class="ai-result-actions">' +
        '<button type="button" class="ai-act" data-ai-edit="' + i + '">✏️ ' + App.t('aiEdit') + '</button>' +
        '<button type="button" class="ai-act danger" data-ai-del="' + i + '">🗑 ' + App.t('aiDelete') + '</button>' +
        '</div></div></div>';
    }).join('');
  }

  /* حذف بطاقة من نتائج التوليد قبل الحفظ (لم تُحفظ بعد — لا مساس بقاعدة البيانات) */
  function deleteAiResult(i) {
    var c = App.state.aiResults[i];
    if (!c) return;
    App.state.aiResults.splice(i, 1);
    if (aiEditIdx === i) aiEditIdx = -1;
    else if (aiEditIdx > i) aiEditIdx--;
    U.toast(App.t('aiCardDeleted'), 'warn');
    renderAiResults();
  }

  /* حفظ تعديلات بطاقة من نتائج التوليد */
  function saveAiResultEdit() {
    var i = aiEditIdx;
    var c = App.state.aiResults[i];
    if (!c) { aiEditIdx = -1; renderAiResults(); return; }
    var f = getEl('aiEditFront'), b = getEl('aiEditBack'), ex = getEl('aiEditExample');
    var nf = f ? f.value.trim() : c.front;
    var nb = b ? b.value.trim() : c.back;
    if (!nf || !nb) { U.toast(App.t('needFrontBack'), 'error'); return; }
    c.front = nf; c.back = nb;
    if (ex) c.example = ex.value.trim();
    c._edited = true; /* إشارة بصرية أن المستخدم عدّل هذه البطاقة يدوياً */
    aiEditIdx = -1;
    U.toast(App.t('aiCardUpdated'), 'success');
    renderAiResults();
  }

  /* ═════════ عنوان القسم الذكي (يختاره Gemini حسب النص — قابل للتعديل) ═════════ */
  function fillAiDeckModal() {
    var meta = App.aiResultMeta || {};
    var p = App.state.profile || { targetLang: 'en' };
    var suggested = meta.deckTitle
      ? U.langName(p.targetLang, App.state.lang) + ' · ' + meta.deckTitle
      : suggestedDeckName();
    var input = getEl('aiDeckTitleInput');
    if (input) input.value = suggested;
    var sel = getEl('aiDeckSelect');
    if (sel) sel.value = '__new__';
    syncAiDeckTitle();
  }

  function syncAiDeckTitle() {
    var sel = getEl('aiDeckSelect');
    var field = getEl('aiDeckTitleField');
    if (sel && field) field.style.display = (sel.value === '__new__') ? '' : 'none';
  }

  /* إنشاء قسم جديد بالعنوان (المعدّل من المستخدم) عند الحفظ */
  function createAiDeck() {
    var name = (getEl('aiDeckTitleInput').value || '').trim() || suggestedDeckName();
    var colors = App.store.DECK_COLORS;
    var deck = { id: U.uid(), name: name, desc: '', icon: '📚', color: colors[App.state.decks.length % colors.length], createdAt: Date.now() };
    return App.store.saveDeck(deck).then(function () {
      App.state.decks.push(deck);
      U.toast(App.tf('autoDeckCreated', { name: deck.name }), 'success');
      return deck.id;
    });
  }

  function saveAiCards() {
    var deckSel = getEl('aiDeckSelect');
    var wantNew = deckSel.value === '__new__';
    var deckId = wantNew ? null : (deckSel.value || (App.state.decks[0] && App.state.decks[0].id));
    var sel = App.state.aiResults.filter(function (c) { return c.checked; });
    if (!sel.length) { U.toast(App.t('aiNoneSelected'), 'error'); return; }
    var now = Date.now();
    var genInfo = App.state.aiGenInfo || {};
    var genId = U.uid();
    (wantNew ? createAiDeck() : ensureDeck(deckId)).then(function (resolvedDeckId) {
      var ops = sel.map(function (c, i) {
        var card = { id: U.uid(), deckId: resolvedDeckId, front: c.front, back: c.back, tags: c.tags || [], cefr: c.cefr || null, example: c.example || '', exampleTranslation: c.exampleTranslation || '', generatedFrom: genId, srs: App.srs.newState(now), createdAt: now + i, updatedAt: now, audioFront: undefined, audioBack: undefined };
        App.state.cards.push(card);
        return App.store.saveCard(card);
      });
      /* سجل التوليد مع البرومبت الكامل (prompt_used) للرجوع إليه عند الدعم */
      ops.push(App.store.saveAiGeneration({
        id: genId, deckId: resolvedDeckId, sourceType: 'text',
        sourcePreview: (genInfo.text || '').slice(0, 200),
        cardsCount: sel.length, promptUsed: genInfo.prompt || '', createdAt: now
      }));
      return Promise.all(ops).then(function () {
        closeModal('aiResultModal');
        App.state.aiResults = [];
        getEl('aiText').value = '';
        updateAiCount();
        U.toast(App.t('aiSaved'), 'success');
        App.render.renderAll();
      }, function (err) {
        /* تراجع عن الدفع من الذاكرة + إظهار الخطأ (لا فشل صامت بعد الآن) */
        App.state.cards = App.state.cards.filter(function (x) { return !x.generatedFrom || x.generatedFrom !== genId; });
        App.render.renderAll();
        U.toast(App.t('saveFailed') + (err && err.message ? ' — ' + err.message : ''), 'error');
      });
    });
  }

  /* ═════════ تعديل الملف الشخصي — النقر على الاسم في الشريط الجانبي ═════════ */
  function openProfileModal() {
    var p = App.state.profile || {};
    var inp = getEl('profileNameInput');
    if (!inp) return;
    inp.value = (p.name || '').trim();
    showModal('profileModal');
    setTimeout(function () { try { inp.focus(); inp.select(); } catch (e2) {} }, 60);
  }

  function confirmProfileSave() {
    var inp = getEl('profileNameInput');
    if (!inp) return;
    var name = (inp.value || '').trim();
    var p = App.state.profile || (App.state.profile = {});
    p.name = name;
    App.store.saveProfile(p).then(function () {
      closeModal('profileModal');
      App.render.renderAll(); /* يحدّث الاسم والأفاتار والترحيب في كل الشاشات */
      U.toast(App.t('profileSaved'), 'success');
    }, function (err) {
      U.toast(App.t('saveFailed') + (err && err.message ? ' — ' + err.message : ''), 'error');
    });
  }

  /* ═════════ زر الترجمة التلقائية ═════════ */
  function doTranslate() {
    var front = getEl('frontInput').value.trim();
    var btn = getEl('translateBtn');
    if (!front) { U.toast(App.t('aiNeedText'), 'error'); return; }
    if (!App.state.settings.apiKey) { U.toast(App.t('translateErr'), 'error'); return; }
    var span = btn ? btn.querySelector('span') : null;
    if (btn) { btn.disabled = true; btn.classList.add('loading'); if (span) span.textContent = App.t('translating'); }
    App.ai.translate(front).then(function (raw) {
      var out = String(raw || '').trim().replace(/^"|"$/g, '');
      if (!out) throw new Error('empty');
      getEl('backInput').value = out;
      updatePreview();
      var backIn = getEl('backInput');
      backIn.classList.add('flash-ok');
      setTimeout(function () { backIn.classList.remove('flash-ok'); }, 1200);
      U.toast(App.t('translateOk'), 'success');
      if (span) span.textContent = '↻ ' + App.t('translateBtn');
    }).catch(function () {
      U.toast(App.t('translateErr'), 'error');
    }).then(function () {
      if (btn) { btn.disabled = false; btn.classList.remove('loading'); if (span && span.textContent.indexOf('↻') < 0) span.textContent = App.t('translateBtn'); }
    });
  }

  /* ═════════ مفتاح Gemini: حفظ فوري أولاً ثم تحقق في الخلفية ═════════ */
  function setKeyBtnLoading(on) {
    var btn = getEl('saveKeyBtn');
    btn.disabled = on;
    btn.textContent = on ? App.t('keyChecking') : App.t('save');
  }

  function saveKeyWithValidation() {
    var key = getEl('apiKeyInput').value.trim();
    if (!key) { U.toast(App.t('keyEmpty'), 'error'); return; }
    /* 1) حفظ فوري في قاعدة البيانات — المفتاح لا يُفقد مهما حدث لاحقاً */
    App.state.settings.apiKey = key;
    App.state.settings.keyStatus = 'checking';
    App.render.renderSettings(); /* شارة خضراء + تلميح "محفوظ — جارٍ التحقق" فوراً */
    persistSettings();
    U.toast(App.t('keySavedChecking'), 'success', 3500);
    /* 2) تحقق فعلي في الخلفية عبر النموذج — مهلة 15 ثانية كحد أقصى (لا دوران أبدياً) */
    setKeyBtnLoading(true);
    var timeout = new Promise(function (_, rej) { setTimeout(function () { rej(new Error('timeout')); }, 15000); });
    Promise.race([App.ai.verifyKey(key), timeout]).then(function (res) {
      res = res || {};
      var s = App.state.settings;
      if (s.apiKey !== key) return; /* تغيّر المفتاح أثناء التحقق — تجاهل النتيجة */
      if (res.ok) {
        s.keyStatus = 'ok';
        U.toast(App.t('keyVerifiedOk'), 'success', 4000);
      } else if (res.kind === 'busy' || res.kind === 'geo') {
        /* المصادقة نجحت — ازدحام/حجب شبكي وليس مفتاحاً فاسداً → المفتاح يبقى محفوظاً */
        s.keyStatus = res.kind;
        U.toast(App.t(res.kind === 'busy' ? 'keySavedBusy' : 'keySavedGeo') + (res.message ? ' — ' + res.message : ''), 'warn', 7000);
      } else if (res.kind === 'invalid') {
        s.keyStatus = 'invalid';
        U.toast(App.t('keyInvalid') + (res.message ? ' — ' + res.message : ''), 'error', 6000);
      } else {
        /* شبكة/مهلة — المفتاح محفوظ ويُستخدم عند التوليد */
        s.keyStatus = 'unchecked';
        U.toast(App.t('keyHintNoConn'), 'warn', 6000);
      }
      return persistSettings();
    }).catch(function () {
      if (App.state.settings.apiKey === key) App.state.settings.keyStatus = 'unchecked';
      U.toast(App.t('keyHintNoConn'), 'warn', 6000);
      return persistSettings();
    }).then(function () {
      App.render.renderSettings();
      setKeyBtnLoading(false);
    });
  }

  /* ---------- export / import / wipe ---------- */
  function doExport() {
    App.store.exportData().then(function (data) {
      return App.store.exportWithAudio(data);
    }).then(function (data) {
      var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'flashki-backup-' + U.todayKey() + '.json';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
      U.toast(App.t('exportedOk'), 'success');
    }).catch(function (err) {
      console.error('Export error:', err);
      U.toast(App.t('importFailed') || 'فشل التصدير', 'error');
    });
  }

  function doImport(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var json;
      try { json = JSON.parse(reader.result); } catch (e) { U.toast(App.t('importFailed'), 'error'); return; }
      if (!confirm(App.t('wipeConfirm1'))) return;
      App.store.importData(json).then(function () {
        return Promise.all([App.store.getDecks(), App.store.getCards(), App.store.getReviews(), App.store.getSettings(), App.store.getProfile()]);
      }).then(function (r) {
        App.state.decks = r[0]; App.state.cards = r[1]; App.state.reviews = r[2];
        App.state.settings = r[3];
        if (r[4]) App.state.profile = r[4];
        applyTheme();
        App.i18n.applyLang(App.state.settings.lang || 'ar');
        App.render.renderAll();
        if (App.render.updateLangLabels) App.render.updateLangLabels();
        U.toast(App.t('importedOk'), 'success');
      }).catch(function (err) {
        console.error('Import error:', err);
        U.toast(App.t('importFailed'), 'error');
      });
    };
    reader.readAsText(file);
  }

  function doWipe() {
    if (!confirm(App.t('wipeConfirm1'))) return;
    if (!confirm(App.t('wipeConfirm2'))) return;
    App.store.wipeAll().then(function () { location.reload(); });
  }

  /* ---------- theme / settings ---------- */
  function applyTheme() {
    var theme = App.state.settings.theme || 'dark';
    document.body.classList.remove('light', 'dark');
    document.body.classList.add(theme);
    document.body.classList.toggle('no-anim', !App.state.settings.animations);
    /* حجم الخط: --font-size-base بين 14px و 24px — مصدر الحقيقة settings.fontSize (px)،
       وكاش localStorage يجعل الإقلاع التالي بلا وميض (يقرؤه سكربت <body> المتزامن) */
    var fs = parseInt(App.state.settings.fontSize, 10);
    if (!fs || fs < 14 || fs > 24) fs = 16;
    document.body.style.setProperty('--font-size-base', fs + 'px');
    try {
      localStorage.setItem('flashki.theme', theme);
      localStorage.setItem('flashki.fsz', String(fs));
    } catch (e) {}
  }

  /* +/- حجم الخط: خطوة 2px ضمن [14,24] — فوري + محفوظ */
  function nudgeFontSize(delta) {
    var fs = parseInt(App.state.settings.fontSize, 10) || 16;
    if (fs < 14 || fs > 24) fs = 16;
    fs = Math.min(24, Math.max(14, fs + delta));
    App.state.settings.fontSize = fs;
    applyTheme();
    var v = getEl('fontSizeVal');
    if (v) v.textContent = fs + 'px';
    persistSettings();
  }

  function persistSettings() {
    return App.store.saveSettings(App.state.settings);
  }

  function switchView(view) { App.switchView(view); }

  /* ═════════ Onboarding: لغة الواجهة ← الاسم ← اللغتان ← CEFR ═════════ */
  var obStep = 1;
  var obData = { name: '', uiLang: 'ar', nativeLang: 'ar', targetLang: 'en', cefrLevel: 'B1' };

  function openOnboarding() {
    var p = App.state.profile || {};
    obData.name = p.name || '';
    obData.uiLang = App.state.lang || (App.state.settings && App.state.settings.lang) || 'ar';
    obData.nativeLang = p.nativeLang || 'ar';
    obData.targetLang = p.targetLang || 'en';
    obData.cefrLevel = p.cefrLevel || 'B1';
    obStep = 1;
    getEl('onboarding').style.display = 'flex';
    getEl('obName').value = obData.name;
    fillObLangSelects();
    paintObStep();
  }

  /* شبكة لغات الواجهة الثماني — النص بالاسم الأصلي لكل لغة (تصميمي) */
  function paintObUiLang() {
    var grid = getEl('obUiGrid');
    if (!grid) return;
    var html = '';
    U.UI_LANGS.forEach(function (L) {
      html += '<button type="button" class="ob-ui-btn' + (obData.uiLang === L.code ? ' selected' : '') + '" data-uilang="' + L.code + '">' + L.native + '</button>';
    });
    grid.innerHTML = html;
  }

  function fillObLangSelects() {
    var native = getEl('obNativeSelect'), target = getEl('obTargetSelect');
    [native, target].forEach(function (sel) {
      if (!sel) return;
      var html = '';
      Object.keys(U.LANGS).forEach(function (code) {
        var L = U.LANGS[code];
        html += '<option value="' + code + '">' + L.flag + ' ' + U.langName(code, App.state.lang) + '</option>';
      });
      sel.innerHTML = html;
    });
    if (native) native.value = obData.nativeLang;
    if (target) target.value = obData.targetLang;
  }

  function paintObStep() {
    U.qsa('.ob-step').forEach(function (s) { s.style.display = (Number(s.getAttribute('data-step')) === obStep) ? '' : 'none'; });
    U.qsa('.ob-dot').forEach(function (d) { d.classList.toggle('on', Number(d.getAttribute('data-dot')) === obStep); });
    var back = getEl('obBackBtn'), next = getEl('obNextBtn');
    back.style.visibility = obStep === 1 ? 'hidden' : '';
    next.innerHTML = obStep === 4 ? App.t('obStart') : App.t('obNext');
    var title = getEl('obStepTitle');
    if (obStep === 1) title.textContent = App.t('obTitleUi');
    else if (obStep === 2) title.textContent = App.t('obTitle1');
    else if (obStep === 3) title.textContent = App.t('obTitle2');
    else title.textContent = App.tf('obTitle3', { lang: U.langName(obData.targetLang, App.state.lang) });
    if (obStep === 1) paintObUiLang();
    if (obStep === 4) paintObCefr();
  }

  function paintObCefr() {
    var lv = { A1: 'cefrA1', A2: 'cefrA2', B1: 'cefrB1', B2: 'cefrB2', C1: 'cefrC1', C2: 'cefrC2' };
    var html = '';
    U.CEFR_ORDER.forEach(function (code) {
      html += '<button type="button" class="ob-cefr-btn' + (obData.cefrLevel === code ? ' selected' : '') + '" data-cefr="' + code + '">' +
        '<b>' + code + '</b><span>' + App.t(lv[code]) + '</span><i>' + App.t(lv[code] + 'd') + '</i></button>';
    });
    getEl('obCefrGrid').innerHTML = html;
  }

  function obNext() {
    if (obStep === 2) {
      obData.name = getEl('obName').value.trim();
    } else if (obStep === 3) {
      obData.nativeLang = getEl('obNativeSelect').value;
      obData.targetLang = getEl('obTargetSelect').value;
      if (obData.nativeLang === obData.targetLang) {
        U.toast(App.t('obSameLangs'), 'error');
        return;
      }
    } else if (obStep === 4) {
      finishOnboarding();
      return;
    }
    obStep++;
    paintObStep();
  }

  function finishOnboarding() {
    var p = Object.assign({}, App.state.profile, obData, {
      cefrLevel: obData.cefrLevel,
      onboardingCompletedAt: Date.now()
    });
    App.state.profile = p;
    /* لغة الواجهة المختارة تصبح الإعداد الدائم (وتُخزّن في localStorage عبر applyLang) */
    App.state.settings.lang = obData.uiLang;
    App.state.settings.cefrLevel = p.cefrLevel;
    App.i18n.applyLang(obData.uiLang);
    Promise.all([App.store.saveProfile(p), App.store.saveSettings(App.state.settings)]).then(function () {
      getEl('onboarding').style.display = 'none';
      App.render.renderAll();
      App.render.updateLangLabels();
      U.toast(App.tf('profileSaved', { name: p.name || '' }), 'success');
    });
  }

  /* ---------- init ---------- */
  function init() {
    /* رابط Google AI Studio + زر تحميل التطبيق: في Tauri يفتحان بالمتصفح الخارجي */
    ['aiStudioLink', 'downloadAppBtn'].forEach(function (id) {
      var el = getEl(id);
      if (el) {
        el.addEventListener('click', function (e) {
          try {
            var T = window.__TAURI__;
            var opener = T && (T.opener || T.shell);
            if (opener && (opener.openUrl || opener.open)) {
              e.preventDefault();
              var url = el.getAttribute('href');
              if (opener.openUrl) opener.openUrl(url); else opener.open(url);
            }
          } catch (err) { /* المتصفح: سلوك الرابط الطبيعي */ }
        });
      }
    });

    /* سحب وإفلات الصور في منطقة رفع الصور */
    var uploadZone = getEl('cardUploadZone');
    if (uploadZone) {
      ['dragenter', 'dragover'].forEach(function (evt) {
        uploadZone.addEventListener(evt, function (e) {
          e.preventDefault(); e.stopPropagation();
          uploadZone.classList.add('drag-over');
        });
      });
      ['dragleave', 'drop'].forEach(function (evt) {
        uploadZone.addEventListener(evt, function (e) {
          e.preventDefault(); e.stopPropagation();
          uploadZone.classList.remove('drag-over');
        });
      });
      uploadZone.addEventListener('drop', function (e) {
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
          pickCardImage(e.dataTransfer.files[0]);
        }
      });
    }
    document.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || !t.closest) return;

      /* close modal on overlay click */
      if (t.classList && t.classList.contains('modal-overlay')) { t.classList.remove('show'); return; }

      /* 1) session opener — دخول مباشر للجلسة (بدون نافذة إعداد)
         ⚠️ استثناء الأزرار ذات data-action (مثل زر تعديل القسم داخل بطاقة القسم) */
      var opener = t.closest('[data-open-session]');
      if (opener && !t.closest('[data-action]')) { e.preventDefault(); App.study.start(opener.getAttribute('data-deck') || 'all'); return; }

      var closer = t.closest('[data-close-modal]');
      if (closer) { var ov = closer.closest('.modal-overlay'); if (ov) ov.classList.remove('show'); if (ov && ov.id === 'aiResultModal') aiEditIdx = -1; return; }

      /* تعديل الملف الشخصي — النقر على الاسم في الشريط الجانبي يفتح نافذة التعديل */
      var prof = t.closest('.profile');
      if (prof) { e.preventDefault(); openProfileModal(); return; }
      if (t.closest('#profileSaveBtn')) { e.preventDefault(); confirmProfileSave(); return; }

      /* 4) study controls */
      if (t.closest('#exitStudy')) { e.preventDefault(); App.study.exit(); return; }
      var rateBtn = t.closest('.rate-btn, .srs-btn');
      if (rateBtn) { e.preventDefault(); App.study.rate(rateBtn.getAttribute('data-rate')); return; }
      if (t.closest('#flashCard') && !t.closest('.fx-audio-btn') && !t.closest('.fx-example-audio')) {
        /* النقر على البطاقة (أو زر القلب) يقلب في الاتجاهين دائماً (أمامي ← خلفي ← أمامي...) */
        App.study.flip();
        return;
      }
      if (t.closest('#audioBadge')) {
        e.preventDefault(); e.stopPropagation();
        var s = App.state.session;
        if (s && s.queue[s.idx]) {
          var card = s.queue[s.idx];
          var blob = card.audioBack || card.audioFront;
          if (blob) {
            try {
              var url = URL.createObjectURL(blob);
              var a = new Audio(url);
              a.onended = function () { URL.revokeObjectURL(url); };
              a.play();
            } catch (err) {}
          }
        }
        return;
      }

      /* 5) TTS — النطق بالكشف التلقائي للغة */
      var ttsMini = t.closest('.tts-mini');
      if (ttsMini) {
        e.preventDefault();
        var whichTts = ttsMini.getAttribute('data-tts');
        if (whichTts === 'Question') App.tts.speak(getEl('frontInput').value, 'front');
        else if (whichTts === 'Example') App.tts.speak(getEl('exampleInput') ? getEl('exampleInput').value : '', 'front');
        else App.tts.speak(getEl('backInput').value, 'back');
        return;
      }
      var ttsBtn = t.closest('[data-tts]');
      if (ttsBtn) { e.preventDefault(); App.tts.speak(ttsBtn.getAttribute('data-tts'), ttsBtn.getAttribute('data-tts-side') || 'front'); return; }
      if (t.closest('#ttsBtn')) {
        e.preventDefault();
        var ss = App.state.session;
        if (ss && ss.queue[ss.idx]) {
          var cur = ss.queue[ss.idx];
          var userVoice = (ss.dir === 'reverse') ? cur.audioBack : cur.audioFront;
          if (userVoice) {
            App.audio.playSource(userVoice);
          } else {
            App.tts.speak(ss.dir === 'reverse' ? cur.back : cur.front, ss.dir === 'reverse' ? 'back' : 'front');
          }
        }
        return;
      }
      /* نطق جملة المثال على الوجه الخلفي */
      if (t.closest('#exampleAudioBtn')) {
        e.preventDefault();
        var sx = App.state.session;
        if (sx && sx.queue[sx.idx] && sx.queue[sx.idx].example) {
          App.tts.speak(sx.queue[sx.idx].example, 'front');
        }
        return;
      }
      /* زر الترجمة */
      if (t.closest('#translateBtn')) { e.preventDefault(); doTranslate(); return; }

      /* رفع صورة البطاقة + إزالتها */
      if (t.closest('#cardUploadZone') || t.closest('#imageUploadBtn')) {
        e.preventDefault();
        var inp = getEl('imageFileInput');
        if (inp) inp.click();
        return;
      }
      if (t.closest('#cardImageRemove')) {
        e.preventDefault();
        var hadImage = false;
        if (App.state.editingCardId) {
          App.state.cards.forEach(function (x) { if (x.id === App.state.editingCardId && x.imagePath) hadImage = true; });
        }
        resetImageUI();
        imageRemoved = hadImage; /* في التعديل: إزالة فعلية تُحفظ؛ في الإضافة: تصفير فقط */
        return;
      }

      /* زر إخفاء وإظهار الشريط الجانبي */
      if (t.closest('#sidebarToggleBtn')) {
        e.preventDefault();
        var appEl = getEl('app');
        if (appEl) appEl.classList.toggle('sidebar-hidden');
        return;
      }

      /* فحص التحديثات */
      if (t.closest('#checkUpdateBtn')) { e.preventDefault(); checkAppUpdate(); return; }

      /* حجم الخط +/- */
      if (t.closest('#fontSizeMinus')) { e.preventDefault(); nudgeFontSize(-2); return; }
      if (t.closest('#fontSizePlus')) { e.preventDefault(); nudgeFontSize(2); return; }

      /* وضع AI: بطاقات / قصة */
      var aiModeOpt = t.closest('.ai-mode-opt');
      if (aiModeOpt) { e.preventDefault(); setAiMode(aiModeOpt.getAttribute('data-ai-mode')); return; }
      if (t.closest('#storyTtsBtn') || t.closest('#storiesTtsBtn')) { e.preventDefault(); toggleStoryAudio(); return; }
      if (t.closest('#storyToCardsBtn') || t.closest('#storiesExtractAllCardsBtn')) { e.preventDefault(); storyToCards(); return; }
      if (t.closest('#storyFontInc') || t.closest('#storiesFontInc')) { e.preventDefault(); changeStoryFontSize(10); return; }
      if (t.closest('#storyFontDec') || t.closest('#storiesFontDec')) { e.preventDefault(); changeStoryFontSize(-10); return; }
      if (t.closest('#storiesToggleInterlinearBtn')) {
        e.preventDefault();
        App.state.interlinearStoryMode = !App.state.interlinearStoryMode;
        App.render.renderStoriesView();
        return;
      }
      if (t.closest('#viewStoriesNewBtn') || t.closest('#storiesEmptyNewBtn') || t.closest('#storiesSwitchToNewBtn') || t.closest('#storiesBottomNewBtn')) {
        e.preventDefault();
        openStoryCreator();
        return;
      }
      if (t.closest('#storiesDoGenerateBtn')) {
        e.preventDefault();
        generateStoriesViewAi();
        return;
      }
      if (t.closest('#deckCardsAddBtn')) {
        e.preventDefault();
        addEmptyDeckCard();
        return;
      }
      if (t.closest('#createWordCardBtn')) { e.preventDefault(); convertWordToCard(); return; }
      if (t.closest('#closeStoryPopBtn')) { e.preventDefault(); hideStoryWordPopover(); return; }
      var storyWordEl = t.closest('.story-word');
      if (storyWordEl) { e.preventDefault(); e.stopPropagation(); openStoryWordPopover(storyWordEl); return; }
      if (!t.closest('#storyWordPopover') && !t.closest('.story-word')) {
        hideStoryWordPopover();
      }

      /* 6) add tabs */
      var addTab = t.closest('.add-tab');
      if (addTab) {
        addTab.parentElement.querySelectorAll('.add-tab').forEach(function (x) { x.classList.remove('active'); });
        addTab.classList.add('active');
        var tabName = addTab.getAttribute('data-tab');
        document.querySelectorAll('.add-panel').forEach(function (p) {
          p.style.display = (p.getAttribute('data-panel') === tabName) ? '' : 'none';
        });
        return;
      }

      /* 7) AI options — عدد البطاقات (5/10/تلقائي) + المفاتيح */
      var aiCountOpt = t.closest('.ai-count-opt');
      if (aiCountOpt) {
        document.querySelectorAll('.ai-count-opt').forEach(function (o) { o.classList.remove('on'); });
        aiCountOpt.classList.add('on');
        var cv = aiCountOpt.getAttribute('data-count');
        App.state.aiOptions.count = (cv === 'auto') ? 'auto' : parseInt(cv, 10) || 5;
        App.state.settings.aiCount = App.state.aiOptions.count;
        persistSettings();
        return;
      }
      var aiOpt = t.closest('.ai-option');
      if (aiOpt) {
        aiOpt.classList.toggle('on');
        var opt = aiOpt.getAttribute('data-opt') || '';
        App.state.aiOptions[opt] = aiOpt.classList.contains('on');
        return;
      }

      /* 8) theme + toggles */
      if (t.closest('#themeToggle')) {
        App.state.settings.theme = (App.state.settings.theme === 'light') ? 'dark' : 'light';
        applyTheme();
        getEl('themeToggle').classList.toggle('on', App.state.settings.theme === 'light');
        persistSettings();
        return;
      }
      var toggle = t.closest('.toggle');
      if (toggle) {
        var id = toggle.id;
        if (id === 'autoTtsToggle' || id === 'animationsToggle' || id === 'autoTwoSidedToggle' || id === 'translateToggle') {
          toggle.classList.toggle('on');
          var key = id === 'autoTtsToggle' ? 'autoTts' : (id === 'animationsToggle' ? 'animations' : (id === 'translateToggle' ? 'translationAutoEnabled' : 'autoTwoSided'));
          App.state.settings[key] = toggle.classList.contains('on');
          if (key === 'animations') applyTheme();
          if (key === 'translationAutoEnabled') App.render.updateTranslateBtnVisibility();
          persistSettings();
          return;
        }
      }

      /* 9) voice recorders */
      var recBtn = t.closest('[data-rec]');
      if (recBtn) { e.preventDefault(); var rec = recBtn.closest('.voice-recorder'); if (rec) App.audio.toggle(rec); return; }
      var recAction = t.closest('.rec-action');
      if (recAction) {
        e.preventDefault();
        var rc = recAction.closest('.voice-recorder');
        if (rc) {
          if (recAction.classList.contains('del')) {
            App.audio.clear(rc);
            rc.classList.add('del-clicked');
          } else App.audio.play(rc);
        }
        return;
      }

      /* 10) action attributes */
      var act = t.closest('[data-action]');
      if (act) {
        var action = act.getAttribute('data-action');
        if (action === 'open-story-creator') {
          e.preventDefault();
          if (App.state.lastView !== 'stories') App.switchView('stories');
          openStoryCreator();
          return;
        }
        if (action === 'manage-deck-cards') {
          e.preventDefault(); e.stopPropagation();
          openDeckCardsModal(act.getAttribute('data-id'));
          return;
        }
        if (action === 'edit-inline-card') {
          e.preventDefault(); e.stopPropagation();
          enterInlineCardEdit(act.getAttribute('data-id'));
          return;
        }
        if (action === 'save-inline-card') {
          e.preventDefault(); e.stopPropagation();
          saveInlineCard(act.getAttribute('data-id'));
          return;
        }
        if (action === 'cancel-inline-card') {
          e.preventDefault(); e.stopPropagation();
          var s = (getEl('deckCardsSearchInput') || {}).value || '';
          App.render.renderDeckCardsList(App.state.managingDeckId, s);
          return;
        }
        if (action === 'del-deck-card') {
          e.preventDefault(); e.stopPropagation();
          deleteDeckCard(act.getAttribute('data-id'));
          return;
        }
        if (action === 'new-deck') { e.preventDefault(); openCreateDeck(); return; }
        if (action === 'edit-deck' || action === 'deck-menu') { e.preventDefault(); openEditDeck(act.getAttribute('data-id')); return; }
        if (action === 'edit-card') { e.preventDefault(); openEditCard(act.getAttribute('data-id')); return; }
        if (action === 'toggle-trash') {
          e.preventDefault();
          App.state.showTrash = !App.state.showTrash;
          if (App.state.showTrash) {
            App.store.loadTrash().then(function (r) {
              App.state.trashDecks = r[0]; App.state.trashCards = r[1];
              App.render.renderBrowse();
            });
          } else App.render.renderBrowse();
          return;
        }
        if (action === 'restore-card') {
          e.preventDefault();
          App.store.restoreCard(act.getAttribute('data-id')).then(function () {
            return App.store.loadTrash();
          }).then(function (r) {
            App.state.trashDecks = r[0]; App.state.trashCards = r[1];
            return App.store.getCards();
          }).then(function (cards) {
            App.state.cards = cards;
            U.toast(App.t('restoredOk'), 'success');
            App.render.renderAll();
          });
          return;
        }
        if (action === 'purge-card') {
          e.preventDefault();
          if (!confirm(App.t('confirmPurge'))) return;
          App.store.purgeCard(act.getAttribute('data-id')).then(function () {
            return App.store.loadTrash();
          }).then(function (r) {
            App.state.trashDecks = r[0]; App.state.trashCards = r[1];
            App.state.reviews = App.state.reviews.filter(function (x) { return x.cardId !== act.getAttribute('data-id'); });
            U.toast(App.t('purgedOk'), 'success');
            App.render.renderBrowse();
          });
          return;
        }
        if (action === 'restore-deck') {
          e.preventDefault();
          App.store.restoreDeck(act.getAttribute('data-id')).then(function () {
            return Promise.all([App.store.loadTrash(), App.store.getDecks(), App.store.getCards()]);
          }).then(function (r) {
            App.state.trashDecks = r[0][0]; App.state.trashCards = r[0][1];
            App.state.decks = r[1]; App.state.cards = r[2];
            U.toast(App.t('restoredOk'), 'success');
            App.render.renderAll();
          });
          return;
        }
        if (action === 'purge-deck') {
          e.preventDefault();
          if (!confirm(App.t('confirmPurge'))) return;
          App.store.purgeDeck(act.getAttribute('data-id')).then(function () {
            return App.store.loadTrash();
          }).then(function (r) {
            App.state.trashDecks = r[0]; App.state.trashCards = r[1];
            U.toast(App.t('purgedOk'), 'success');
            App.render.renderBrowse();
          });
          return;
        }
        if (action === 'del-card') {
          e.preventDefault();
          var id2 = act.getAttribute('data-id');
          if (confirm(App.t('confirmDeleteCard'))) {
            App.store.deleteCard(id2).then(function () {
              App.state.cards = App.state.cards.filter(function (x) { return x.id !== id2; });
              U.toast(App.t('cardTrashed'), 'success');
              App.render.renderAll();
            });
          }
          return;
        }
        if (action === 'filter-browse') {
          App.state.browseFilter = act.getAttribute('data-val');
          App.render.renderBrowse();
          return;
        }
        if (action === 'filter-search') {
          App.state.searchFilter = act.getAttribute('data-val');
          App.render.renderSearch();
          return;
        }
      }

      /* 11) color + emoji swatches (generic — any container) */
      var sw = t.closest('.color-swatch');
      if (sw) {
        sw.parentElement.querySelectorAll('.color-swatch').forEach(function (x) { x.classList.remove('selected'); });
        sw.classList.add('selected');
        return;
      }
      var em = t.closest('.emoji-opt');
      if (em) {
        em.parentElement.querySelectorAll('.emoji-opt').forEach(function (x) { x.classList.remove('selected'); });
        em.classList.add('selected');
        return;
      }

      /* 12) create deck / save card / others */
      if (t.closest('#createDeckConfirm')) { confirmCreateDeck(); return; }
      if (t.closest('#saveDeckBtn')) { confirmSaveDeck(); return; }
      if (t.closest('#deleteDeckBtn')) { confirmDeleteDeck(); return; }
      if (t.closest('#trashToggle')) { e.preventDefault(); App.state.showTrash = !App.state.showTrash; if (App.state.showTrash) { App.store.loadTrash().then(function (r) { App.state.trashDecks = r[0]; App.state.trashCards = r[1]; App.render.renderBrowse(); }); } else App.render.renderBrowse(); return; }
      if (t.closest('#cancelEditCardBtn')) { e.preventDefault(); exitEditMode(); return; }
      if (t.closest('#saveCardBtn')) { e.preventDefault(); saveManualCard(); return; }
      if (t.closest('#previewCardBtn')) { e.preventDefault(); updatePreview(); return; }
      if (t.closest('#generateBtn')) { e.preventDefault(); if (App.state.aiMode === 'story') generateStoryAi(); else generateAi(); return; }
      /* ═══ نتائج AI: أزرار تعديل/حذف لكل بطاقة (قبل الـ item toggle حتى لا يقلب التحديد) ═══ */
      var aiEditBtn = t.closest('[data-ai-edit]');
      if (aiEditBtn) {
        e.preventDefault(); e.stopPropagation();
        aiEditIdx = parseInt(aiEditBtn.getAttribute('data-ai-edit'), 10);
        renderAiResults();
        var ef = getEl('aiEditFront'); if (ef) { ef.focus(); ef.select(); }
        return;
      }
      var aiDelBtn = t.closest('[data-ai-del]');
      if (aiDelBtn) {
        e.preventDefault(); e.stopPropagation();
        deleteAiResult(parseInt(aiDelBtn.getAttribute('data-ai-del'), 10));
        return;
      }
      var aiEditSaveBtn = t.closest('[data-ai-edit-save]');
      if (aiEditSaveBtn) { e.preventDefault(); e.stopPropagation(); saveAiResultEdit(); return; }
      var aiEditCancelBtn = t.closest('[data-ai-edit-cancel]');
      if (aiEditCancelBtn) { e.preventDefault(); e.stopPropagation(); aiEditIdx = -1; renderAiResults(); return; }
      var aiItem = t.closest('.ai-result-item');
      if (aiItem) {
        var i2 = parseInt(aiItem.getAttribute('data-ai-index'), 10);
        var c = App.state.aiResults[i2];
        if (c) { c.checked = !c.checked; renderAiResults(); }
        return;
      }
      if (t.closest('#saveAiCardsBtn')) { saveAiCards(); return; }
      if (t.closest('#renameDeckBtn')) { e.preventDefault(); openRenameDeck(); return; }
      if (t.closest('#renameDeckSaveBtn')) { e.preventDefault(); confirmRenameDeck(); return; }
      /* Onboarding */
      if (t.closest('#obNextBtn')) { e.preventDefault(); obNext(); return; }
      if (t.closest('#obBackBtn')) { e.preventDefault(); if (obStep > 1) { obStep--; paintObStep(); } return; }
      var obCefr = t.closest('.ob-cefr-btn');
      if (obCefr) {
        obData.cefrLevel = obCefr.getAttribute('data-cefr');
        U.qsa('.ob-cefr-btn').forEach(function (b2) { b2.classList.remove('selected'); });
        obCefr.classList.add('selected');
        return;
      }
      /* اختيار لغة الواجهة في Onboarding — تطبيق فوري حي على كامل التطبيق */
      var obUi = t.closest('.ob-ui-btn');
      if (obUi) {
        var code = obUi.getAttribute('data-uilang');
        if (code) {
          obData.uiLang = code;
          if (App.state.lang !== code) {
            App.i18n.applyLang(code); /* يخزّن localStorage أيضاً */
            fillObLangSelects();      /* أسماء اللغات باللغة الجديدة */
          }
          paintObStep();              /* العنوان والشبكة تُعاد باللغة الجديدة */
        }
        return;
      }
      if (t.closest('#saveKeyBtn')) {
        saveKeyWithValidation();
        return;
      }
      if (t.closest('#deleteKeyBtn')) {
        var delBtn = getEl('deleteKeyBtn');
        if (delBtn && !delBtn.disabled) showModal('deleteKeyModal');
        return;
      }
      if (t.closest('#deleteKeyConfirm')) {
        /* حذف نهائي: من الإعدادات + من الذاكرة + من الحقل + تصفير حالة التحقق */
        App.state.settings.apiKey = '';
        App.state.settings.keyStatus = 'unchecked';
        getEl('apiKeyInput').value = '';
        persistSettings().then(function () {
          closeModal('deleteKeyModal');
          App.render.renderSettings();
          U.toast(App.t('keyDeleted'), 'success');
        });
        return;
      }
      if (t.closest('#exportBtn')) { doExport(); return; }
      if (t.closest('#importBtn')) { e.preventDefault(); getEl('importFile').click(); return; }
      if (t.closest('#wipeBtn')) { doWipe(); return; }

      /* 13) chart tabs */
      var chartTab = t.closest('.chart-tab');
      if (chartTab && chartTab.getAttribute('data-range')) {
        chartTab.parentElement.querySelectorAll('.chart-tab').forEach(function (c2) { c2.classList.remove('active'); });
        chartTab.classList.add('active');
        App.state.chartRange = parseInt(chartTab.getAttribute('data-range'), 10) || 30;
        App.render.renderBarChart();
        return;
      }

      /* 14) generic navigation (LAST) */
      var navBtn = t.closest('button[data-view]');
      if (navBtn && !navBtn.hasAttribute('data-open-session') && !navBtn.closest('.deck-card') && !navBtn.closest('.picker-card')) {
        e.preventDefault();
        switchView(navBtn.getAttribute('data-view'));
        return;
      }
    });

    /* change events */
    document.addEventListener('change', function (e) {
      var el = e.target;
      if (!el) return;
      if (el.id === 'langSelect') {
        App.state.settings.lang = el.value;
        if (App.state.profile) { App.state.profile.uiLang = el.value; App.store.saveProfile(App.state.profile); }
        persistSettings();
        App.i18n.applyLang(el.value);
        App.render.renderAll();
      } else if (el.id === 'deckSelect') {
        if (el.value === '__new__') {
          openCreateDeck();
        }
      } else if (el.id === 'aiDeckSelect') {
        syncAiDeckTitle();
      } else if (el.id === 'modelSelect') {
        App.state.settings.model = el.value;
        persistSettings();
        U.toast(App.t('settingsSaved'), 'success');
      } else if (el.id === 'aiTargetLangSelect') {
        if (!App.state.profile) App.state.profile = {};
        App.state.profile.targetLang = el.value;
        App.store.saveProfile(App.state.profile);
        App.render.renderSettings();
        App.render.updateLangLabels();
        U.toast(App.t('settingsSaved'), 'success');
      } else if (el.id === 'nativeLangSelect' || el.id === 'targetLangSelect') {
        if (!App.state.profile) return;
        App.state.profile[el.id === 'nativeLangSelect' ? 'nativeLang' : 'targetLang'] = el.value;
        App.store.saveProfile(App.state.profile);
        App.render.renderSettings();
        App.render.updateLangLabels();
        U.toast(App.t('settingsSaved'), 'success');
      } else if (el.id === 'cefrSelect') {
        var lv = el.value;
        App.state.settings.cefrLevel = lv;
        if (App.state.profile) { App.state.profile.cefrLevel = lv; App.store.saveProfile(App.state.profile); }
        persistSettings();
        U.toast(App.t('cefrWarn'), '');
      } else if (el.id === 'voiceTargetSelect' || el.id === 'voiceNativeSelect') {
        if (!App.state.profile) return;
        var key = 'tts_voice_' + (el.id === 'voiceTargetSelect' ? App.state.profile.targetLang : App.state.profile.nativeLang);
        App.state.settings[key] = el.value;
        persistSettings();
      } else if (el.id === 'ttsVoice') {
        App.state.settings.ttsVoiceURI = el.value;
        persistSettings();
      } else if (el.id === 'dailyNewInput') {
        App.state.settings.dailyNew = Math.max(0, parseInt(el.value, 10) || 0);
        persistSettings();
      } else if (el.id === 'fontSizeSelect') {
        /* legacy — استُبدل بالـ stepper؛ يبقى تجاهلاً آمناً */
      } else if (el.id === 'imageFileInput' && el.files && el.files[0]) {
        pickCardImage(el.files[0]);
        el.value = '';
      } else if (el.id === 'importFile' && el.files && el.files[0]) {
        doImport(el.files[0]);
        el.value = '';
      } else if (el.id === 'ttsRate') {
        App.state.settings.ttsRate = parseFloat(el.value) || 1;
        persistSettings();
      }
    });

    /* input events */
    document.addEventListener('input', function (e) {
      var el = e.target;
      if (!el) return;
      if (el.id === 'searchInput') { App.debouncedSearch(); }
      else if (el.id === 'deckCardsSearchInput') {
        if (App.state.managingDeckId && App.render.renderDeckCardsList) {
          App.render.renderDeckCardsList(App.state.managingDeckId, el.value);
        }
      }
      else if (el.id === 'aiText') { updateAiCount(); }
      else if (el.id === 'frontInput' || el.id === 'backInput') { updatePreview(); }
      else if (el.id === 'apiKeyInput') {
        /* زر حذف المفتاح يتبع حالة الحقل حياً */
        if (App.render.updateKeyButtons) App.render.updateKeyButtons();
      }
      else if (el.id === 'ttsRate') {
        App.state.settings.ttsRate = parseFloat(el.value) || 1;
      }
    });

    /* keyboard shortcuts in study mode */
    document.addEventListener('keydown', function (e) {
      if (e.target && e.target.matches && e.target.matches('input, textarea, select')) return;
      if (App.state.lastView === 'study') {
        if (e.code === 'Space' || e.key === 'Enter') {
          e.preventDefault();
          App.study.flip(); /* Space يقلب في الاتجاهين */
          return;
        }
        if (e.key === 'Escape') { App.study.exit(); return; }
        if (['1', '2', '3', '4'].indexOf(e.key) !== -1) {
          var r = getEl('rateRow');
          if (r && r.classList.contains('show')) {
            e.preventDefault();
            /* ترتيب أزرار التصميم الجديد: 1=سهل · 2=متوسط · 3=صعب · 4=صعب جداً */
            App.study.rate(['easy', 'good', 'hard', 'again'][parseInt(e.key, 10) - 1]);
          }
        }
      } else if (App.state.lastView === 'search' && document.activeElement !== getEl('searchInput') && e.key === '/') {
        e.preventDefault();
        getEl('searchInput').focus();
      }
    });
  }

  App.handlers = {
    init: init,
    applyTheme: applyTheme,
    switchView: switchView,
    exitEditMode: exitEditMode,
    updateAiCount: updateAiCount,
    openOnboarding: openOnboarding,
    doTranslate: doTranslate,
    setAiMode: setAiMode,
    imagePathToSrc: imagePathToSrc,
    formatStoryWithWords: formatStoryWithWords,
    applyStoriesViewFontSize: applyStoryFontSize,
    openStoryCreator: openStoryCreator,
    _internal: { saveManualCard: saveManualCard, doExport: doExport, generateAi: generateAi, generateStoryAi: generateStoryAi, checkAppUpdate: checkAppUpdate, nudgeFontSize: nudgeFontSize }
  };
  App.updateAiModeUi = updateAiModeUi;
})();
