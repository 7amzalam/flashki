# Flashki — الإصدار 1.7.4 (2026-11-05)

> تطبيق مكتبي ومحمول مفتوح المصدر لتعلم اللغات: بطاقات بتكرار متباعد SM-2، قصص تفاعلية بالذكاء الاصطناعي، نطق Microsoft Edge TTS — محلي 100% (Tauri 2 + SQLite + غلاف أندرويد أصلي).

## 1. بطاقة المشروع

| البند | القيمة (مُتحقق منها من الكود) |
|---|---|
| الاسم | Flashki — البطاقات الذكية والقصص التفاعلية |
| الإصدار | **1.7.4** — متزامن في الملفات الثلاثة: `package.json` · `src-tauri/tauri.conf.json` · `src-tauri/Cargo.toml` ✅ (وأندرويد يقرأه من package.json وقت البناء) |
| المعرف | `com.flashki.app` (tauri.conf.json) |
| النوع | تطبيق مكتبي (Tauri 2 / Rust core) + **تطبيق أندرويد أصلي** (WebView + جسر Java، بلا Gradle — `android/`) + نسخة ويب للمعاينة (`npm run web`) |
| قاعدة البيانات | SQLite محلي `flashki.db` (WAL + Foreign Keys) عبر `tauri-plugin-sql`؛ في المتصفح `sql.js WASM` (مخزَّن في localStorage) — `src/db.js` |
| المخطط | **7 جداول** + **8 فهارس جزئية**: `ai_generations` · `decks` · `cards` · `reviews` · `sessions` · `settings` · `meta` — `src/schema.sql` |
| الذكاء الاصطناعي | Google Gemini اختياري — سلسلة نماذج حية: `gemini-3.6-flash` → `gemini-3.8-flash` → `gemini-3.5-flash-lite` → `*-latest` مع تجاوز تلقائي للأخطاء (404/429/503) — `src/js/ai.js` |
| النطق | Microsoft Edge TTS (DRM v2 بـ Rust وJS) + احتياطي Google TTS وWeb Speech. قائمة منسقة: **30 صوتًا عبر 11 لغة** في `EDGE_VOICES` (تعليق الكود يذكر تحقّقاً حياً من 322 صوت خدمة) — `src/js/tts.js` |
| أوامر Tauri | 4: `gemini_generate` · `edge_tts_synthesize` · `save_card_image` · `load_card_image` — `src-tauri/src/lib.rs:148-153` |
| إضافات Tauri | `tauri-plugin-sql` · `tauri-plugin-opener` · `tauri-plugin-updater` — `Cargo.toml` |
| الصلاحيات | `core:default` · `sql:default` · `opener:default` · `updater:default` — `src-tauri/capabilities/default.json` |
| لغات الواجهة | 8 لغات × **473 مفتاح ترجمة لكل لغة، تكافؤ 100%** (ar, en, de, fr, es, tr, fa, ur) — `src/i18n/` |
| CI | GitHub Actions على وسم `v*` + تشغيل يدوي: سطح المكتب `ubuntu-22.04` + `windows-latest` (`build.yml`) وأندرويد (`android.yml`) |
| الخصوصية | البيانات على الجهاز فقط؛ الاتصال الخارجي الوحيد: Gemini (اختياري) وEdge TTS (اختياري)؛ مفتاح Gemini لا يُصدَّر أبداً (`store.js:163`) |

## 2. ملخص هذا الإصدار — ما الذي تغيّر؟

> السجل الكامل لكل الإصدارات (1.0.0 ← 1.7.4) في [`CHANGELOG.md`](CHANGELOG.md).
> خلاصة ما أُضيف بعد 1.1.0: إصلاح الصوت على أندرويد جذرياً (BigInt + ترويسة Edg + أولوية مايكروسوفت)، إشعارات المراجعة على أندرويد، ميكروفون التسجيل على أندرويد، فحص التطبيق للتحديثات، لوحة «آخر القصص» الجانبية وزر القائمة متعدد الأجهزة، استعادة قسم TTS وسرعتَي النطق، إعادة تصميم حقل مفتاح Gemini.

### 2.1 في 1.7.4: تحسين ألوان النصوص في الوضع الداكن فقط
- فحص تباين آلي لكل نص في كل الشاشات (حاسوب + هاتف، 8 واجهات + نوافذ منبثقة) — كشف أن لون الشروحات `--text-3` (3.4:1) دون حد القراءة، فرُفع من `#6a6a85` إلى `#9494b0` (5.3–6.4:1) دون مساس بالوضع الفاتح، مع شارات أعلى تبايناً وعنصر نائب حقل القصة يتبع السمة.

### 2.2 في 1.7.4: إصلاح تعطل «تعديل البطاقة» (خطأ كامن قديم)
- `getEl('twoSidedRow').style` على صف محذوف من الواجهة منذ إصدارات كان يرمي استثناء يوقف تحضير نموذج التعديل — حُرست المسارات وأصبح التعديل يعمل من أول نقرة إلى الحفظ (مُختبر طرف-لطرف).

### 2.3 في 1.7.4: إكمال الترجمات
- مفتاحا `retry` و`storiesCefr` جديدان في اللغات الثماني (473 مفتاحاً)، وتوجيه ثلاثة استدعاءات لمفاتيح غير موجودة إلى مفاتيحها الفعلية — فلا يعد يظهر نص عربي احتياطي في واجهات لغات أخرى.

### 2.4 تاريخياً (1.1.0): خلاصة ما كان قد أُصلح آنذاك
- إعادة الاستماع إلى القصة، كاش صوت القصة، ربط شريط سرعة النطق، نافذة الكلمة، وعقد صعوبة القصص حسب CEFR (A1 ‏80–120 كلمة ← C2 ‏420–550 كلمة) — التفاصيل الكاملة في git history.

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

## 5. حالة الجودة — ما تم التحقق منه (جولة 1.7.4)

- ✅ فحص بناء الجملة لكل ملفات JS الخمسة عشر (`node --check`): سليمة كلها.
- ✅ إقلاع فعلي في متصفح حقيقي ببيانات تجريبية: لا أخطاء إقلاع، والثماني واجهات ترسم بلا استثناءات (مُلتقطة ومفحوصة).
- ✅ **فحص تباين آلي** (`getComputedStyle` + WCAG) لكل نص ظاهر في كل واجهة — سطح مكتب 1920px وهاتف 390px، وضع داكن وفاتح: صفر نصوص دون 4.5:1 في الداكن بعد الإصلاح، والفاتح كما هو تماماً.
- ✅ تعديل بطاقة طرف-لطرف: فتح النموذج بالبيانات، زر الإلغاء، تسمية «حفظ التغييرات»، خروج نظيف — بعد إصلاح استثناء `twoSidedRow`.
- ✅ جلسة مراجعة كاملة: بدء ← قلب ← تقييم «سهل» ← تسجيل المراجعة في DB.
- ✅ تكافؤ مفاتيح الترجمة: **473 مفتاحاً × 8 لغات** بلا أي فرق، ولا مفاتيح فارغة مستخدمة، وكل مفاتيح `App.t()` في الكود موجودة فعلاً.
- ✅ بناء APK حقيقي v1.7.4 (code 174) وتوقيعه بمفتاح الإصدار والتحقق منه (`apksigner verify`) — 1.2MB، minSdk 29/target 34، الأصول الويب داخل الحزمة تتضمن كل إصلاحات 1.7.4.
- ✅ خدمة مايكروسوفت حية: قائمة الأصوات تعيد HTTP 200 مع 322 صوتاً بنفس خوارزمية Sec-MS-GEC في `tts.js` وترويسة Edg/143 (تحقق 2026-11-05).
- ✅ طبقة أندرويد المحاكاة (`?android=1`): الجسر يظهر وقسم TTS كامل (المحرك + التشخيص + الصوتان + السرعتان).
- ✅ تزامن الإصدار 1.7.4 في الملفات الثلاثة + توثيق CHANGELOG.
- ✅ اختبار Rust مرجعي موجود: `edge_tts.rs` → `gec_v2_matches_reference` (5 حالات مرجعية ضد edge-tts 7.3.1) — لم يُمس كود Rust في 1.7.4.
- ℹ️ لا اختبارات JS مؤتمتة في المستودع (لا مجلد tests/ ولا *.test.js) — التحقق تفاعلي آلي كما أعلاه.

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

## 7. خطوات الرفع المتبقية (محدّثة لإصدار 1.7.4)

1. تأكد أن أسرار GitHub ما زالت موجودة: `TAURI_SIGNING_PRIVATE_KEY` (سطح المكتب) و`ANDROID_KEYSTORE_B64` + `ANDROID_KS_PASS` + `ANDROID_KEY_ALIAS` (أندرويد).
2. من مجلد المستودع: `git add -A && git commit -m "fix: v1.7.4 — dark-theme text contrast + edit-card guard + i18n completion"` ثم `git push`.
3. أنشئ الوسم وادفعه: `git tag v1.7.4 && git push origin v1.7.4` — ينطلق CI تلقائياً: مثبّتات ويندوز (msi/nsis) ولينكس (deb/rpm/AppImage) و**APK أندرويد** في نفس الـ Release.
4. تحقق من تبويب Actions ثم Releases: مرفقات `v1.7.4` كاملة + `latest.json` (للتحديث التلقائي).
5. جرّب APK على الهاتف: `android/dist/flashki-android-v1.7.4.apk` المرفق هنا — انسخه للهاتف وثبّته (نفس مفتاح الإصدار، يثبّت فوق القديم محتفظاً بالبيانات).
6. ملاحظة: التوقيع على أندرويد في CI يحتاج الأسرار أعلاه؛ والبناء المحلي موثق في `ANDROID.md`.
