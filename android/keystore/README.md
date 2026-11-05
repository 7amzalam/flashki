# مفتاح توقيع إصدارات أندرويد — Flashki

- `flashki-release.jks` — مفتاح التوقيع (RSA 2048، صلاحية ~27 سنة)
- `KEYS.env` — كلمة مرور المخزن والاسم المستعار (`flashki`)

## قواعد حاسمة

1. **لا تفقد هذا الملف أبداً**: التحديثات المنشورة على المتجر/الموقع يجب أن
   تُوقّع بنفس المفتاح وإلا رفض أندرويد التحديث فوق النسخة المثبتة
   (`INSTALL_FAILED_UPDATE_INCOMPATIBLE`) وسيضطر المستخدمون لحذف التطبيق.
2. خزّن نسخة من `flashki-release.jks` و`KEYS.env` في مكان آمن (مدير كلمات
   مرور / مستودع سري خاص). لا ترفعهما إلى مستودع عام أبداً.
3. في GitHub Actions ضع محتوى الاثنين كأسرار:
   - `ANDROID_KEYSTORE_B64` = `base64 flashki-release.jks`
   - `ANDROID_KS_PASS` = كلمة المرور
   - `ANDROID_KEY_ALIAS` = `flashki`
4. للبناء اليدوي: `source android/keystore/KEYS.env && ./android/build-apk.sh release`
   (يقرأ `KSPASS` تلقائياً).
