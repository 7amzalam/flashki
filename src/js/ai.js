/* Flashki — ai.js : توليد بطاقات ذكي + ترجمة فورية عبر Gemini.
   Desktop (Tauri): الطلب عبر نواة Rust — بلا CORS، المفتاح محلي.
   Browser: fetch مباشر (Gemini يدعم CORS). */
(function () {
  'use strict';
  var App = window.App = window.App || {};
  var U = App.util;

  function profile() { return App.state.profile || { nativeLang: 'ar', targetLang: 'en', cefrLevel: 'B1' }; }
  /* أسماء اللغات داخل البرومبت بالإنجليزية دائماً (جودة النموذج) — بغض النظر عن لغة الواجهة.
   "English" لا تظهر إلا إذا كانت native/target = en فعلاً */
  function ln(code) { return U.langName(code, 'en'); }

  /* ═════════ البرومبت الكامل (يُحفظ في ai_generations.prompt_used) ═════════ */
  /* a/an الصحيحة نحوياً حسب أول حرف من اسم اللغة */
  function article(word) { return /^[aeiou]/i.test(String(word || '')) ? 'an' : 'a'; }

  function buildPrompt(text, count, withContext) {
    var p = profile();
    var nativeName = ln(p.nativeLang), targetName = ln(p.targetLang);
    var nativeCode = p.nativeLang || 'ar', targetCode = p.targetLang || 'en';
    var cefr = p.cefrLevel || 'B1';

    var head =
      'You are a professional flashcard generator for ' + article(nativeName) + ' ' + nativeName + ' speaker learning ' + targetName + '.\n' +
      '\n' +
      'User profile:\n' +
      '- Native language: ' + nativeName + ' (' + nativeCode + ')\n' +
      '- Target language: ' + targetName + ' (' + targetCode + ')\n' +
      '- CEFR level: ' + cefr + '\n' +
      '\n' +
      'Generate exactly ' + count + ' cards in this exact format:\n' +
      '- front: word or expression in ' + targetName + '\n' +
      '- back: precise meaning in ' + nativeName + '\n' +
      '- example: natural sentence in ' + targetName + '\n' +
      '- example_translation: translation of the example in ' + nativeName + '\n' +
      '- tags: array of 2-3 relevant categories\n' +
      '- cefr: the CEFR level of the card (A1|A2|B1|B2|C1|C2)\n' +
      '\n' +
      'EXTRACTION RULES — apply strictly:\n' +
      '\n' +
      '1. FREQUENCY FILTER:\n' +
      '   - Include words that appear >=2 times in the text\n' +
      '   - Skip words that appear only once UNLESS they are marked as high-value (see #3)\n' +
      '\n' +
      '2. PRIORITY ORDER (extract in this order, stop when reaching the requested count):\n' +
      '   a) High-frequency common words (top 3000 in ' + targetName + ')\n' +
      '   b) Words at or just above the user\'s CEFR level (' + cefr + ')\n' +
      '   c) Idiomatic expressions and collocations (2+ words)\n' +
      '   d) Useful phrasal verbs and prepositions combinations\n' +
      '   e) Technical words ONLY if they appear >=3 times\n' +
      '\n' +
      '3. ALWAYS SKIP:\n' +
      '   - Proper names (people, cities, brands)\n' +
      '   - Numbers and dates\n' +
      '   - Single characters or punctuation\n' +
      '   - Basic stopwords in either language: articles, pronouns, conjunctions, auxiliary verbs\n' +
      '   - Words the user already knows at level ' + cefr + ' minus 1 (e.g., if user is B1, skip A1 words)\n' +
      '\n' +
      '4. DIFFICULTY BALANCE:\n' +
      '   - 40% at user\'s level\n' +
      '   - 30% slightly above (to push growth)\n' +
      '   - 20% review of below-level but common words\n' +
      '   - 10% idioms/special expressions\n' +
      '\n' +
      '5. QUALITY BAR:\n' +
      '   - Every back must be a precise definition, not a vague synonym\n' +
      '   - Every example must be a real, natural sentence (not grammatically awkward)\n' +
      '   - Every example must use the word in a realistic context\n' +
      '   - Idioms must include cultural/usage note when relevant\n' +
      '\n' +
      '6. DUPLICATES:\n' +
      '   - Skip any word already present in the same deck (case-insensitive, trimmed)\n' +
      '   - Report count of skipped duplicates';

    if (!withContext) {
      head += '\n\nNOTE: set "example" and "example_translation" to empty strings "" for every card.';
    }

    var format =
      '\n\n' +
      'DECK TITLE RULE:\n' +
      '- deck_title: a short, descriptive topic title (2-5 words) in ' + targetName + ' that summarizes the main theme of the text (e.g. a text about cooking → "Kochen und Essen"; a text about job interviews → "Bewerbungsgespräche").\n' +
      '- The title must reflect the actual content of the text, be specific, and must NOT be generic like "Vocabulary" or "Words".\n' +
      '\n' +
      'Return STRICT JSON only — no markdown, no code fences, no commentary:\n' +
      '{"deck_title":"...","cards":[{"front":"resilient","back":"...","example":"...","example_translation":"...","tags":["..."],"cefr":"B2"}],"skipped_duplicates":0,"source_analysis":"Text contains N unique words, M high-value candidates identified, K generated"}';

    var existing = existingWords();
    if (existing.length) {
      format += '\n\nALREADY IN DECK (skip these — case-insensitive):\n' + existing.join(', ');
    }

    format += '\n\nSTUDY TEXT:\n"""\n' + text + '\n"""';
    return head + format;
  }

  /* كلمات القسم الموجودة (حتى يتفادى Gemini المكرر) — حد 150 كلمة */
  function existingWords() {
    var deckId = null;
    var el = document.getElementById('aiDeckSelect');
    if (el && el.value) deckId = el.value;
    var words = App.state.cards
      .filter(function (c) { return !deckId || c.deckId === deckId; })
      .map(function (c) { return (c.front || '').trim().toLowerCase(); })
      .filter(function (w, i, a) { return w && a.indexOf(w) === i; })
      .slice(0, 150);
    return words;
  }

  /* ═════════ برومبت الترجمة الفورية ═════════ */
  function buildTranslatePrompt(text) {
    var p = profile();
    return 'Translate the following ' + ln(p.targetLang) + ' text to ' + ln(p.nativeLang) + '.\n' +
      'Provide ONLY the translation, no explanation, no quotes.\n' +
      "If it's a single word, give the most common meaning + part of speech in parentheses.\n" +
      "If it's a phrase, give the natural translation.\n" +
      '\n' +
      'Text: ' + text;
  }

  /* ═════════ برومبت توليد القصة (وضع قصة) ═════════ */
  function storyLength(cefr) {
    if (cefr === 'A1' || cefr === 'A2') return '80-120 words';
    if (cefr === 'C1' || cefr === 'C2') return '200-300 words';
    return '120-200 words';
  }

  function buildStoryPrompt(text) {
    var p = profile();
    var nativeName = ln(p.nativeLang), targetName = ln(p.targetLang);
    var nativeCode = p.nativeLang || 'ar', targetCode = p.targetLang || 'en';
    var cefr = p.cefrLevel || 'B1';
    return 'You are a professional language-learning story writer for ' + article(nativeName) + ' ' + nativeName +
      ' speaker learning ' + targetName + '.\n' +
      '\n' +
      'User profile:\n' +
      '- Native language: ' + nativeName + ' (' + nativeCode + ')\n' +
      '- Target language: ' + targetName + ' (' + targetCode + ')\n' +
      '- CEFR level: ' + cefr + '\n' +
      '\n' +
      'Write a short story in ' + targetName + ' for a learner at CEFR level ' + cefr + '.\n' +
      '\n' +
      'STORY RULES:\n' +
      '- Length: ' + storyLength(cefr) + '\n' +
      '- Use mostly vocabulary at CEFR level ' + cefr + ', with a few words slightly above to stretch learning\n' +
      '- Natural, engaging plot with a clear beginning, middle and end\n' +
      '- Sentence structures appropriate to the level, but not childish\n' +
      '- Use the user input below as the core theme, or weave the given words naturally into the story\n' +
      '\n' +
      'Return STRICT JSON only — no markdown, no code fences, no commentary:\n' +
      '{"title":"...","story":"...","translation":"...","vocabulary":[{"word":"...","meaning":"..."}]}\n' +
      '\n' +
      '- title: short story title in ' + targetName + '\n' +
      '- story: the complete story in ' + targetName + '\n' +
      '- translation: complete faithful translation of the story in ' + nativeName + '\n' +
      '- vocabulary: 5-8 key words or expressions from the story that a learner at ' + cefr + ' might not know, each with its precise meaning in ' + nativeName + '\n' +
      '\n' +
      'USER INPUT (topic, theme or words to include):\n' +
      '"""\n' + text + '\n"""';
  }

  function parseStory(raw) {
    var s = String(raw || '').trim();
    s = s.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    var start = s.indexOf('{'), end = s.lastIndexOf('}');
    if (start > 0 || end < s.length - 1) { if (start >= 0 && end > start) s = s.slice(start, end + 1); }
    var data = JSON.parse(s);
    if (!data || !data.story) throw new Error('bad format');
    var vocab = (Array.isArray(data.vocabulary) ? data.vocabulary : []).map(function (v) {
      if (!v || !v.word) return null;
      return { word: String(v.word).trim(), meaning: String(v.meaning || '').trim() };
    }).filter(Boolean).slice(0, 8);
    return {
      title: String(data.title || '').trim(),
      story: String(data.story).trim(),
      translation: String(data.translation || '').trim(),
      vocabulary: vocab
    };
  }

  /* ═════════ الاتصال ═════════ */
  /* نماذج Gemini المجانية للحسابات الجديدة — مختبرة فعلياً بالمفتاح (10/2026):
     الحية: 3.8-flash / 3.6-flash / flash-latest / flash-lite-latest (+ 3.5/3.1-flash-lite).
     الميتة: 2.5/2.0/1.5 (404 للحسابات الجديدة). Pro كلها مدفوعة (429 quota).
     سلسلة الاحتياط: عند خطأ نموذج (404) أو ازدحام (429/503 high demand) ينتقل تلقائياً للنموذج التالي */
  var MODEL_CHAIN = ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-flash-latest', 'gemini-flash-lite-latest'];
  var DEAD_MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-3.8-pro', 'gemini-3.8-flash-lite', 'gemini-3-flash'];

  /* ⚠️ v20: بدون thinkingConfig(budget=0) يستهلك النموذج كل الرصيد في "التفكير"
     (thoughtsTokenCount >> candidatesTokenCount) ويعيد نصاً فارغاً — هذا هو سبب
     فشل التوليد الحقيقي. إن رفض نموذج thinkingConfig نفسه → إعادة بلا تفكير ثم السلسلة. */
  function generationConfig(json, schema, noThinking) {
    var gc = { temperature: 0.4, maxOutputTokens: 4096 };
    if (!noThinking) gc.thinkingConfig = { thinkingBudget: 0 };
    if (json) {
      gc.responseMimeType = 'application/json';
      if (schema) gc.responseSchema = schema;
    }
    return gc;
  }

  /* مخطط ترجمة صارم: يضمن {"translation": "..."} دائماً */
  var TRANSLATION_SCHEMA = {
    type: 'OBJECT',
    properties: { translation: { type: 'STRING' } },
    required: ['translation']
  };

  function logUsage(usage) {
    try {
      var u = usage || {};
      console.log('[flashki] gemini usage — prompt:', u.promptTokenCount || 0,
        'output:', u.candidatesTokenCount || 0, 'thoughts:', u.thoughtsTokenCount || 0);
    } catch (e) {}
  }

  function modelList() {
    var m = (App.state.settings && App.state.settings.model) || '';
    var arr = [];
    if (m && DEAD_MODELS.indexOf(m) < 0) arr.push(m);
    MODEL_CHAIN.forEach(function (x) { if (arr.indexOf(x) < 0) arr.push(x); });
    return arr;
  }

  function isModelErr(msg) {
    return /no longer available|is not found|not found for API version|not supported for generateContent/i.test(String(msg || ''));
  }

  /* ازدحام/سعة: ينتقل للنموذج التالي في السلسلة ("high demand" شائع على flash في الذروة) */
  function isBusyErr(msg) {
    return /RESOURCE_EXHAUSTED|high demand|overloaded?|service unavailable|UNAVAILABLE|exceeded your current quota|\b429\b|\b503\b/i.test(String(msg || ''));
  }

  /* تصنيف خطأ المفتاح: صالح vs فاسد vs ازدحام vs حجب جغرافي —
     المفتاح يُعتبر صالحاً (مصادقة ناجحة) في كل الحالات عدا "API key not valid" */
  function classifyKeyError(e) {
    var msg = String((e && e.message) || e || '');
    if (/API key not valid|API_KEY_INVALID|invalid API key/i.test(msg)) return { kind: 'invalid', message: msg };
    if (/location is not supported/i.test(msg)) return { kind: 'geo', message: msg };
    if (isBusyErr(msg) || /internal error|\b500\b/i.test(msg)) return { kind: 'busy', message: msg };
    return { kind: 'network', message: msg };
  }

  function callTauri(apiKey, model, prompt, json, schema, noThinking) {
    return window.__TAURI__.core.invoke('gemini_generate', {
      apiKey: apiKey, model: model, prompt: prompt,
      jsonMode: !!json, schema: schema || null, useThinking: !noThinking
    }).then(function (res) {
      /* Rust يعيد { text, usage } — النص مستخرج جاهزاً + اللوج في الطرفية */
      logUsage(res && res.usage);
      var t = (res && res.text != null) ? String(res.text) : '';
      if (!t.trim()) throw new Error('empty response');
      return t;
    });
  }

  function callBrowser(apiKey, model, prompt, json, schema, noThinking) {
    var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) +
      ':generateContent?key=' + encodeURIComponent(apiKey);
    var body = { contents: [{ parts: [{ text: prompt }] }], generationConfig: generationConfig(json, schema, noThinking) };
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (resp) {
      return resp.json().then(function (data) {
        if (!resp.ok) {
          var msg = (data && data.error && data.error.message) || ('HTTP ' + resp.status);
          throw new Error(msg);
        }
        logUsage(data && data.usageMetadata);
        var parts = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
        var out = parts.map(function (p) { return p.text || ''; }).join('');
        if (!out.trim()) {
          var finish = (data.candidates && data.candidates[0] && data.candidates[0].finishReason) || '?';
          throw new Error('empty response (finishReason=' + finish + ')');
        }
        return out;
      });
    });
  }

  function call(apiKey, model, prompt, json, schema, noThinking) {
    var isTauri = !!(window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke);
    return isTauri ? callTauri(apiKey, model, prompt, json, schema, noThinking)
                   : callBrowser(apiKey, model, prompt, json, schema, noThinking);
  }

  /* النموذج رفض thinkingConfig نفسه (400 invalid JSON payload) → أعد بلا تفكير على النموذج نفسه */
  function isThinkingErr(msg) {
    return /thinkingConfig|thinking_budget|thinkingBudget|thinking_config/i.test(String(msg || ''));
  }

  /* استدعاء ذكي: يجرب النموذج المختار ثم البدائل تلقائياً —
     thinkingConfig مرفوض → إعادة على نفس النموذج بلا تفكير؛
     خطأ نموذج (404/إيقاف) أو ازدحام (429/503 high demand) → النموذج التالي */
  function callSmart(apiKey, prompt, json, schema) {
    var models = modelList();
    var i = 0;
    function attempt(noThinking) {
      return call(apiKey, models[i], prompt, json, schema, noThinking).catch(function (e) {
        var m = e && e.message;
        if (!noThinking && isThinkingErr(m)) return attempt(true);
        if (i < models.length - 1 && (isModelErr(m) || isBusyErr(m))) { i++; return attempt(false); }
        throw e;
      });
    }
    return attempt(false);
  }

  /* ═════════ تحليل رد Gemini ═════════ */
  function parseCards(raw) {
    var s = String(raw || '').trim();
    s = s.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    var start = s.indexOf('{'), end = s.lastIndexOf('}');
    if (start > 0 || end < s.length - 1) { if (start >= 0 && end > start) s = s.slice(start, end + 1); }
    var data = JSON.parse(s);
    var cards = (data && (data.cards || data.flashcards)) || [];
    if (!Array.isArray(cards)) throw new Error('bad format');
    var out = [];
    cards.forEach(function (c) {
      if (!c || !c.front || !c.back) return;
      out.push({
        front: String(c.front).trim(),
        back: String(c.back).trim(),
        example: c.example ? String(c.example).trim() : '',
        exampleTranslation: c.example_translation ? String(c.example_translation).trim() : '',
        tags: Array.isArray(c.tags) ? c.tags.map(function (t) { return String(t).trim(); }).filter(Boolean).slice(0, 3) : [],
        cefr: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].indexOf(c.cefr) >= 0 ? c.cefr : null
      });
    });
    out._meta = {
      deckTitle: (data && typeof data.deck_title === 'string' && data.deck_title.trim()) || '',
      skippedDuplicates: (data && Number(data.skipped_duplicates)) || 0,
      sourceAnalysis: (data && data.source_analysis) || ''
    };
    return out;
  }

  /* opts: { count, twosided, context } */
  function generate(text, opts) {
    opts = opts || {};
    var settings = App.state.settings;
    if (!settings.apiKey) return Promise.reject({ message: App.t('aiNoKey') });
    var prompt = buildPrompt(text, opts.count || 5, !!opts.context);
    App.lastPrompt = prompt; /* للرجوع إليه عند الدعم + الحفظ في prompt_used */
    return callSmart(settings.apiKey, prompt, true).then(function (raw) {
      var cards = parseCards(raw);
      if (!cards.length) throw new Error('empty');
      App.aiResultMeta = cards._meta;
      if (opts.twosided) {
        var rev = cards.map(function (c) {
          return { front: c.back, back: c.front, example: c.exampleTranslation, exampleTranslation: c.example, tags: c.tags.concat(['↔']), cefr: c.cefr };
        });
        cards = cards.concat(rev);
      }
      return cards;
    });
  }

  /* ═════════ ترجمة السؤال → ملء الإجابة ═════════
     v20: الرد JSON مفروض بـ responseSchema — نستخرج translation فقط،
     ولا يُعرض JSON خام في الحقل أبداً (اختبار المستخدم: Hello → {"translation":...}) */
  function extractTranslation(raw) {
    var s = String(raw || '').trim();
    s = s.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    if (s.charAt(0) === '{') {
      try {
        var obj = JSON.parse(s);
        if (obj && obj.translation != null && String(obj.translation).trim()) return String(obj.translation).trim();
      } catch (e) { /* ليس JSON — تابع للنص الخام */ }
    }
    return s.replace(/^"|"$/g, '').trim();
  }

  function translate(text) {
    var settings = App.state.settings;
    if (!settings.apiKey) return Promise.reject({ message: App.t('aiNoKey') });
    return callSmart(settings.apiKey, buildTranslatePrompt(text), true, TRANSLATION_SCHEMA).then(extractTranslation);
  }

  /* توليد قصة من نص/كلمات — JSON صارم */
  function generateStory(text) {
    var settings = App.state.settings;
    if (!settings.apiKey) return Promise.reject({ message: App.t('aiNoKey') });
    var prompt = buildStoryPrompt(text);
    App.lastPrompt = prompt;
    return callSmart(settings.apiKey, prompt, true).then(parseStory);
  }

  /* تحقق سريع من صلاحية المفتاح — طلب اختبار مصغّر قبل الحفظ.
     يرجع { ok:true } أو { ok:false, kind:'invalid'|'busy'|'geo'|'network', message } —
     kind=busy/geo يعني أن المصادقة نجحت والمفتاح صالح (يُحفظ) والخطأ في الخدمة/الشبكة */
  function verifyKey(apiKey) {
    return callSmart(apiKey, 'Reply with exactly: OK', false).then(function (raw) {
      if (String(raw || '').trim().length > 0) return { ok: true };
      return { ok: false, kind: 'invalid', message: 'empty response' };
    }).catch(function (e) {
      var c = classifyKeyError(e);
      return { ok: false, kind: c.kind, message: c.message };
    });
  }

  App.ai = { generate: generate, parseCards: parseCards, buildPrompt: buildPrompt, buildTranslatePrompt: buildTranslatePrompt, translate: translate, extractTranslation: extractTranslation, verifyKey: verifyKey, classifyKeyError: classifyKeyError, isBusyError: isBusyErr, buildStoryPrompt: buildStoryPrompt, generateStory: generateStory, parseStory: parseStory, modelList: modelList, isDeadModel: function (m) { return DEAD_MODELS.indexOf(m) >= 0; } };
})();
