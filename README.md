# Flashki — تطبيق البطاقات الذكية (Tauri 2)

تطبيق بطاقات مراجعة متباعدة (Spaced Repetition) **محلي بالكامل**: كل بياناتك مخزّنة على جهازك، بدون سيرفر، مع توليد بطاقات بالذكاء الاصطناعي (Google Gemini فقط) عبر نواة خلفية داخل التطبيق.

## البنية التقنية

| الطبقة | التقنية |
|---|---|
| الواجهة | HTML/CSS/JS خالص (تصميمك الأصلي) |
| التخزين | IndexedDB محلية على جهاز المستخدم |
| الخوارزمية | SM-2 للمراجعة المتباعدة (نمط Anki) |
| الخادم الخلفي للذكاء الاصطناعي | نواة Rust داخل التطبيق تتصل بـ Gemini فقط |
| التغليف | Tauri 2 (Windows · Linux · macOS · Android لاحقاً) |

```
flashki/
├── src/                 ← الواجهة (frontend)
│   ├── index.html
│   ├── css/             ← التنسيقات + الخطوط المحلية (Tajawal)
│   ├── js/              ← المنطق: db, srs, store, tts, audio, ai, render, handlers, app
│   └── assets/fonts/
├── src-tauri/           ← نواة Tauri (Rust)
│   ├── src/main.rs      ← نقطة الدخول
│   ├── src/lib.rs       ← أمر gemini_generate (الاتصال بـ Gemini من الخلف)
│   ├── tauri.conf.json  ← إعدادات النافذة والحزمة
│   ├── capabilities/    ← صلاحيات النافذة
│   └── icons/           ← أيقونات التطبيق (كل المقاسات)
└── package.json
```

---

## 1) تثبيت المتطلبات (مرة واحدة فقط)

### Windows
1. **Microsoft Edge WebView2** — مثبت مسبقاً في Windows 11 وWindows 10 المحدَّث.
2. **Rust**: حمّل `rustup-init.exe` من https://rustup.rs وشغّله.
3. **Node.js 20+**: من https://nodejs.org (نسخة LTS).
4. **Visual Studio Build Tools**: من https://visualstudio.microsoft.com/visual-cpp-build-tools/
   - أثناء التثبيت اختر: **Desktop development with C++**.

### Linux (Ubuntu / Debian)
```bash
sudo apt update
sudo apt install -y build-essential curl wget file libx11-dev libasound2-dev \
  libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev

# Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"

# Node.js (إذا لم يكن مثبتاً)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

تحقق أن كل شيء جاهز:
```bash
rustc --version && node --version && npm --version
```

---

## 2) التشغيل الأول (وضع التطوير)

من داخل مجلد المشروع:

```bash
npm install        # يثبت أدوات Tauri CLI (أول مرة فقط)
npm run dev        # يبني النواة ويفتح نافذة التطبيق
```

> أول تشغيل يستغرق عدة دقائق (ترجمة Rust)، التشغيلات التالية سريعة.
> عند نجاح الأمر ستفتح نافذة **Flashki** ببيانات بداية جاهزة للتجربة.

### تجربة الواجهة في المتصفح فقط (بدون Rust — للاختبار السريع)
```bash
npm run web
# ثم افتح http://localhost:5173
```
في وضع المتصفح يعمل كل شيء عدا الاتصال بـ Gemini يتم مباشرة من المتصفح بدل النواة (مفيد لتجربة الواجهة).

---

## 3) تفعيل الذكاء الاصطناعي (Gemini)

1. افتح https://aistudio.google.com/apikey وسجّل بحساب Google.
2. اضغط **Create API key** وانسخ المفتاح (يبدأ بـ `AIza...`).
3. في التطبيق: **الإعدادات ← تكامل الذكاء الاصطناعي ← مفتاح Gemini API** والصق المفتاح ثم **حفظ**.
   - المفتاح يُحفظ **محلياً على جهازك فقط** ولا يُصدَّر مع النسخ الاحتياطية.
4. جرب: **إضافة بطاقات ← بالذكاء الاصطناعي** → الصق أي نص دراسي → اختر عدد البطاقات → **توليد البطاقات** → راجع البطاقات المولّدة → احفظ المحدد في قسمك.

يمكن تغيير الموديل من ملف الإعدادات الافتراضي هو `gemini-2.5-flash`.

---

## 4) بناء نسخة التوزيع (ملفات التنصيب)

```bash
npm run build
```

النتائج:
- **Windows**: `src-tauri/target/release/bundle/msi/*.msi` و `bundle/nsis/*-setup.exe`
- **Linux**: `bundle/deb/*.deb` و `bundle/appimage/*.AppImage`

هذه الملفات هي التي توزعها على المستخدمين — لا حاجة لأي سيرفر، كل مستخدم يثبت التطبيق ويعمل على جهازه محلياً.

### تغيير أيقونة التطبيق مستقبلاً
ضع صورة PNG مربعة 1024×1024 ثم:
```bash
npm run icon
```

---

## 5) خطوة أندرويد (لاحقاً عندما نجهز نسخة الحاسوب)

```bash
rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
# يتطلب تثبيت Android Studio + Android SDK ثم:
npm run tauri android init
npm run tauri android dev
npm run tauri android build   # ينتج .apk / .aab للمتجر
```

---

## ما المُنفَّذ حالياً (الجولة الأولى)

- كل شاشات التصميم الأصلي مربوطة بمنطق حقيقي: الرئيسية، الأقسام، التصفح، البحث بالتظليل، الإحصائيات الحقيقية (مخطط أعمدة + خريطة حرارية + سلاسل تعلم)، الإضافة، الإعدادات.
- **البيانات**: IndexedDB محلية — أقسام وبطاقات وسجل مراجعات وإعدادات + بيانات بداية (4 أقسام، 20 بطاقة) لأول تشغيل.
- **جلسة المراجعة**: بناء طابور من المستحق + الجديدة (بحد يومي)، ترتيب (خلط/تسلسل/الأصعب أولاً)، اتجاه (عادي/معكوس)، تقييم بأربع درجات يحدّث جدولة SM-2 فوراً، اختصارات لوحة المفاتيح (مسافة للقلب، 1-4 للتقييم، Esc للخروج)، شاشة نهاية جلسة بإحصاءات حقيقية.
- **الذكاء الاصطناعي**: نص → بطاقات عبر Gemini (من نواة Rust) مع خيار الوجهين والأمثلة السياقية — **تم حذف ميزة PDF كما طلبت**.
- **الصوت**: تسجيل ميكروفون حقيقي للوجهين وتشغيله أثناء المراجعة، ونطق TTS تلقائي أو يدوي (عربي/إنجليزي).
- **البيانات**: تصدير/استيراد نسخة احتياطية JSON كاملة (مع التسجيلات الصوتية)، وزر مسح شامل.

## المشاكل الشائعة وحلولها

| المشكلة | الحل |
|---|---|
| `error: Microsoft Visual C++ 14.0 or greater is required` (Windows) | ثبّت Visual Studio Build Tools مع عبء عمل "Desktop development with C++" |
| `failed to run custom build command` أو `webkit2gtk` مفقود (Linux) | ثبّت حزم libwebkit2gtk-4.1-dev وlibgtk-3-dev من القسم أعلاه |
| `cargo: command not found` | أعد فتح الطرفية بعد تثبيت rustup أو شغّل `source "$HOME/.cargo/env"` |
| الخط يظهر مختلفاً في أول تشغيل بلا إنترنت | الخطوط محملة محلياً داخل المشروع — تأكد أن مجلد `src/assets/fonts` موجود |
| فشل اتصال Gemini | تحقق من المفتاح في الإعدادات، ومن اتصال الإنترنت، وحصص الاستخدام في Google AI Studio |
| الميكروفون لا يعمل (Windows) | تحقق من صلاحية الميكروفون لتطبيق Flashki في إعدادات الخصوصية |
