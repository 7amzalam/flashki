# Flashki — الإصدار 1.1.0 (2026-11-02)

> تطبيق مكتبي مفتوح المصدر لتعلم اللغات: بطاقات بتكرار متباعد SM-2، قصص تفاعلية بالذكاء الاصطناعي، نطق Edge TTS — محلي 100% (Tauri 2 + SQLite).

## 1. بطاقة المشروع

| البند | القيمة (مُتحقق منها من الكود) |
|---|---|
| الاسم | Flashki — البطاقات الذكية والقصص التفاعلية |
| الإصدار | **1.1.0** — متزامن في الملفات الأربعة: `package.json` · `src-tauri/tauri.conf.json` · `src-tauri/Cargo.toml` · `src-tauri/Cargo.lock` ✅ |
| المعرف | `com.flashki.app` (tauri.conf.json) |
| النوع | تطبيق مكتبي (Tauri 2 / Rust core) + نسخة ويب للمعاينة (`npm run web`) |
| قاعدة البيانات | SQLite محلي `flashki.db` (WAL + Foreign Keys) عبر `tauri-plugin-sql`؛ في المتصفح `sql.js WASM` (مخزَّن في localStorage) — `src/db.js` |
| المخطط | **7 جداول** + **8 فهارس جزئية**: `ai_generations` · `decks` · `cards` · `reviews` · `sessions` · `settings` · `meta` — `src/schema.sql` |
| الذكاء الاصطناعي | Google Gemini اختياري — سلسلة نماذج حية: `gemini-3.6-flash` → `gemini-3.8-flash` → `gemini-3.5-flash-lite` → `*-latest` مع تجاوز تلقائي للأخطاء (404/429/503) — `src/js/ai.js` |
| النطق | Microsoft Edge TTS (DRM v2 بـ Rust وJS) + احتياطي Google TTS وWeb Speech. قائمة منسقة: **30 صوتًا عبر 11 لغة** في `EDGE_VOICES` (تعليق الكود يذكر تحقّقاً حياً من 322 صوت خدمة) — `src/js/tts.js` |
| أوامر Tauri | 4: `gemini_generate` · `edge_tts_synthesize` · `save_card_image` · `load_card_image` — `src-tauri/src/lib.rs:148-153` |
| إضافات Tauri | `tauri-plugin-sql` · `tauri-plugin-opener` · `tauri-plugin-updater` — `Cargo.toml` |
| الصلاحيات | `core:default` · `sql:default` · `opener:default` · `updater:default` — `src-tauri/capabilities/default.json` |
| لغات الواجهة | 8 لغات × **421 مفتاح ترجمة لكل لغة، تكافؤ 100%** (ar, en, de, fr, es, tr, fa, ur) — `src/i18n/` |
| CI | GitHub Actions على وسم `v*` + تشغيل يدوي: `ubuntu-22.04` (deb/rpm/AppImage) + `windows-latest` (msi/nsis) — **يرفع Artifacts فقط** — `.github/workflows/build.yml` |
| الخصوصية | البيانات على الجهاز فقط؛ الاتصال الخارجي الوحيد: Gemini (اختياري) وEdge TTS (اختياري)؛ مفتاح Gemini لا يُصدَّر أبداً (`store.js:163`) |

## 2. ملخص هذا الإصدار — ما الذي تغيّر؟

### 2.1 إصلاح: إعادة الاستماع إلى القصة (خلل حرج)
- **المشكلة**: زر «استمع» يعمل مرة واحدة فقط؛ بعد الإيقاف لا يمكن إعادة التشغيل.
- **السبب الجذري**: التبديل كان يستشير `speechSynthesis.speaking` التي تعلق `true` في WebKitGTK بعد الإيقاف، فيُستدعى «الإيقاف» بدل «التشغيل» كل مرة.
- **الحل** (`src/js/handlers.js` + `src/js/tts.js`): التبديل صار يعتمد حالة جلسة القصة نفسها (`isStoryPlaying`) + رقم جلسة (`storySession`) يُبطل الأحداث القديمة، وحالة Web Speech تُتتبَّع محلياً (`webActive`).

### 2.2 إضافة: كاش صوت القصة
- بعد أول استماع يُخزَّن MP3 القصة في الذاكرة، والإعادة **فورية من الكاش** بلا طلب شبكي.
- النحو الجديد: `App.tts.speak(text, side, onStatus, onBlob)` + دالة عامة `App.tts.playAudioBlob(blob, onStatus)`.

### 2.3 إصلاح: ربط «سرعة النطق» في الإعدادات (كان تحكمًا ميتًا)
- شريط الإعدادات كان بلا `id` ولا حفظ ولا تطبيق. الآن: `id="ttsRate"`، الحفظ فوري (`input` + `change`)، القيمة (0.5x–2x) تُطبَّق فعليًا على نطق لغة التعلم كله (بطاقات/جمل/قصص) في مسار Rust ومسار المتصفح عبر `ratePct()`، وتُستعاد على المنزلق في `renderSettings`، مع وصف مترجم جديد `ttsSpeedSub`.

### 2.4 تحسين: نافذة الكلمة داخل القصة
- إصلاح سباق زمني (ترجمة كلمة سابقة لا تغلب الحالية)، رسالة فشل واضحة بدل الاختفاء الصامت (`popTranslateFailed`)، إعادة تعليم كل مواضع الكلمة بعد تحويلها لبطاقة (`markStoryWordSaved`)، ورفع سقف مفردات القصة إلى 15.

### 2.5 تحسين: توليد القصص حسب المستوى (CEFR) — عقد صعوبة صارم
| المستوى | طول القصة | مفردات | طبيعة الصعوبة |
|---|---|---|---|
| A1 | 80–120 كلمة | 4–6 | جمل قصيرة جداً، مضارع فقط، مفردات أساسية |
| A2 | 120–170 كلمة | 5–8 | جمل قصيرة، ماضٍ بسيط، روابط أساسية |
| B1 | 170–240 كلمة | 6–9 | جمل تابعة شائعة، سرد بالماضي |
| B2 | 240–320 كلمة | 7–10 | تراكيب متنوعة، تعابير اصطلاحية |
| C1 | 320–420 كلمة | 8–12 | مفردات غنية، مقيدات دقيقة |
| C2 | 420–550 كلمة | 10–15 | شبه أصلي: بلاغة وتركيب أدبي |

مع تعليمات صريحة: «عدّ الكلمات قبل الإجابة» و«يُمنع مفردات أعلى/أدنى من المستوى» (`storySpec()` في `src/js/ai.js`).

## 3. بنية المشروع (خريطة الملفات الفعلية)

```
flashki/
├── src/                              # الواجهة — Vanilla JS بلا إطار عمل
│   ├── index.html                    # كل الشاشات والنوافذ (685 سطراً)
│   ├── css/styles.css                # الثيم الليلي/النهاري والمكونات
│   ├── css/fonts.css                 # 🆕 خط Tajawal (عربي/لاتيني ×4 أوزان)
│   ├── assets/fonts/                 # 🆕 8 ملفات woff2 (Tajawal)
│   ├── i18n/*.json                   # 8 لغات × 421 مفتاحاً بتكافؤ كامل
│   ├── js/
│   │   ├── app.js                    # الحالة العامة + محرك الجلسة + الإقلاع + تنظيف بذور قديمة
│   │   ├── handlers.js               # كل ربط الأحداث + منطق القصص والنوافذ (2269 سطراً)
│   │   ├── render.js                 # كل الرسم: بطاقات/أقسام/قصص/إحصائيات/إعدادات
│   │   ├── ai.js                     # برومبتات Gemini + سلسلة النماذج + الترجمة الفورية
│   │   ├── tts.js                    # Edge TTS بـJS (DRM v2) + احتياطي ثلاثي + كاش القصة
│   │   ├── store.js                  # طبقة الحفظ + تصدير/استيراد (المفتاح لا يُصدَّر)
│   │   ├── db.js                     # SQLite موحد: Tauri-plugin-sql أو sql.js WASM
│   │   ├── srs.js                    # خوارزمية SM-2
│   │   ├── audio.js                  # تسجيل صوت يدوي للوجهين
│   │   ├── util.js                   # كشف لغة Unicode، ضغط صور Canvas، أدوات
│   │   ├── i18n.js                   # تحميل الترجمات وتطبيق اللغة
│   │   └── seed-demo.js              # 🆕 بذور العرض التجريبي (تُحمَّل ديناميكياً عند ?demo=1 فقط)
│   ├── vendor/sql-wasm.js + .wasm    # 🆕 sql.js مضمّن لتشغيل المتصفح
│   └── schema.sql                    # المخطط: 7 جداول + 8 فهارس جزئية
├── src-tauri/
│   ├── src/lib.rs                    # تسجيل 4 أوامر + الإضافات + حفظ/قراءة الصور بأمان
│   ├── src/gemini.rs                 # نداء Gemini من Rust (بلا CORS)
│   ├── src/edge_tts.rs               # Edge TTS من Rust + اختبار مرجعي ضد edge-tts 7.3.1 (#[test])
│   ├── src/main.rs                   # نقطة الانطلاق
│   ├── capabilities/default.json     # صلاحيات محصورة (core/sql/opener/updater:default)
│   ├── icons/                        # أيقونات سطح المكتب + 🆕 طقم android/ + ios/ كامل
│   ├── tauri.conf.json               # الإصدار + النافذة + updater (يشير إلى 7amzalam/flashki)
│   └── Cargo.toml / Cargo.lock       # تبعات Rust + نسخة الإصدار 1.1.0
├── scripts/build_appimage.sh         # 🆕 AppImage خفيف محلياً (~5MB بدل ~90MB)
├── .github/workflows/build.yml       # CI: ويندوز + لينكس → Artifacts
├── README.md · CHANGELOG.md · SETUP.md · PUSH-INSTRUCTIONS.md · PROJECT-REPORT.md
└── package.json                      # devDeps فقط: @tauri-apps/cli ^2
```

## 4. الميزات الكاملة (كلها مؤكدة في الكود)

1. **مراجعة SM-2**: استحقاق ذكي، تقييم 1–4 (أزرار + لوحة مفاتيح 1-4)، قلب غير محدود (Space/Enter)، حد يومي للجديد، ترتيب حسب قرب CEFR من مستوى المتعلم — `srs.js` + `app.js`.
2. **توليد بطاقات Gemini**: نص → بطاقات (كلمة/معنى/مثال/ترجمة/وسوم/CEFR)، معاينة قابلة للتعديل، عنوان قسم مقترح، تخطي مكررات، فحص انعكاس اللغتين، عدد 5/10/تلقائي — `ai.js` + `handlers.js`.
3. **قصص تفاعلية**: توليد بمستوى CEFR محدد (عقد صعوبة تصاعدي)، ترجمة كاملة، عرض Interlinear جملة-جملة، مفردات مفتاحية، استماع قابل للإيقاف/الإعادة مع كاش صوتي وسرعة مخصصة، تكبير خط، نقر كلمة → ترجمة فورية → بطاقة، تحويل كل المفردات لقسم بضغطة — `handlers.js` + `render.js`.
4. **نطق Edge TTS**: 30 صوتاً منسقاً عبر 11 لغة تعلم، صوت منفصل للهدف/الأم، سرعة 0.5x–2x مطبقة على كل النطق، كشف لغة تلقائي، نطق تلقائي عند القلب، احتياطي ثلاثي (Rust → WebSocket المتصفح → Google/Web Speech) — `tts.js` + `edge_tts.rs`.
5. **إدارة الأقسام والبطاقات**: إنشاء/تعديل/حذف ناعم + سلة محذوفات، نافذة إدارة كلمات القسم مع بحث فوري، صور البطاقات (ضغط Canvas + فحص magic bytes في Rust + حد 8MB + منع اجتياز مسارات)، تسجيل صوت يدوي — `handlers.js` + `lib.rs`.
6. **إحصائيات**: خط يومي 30 يوماً، خريطة حرارية، دقة، سلسلة أيام، عدادات استحقاق — `render.js` (استعلام مرجعي موثق في `schema.sql:111-114`).
7. **بيانات**: تصدير/استيراد بدمج أو استبدال، المفتاح لا يُصدَّر، ترحيل تلقائي من IndexedDB القديم — `store.js` + `db.js`.
8. **واجهة**: 8 لغات RTL/LTR، ثيم ليلي/نهاري، تكبير خط عام، إخفاء الشريط الجانبي، onboarding أول مرة، اختصارات لوحة مفاتيح (Space/Enter/1-4/`/`)، استعادة آخر واجهة وآخر قصة عند الإقلاع — `app.js` + `handlers.js`.
9. **توزيع**: CI بمثبتات ويندوز ولينكس (Artifacts)، AppImage خفيف محلي، فحص تحديثات داخل التطبيق (updater + مفتاح minisign منفصل).

## 5. حالة الجودة — ما تم التحقق منه

- ✅ فحص بناء الجملة لكل JS المعدل (`node --check`): tts.js، handlers.js، ai.js، render.js.
- ✅ إقلاع فعلي في متصفح حقيقي (`?demo=1`): لا أخطاء boot، كل الواجهات ترسم.
- ✅ شريط سرعة النطق: 1.5x حُفظ وأُعيد للمنزلق بدقة.
- ✅ آلة حالة زر الاستماع: ثلاث دورات كاملة (تشغيل←إيقاف←إعادة←نهاية←تشغيل) بلا تعليق.
- ✅ برومبت القصة: أطوال ومفردات تصاعدية صحيحة للمستويات الستة.
- ✅ نافذة الكلمة: فتح فوري، معنى لحظي، رسالة خطأ + إعادة محاولة بلا مفتاح.
- ✅ تكافؤ مفاتيح الترجمة: 421 مفتاحاً × 8 لغات بلا أي فرق.
- ✅ تزامن الإصدار 1.1.0 في الملفات الأربعة + توثيق CHANGELOG.
- ✅ اختبار Rust مرجعي موجود: `edge_tts.rs` → `gec_v2_matches_reference` (5 حالات مرجعية ضد edge-tts 7.3.1).
- ℹ️ لم يُمس كود Rust في 1.1.0 (كل التعديلات بطاقة الواجهة) — لا حاجة لإعادة بناء النواة، والـ CI يبني تلقائياً.
- ℹ️ لا اختبارات JS مؤتمتة في المستودع (لا مجلد tests/ ولا *.test.js) — التحقق يدوي/تفاعلي.

## 6. الفروقات مقابل الوثيقة السابقة (Delta Report)

### 6.1 🆕 عناصر جديدة لم تكن موثّقة

| العنصر | النوع | المسار | ملاحظة |
|---|---|---|---|
| جدول `ai_generations` | جدول DB | `src/schema.sql:14-22` | سجل التوليدات + `prompt_used` |
| جدول `sessions` | جدول DB | `src/schema.sql:79-87` | جلسات المراجعة (mode normal/cram) |
| جدول `meta` | جدول DB | `src/schema.sql:96-99` | بيانات وصفية (schema_version) |
| 8 فهارس جزئية | فهارس DB | `src/schema.sql:102-109` | تستبعد المحذوف ناعماً |
| أعمدة SM-2 داخل cards | أعمدة DB | `src/schema.sql:53-59` | ease_factor, interval_days, repetitions, lapses, status, due_date, suspended_until |
| أعمدة cards إضافية | أعمدة DB | `src/schema.sql:43-52` | hint, audio_front, audio_back, generated_from, lang, cefr, example, example_translation |
| `seed-demo.js` | ملف | `src/js/seed-demo.js` | بذور ?demo=1 تُحمَّل ديناميكياً |
| `vendor/sql-wasm.js` + `.wasm` | ملفان | `src/vendor/` | محرك sql.js المضمّن للمتصفح |
| `css/fonts.css` + `assets/fonts/` (8 woff2) | ملفات | `src/css/` `src/assets/` | خط Tajawal الذاتي |
| `icons/android/` + `icons/ios/` | أصول | `src-tauri/icons/` | أطقم أيقونات جوال كاملة |
| أمر `load_card_image` | أمر Tauri | `src-tauri/src/lib.rs:111` | قراءة صورة بمراقبة المسار |
| `tauri-plugin-opener` | إضافة | `Cargo.toml:21` | لم تكن مذكورة |
| صلاحيات capabilities | إعداد | `src-tauri/capabilities/default.json` | قائمة أذونات محصورة |
| `scripts/build_appimage.sh` | سكربت | `scripts/` | AppImage خفيف ~5MB |
| `ttsSpeedSub`, `popTranslateFailed` | مفاتيح ترجمة | `src/i18n/*.json` | أضيفت في 1.1.0 |
| عدد مفاتيح الترجمة الفعلي | حقيقة | `src/i18n/` | 421 مفتاحاً × 8 لغات بتكافؤ 100% |
| تنظيف بذور قديمة عند الإقلاع | ميزة | `src/js/app.js:245-264` | cleanupLegacySeeds |
| شفاء النماذج الميتة عند الإقلاع | ميزة | `src/js/app.js:278-282` | إعادة تعيين نموذج متوقف |
| استعادة آخر قصة/واجهة | ميزة | `src/js/app.js:307-319` | localStorage |
| اختصارات لوحة المفاتيح | ميزة | `src/js/handlers.js:2229+` | Space/Enter/1-4/`/` |
| مفتاح توقيع minisign منفصل | عملية | `PUSH-INSTRUCTIONS.md:125` | يُسلَّم خارج المستودع |
| تبعيات Rust الكاملة + release profile | إعداد | `src-tauri/Cargo.toml` | lto, opt-level=s, strip, panic=abort |

### 6.2 ⚠️ عناصر متغيّرة أو مناقضة

| ما ذكرته الوثائق السابقة | الواقع في الكود | المسار | التصحيح |
|---|---|---|---|
| PROJECT-REPORT سابقاً: «322 صوتاً عبر 12 لغة تعلم» | القائمة المنسقة `EDGE_VOICES` = **30 صوتاً عبر 11 لغة**؛ رقم 322 هو تحقق حي من أصوات الخدمة (تعليق كود) | `src/js/tts.js:150-163` | اعتماد 30/11 |
| PROJECT-REPORT سابقاً: المخطط «decks · cards · reviews · kv» | **7 جداول** ولا يوجد جدول `kv` — جدول الإعدادات اسمه `settings` | `src/schema.sql` | تصحيح القائمة |
| README:63 «Gemini 2.5 Flash / Flash Lite / Pro» | نماذج 2.5/2.0/1.5 **ميتة** (DEAD_MODELS — جوجل أوقفتها بـ404)؛ الحية: 3.6/3.8/3.5-lite | `src/js/ai.js:183` | تحديث README |
| README:136 «405 مفتاح ترجمة لكل لغة» | **421 مفتاحاً** لكل لغة | `src/i18n/` | تحديث README |
| README:112 «يتم تشفير المفتاح وتخزينه» | لا تشفير فعلي — يُخزَّن نصاً في جدول `settings` المحلي (لكنه لا يُصدَّر) | `src/js/store.js:13` | تعديل الصياغة: «محلي فقط» |
| CHANGELOG 1.0.0 + PUSH-INSTRUCTIONS:97 «Draft Release تلقائي» | `build.yml` لا ينشئ Release (لا `tagName` لـ tauri-action) — يرفع **Artifacts فقط** | `.github/workflows/build.yml:51-71` | الإصدار يُنشأ يدوياً من الـ Artifacts |
| CHANGELOG 1.0.0 «CSP مضبوط» | `"csp": null` في الإعداد | `src-tauri/tauri.conf.json:22` | إما تفعيل CSP أو حذف الادعاء |
| PUSH-INSTRUCTIONS:13 «USERNAME في README و4 مواضع» | README الحالي **خالٍ من USERNAME وروابط GitHub**؛ المتبقي موضع واحد فقط في LICENSE؛ وtauri.conf.json يحوي `7amzalam` فعلياً | `LICENSE:3` | تحديث التعليمات |
| SETUP.md:61 «.gitignore يستبعد *.db وaudio/ و.sysroot…» | `.gitignore` الفعلي 6 أسطر فقط (node_modules, target, gen, dist, *.log, .DS_Store) | `.gitignore` | تحديث SETUP أو توسيع .gitignore |

### 6.3 🗑️ عناصر محذوفة أو لم يعد لها وجود

| العنصر | كان في | تحقق الغياب |
|---|---|---|
| دالة `storyLength(cefr)` (داخلية) | `src/js/ai.js` قبل 1.1.0 | استُبدلت بـ `storySpec()` — غير موثقة للخارج أصلاً |
| (لا عناصر موثقة للنشر حُذفت من الكود) | — | تم التحقق: كل ميزات 1.0.0 الموثقة موجودة |

## 7. خطوات الرفع المتبقية (محدّثة)

1. استبدال `USERNAME` المتبقي الوحيد في `LICENSE:3` باسم المالك (tauri.conf.json يشير فعلاً إلى `7amzalam/flashki`).
2. `git init -b main` (المجلد ليس مستودع git بعد) ثم commit وpush — التفاصيل الكاملة في `PUSH-INSTRUCTIONS.md` (مع ملاحظة أن خطوة «Draft Release التلقائي» فيه غير دقيقة — الإصدار يُنشأ يدوياً).
3. إنشاء وسم `v1.1.0` ودفعه — يشغّل CI الذي يبني msi/nsis (ويندوز) وdeb/rpm/AppImage (لينكس) **كـ Artifacts قابلة للتحميل**.
4. إنشاء Release يدوياً من صفحة Releases، رفع المثبتات من الـ Artifacts + ملف `latest.json` الموقّع بمفتاح minisign (يُسلَّم منفصلاً) ليعمل التحديث التلقائي داخل التطبيق.
5. يُفضَّل قبل الرفع: تصحيح تعارضات README المذكورة في 6.2 (النماذج الميتة، عدد المفاتيح، ادعاء التشفير) لأنها صفحة المشروع العامة.
