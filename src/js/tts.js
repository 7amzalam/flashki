/* Flashki — tts.js : النطق بكشف تلقائي للغة
   ─ ترتيب المحركات (الافتراضي auto): صوت مايكروسوفت Edge TTS على كل الأجهزة بما فيها
     الهاتف (WebSocket + Sec-MS-GEC بلا BigInt — توافق مع WebView القديم v1.7.2).
     عند تعذره (بلا شبكة) → Google TTS → نطق المتصفح. إعداد 'phone' يبدأ بأصوات
     الهاتف عكسياً (اختياري من الإعدادات لمن يريد النطق المحلي دون إنترنت).
   ─ MP3 من مايكروسوفت يُشغَّل فوراً ويُخزَّن في الكاش
   ─ ترتيب تحديد اللغة: cards.lang → كشف Unicode → سياق الوجه (أمامي=target، خلفي=native)
   ─ صوت كل لغة محفوظ في settings: tts_voice_ar / tts_voice_en / … */
(function () {
  'use strict';
  var App = window.App = window.App || {};
  var U = App.util;

  /* توافقية WebView قديم جداً (< 48): Math.imul مطلوبة في cs64 — بوليفل قياسي MDN */
  if (typeof Math.imul !== 'function') {
    Math.imul = function (a, b) {
      var ah = (a >>> 16) & 0xffff, al = a & 0xffff;
      var bh = (b >>> 16) & 0xffff, bl = b & 0xffff;
      return ((al * bl) + (((ah * bl + al * bh) << 16) >>> 0) | 0);
    };
  }

  var TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
  var GEC_VERSION = '2-143.0.3650.75';

  /* ════════ DRM v2: توكن Sec-MS-GEC = "CS64(16hex)-SHA256(64hex)" ════════
     منقول من edge-tts 7.3.1 drm.py — تحقق تقاطعي 9/9 ضد بايثون + توليد حي ناجح
     (sha256Rounds: حيلة الدوران المركب ≡ ROTR قياسي؛ CS64: كل الضربات Math.imul) */
  var U32N = 0xFFFFFFFF;
  var SHA256_INITIAL = [0x6A09E667,0xBB67AE85,0x3C6EF372,0xA54FF53A,0x510E527F,0x9B05688C,0x1F83D9AB,0x5BE0CD19];
  var SHA256_STATE = [0xFD9FBEA2,0x91243CE7,0xBE499094,0xCD2E1E0A,0x6C006F49,0x04BD35AB,0xFEB0A7E4,0x03EFFBD2];
  var SHA256_SCHEDULE = [0xEB24BF9E,0x1558691F,0xA0C09EE2,0x0CFA32BA,0xA622EE8C,0xD1DD9491,0xC0DD25A0,0xF9E70AB6,0xF0C31573,0x7058CE4E,0x7188E606,0x00E5AB33,0xD258B060,0x72766564];
  var K = [0x428A2F98,0x71374491,0xB5C0FBCF,0xE9B5DBA5,0x3956C25B,0x59F111F1,0x923F82A4,0xAB1C5ED5,0xD807AA98,0x12835B01,0x243185BE,0x550C7DC3,0x72BE5D74,0x80DEB1FE,0x9BDC06A7,0xC19BF174,0xE49B69C1,0xEFBE4786,0x0FC19DC6,0x240CA1CC,0x2DE92C6F,0x4A7484AA,0x5CB0A9DC,0x76F988DA,0x983E5152,0xA831C66D,0xB00327C8,0xBF597FC7,0xC6E00BF3,0xD5A79147,0x06CA6351,0x14292967,0x27B70A85,0x2E1B2138,0x4D2C6DFC,0x53380D13,0x650A7354,0x766A0ABB,0x81C2C92E,0x92722C85,0xA2BFE8A1,0xA81A664B,0xC24B8B70,0xC76C51A3,0xD192E819,0xD6990624,0xF40E3585,0x106AA070,0x19A4C116,0x1E376C08,0x2748774C,0x34B0BCB5,0x391C0CB3,0x4ED8AA4A,0x5B9CCA4F,0x682E6FF3,0x748F82EE,0x78A5636F,0x84C87814,0x8CC70208,0x90BEFFFA,0xA4506CEB,0xBEF9A3F7,0xC67178F2];
  var K_ADJ = 0xC9DC06A7, SIG0_ADJ = 0x059C0B80, SIG1_ADJ = 0x000B92C0;
  var CS64_COEF = [[0xE82E91B1,0xB32700D0],[0x44DE24C6,0x88DFF51D],[0x3BEB65BC,0x29514038],[0xC89C5933,0xB328CBDF],[0x8D1EC211,0xD405B4D5],[0x314EF5D5,0x26E55F3C],[0xE92491B1,0x607801C6],[0xF0A5B9D5,0x82B2C1FB],[0x06064CF3,0xFA51A3DA],[0xDA79FA60,0x207CC464],[0xBED20560,0x3C3C74F3],[0x89F9C9F8,0xD2D14B61],[0x35FA38C6,0xBB04A2C1],[0xCB49E3C6,0xC5626167]];
  var CS64_FACTOR = 0x82893933, CS64_ADJ0 = 0xF2F90B1A, CS64_ADJ1 = 0x0B1A0000;
  var K_BLOCK = (function () { var k = K.slice(); k[14] = K_ADJ; return k; })();

  function rotr(v, n) { v = v >>> 0; return ((v >>> n) | (v << (32 - n))) >>> 0; }
  function rol16(v) { v = v >>> 0; return ((v << 16) | (v >>> 16)) >>> 0; }
  function sigma0(v) { v = v >>> 0; return ((v >>> 7) ^ (v << 25) ^ (v >>> 18) ^ (v << 14) ^ (v >>> 3)) >>> 0; }
  function sigma1(v) { v = v >>> 0; return ((v >>> 17) ^ (v << 15) ^ (v >>> 19) ^ (v << 13) ^ (v >>> 10)) >>> 0; }

  function rounds(state, words, constants, first) {
    var a = state[0], b = state[1], c = state[2], d = state[3], e = state[4], f = state[5], g = state[6], h = state[7];
    for (var i = first; i < 64; i++) {
      var s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      var t1 = (h + s1 + (g ^ (e & (f ^ g))) + constants[i] + words[i]) >>> 0;
      var s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      var t2 = (s0 + ((a & b) | (c & (a | b)))) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    return [a, b, c, d, e, f, g, h];
  }
  function expand(words, from) {
    for (var i = from; i < 64; i++) {
      var x = words[i - 2], y = words[i - 15];
      words[i] = ((((x >>> 17) ^ (x << 15) ^ (x >>> 19) ^ (x << 13) ^ (x >>> 10)) >>> 0) + words[i - 7] +
        (((y >>> 7) ^ (y << 25) ^ (y >>> 18) ^ (y << 14) ^ (y >>> 3)) >>> 0) + words[i - 16]) >>> 0;
    }
  }
  function sha256Init7(d7) {
    var words = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    words.push(((d7[0] << 16) | (d7[1] << 8) | d7[2]) >>> 0);
    words.push(((d7[3] << 24) | (d7[4] << 16) | (d7[5] << 8) | d7[6]) >>> 0);
    for (var index = 16; index < 30; index++) {
      var value = SHA256_SCHEDULE[index - 16] >>> 0;
      if (index - 2 >= 14) value = (value + ((index === 16) ? (sigma1(words[index - 2]) ^ SIG1_ADJ) : sigma1(words[index - 2]))) >>> 0;
      if (index - 7 >= 14) value = (value + words[index - 7]) >>> 0;
      if (index - 15 >= 14) value = (value + ((index === 29) ? (sigma0(words[index - 15]) ^ SIG0_ADJ) : sigma0(words[index - 15]))) >>> 0;
      words.push(value >>> 0);
    }
    words.push((sigma1(words[28]) + words[23] + sigma0(words[15]) + words[14] + K_ADJ - K[14]) >>> 0);
    expand(words, 31);
    var working = rounds(SHA256_STATE, words, K_BLOCK, 14);
    return SHA256_INITIAL.map(function (x, i) { return ((x + working[i]) >>> 0); });
  }
  function sha256Var(data) {
    var length = 57 + data.length;
    var padded = data.slice(7);
    padded.push(0x80);
    var zeros = (((55 - length) % 64) + 64) % 64;
    for (var z = 0; z < zeros; z++) padded.push(0);
    var bitLen = (length * 8) >>> 0;
    padded.push(0, 0, 0, 0, (bitLen >>> 24) & 0xFF, (bitLen >>> 16) & 0xFF, (bitLen >>> 8) & 0xFF, bitLen & 0xFF);
    var state = sha256Init7(data.slice(0, 7));
    for (var off = 0; off < padded.length; off += 64) {
      var words = [];
      for (var j = 0; j < 16; j++) words.push(((padded[off + j * 4] << 24) | (padded[off + j * 4 + 1] << 16) | (padded[off + j * 4 + 2] << 8) | padded[off + j * 4 + 3]) >>> 0);
      expand(words, 16);
      var working = rounds(state, words, K, 0);
      state = state.map(function (x, i) { return ((x + working[i]) >>> 0); });
    }
    return state.map(function (x) { return ('00000000' + x.toString(16)).slice(-8); }).join('').toUpperCase();
  }
  function wordsLE(bytes) {
    var p = bytes.slice();
    var rem = p.length % 4;
    if (rem) for (var i = 0; i < 4 - rem; i++) p.push(0);
    var out = [];
    for (var j = 0; j < p.length; j += 4) out.push((p[j] | (p[j + 1] << 8) | (p[j + 2] << 16) | (p[j + 3] << 24)) >>> 0);
    if (out.length % 2) out.push(0);
    return out;
  }
  function cs64(data, digestHex) {
    var d = [];
    for (var i = 0; i < 64; i += 2) d.push(parseInt(digestHex.substr(i, 2), 16));
    var keyA = ((d[0] | (d[1] << 8) | (d[2] << 16) | (d[3] << 24)) >>> 0) | 1;
    var keyB = ((d[4] | (d[5] << 8) | (d[6] << 16) | (d[7] << 24)) >>> 0) | 1;
    var fA = Math.imul(keyA, CS64_FACTOR) >>> 0, fB = Math.imul(keyB, CS64_FACTOR) >>> 0;
    var terms = CS64_COEF.map(function (c, i) { return Math.imul(i % 2 === 0 ? fA : fB, c[0]) >>> 0; });
    var offsets = CS64_COEF.map(function (c) { return c[1] >>> 0; });
    wordsLE([0].concat(data)).forEach(function (word, index) {
      var term = Math.imul(word, index % 2 === 0 ? keyA : keyB) >>> 0;
      var offset = Math.imul(rol16(word), index % 2 === 0 ? 0xEF0569FB : 0xC31713DB) >>> 0;
      if (index === 0) { term = (term + Math.imul(CS64_ADJ0, fA)) >>> 0; offset = (offset + CS64_ADJ1) >>> 0; }
      terms.push(term >>> 0); offsets.push(offset >>> 0);
    });
    var swapAcc = 0, swapLast = 0, state = 0, acc = 0;
    for (var index2 = 0; index2 < terms.length; index2 += 2) {
      var x = terms[index2], y = terms[index2 + 1], t, q;
      t = rol16((offsets[index2] + x) >>> 0);
      q = Math.imul(t, 0x76F50F34) >>> 0;
      swapAcc = (swapAcc + Math.imul(rol16(q), 0xC3EFEA97) + q) >>> 0;
      t = rol16((offsets[index2 + 1] + y) >>> 0);
      q = Math.imul(t, 0x1881CE3C) >>> 0;
      swapLast = (Math.imul(rol16(q), 0x35BD1EC9) + q) >>> 0;
      swapAcc = (swapAcc + swapLast) >>> 0;
      state = (Math.imul(state, keyA) + x) >>> 0;
      state = Math.imul(rol16(state), 0xCF98B111) >>> 0;
      state = Math.imul(rol16(state), 0x87085B9F) >>> 0;
      state = Math.imul(rol16(state), 0x12CEB96D) >>> 0;
      state = Math.imul(rol16(state), 0x257E1D83) >>> 0;
      acc = (acc + state) >>> 0;
      t = (Math.imul(state, keyB) + y) >>> 0;
      t = Math.imul(rol16(t), 0xA27416F5) >>> 0;
      t = Math.imul(rol16(t), 0xD38396FF) >>> 0;
      state = Math.imul(rol16(Math.imul(rol16(t), 0x7C932B89) >>> 0), 0xBFA49F69) >>> 0;
      acc = (acc + state) >>> 0;
    }
    return { w1: (swapLast ^ state) >>> 0, w2: (swapAcc ^ acc) >>> 0 };
  }
  function u32hexLE(v) {
    v = v >>> 0;
    return [v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF]
      .map(function (b) { return ('0' + b.toString(16)).slice(-2); }).join('').toUpperCase();
  }

  /* ── التوكن v2: ticks مقربة لـ5 دقائق × 10^7 + token ──
     بلا BigInt — أرقام n تعطل تحليل الملف كله في WebView القديم على أندرويد
     (Chromium < 67) فصمت زر الاستماع كلياً. الحساب المكافئ تماماً بأعداد عادية:
     base = ثانية يونكس + 11644473600 (≈1.34e10 < 2^53 → صحيح دقيق)، تقريب لأسفل
     لمضاعف 300، ثم ×10^7 = إلحاق 7 أصفار في النظام العشري (مضبوطة لا تقريب). */
  function genGec() {
    var base = Math.floor(Date.now() / 1000) + 11644473600;
    base = base - (base % 300);
    var str = String(base) + '0000000' + TOKEN;
    var bytes = [];
    for (var i = 0; i < str.length; i++) bytes.push(str.charCodeAt(i));
    var digest = sha256Var(bytes);
    var c64 = cs64(bytes, digest);
    return u32hexLE(c64.w1) + u32hexLE(c64.w2) + '-' + digest;
  }

  /* الأصوات المعتمدة (تحقّق حي 322 صوتاً) — الأول افتراضي */
  var EDGE_VOICES = {
    ar: ['ar-MA-MounaNeural', 'ar-MA-JamalNeural', 'ar-SA-HamedNeural', 'ar-SA-ZariyahNeural', 'ar-EG-SalmaNeural', 'ar-EG-ShakirNeural'],
    en: ['en-US-JennyNeural', 'en-US-GuyNeural', 'en-US-AriaNeural', 'en-US-ChristopherNeural', 'en-GB-SoniaNeural', 'en-GB-RyanNeural'],
    fr: ['fr-FR-DeniseNeural', 'fr-FR-HenriNeural'],
    es: ['es-ES-ElviraNeural', 'es-ES-AlvaroNeural'],
    de: ['de-DE-KatjaNeural', 'de-DE-ConradNeural'],
    tr: ['tr-TR-EmelNeural', 'tr-TR-AhmetNeural'],
    ru: ['ru-RU-SvetlanaNeural', 'ru-RU-DmitryNeural'],
    zh: ['zh-CN-XiaoxiaoNeural', 'zh-CN-YunjianNeural'],
    ja: ['ja-JP-NanamiNeural', 'ja-JP-KeitaNeural'],
    it: ['it-IT-ElsaNeural', 'it-IT-DiegoNeural'],
    pt: ['pt-PT-FernandaNeural', 'pt-PT-DuarteNeural']
  };

  /* ═════════ تحديد اللغة والصوت ═════════ */
  /* side: 'front' (لغة الهدف) | 'back' (اللغة الأم) */
  function resolveLang(text, side) {
    var p = App.state.profile || {};
    var card = App.state.session && App.state.session.queue[App.state.session.idx];
    /* 1) حقل lang على البطاقة يفوز دائماً (إن كان محدداً) */
    if (card && card.lang) return card.lang;
    /* 2) كشف Unicode من النص */
    var detected = U.detectTextLang(text);
    if (detected) return detected;
    /* 3) fallback إلى ملف المستخدم حسب موقع النص */
    if (side === 'back') return p.nativeLang || 'ar';
    return p.targetLang || 'en';
  }

  function voiceFor(langCode) {
    var s = App.state.settings || {};
    var v = s['tts_voice_' + langCode];
    if (v) return v;
    var list = EDGE_VOICES[langCode] || EDGE_VOICES.en;
    return list[0];
  }

  function detectLang(text, side) { return resolveLang(text, side); }

  /* ═════════ محرك Edge TTS (WebSocket → MP3) ═════════ */
  var edgeAudio = null;

  /* ─── أندرويد: تفضيل أصوات الهاتف الحقيقية (أوفلاين) حسب إعداد المستخدم ─── */
  var IS_ANDROID = !!(window.FlashkiAndroid && typeof window.FlashkiAndroid.ttsSynthesize === 'function');

  /* لغات نطق الهاتف المتاحة — تُجلب مرة واحدة عند الإقلاع (ttsInfo) */
  var nativeInfo = { ready: null, langs: null, voices: 0 };
  function fetchNativeInfo() {
    if (!IS_ANDROID || nativeInfo.ready !== null) return;
    try {
      var raw = window.FlashkiAndroid.ttsInfo();
      var d = JSON.parse(raw);
      nativeInfo.ready = !!d.ready;
      nativeInfo.langs = d.langs || [];
      nativeInfo.voices = d.voices || 0;
    } catch (e) { nativeInfo.ready = false; }
  }
  /* هل يغطي نطق الهاتف هذه اللغة؟ — ready=null يعني لم تُجلب المعلومة بعد فنجرّب عمياء */
  function nativeCovers(langCode) {
    if (nativeInfo.langs === null || !nativeInfo.langs.length) return true; /* لا معلومة → جرّب */
    return nativeInfo.langs.indexOf(String(langCode || '').toLowerCase()) >= 0;
  }
  function enginePref() {
    var e = App.state.settings && App.state.settings.ttsEngine;
    return (e === 'phone' || e === 'edge') ? e : 'auto';
  }

  /* النطق المباشر عبر محرك الهاتف — تشغيل فوري بلا ملف ولا كاش.
     العقد مع الأصل: __fkNativeSpeakDone(cbId, phase) بـ phase = start|end|error */
  var directPending = {};
  var directSeq = 0;
  function nativeSpeakDirect(text, voice) {
    return new Promise(function (resolve, reject) {
      try {
        if (!(window.FlashkiAndroid && typeof window.FlashkiAndroid.ttsSpeakDirect === 'function')) return reject(new Error('no bridge'));
        var id = 'd' + (++directSeq);
        directPending[id] = { resolve: resolve, reject: reject, started: false };
        window.FlashkiAndroid.ttsSpeakDirect(String(text), voice || '', ratePct(voice), id);
        setTimeout(function () {
          if (directPending[id]) {
            var p = directPending[id];
            delete directPending[id];
            notify('end');
            p.resolve(); /* انتهى أو علق — لا نحجب الواجهة */
          }
        }, 120000);
      } catch (e) { reject(e); }
    });
  }
  window.__fkNativeSpeakDone = function (id, phase) {
    var p = directPending[id];
    if (!p) return;
    if (phase === 'start') {
      p.started = true;
      notify('play');
      return;
    }
    delete directPending[id];
    if (phase === 'end') { notify('end'); p.resolve(); }
    else { notify('error'); p.reject(new Error('native direct ' + phase)); }
  };

  function edgeSpeak(text, voice) {
    return new Promise(function (resolve, reject) {
      try {
        var connId = randHex(16);
        var url = 'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1' +
          '?TrustedClientToken=' + TOKEN + '&Sec-MS-GEC=' + genGec() + '&Sec-MS-GEC-Version=' + GEC_VERSION + '&ConnectionId=' + connId;
        var ws = new WebSocket(url);
        ws.binaryType = 'arraybuffer';
        var chunks = [];
        var opened = false;
        var timer = setTimeout(function () { cleanup(); reject(new Error('timeout')); }, 15000);

        function cleanup() { clearTimeout(timer); try { ws.close(); } catch (e) {} }

        ws.onopen = function () {
          opened = true;
          var date = new Date().toString();
          ws.send('X-Timestamp:' + date + '\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n' +
            '{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}');
          var reqId = randHex(32);
          var langPrefix = voice.split('-').slice(0, 2).join('-');
          var ssml = "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='" + langPrefix + "'><voice name='" + voice + "'><prosody pitch='+0Hz' rate='" + ratePct(voice) + "' volume='+0%'>" + escXml(text) + '</prosody></voice></speak>';
          ws.send('X-RequestId:' + reqId + '\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:' + date + 'Z\r\nPath:ssml\r\n\r\n' + ssml);
        };
        ws.onmessage = function (ev) {
          if (ev.data instanceof ArrayBuffer) {
            var view = new DataView(ev.data);
            var headerLen = view.getUint16(0);
            if (ev.data.byteLength > headerLen + 2) chunks.push(new Uint8Array(ev.data, 2 + headerLen));
          } else {
            var msg = String(ev.data);
            if (msg.indexOf('Path:turn.end') >= 0) {
              cleanup();
              if (!chunks.length) { reject(new Error('empty audio')); return; }
              var blob = new Blob(chunks, { type: 'audio/mp3' });
              resolve(blob);
            }
          }
        };
        ws.onerror = function () { if (!opened) { clearTimeout(timer); reject(new Error('ws error')); } };
        ws.onclose = function () { if (!chunks.length) { clearTimeout(timer); reject(new Error('closed before audio')); } };
      } catch (e) { reject(e); }
    });
  }

  /* ═══ سرعة النطق: سرعتان مستقلتان ═══
     ttsRate = سرعة صوت لغة التعلم (البطاقات والقصص والكلمات)
     ttsRateNative = سرعة صوت اللغة الأم (الترجمات والإجابات)
     voiceOrLang (اختياري): 'de-DE-KatjaNeural' أو 'de' — يحدد أي السرعتين تُطبّق؛
     بدونه تُستخدم سرعة لغة التعلم (توافقية مع الاستدعاءات القديمة). */
  function rateNum(voiceOrLang) {
    var s = App.state.settings || {};
    var p = App.state.profile || {};
    var r;
    if (voiceOrLang) {
      var code = String(voiceOrLang).split('-')[0].toLowerCase();
      var native = String(p.nativeLang || 'ar').toLowerCase();
      r = (code === native) ? (Number(s.ttsRateNative) || 1) : (Number(s.ttsRate) || 1);
    } else {
      r = Number(s.ttsRate) || 1;
    }
    if (r < 0.5) r = 0.5;
    if (r > 2) r = 2;
    return r;
  }
  function ratePct(voiceOrLang) {
    var pct = Math.round((rateNum(voiceOrLang) - 1) * 100);
    return (pct >= 0 ? '+' : '') + pct + '%';
  }
  function escXml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;'); }
  function randHex(n) { var s = ''; for (var i = 0; i < n; i++) s += Math.floor(Math.random() * 16).toString(16); return s; }

  var statusCallback = null;
  function notify(ev) {
    if (typeof statusCallback === 'function') {
      try { statusCallback(ev); } catch (e) {}
    }
  }

  function playBlob(blob) {
    try {
      if (edgeAudio) {
        try {
          edgeAudio.onended = null;
          edgeAudio.onerror = null;
          edgeAudio.pause();
        } catch (e) {}
      }
      var url = URL.createObjectURL(blob);
      edgeAudio = new Audio(url);
      edgeAudio.onended = function () {
        URL.revokeObjectURL(url);
        notify('end');
      };
      edgeAudio.onerror = function () {
        URL.revokeObjectURL(url);
        notify('error');
      };
      var pr = edgeAudio.play();
      if (pr && pr.then) {
        pr.then(function () {
          notify('play');
        }).catch(function () {
          notify('error');
        });
      } else {
        notify('play');
      }
    } catch (e) { notify('error'); }
  }

  /* ═════════ fallback: Web Speech + Google TTS ═════════ */
  function webSpeechSupported() { return 'speechSynthesis' in window; }

  /* حالة Web Speech تُتتبَّع محلياً — speechSynthesis.speaking يعلق true في WebKitGTK
     بعد cancel()/النهاية بلا أصوات نظام، ما كان يحجب إعادة الاستماع إلى الأبد */
  var webActive = false;

  function speakGoogleTts(text, langCode) {
    return new Promise(function (resolve, reject) {
      try {
        var clean = String(text || '').slice(0, 190).trim();
        if (!clean) return reject(new Error('empty'));
        var url = 'https://translate.google.com/translate_tts?ie=UTF-8&tl=' + encodeURIComponent(langCode) + '&client=tw-ob&q=' + encodeURIComponent(clean);
        if (edgeAudio) {
          try {
            edgeAudio.onended = null;
            edgeAudio.onerror = null;
            edgeAudio.pause();
          } catch (e) {}
        }
        edgeAudio = new Audio(url);
        edgeAudio.onended = function () { notify('end'); resolve(); };
        edgeAudio.onerror = function () { notify('error'); reject(new Error('audio err')); };
        var pr = edgeAudio.play();
        if (pr && pr.then) {
          pr.then(function () {
            notify('play');
          }).catch(function (e) {
            notify('error'); reject(e);
          });
        } else {
          notify('play');
        }
      } catch (e) { notify('error'); reject(e); }
    });
  }

  function webSpeak(text, langCode) {
    try {
      window.speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(String(text));
      var tag = { ar: 'ar-SA', en: 'en-US', fr: 'fr-FR', es: 'es-ES', de: 'de-DE', tr: 'tr-TR', ru: 'ru-RU', zh: 'zh-CN', ja: 'ja-JP', it: 'it-IT', pt: 'pt-PT' }[langCode] || 'en-US';
      u.lang = tag;
      var voices = window.speechSynthesis.getVoices() || [];
      var pref = voices.filter(function (v) { return v.lang.toLowerCase().indexOf(langCode) === 0; });
      if (pref[0]) u.voice = pref[0];
      u.rate = rateNum(langCode);
      u.onstart = function () { webActive = true; notify('play'); };
      u.onend = function () { webActive = false; notify('end'); };
      u.onerror = function () { webActive = false; notify('error'); };
      window.speechSynthesis.speak(u);
    } catch (e) { notify('error'); }
  }

  function fallbackSpeak(text, langCode) {
    if (String(text || '').length > 180) {
      webSpeak(text, langCode);
    } else {
      speakGoogleTts(text, langCode).catch(function () {
        webSpeak(text, langCode);
      });
    }
  }

  /* ═════════ كاش الصوت: تشغيل فوري من قاعدة البيانات بدل انتظار السيرفر ═════════
     المفتاح = بصمة (voice|rate|text) — أي تغيير صوت/سرعة/نص = مفتاح جديد تلقائياً.
     الطبقات: ذاكرة (آخر 24 صوتاً) → جدول audio_cache → توليد Edge TTS ثم تخزين.
     المحرك المسبق (precache.js) يملأ الكاش في الخلفية فور إنشاء البطاقة/القصة. */
  function hash32(str, seed) {
    var h = seed >>> 0;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return ('0000000' + h.toString(16)).slice(-8);
  }
  function cacheKeyOf(voice, rate, text) {
    var s = voice + '|' + rate + '|' + text;
    return hash32(s, 0x811c9dc5) + hash32(s, 0x9e3779b9);
  }
  var memCache = new Map(); /* key → Blob */
  var MEM_CAP = 24;
  function memPut(key, blob) {
    if (memCache.has(key)) memCache.delete(key);
    memCache.set(key, blob);
    while (memCache.size > MEM_CAP) memCache.delete(memCache.keys().next().value);
  }
  function blobToB64(blob) {
    return new Promise(function (resolve, reject) {
      try {
        var fr = new FileReader();
        fr.onload = function () {
          var s = String(fr.result || '');
          var i = s.indexOf('base64,');
          resolve(i >= 0 ? s.slice(i + 7) : '');
        };
        fr.onerror = function () { reject(new Error('reader')); };
        fr.readAsDataURL(blob);
      } catch (e) { reject(e); }
    });
  }
  /* توليد فقط بلا تشغيل — لا يمس الصوت الجاري (يستخدمه التوليد المسبق في الخلفية)
     عبر App.tts.edgeSpeak كي تتمكن المعاينة/الاختبارات من حقن بديل للشبكة */
  function synthesizeBlobRaw(text, voice) {
    var eng = enginePref();
    if (IS_ANDROID) {
      /* 'phone' صراحةً (اختياري من الإعدادات): الهاتف أولاً (أوفلاين فوري) ثم مايكروسوفت عند الفشل.
         الافتراضي auto و'edge': صوت مايكروسوفت فقط بلا أصوات هاتف — تطابق تام مع سطح المكتب
         (v1.7.2 حسب طلب المستخدم)، وعند تعذر الشبكة تُستكمل السلسلة بـ Google TTS ثم نطق المتصفح. */
      if (eng === 'phone') {
        return nativeSynthesize(text, voice).catch(function () {
          return App.tts.edgeSpeak(text, voice);
        });
      }
      return App.tts.edgeSpeak(text, voice);
    }
    if (window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke) {
      return tauriSynthesize(text, voice);
    }
    return App.tts.edgeSpeak(text, voice);
  }

  /* سلسلة الشبكة عند فشل أصوات الهاتف تماماً: Edge → Google TTS → Web Speech */
  function networkSpeak(text, voice, langCode) {
    return App.tts.edgeSpeak(text, voice).catch(function () {
      return fallbackSpeak(text, langCode);
    });
  }

  /* ─── المحرك الأصلي أندرويد: نداء غير حاجب + عودة عبر callback ─── */
  var nativePending = {};
  var nativeSeq = 0;
  function nativeSynthesize(text, voice) {
    return new Promise(function (resolve, reject) {
      try {
        var id = 'n' + (++nativeSeq);
        nativePending[id] = { resolve: resolve, reject: reject };
        window.FlashkiAndroid.ttsSynthesize(String(text), voice || '', ratePct(voice), id);
        setTimeout(function () { /* مهلة أمان — صوت طويل أو تعليق محرك */
          if (nativePending[id]) { delete nativePending[id]; reject(new Error('native tts timeout')); }
        }, 60000);
      } catch (e) { reject(e); }
    });
  }
  window.__fkNativeTtsDone = function (id, b64) {
    var p = nativePending[id];
    if (!p) return;
    delete nativePending[id];
    var blob = b64 ? b64ToBlob(b64) : null;
    if (blob) p.resolve(blob); else p.reject(new Error('native tts failed'));
  };

  function tauriSynthesize(text, voice) {
    return window.__TAURI__.core.invoke('edge_tts_synthesize', { text: String(text), voice: voice, rate: ratePct(voice) })
      .then(function (b64) {
        var blob = b64 ? b64ToBlob(b64) : null;
        if (!blob) throw new Error('empty audio');
        return blob;
      });
  }
  function saveCacheRow(key, kind, refId, voice, rate, text, blob) {
    if (!(App.db && App.db.audioCachePut)) return Promise.resolve(false);
    return blobToB64(blob).then(function (b64) {
      return App.db.audioCachePut({ cacheKey: key, kind: kind, refId: refId, voice: voice, rate: rate, sourceText: text, audioB64: b64, bytes: blob.size });
    }).catch(function () { return false; });
  }
  /* يضمن وجود صوت النص في الكاش: ذاكرة → DB → توليد وتخزين — بلا أي تشغيل */
  function ensureCached(text, voice, kind, refId) {
    var t = String(text || '').trim();
    if (!t) return Promise.resolve({ cached: true });
    var rate = ratePct(voice);
    var key = cacheKeyOf(voice, rate, t);
    if (memCache.get(key)) return Promise.resolve({ cached: true });
    if (!(App.db && App.db.audioCacheGet)) {
      return synthesizeBlobRaw(t, voice).then(function (blob) { memPut(key, blob); return { cached: false }; });
    }
    return App.db.audioCacheGet(key).then(function (row) {
      if (row && row.audio_b64) {
        var b = b64ToBlob(row.audio_b64);
        if (b) { memPut(key, b); return { cached: true }; }
      }
      return synthesizeBlobRaw(t, voice).then(function (blob) {
        memPut(key, blob);
        return saveCacheRow(key, kind || 'card', refId || null, voice, rate, t, blob).then(function () { return { cached: false }; });
      });
    });
  }

  /* ═════════ الواجهة العامة ═════════ */
  /* onBlob (اختياري): يستلم الـ MP3 بعد التوليد — يُستخدم لكاش صوت القصة لإعادة الاستماع الفوري */
  function speak(text, side, onStatus, onBlob) {
    if (!text) return;
    cancel();
    statusCallback = onStatus || null;
    notify('loading');
    var lang = resolveLang(text, side || 'front');
    var voice = voiceFor(lang);
    App.tts.lastCall = { text: String(text).slice(0, 60), side: side || 'front', lang: lang, voice: voice, ts: Date.now() }; /* تشخيص */
    function deliver(blob) {
      if (blob && typeof onBlob === 'function') { try { onBlob(blob); } catch (e) {} }
      playBlob(blob);
    }
    var rate = ratePct(voice);
    var key = cacheKeyOf(voice, rate, String(text));
    /* 1) الذاكرة — فوري تماماً */
    var mem = memCache.get(key);
    if (mem) { deliver(mem); return; }

    /* 1.5) أندرويد — الإعداد 'phone' فقط يبدأ بأصوات الهاتف (أوفلاين وفوراً):
            الافتراضي auto و'edge' يستخدمان صوت مايكروسوفت فقط (انظر synthesizeBlobRaw)،
            وعند تعذره ينتقل إلى Google TTS ثم نطق المتصفح — نفس سلوك سطح المكتب تماماً. */
    var eng = enginePref();
    if (IS_ANDROID && eng === 'phone' && nativeCovers(lang)) {
      nativeSynthesize(String(text), voice).then(function (blob) {
        memPut(key, blob);
        saveCacheRow(key, 'speak', null, voice, rate, String(text), blob);
        deliver(blob);
      }).catch(function () {
        /* توليد الملف فشل (محرك/لغة/جهاز) — النطق المباشر أضمن على الجهاز */
        nativeSpeakDirect(String(text), voice).catch(function () {
          return networkSpeak(String(text), voice, lang).then(function (blob) {
            memPut(key, blob);
            deliver(blob);
          });
        });
      });
      return;
    }

    /* عند تعذر توليد مايكروسوفت (بلا شبكة مثلاً) — نفس السلسلة على كل الأجهزة:
       Google TTS → نطق المتصفح. أصوات الهاتف لا تدخل هنا إلا بإعداد 'phone' صراحة. */
    function nativeFallback() {
      return fallbackSpeak(text, lang);
    }

    /* 2) قاعدة البيانات (التحميل المسبق) — فوري بلا شبكة */
    var dbp = (App.db && App.db.audioCacheGet) ? App.db.audioCacheGet(key) : Promise.resolve(null);
    dbp.then(function (row) {
      if (row && row.audio_b64) {
        var b = b64ToBlob(row.audio_b64);
        if (b) { memPut(key, b); deliver(b); return; }
      }
      /* 3) توليد الآن + تخزينه في الكاش للمرات القادمة */
      synthesizeBlobRaw(String(text), voice).then(function (blob) {
        memPut(key, blob);
        saveCacheRow(key, 'speak', null, voice, rate, String(text), blob);
        deliver(blob);
      }).catch(function () { nativeFallback(); });
    }).catch(function () {
      synthesizeBlobRaw(String(text), voice).then(function (blob) {
        memPut(key, blob);
        deliver(blob);
      }).catch(function () { nativeFallback(); });
    });
  }

  function b64ToBlob(b64) {
    try {
      var bin = atob(b64);
      var buf = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
      return new Blob([buf], { type: 'audio/mp3' });
    } catch (e) { return null; }
  }

  function cancel() {
    statusCallback = null;
    webActive = false;
    if (edgeAudio) {
      try {
        edgeAudio.onended = null;
        edgeAudio.onerror = null;
        edgeAudio.pause();
      } catch (e) {}
    }
    if (IS_ANDROID) {
      /* قطع النطق المباشر الجاري على المحرك الأصلي */
      try { if (typeof window.FlashkiAndroid.ttsStop === 'function') window.FlashkiAndroid.ttsStop(); } catch (e) {}
      var ids = Object.keys(directPending);
      for (var i = 0; i < ids.length; i++) {
        var p = directPending[ids[i]];
        delete directPending[ids[i]];
        if (p && !p.started) { try { p.reject(new Error('cancelled')); } catch (e) {} }
      }
    }
    if (webSpeechSupported()) {
      try { window.speechSynthesis.cancel(); } catch (e) {}
    }
  }

  function isSpeaking() {
    return !!(edgeAudio && !edgeAudio.paused && !edgeAudio.ended) || webActive;
  }

  /* تشغيل MP3 جاهز (من كاش القصة) — إعادة استماع فورية بلا طلب شبكي */
  function playAudioBlob(blob, onStatus) {
    if (!blob) return;
    cancel();
    statusCallback = onStatus || null;
    notify('loading');
    playBlob(blob);
  }

  /* يُستدعى من boot — لم تعد تملأ قائمة صوت واحد؛ توافقية مع الكود القديم */
  function loadVoices() {
    if (webSpeechSupported()) { try { window.speechSynthesis.getVoices(); } catch (e) {} }
    if (IS_ANDROID) setTimeout(fetchNativeInfo, 800); /* المحرك يجهز بعد الإقلاع */
  }
  function supported() { return true; /* Edge TTS دائماً + fallback */ }

  App.tts = {
    supported: supported, speak: speak, cancel: cancel, loadVoices: loadVoices,
    detectLang: detectLang, voiceFor: voiceFor, EDGE_VOICES: EDGE_VOICES,
    edgeSpeak: edgeSpeak, playAudioBlob: playAudioBlob, _genGec: genGec, isSpeaking: isSpeaking,
    ensureCached: ensureCached, synthesizeBlobRaw: synthesizeBlobRaw,
    nativeInfo: function () { return nativeInfo; },
    enginePref: enginePref,
    cacheKeyFor: function (text, voice) { return cacheKeyOf(voice, ratePct(voice), String(text || '').trim()); }
  };
})();
