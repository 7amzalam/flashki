# رفع Flashki على GitHub — خطوة بخطوة

هذا الدليل بلا أي افتراضات: اتبع الخطوات بالترتيب ولو كانت تبدو بديهية.

## 1. أنشئ حساب على GitHub

- افتح: <https://github.com>
- اضغط **Sign up** (إن لم يكن لديك حساب) وأكمل التسجيل بالبريد الإلكتروني.
- احفظ **اسم المستخدم** (Username) الذي اخترته — ستحتاجه في كل الخطوات القادمة بدلًا من `YOUR_USERNAME`.

## 2. استبدل USERNAME داخل ملفات المشروع (مرة واحدة)

في مجلد `flashki` المفكوك، يوجد `USERNAME` في 4 مواضع. استبدله باسم مستخدمك:

```bash
cd flashki
sed -i 's/USERNAME/YOUR_USERNAME/g' README.md LICENSE
```

(استبدل `YOUR_USERNAME` أولًا بالاسم الحقيقي قبل تشغيل الأمر، أو عدّل الملفين يدويًا بالبحث عن `USERNAME`.)

- ملف `README.md`: شارة CI + رابط Releases + رابط الاستنساخ.
- ملف `LICENSE`: سطر حقوق النشر.
- ملف `src-tauri/tauri.conf.json`: رابط فحص التحديثات (updater). هذا الملف عدّله يدويًا في السطر `"https://github.com/USERNAME/flashki/releases/latest/download/latest.json"`.

## 3. أنشئ repository جديد

- اذهب إلى: <https://github.com/new>
- **Repository name**: `flashki`
- **Visibility**: Public (أو Private إن أردت)
- ⚠️ **لا** تضف README / .gitignore / license — كلها موجودة في المشروع جاهزة.
- اضغط **Create repository**.

## 4. في Terminal على جهازك — أول commit

```bash
cd flashki
git init -b main
git add .
git commit -m "chore: v1.0.0 — initial release"
```

إن طلب git اسمك وبريدك أول مرة:

```bash
git config --global user.name "اسمك"
git config --global user.email "بريدك@example.com"
```

ثم أعِد أمر `git commit` فوق.

## 5. اربط المشروع بالـ repo

انسخ الرابط من صفحة GitHub (يظهر بعد إنشاء الـ repo).

إذا كان SSH:

```bash
git remote add origin git@github.com:YOUR_USERNAME/flashki.git
```

إذا كان HTTPS:

```bash
git remote add origin https://github.com/YOUR_USERNAME/flashki.git
```

استبدل `YOUR_USERNAME` باسمك على GitHub.

## 6. ارفع الكود

```bash
git push -u origin main
```

قد يطلب منك مصادقة:

- **SSH**: أضف SSH key أولًا من <https://github.com/settings/keys> (أنشئه بـ `ssh-keygen -t ed25519` ثم الصق محتوى `~/.ssh/id_ed25519.pub`).
- **HTTPS**: استخدم **Personal Access Token** بدل كلمة المرور — أنشئه من <https://github.com/settings/tokens> (صلاحية `repo`)، وانسخه ككلمة مرور عند الطلب.

## 7. شغّل الـ CI يدويًا (لأول مرة)

الـ workflow يعمل تلقائيًا مع كل tag يبدأ بـ `v`، ولأول تجربة شغّله يدويًا:

- اذهب إلى repo → تبويب **Actions**
- اضغط **build** في القائمة الجانبية
- اضغط **Run workflow** → **Run workflow**
- انتظر 15–25 دقيقة (ويندوز يبني msi/nsis، لينكس يبني deb/rpm/AppImage)

## 8. أنشئ الإصدار v1.0.0 (tag)

```bash
git tag v1.0.0
git push origin v1.0.0
```

رفع الـ tag يشغّل الـ CI تلقائيًا مرة أخرى — هذه المرة سينشئ **Draft Release** باسم "Flashki v1.0.0".

## 9. حمّل الحزم وانشر الإصدار

بعد نجاح الـ CI → تبويب **Releases**:

- ستجد مسودة (Draft): **"Flashki v1.0.0"**
- ستجد فيها مرفقات:

| الملف | النظام |
|---|---|
| `Flashki_1.0.0_x64_en-US.msi` (+ `.exe` من nsis) | Windows |
| `Flashki_1.0.0_amd64.deb` | Ubuntu/Debian |
| `Flashki-1.0.0-1.x86_64.rpm` | Fedora/RHEL |
| `Flashki_1.0.0_amd64.AppImage` | Linux عام |
| `latest.json` | فحص التحديثات التلقائية |

- راجع المسودة → اضغط **Publish release**.

## إن فشل الـ CI

- افتح الـ run الفاشل من تبويب Actions وانسخ **نص الخطأ** الأحمر.
- أرسله لي (الوكيل) وسأصلحه في جولة واحدة.

## ملاحظات مهمة

- أول CI قد يفشل (طبيعي تمامًا — اختلافات بيئة GitHub). أرسل الخطأ وأصلحه في جولة واحدة.
- تحديثات التطبيق التلقائية (updater) تقرأ `latest.json` من صفحة Releases — لذلك مهم أن يُنشر الإصدار رسميًا وليس مسودة نهائية.
- توقيع التحديثات يحتاج **مفتاح minisign الخاص** — موجود في ملف منفصل أُرسل لك (`flashki-SIGNING-KEY-TXT`)، **ليس** داخل هذا المشروع. احتفظ به في مكان آمن جدًا.
