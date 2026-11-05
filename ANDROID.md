# Flashki لأندرويد

تطبيق أندرويد أصلي خفيف يغلّف واجهة الويب نفسها (مجلد `src/`) بلا أي تغيير
في الكود المشترك، مع تكامل أصلي مع النظام: نطق أوفلاين، زر رجوع، حفظ ملفات،
منتقي صور. الناتج **APK واحدة عالمية < 1 ميجابايت** تعمل على أندرويد 10 (API 29)
فما فوق، هواتف وتابلت، بأي معمارية (لا مكتبات أصلية).

```
android/
├── app/src/main/
│   ├── AndroidManifest.xml          أذونات: INTERNET فقط
│   ├── java/com/flashki/app/MainActivity.java   كل شيء: WebView + جسر + TTS
│   ├── res/                          الأيقونات التكيفية والألوان والسمة
│   └── assets/                       (يُملأ وقت البناء من src/ — غير مخزّن)
├── keystore/
│   ├── flashki-release.jks           مفتاح توقيع الإصدارات — احتفظ به!
│   ├── KEYS.env                      كلمة المرور والاسم المستعار
│   └── README.md                     قواعد الأمان والنشر
├── build-apk.sh                      سكربت البناء الكامل (بلا Gradle)
└── dist/                             ناتج البناء flashki-android-vX.Y.Z.apk
```

## كيف يعمل الغلاف

1. **تقديم الأصول**: الويب فيو يفتح `https://appassets.flashki.local/index.html`
   و`shouldInterceptRequest` يقرأ الملف فعلياً من `assets/web/` (نسخة من `src/`)
   مع MIME الصحيح لكل نوع (`application/wasm` للـ sql.js مثلاً). النتيجة أصل
   https حقيقي: التخزين المحلي، وfetch، وWebSocket (Edge TTS)، وGemini API تعمل
   دون أي حيلة CORS أو `file://`.
2. **جسر `window.FlashkiAndroid`** (JavascriptInterface):
   - `ttsSynthesize(text, voice, rate, id)` — نطق أصلي أوفلاين عبر
     `TextToSpeech.synthesizeToFile` في خيط منفصل، ويعيد النتيجة عبر
     `window.__fkNativeTtsDone(id, base64)`. يطابق الصوت بالأولوية:
     صوت محلي (أوفلاين) للغة+الدولة ← محلي للغة ← شبكي ← سقوط إلى Edge TTS.
     كل صوت يُخزَّن في `files/tts/` (مفتاح = بصمة النص والصوت والسرعة) بحد 90 ملفاً.
   - `saveExportFile(name, base64)` — كتابة النسخة الاحتياطية في
     `Download/Flashki/` عبر MediaStore (لا أذونات على أندرويد 10+).
   - `setBackEnabled(bool)` + `__fkBack()` — إدارة زر الرجوع.
   - `setKeepScreenOn(bool)` — الشاشة لا تنطفئ أثناء المراجعة.
3. **الرقيب `platform-android.js`** يفعّل الطبقة فقط إن وجد الجسر، فبقية
   المنصات (ويندوز/لينكس/الويب) لا تتأثر إطلاقاً.

أولوية محرك الصوت على أندرويد داخل `tts.js` (منذ v1.7.2 — صوت مايكروسوفت هو الأساس):
**مايكروسوفت Edge TTS (شبكة) ← Google TTS ← نطق المتصفح** — نفس صوت سطح المكتب
تماماً. أصوات الهاتف الأصلية لا تُستخدم إلا باختيار صريح لإعداد «أصوات الهاتف
فقط» من الإعدادات (نطق أوفلاين فوري لمن يريده). وكي يقبل خادم مايكروسوفت
مصافحة WebSocket من داخل الويب فيو، يضبط `MainActivity` ترويسة User-Agent
بنفس صيغة Edge‏ (`…Edg/143…` المطابقة لـ Sec-MS-GEC-Version) — بدلها يرد الخادم
برمز 403 ويصمت الصوت. الكاش ثلاثي الطبقات (ذاكرة ← SQLite ← توليد)
يعمل كما على سطح المكتب، والتوليد المسبق في الخلفية يملأ الكاش تلقائياً.

## البناء محلياً

المطلوب: JDK 11+ (خُطبت مع 21)، Android **build-tools 35.0.0** (aapt2/d8/apksigner)،
**platform android-34** (android.jar)، zip/unzip، python3.

```bash
# توجيه السكربت للأدوات (أو ضعها في $HOME/Android/Sdk بالترتيب القياسي فيكتشفها وحده)
export JAVA_HOME=/path/to/jdk-21
export BT_DIR=/path/to/build-tools/35.0.0
export AJAR=/path/to/platforms/android-34/android.jar

source android/keystore/KEYS.env     # يعرّف KSPASS
./android/build-apk.sh release       # → android/dist/flashki-android-vX.Y.Z.apk (الإصدار من package.json)
```

السكربت بالترتيب: مزامنة `src/` → `assets/web/`، ثم `aapt2 compile+link`
(minSdk 29 / targetSdk 34 / الإصدار من package.json)، ثم `javac` ثم `d8`
ثم إدراج `classes.dex` في الحزمة، ثم `zipalign` و`apksigner sign`.

> ملاحظة: d8 داخل build-tools 34.0.0 (إصدار 8.2.2-dev) يتعثر على الفئات
> المجهولة بخطأ `NullPointerException` — استخدم 35.0.0 (d8 8.6.2) كما هو
> مضبوط في السكربت والـ workflow.

## النشر عبر GitHub Actions

Workflow ‏`.github/workflows/android.yml` ينطلق مع وسوم `v*` (بالتوازي مع
بناء سطح المكتب) ويرفع `flashki-android-vX.Y.Z.apk` إلى نفس الـ Release.
يحتاج الأسرار التالية (مرة واحدة):

```bash
base64 -w0 android/keystore/flashki-release.jks   # → سر ANDROID_KEYSTORE_B64
cat android/keystore/KEYS.env                      # → سرّا ANDROID_KS_PASS و ANDROID_KEY_ALIAS
```

التشغيل اليدوي (تبويب Actions ← Android APK ← Run) يبني ويرفع Artifact دون نشر.

## التجربة على الهاتف

1. انقل `flashki-android-vX.Y.Z.apk` إلى الهاتف (كابل/تيليجرام/Drive).
2. افتحه — سيعرض أندرويد تحذير «مصادر غير معروفة» لأن التوقيع ذاتي؛
   اسمح بالتثبيت من هذا المصدر مرة واحدة.
3. عند تحديث لاحق بنفس المفتاح يثبّت فوق القديم مباشرة مع الحفاظ على بياناتك
   (البطاقات والصوتيات في تخزين التطبيق الخاص).

## ما يختلف عن سطح المكتب (مقصود)

| الموضوع | سطح المكتب (تورّي) | أندرويد |
| --- | --- | --- |
| الصوت | Edge TTS عبر Rust | مايكروسوفت Edge TTS أولاً (نفس صوت سطح المكتب — ترويسة Edg مضبوطة في الويب فيو)، ثم Google TTS عند تعذر الشبكة؛ أصوات الهاتف باختيار صريح فقط |
| التحديث التلقائي | عبر GitHub Releases | يُثبَّت APK الجديد يدوياً (زر «حمّل التطبيق» يفتح صفحة المشروع) |
| صور البطاقات | ملفات على القرص عبر Rust | data-URL داخل قاعدة البيانات (نفس سلوك المعاينة) |
| تكبير خط النظام | يتبع النظام | معطَّل داخل التطبيق (يكسر التخطيط) — استخدم حجم خط القصة في الإعدادات |

## تشخيص

سجلات الويب في اللوجكات: `adb logcat -s FlashkiWeb Flashki chromium`. تظهر
رسائل console وخطوط تحميل الأصول إن وجدت. لو تعطلت عملية العرض يُعاد بناء
الويب فيو تلقائياً (`onRenderProcessGone` → recreate).
