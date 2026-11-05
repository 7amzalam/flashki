# Flashki — إعداد المشروع بعد فك الضغط

هذا الدليل يفترض أنك فككت ضغط `flashki-v1.0.0-source.zip` وحصلت على مجلد `flashki/`.

## على Linux (Ubuntu/Debian)

```bash
cd flashki
bash scripts/build_env_setup.sh
npm install
npm run tauri dev
```

ماذا يفعل `scripts/build_env_setup.sh`؟ يفحص جهازك ويختار الوضع المناسب تلقائيًا:

1. **إذا كانت اعتماديات Tauri مثبتة أصلًا** → لا يفعل شيئًا وينتهي فورًا.
2. **إذا كان لديك sudo** → يثبّت الاعتماديات النظامية بنفسه (سيطلب كلمة مرورك مرة واحدة):
   `libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev`
3. **إن لم يكن لديك sudo** (حاويات/سيرفرات) → يبني sysroot محلي داخل `.sysroot/` بجانب المشروع بدون صلاحيات جذر.
4. يثبّت Rust عبر rustup إذا لم يكن `cargo` موجودًا.

ثم `npm install` يثبّت Tauri CLI وأدوات الواجهة، و`npm run tauri dev` يفتح التطبيق في وضع التطوير (نافذة حقيقية، إعادة تحميل تلقائي عند تعديل `src/`).

ملاحظة: التطبيق يحتاج webkit2gtk 4.1 وقت التشغيل — موجود افتراضيًا في Ubuntu 22.04+/Debian 12+/Fedora 37+، وسكربت الإعداد يثبّت حزمة التطوير الخاصة به على أي حال.

## على Windows

```powershell
# 1. ثبّت Rust من https://rustup.rs
# 2. ثبّت Node.js 20+ من https://nodejs.org
# 3. ثبّت Visual Studio Build Tools (C++ workload)
# 4. في PowerShell:
cd flashki
npm install
npm run tauri dev
```

- عند أول تشغيل سيقوم rustup بتنزيل أدوات MSVC تلقائيًا في المرة الأولى فقط.
- لا تحتاج أيًا من سكربتات `scripts/` على Windows — هي خاصة ببيئات Linux.

## البناء

```bash
npm run tauri build
```

ينتج في `src-tauri/target/release/bundle/`:

| الحزمة | المسار | ملاحظة |
|---|---|---|
| Windows | `msi/Flashki_1.0.0_x64_en-US.msi` + `nsis/` | يعمل على Windows 10/11 |
| Ubuntu/Debian | `deb/Flashki_1.0.0_amd64.deb` | ~4.5 MB |
| Fedora/RHEL | `rpm/Flashki-1.0.0-1.x86_64.rpm` | ~4.5 MB |
| AppImage افتراضي | `appimage/` | عبر tauri — يحزم webkit كاملًا (~90 MB) |
| AppImage صغير | `bash scripts/build_appimage.sh` | ~5 MB، يعتمد webkit النظام مثل deb/rpm |

كلا النوعين من AppImage يعمل — الفرق فقط في الحجم وطريقة اعتماد webkit. اختر الصغير إذا كنت توزّع للمستخدمين نفسهم (أنظمة حديثة)، والافتراضي إذا أردت حزمة مستقلة تمامًا.

## مجلدات لا تُلمس ولا تُرفع إلى Git

مستبعدة أصلًا في `.gitignore`: `node_modules/`، `src-tauri/target/`، `src-tauri/gen/schemas/`، `*.db`، `audio/`، وسكربتات البنية البيئية (`.sysroot/` `.build-env/` `.debs/`). كلها تُولَّد محليًا عند أول بناء.
