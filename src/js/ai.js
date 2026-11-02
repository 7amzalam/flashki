/* Flashki — ai.js : توليد بطاقات ذكي + ترجمة فورية عبر Gemini.
   Desktop (Tauri): الطلب عبر نواة Rust — بلا CORS، المفتاح محلي.
   Browser: fetch مباشر (Gemini يدعم CORS). */
(function () {
  'use strict';
  var App = window.App = window.App || {};
  var U = App.util;

  function profile() {
    var p = Object.assign({}, App.state.profile || { nativeLang: 'ar', targetLang: 'en', cefrLevel: 'B1' });
    var sel = document.getElementById('aiTargetLangSelect');
    if (sel && sel.value) p.targetLang = sel.value;
    return p;
  }
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
      '- Native language (learner speaks this): ' + nativeName + ' (' + nativeCode + ')\n' +
      '- Target language (learner is learning this): ' + targetName + ' (' + targetCode + ')\n' +
      '- CEFR level: ' + cefr + '\n' +
      '\n' +
      'CRITICAL LANGUAGE RULES (NEVER INVERT OR SWAP!):\n' +
      '1. "front": MUST BE IN ' + targetName.toUpperCase() + ' ONLY (e.g. German: "das Geheimnis", "erforschen"). NEVER put ' + nativeName + ' (Arabic) on front!\n' +
      '2. "back": MUST BE IN ' + nativeName.toUpperCase() + ' ONLY (e.g. Arabic: "السر", "يستكشف"). NEVER put ' + targetName + ' (German) on back!\n' +
      '3. "example": ALWAYS provide a natural, focused example sentence in ' + targetName.toUpperCase() + ' containing the front word.\n' +
      '4. "example_translation": ALWAYS provide the Arabic/native translation in ' + nativeName.toUpperCase() + ' for that example sentence.\n' +
      '\n' +
      'Generate exactly ' + count + ' rich cards in this exact format:\n' +
      '- front: word or expression in ' + targetName + ' (TARGET LANGUAGE ONLY; for German nouns include der/die/das; for verbs use infinitive)\n' +
      '- back: precise meaning in ' + nativeName + ' (NATIVE LANGUAGE ONLY)\n' +
      '- example: natural focused sentence in ' + targetName + '\n' +
      '- example_translation: translation of the example in ' + nativeName + '\n' +
      '- tags: array of 2-3 relevant categories\n' +
      '- cefr: the CEFR level of the card (A1|A2|B1|B2|C1|C2)\n' +
      '\n' +
      'EXTRACTION RULES:\n' +
      '1. Extract ' + count + ' high-value vocabulary items and expressions from across the entire text suitable for CEFR ' + cefr + ' learners.\n' +
      '2. Include diverse nouns (with gender article), essential verbs, adjectives, and natural collocations.\n' +
      '3. Do NOT limit to words repeated multiple times. Extract key educational vocabulary even if it appears once in the text.\n' +
      '4. Skip proper names, dates, numbers, and basic stopwords (pronouns, auxiliary verbs).\n' +
      '5. Always provide realistic context sentences in "example" and "example_translation".';

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
    return 'Translate the following text strictly from ' + ln(p.targetLang) + ' into ' + ln(p.nativeLang) + '.\n' +
      'Text is in ' + ln(p.targetLang) + '. You must output the translation in ' + ln(p.nativeLang) + '.\n' +
      'Provide ONLY the translation, no explanation, no quotes.\n' +
      "If it's a single word, give the most common meaning + part of speech in parentheses.\n" +
      "If it's a phrase, give the natural translation.\n" +
      '\n' +
      'Text: ' + text;
  }

  /* ═════════ برومبت توليد القصة (وضع قصة) ═════════ */
  /* عقد الصعوبة لكل مستوى CEFR: كلما ارتفع المستوى زاد الطول والمفردات وتعقيد التركيب */
  function storySpec(cefr) {
    var map = {
      A1: {
        len: '80-120 words', vocab: '4-6',
        desc: 'Absolute beginner (A1). Use ONLY the most basic high-frequency vocabulary. Very short simple sentences (max 8-10 words each). Present tense only. No subordinate clauses. Concrete everyday situations (family, food, school, shopping).'
      },
      A2: {
        len: '120-170 words', vocab: '5-8',
        desc: 'Elementary (A2). Use A1-A2 vocabulary with at most 2-3 slightly harder stretch words. Short sentences (max 12 words). Present tense and simple past. Basic connectors (and, but, then, because). Familiar everyday topics.'
      },
      B1: {
        len: '170-240 words', vocab: '6-9',
        desc: 'Intermediate (B1). Mainly B1 vocabulary with a few B2 stretch words. Medium-length sentences with common subordinate clauses. Narration mostly in past tense. Everyday but richer topics (travel, work, friendships).'
      },
      B2: {
        len: '240-320 words', vocab: '7-10',
        desc: 'Upper-intermediate (B2). Mainly B2 vocabulary with some C1 stretch words. Varied sentence structures, common idiomatic expressions, opinions and mildly abstract topics.'
      },
      C1: {
        len: '320-420 words', vocab: '8-12',
        desc: 'Advanced (C1). Rich C1 vocabulary, idioms, nuanced connectors, complex and varied sentence structures, flexible register. Fluent natural style close to authentic texts.'
      },
      C2: {
        len: '420-550 words', vocab: '10-15',
        desc: 'Mastery (C2). Near-native sophistication: precise and rare vocabulary, idioms, stylistic devices (metaphor, irony, wordplay), elegant complex structures. Full literary fluency.'
      }
    };
    return map[cefr] || map.B1;
  }

  function buildStoryPrompt(text) {
    var p = profile();
    var nativeName = ln(p.nativeLang), targetName = ln(p.targetLang);
    var nativeCode = p.nativeLang || 'ar', targetCode = p.targetLang || 'en';
    var cefr = p.cefrLevel || 'B1';
    var spec = storySpec(cefr);
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
      'DIFFICULTY CONTRACT (MUST FOLLOW EXACTLY):\n' +
      '- Target length: ' + spec.len + ' — count the words before answering.\n' +
      '- ' + spec.desc + '\n' +
      '- The higher the CEFR level, the longer the story, the richer the vocabulary and the more complex the grammar. NEVER write a ' + cefr + ' story with beginner-level vocabulary or a beginner story with advanced vocabulary.\n' +
      '- Natural, engaging plot with a clear beginning, middle and end, appropriate to the level but not childish\n' +
      '- Use the user input below as the core theme, or weave the given words naturally into the story\n' +
      '\n' +
      'Return STRICT JSON only — no markdown, no code fences, no commentary:\n' +
      '{"title":"...","story":"...","translation":"...","sentences":[{"target":"...","native":"..."}],"vocabulary":[{"word":"...","meaning":"..."}]}\n' +
      '\n' +
      '- title: short story title in ' + targetName + '\n' +
      '- story: the complete story in ' + targetName + '\n' +
      '- translation: complete faithful translation of the story in ' + nativeName + '\n' +
      '- sentences: array of each individual sentence in ' + targetName + ' ("target") matched with its direct translation in ' + nativeName + ' ("native")\n' +
      '- vocabulary: ' + spec.vocab + ' key words or expressions from the story that a learner at ' + cefr + ' might not know, each with its precise meaning in ' + nativeName + '\n' +
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
    }).filter(Boolean).slice(0, 15);
    var sentences = [];
    if (Array.isArray(data.sentences) && data.sentences.length) {
      sentences = data.sentences.map(function (pair) {
        if (!pair || !pair.target) return null;
        return {
          target: String(pair.target).trim(),
          native: String(pair.native || pair.translation || '').trim()
        };
      }).filter(Boolean);
    }
    return {
      title: String(data.title || '').trim(),
      story: String(data.story).trim(),
      translation: String(data.translation || '').trim(),
      sentences: sentences,
      vocabulary: vocab
    };
  }

  /* ═════════ الاتصال ═════════ */
  /* نماذج Gemini الحية المجانية:
     gemini-3.6-flash و gemini-3.8-flash و gemini-3.5-flash-lite (+ flash-latest).
     النماذج القديمة (2.5 / 2.0 / 1.5) أوقفتها جوجل وتعيد 404.
     سلسلة الاحتياط: عند خطأ نموذج أو ازدحام (429/503) ينتقل تلقائياً للنموذج التالي */
  var MODEL_CHAIN = ['gemini-3.6-flash', 'gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-flash-latest', 'gemini-flash-lite-latest'];
  var DEAD_MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-3.8-pro', 'gemini-1.0-pro', 'gemini-pro'];

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

  var AR_REGEX = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
  function isArabicText(t) { return AR_REGEX.test(String(t || '')); }

  /* ═════════ تحليل رد Gemini ═════════ */
  function parseCards(raw) {
    var s = String(raw || '').trim();
    s = s.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    var start = s.indexOf('{'), end = s.lastIndexOf('}');
    if (start > 0 || end < s.length - 1) { if (start >= 0 && end > start) s = s.slice(start, end + 1); }
    var data = JSON.parse(s);
    var cards = (data && (data.cards || data.flashcards)) || [];
    if (!Array.isArray(cards)) throw new Error('bad format');
    var p = profile();
    var nativeIsArabic = (p.nativeLang === 'ar');
    var targetIsArabic = (p.targetLang === 'ar');

    var out = [];
    cards.forEach(function (c) {
      if (!c || !c.front || !c.back) return;
      var f = String(c.front).trim();
      var b = String(c.back).trim();
      var ex = c.example ? String(c.example).trim() : '';
      var exTr = c.example_translation ? String(c.example_translation).trim() : '';

      /* التحقق من عدم عكس اللغات: الوجه الأمامي يجب أن يكون بلغة التعلم، والخلفي بلغة المستخدم */
      if (nativeIsArabic && !targetIsArabic) {
        if (isArabicText(f) && !isArabicText(b)) {
          var tmpF = f; f = b; b = tmpF;
          if (isArabicText(ex) && !isArabicText(exTr)) {
            var tmpEx = ex; ex = exTr; exTr = tmpEx;
          }
        }
      } else if (!nativeIsArabic && targetIsArabic) {
        if (!isArabicText(f) && isArabicText(b)) {
          var tmpF2 = f; f = b; b = tmpF2;
          if (!isArabicText(ex) && isArabicText(exTr)) {
            var tmpEx2 = ex; ex = exTr; exTr = tmpEx2;
          }
        }
      }

      out.push({
        front: f,
        back: b,
        example: ex,
        exampleTranslation: exTr,
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

  /* توليد بطاقة واحدة مباشرة من كلمة داخل سياق القصة */
  function createCardFromWord(word, contextSentence) {
    var settings = App.state.settings;
    if (!settings.apiKey) return Promise.reject({ message: App.t('aiNoKey') });
    var p = profile();
    var nativeName = ln(p.nativeLang), targetName = ln(p.targetLang);
    var prompt =
      'You are creating a language learning flashcard for ' + article(nativeName) + ' ' + nativeName + ' speaker learning ' + targetName + '.\n' +
      'Word to learn: "' + word + '"\n' +
      (contextSentence ? 'Context in story: "' + contextSentence + '"\n' : '') +
      '\n' +
      'Generate STRICT JSON only (no markdown, no backticks):\n' +
      '{"front":"...", "back":"...", "example":"...", "example_translation":"...", "cefr":"' + (p.cefrLevel || 'B1') + '", "tags":["story"]}\n' +
      '\n' +
      'RULES:\n' +
      '- "front": The base / dictionary form of the word in ' + targetName + ':\n' +
      '  * If the word is an inflected verb in any tense (e.g. "arbeitete", "blieb", "ging", "sah", "hatte", "machte"), you MUST return the INFINITIVE / LEMMA form (e.g. "arbeiten", "bleiben", "gehen", "sehen", "haben", "machen"). NEVER keep the conjugated or past form!\n' +
      '  * If the word is a noun in ' + targetName + ' (e.g. German/Spanish/French), you MUST prepend the correct definite article (der/die/das in German, el/la in Spanish) and capitalize correctly (e.g. "der Projektleiter", "die Kollegin", "das Büro", "das Problem", "die Datei").\n' +
      '- "back": Precise concise meaning/translation in ' + nativeName + ' (e.g. Arabic) only.\n' +
      '- "example": The sentence from the story containing the word (or a concise clear example sentence in ' + targetName + ').\n' +
      '- "example_translation": Natural faithful translation of the example sentence in ' + nativeName + '.\n';

    return callSmart(settings.apiKey, prompt, true).then(function (raw) {
      var s = String(raw || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
      var start = s.indexOf('{'), end = s.lastIndexOf('}');
      if (start >= 0 && end > start) s = s.slice(start, end + 1);
      var data = JSON.parse(s);
      var f = String(data.front || word).trim();
      var b = String(data.back || '').trim();
      var ex = String(data.example || contextSentence || '').trim();
      var exTr = String(data.example_translation || '').trim();

      if (p.nativeLang === 'ar' && p.targetLang !== 'ar') {
        if (isArabicText(f) && !isArabicText(b)) {
          var tmp = f; f = b; b = tmp;
          var tmpEx = ex; ex = exTr; exTr = tmpEx;
        }
      }

      return {
        front: f,
        back: b,
        example: ex,
        exampleTranslation: exTr,
        cefr: data.cefr || p.cefrLevel || 'B1',
        tags: Array.isArray(data.tags) ? data.tags : ['story']
      };
    });
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

  App.ai = {
    generate: generate, parseCards: parseCards, buildPrompt: buildPrompt,
    buildTranslatePrompt: buildTranslatePrompt, translate: translate,
    extractTranslation: extractTranslation, verifyKey: verifyKey,
    classifyKeyError: classifyKeyError, isBusyError: isBusyErr,
    buildStoryPrompt: buildStoryPrompt, generateStory: generateStory, parseStory: parseStory,
    createCardFromWord: createCardFromWord,
    modelList: modelList, isDeadModel: function (m) { return DEAD_MODELS.indexOf(m) >= 0; }
  };
})();
