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
    if (el && el.classList) el.classList.remove('show');
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
    if (preferredId) return Promise.resolve(preferredId);
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
    var prev = getEl('cardImagePreview'), img = getEl('cardImageImg'), up = getEl('imageUploadBtn');
    if (!prev || !img) return;
    img.src = src;
    prev.style.display = '';
    if (up) up.style.display = 'none';
  }

  function resetImageUI() {
    pendingImage = null; imageRemoved = false;
    var prev = getEl('cardImagePreview'); if (prev) prev.style.display = 'none';
    var img = getEl('cardImageImg'); if (img) img.src = '';
    var up = getEl('imageUploadBtn'); if (up) up.style.display = '';
    var inp = getEl('imageFileInput'); if (inp) inp.value = '';
  }

  function pickCardImage(file) {
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) { U.toast(App.t('imageBadType'), 'error'); return; }
    if (file.size > 8 * 1024 * 1024) { U.toast(App.t('imageTooBig'), 'error'); return; }
    var reader = new FileReader();
    reader.onload = function () {
      var dataUrl = String(reader.result || '');
      var ext = file.type === 'image/png' ? 'png' : (file.type === 'image/webp' ? 'webp' : 'jpg');
      pendingImage = { dataUrl: dataUrl, b64: dataUrl.split(',')[1] || '', ext: ext };
      imageRemoved = false;
      showImagePreview(dataUrl);
      U.toast(App.t('imagePreviewReady'), 'success');
    };
    reader.readAsDataURL(file);
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
    if (!front || !back) { U.toast(App.t('needFrontBack'), 'error'); return; }
    var deckId = getEl('deckSelect').value || (App.state.decks[0] && App.state.decks[0].id);
    var tags = parseTags(getEl('tagsInput').value);
    var langSel = getEl('cardLangSelect');
    var cefrSel = getEl('cardCefrSelect');
    var cardLang = (langSel && langSel.value !== 'auto') ? langSel.value : null;
    var cardCefr = (cefrSel && cefrSel.value !== 'auto') ? cefrSel.value : null;
    var now = Date.now();

    /* ── وضع التعديل: نفس النموذج + قاعدة تصفير SM-2 ── */
    if (App.state.editingCardId) {
      var c = null;
      App.state.cards.forEach(function (x) { if (x.id === App.state.editingCardId) c = x; });
      if (!c) { exitEditMode(); return; }
      var contentChanged = (c.front !== front) || (c.back !== back);
      ensureDeck(deckId).then(function (resolvedDeckId) {
        c.front = front; c.back = back; c.tags = tags; c.deckId = resolvedDeckId;
        c.lang = cardLang; c.cefr = cardCefr;
        c.updatedAt = now;
        if (contentChanged) c.srs = App.srs.newState(now); /* تعديل front/back = تصفير؛ الوسوم/الصوت فقط = لا تصفير */
        if (imageRemoved) c.imagePath = null; /* أزال المستخدم الصورة */
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
      return;
    }

    var recF = document.querySelector('.voice-recorder[data-recorder="front"]');
    var recB = document.querySelector('.voice-recorder[data-recorder="back"]');
    ensureDeck(deckId).then(function (resolvedDeckId) {
      var card = { id: U.uid(), deckId: resolvedDeckId, front: front, back: back, tags: tags, lang: cardLang, cefr: cardCefr, srs: App.srs.newState(now), createdAt: now, updatedAt: now, audioFront: recF && recF._blob, audioBack: recB && recB._blob };
      var ops = [persistCardImage(card.id).then(function (res) {
        if (res && res.path) card.imagePath = res.path;
        return App.store.saveCard(card);
      })];
      App.state.cards.push(card);
      if (getEl('twoSidedCheck').checked) {
        var c2 = { id: U.uid(), deckId: resolvedDeckId, front: back, back: front, tags: tags.concat(['↔']), lang: cardLang, cefr: cardCefr, srs: App.srs.newState(now), createdAt: now + 1, updatedAt: now, audioFront: recB && recB._blob, audioBack: recF && recF._blob };
        ops.push(App.store.saveCard(c2));
        App.state.cards.push(c2);
      }
      return Promise.all(ops).then(function () {
        U.toast(App.t('savedOk'), 'success');
        getEl('frontInput').value = ''; getEl('backInput').value = ''; getEl('tagsInput').value = '';
        if (langSel) langSel.value = 'auto'; if (cefrSel) cefrSel.value = 'auto';
        if (recF) App.audio.clear(recF);
        if (recB) App.audio.clear(recB);
        resetImageUI();
        updatePreview();
        App.render.renderAll();
      }, function (err) {
        App.state.cards = App.state.cards.filter(function (x) { return x.id !== card.id && (!c2 || x.id !== c2.id); });
        App.render.renderAll();
        U.toast(App.t('saveFailed') + (err && err.message ? ' — ' + err.message : ''), 'error');
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
    /* عدد البطاقات: 5 / 10 / تلقائي (كل 200 حرف = بطاقة، حد أدنى 3 وحد أقصى 20) */
    var count = App.state.aiOptions.count;
    if (count === 'auto') count = Math.min(20, Math.max(3, Math.ceil(text.length / 200)));
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

  function renderStoryResult(story) {
    var p = App.state.profile || { nativeLang: 'ar', targetLang: 'en', cefrLevel: 'B1' };
    getEl('storyTitleText').textContent = story.title || App.t('storyResultTitle');
    var wc = (story.story || '').split(/\s+/).filter(Boolean).length;
    getEl('storySub').textContent = U.langName(p.targetLang, App.state.lang) + ' · ' + U.fmtInt(wc) + ' ' + App.t('wordsUnit') + ' · ' + (p.cefrLevel || 'B1');
    getEl('storyTargetLabel').textContent = U.langName(p.targetLang, App.state.lang);
    getEl('storyNativeLabel').textContent = U.langName(p.nativeLang, App.state.lang);
    getEl('storyText').textContent = story.story || '';
    var tr = getEl('storyTranslation');
    tr.textContent = story.translation || '';
    tr.parentElement.style.display = story.translation ? '' : 'none';
    var wrap = getEl('storyVocabWrap');
    var v = getEl('storyVocab');
    if (story.vocabulary && story.vocabulary.length) {
      wrap.style.display = '';
      v.innerHTML = story.vocabulary.map(function (w) {
        return '<span class="story-vocab-chip"><b>' + U.esc(w.word) + '</b>' + (w.meaning ? ' — ' + U.esc(w.meaning) : '') + '</span>';
      }).join('');
    } else { wrap.style.display = 'none'; v.innerHTML = ''; }
  }

  /* القصة → بطاقات: يملأ النص ويلتزم للتوليد مباشرة */
  function storyToCards() {
    var story = App.state.lastStory;
    if (!story || !story.story) { U.toast(App.t('aiNeedText'), 'error'); return; }
    closeModal('storyResultModal');
    setAiMode('cards');
    getEl('aiText').value = story.story;
    updateAiCount();
    generateAi();
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
    });
  }

  function doImport(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var json;
      try { json = JSON.parse(reader.result); } catch (e) { U.toast(App.t('importFailed'), 'error'); return; }
      if (!confirm(App.t('wipeConfirm1'))) return;
      App.store.importData(json).then(function () {
        return Promise.all([App.store.getDecks(), App.store.getCards(), App.store.getReviews(), App.store.getSettings()]);
      }).then(function (r) {
        App.state.decks = r[0]; App.state.cards = r[1]; App.state.reviews = r[2];
        App.state.settings = r[3];
        applyTheme();
        App.i18n.applyLang(App.state.settings.lang);
        App.render.renderAll();
        U.toast(App.t('importedOk'), 'success');
      }).catch(function () { U.toast(App.t('importFailed'), 'error'); });
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
    /* رابط Google AI Studio: في Tauri يفتح بالمتصفح الخارجي عبر opener، وفي المتصفح بشكل طبيعي */
    var aiLink = getEl('aiStudioLink');
    if (aiLink) {
      aiLink.addEventListener('click', function (e) {
        try {
          var T = window.__TAURI__;
          var opener = T && (T.opener || T.shell);
          if (opener && (opener.openUrl || opener.open)) {
            e.preventDefault();
            var url = aiLink.getAttribute('href');
            if (opener.openUrl) opener.openUrl(url); else opener.open(url);
          }
        } catch (err) { /* المتصفح: سلوك الرابط الطبيعي */ }
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
      if (t.closest('#showAnswer')) { e.preventDefault(); App.study.flip(); return; }
      var rateBtn = t.closest('.rate-btn');
      if (rateBtn) { e.preventDefault(); App.study.rate(rateBtn.getAttribute('data-rate')); return; }
      if (t.closest('#flashCard') && !t.closest('.flash-tts') && !t.closest('#audioBadge') && !t.closest('.rate-btn')) {
        /* النقر على البطاقة يقلب في الاتجاهين دائماً (أمامي ← خلفي ← أمامي...) */
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
        if (ttsMini.getAttribute('data-tts') === 'Question') App.tts.speak(getEl('frontInput').value, 'front');
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
          App.tts.speak(ss.dir === 'reverse' ? cur.back : cur.front, ss.dir === 'reverse' ? 'back' : 'front');
        }
        return;
      }
      /* زر الترجمة */
      if (t.closest('#translateBtn')) { e.preventDefault(); doTranslate(); return; }

      /* رفع صورة البطاقة + إزالتها */
      if (t.closest('#imageUploadBtn')) { e.preventDefault(); getEl('imageFileInput').click(); return; }
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

      /* فحص التحديثات */
      if (t.closest('#checkUpdateBtn')) { e.preventDefault(); checkAppUpdate(); return; }

      /* حجم الخط +/- */
      if (t.closest('#fontSizeMinus')) { e.preventDefault(); nudgeFontSize(-2); return; }
      if (t.closest('#fontSizePlus')) { e.preventDefault(); nudgeFontSize(2); return; }

      /* وضع AI: بطاقات / قصة */
      var aiModeOpt = t.closest('.ai-mode-opt');
      if (aiModeOpt) { e.preventDefault(); setAiMode(aiModeOpt.getAttribute('data-ai-mode')); return; }
      if (t.closest('#storyTtsBtn')) { e.preventDefault(); var st = App.state.lastStory; if (st && st.story) App.tts.speak(st.story, 'front'); return; }
      if (t.closest('#storyToCardsBtn')) { e.preventDefault(); storyToCards(); return; }

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
          if (recAction.classList.contains('del')) App.audio.clear(rc);
          else App.audio.play(rc);
        }
        return;
      }

      /* 10) action attributes */
      var act = t.closest('[data-action]');
      if (act) {
        var action = act.getAttribute('data-action');
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
      } else if (el.id === 'aiDeckSelect') {
        syncAiDeckTitle();
      } else if (el.id === 'modelSelect') {
        App.state.settings.model = el.value;
        persistSettings();
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
            App.study.rate(['again', 'hard', 'good', 'easy'][parseInt(e.key, 10) - 1]);
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
    _internal: { saveManualCard: saveManualCard, doExport: doExport, generateAi: generateAi, generateStoryAi: generateStoryAi, checkAppUpdate: checkAppUpdate, nudgeFontSize: nudgeFontSize }
  };
  App.updateAiModeUi = updateAiModeUi;
})();
