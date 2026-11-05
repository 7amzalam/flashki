package com.flashki.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlarmManager;
import android.app.AlertDialog;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ContentValues;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import android.util.Base64;
import android.view.View;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.JavascriptInterface;
import android.webkit.JsResult;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/**
 * Flashki — غلاف أندرويد أصلي لتطبيق الويب.
 *
 * يقدّم ملفات src/ من أصول التطبيق عبر نطاق وهمي https://appassets.flashki.local
 * (بديل خفيف لـ WebViewAssetLoader بلا أي مكتبات خارجية) كي يحصل التطبيق على
 * أصل https حقيقي: التخزين المحلي، و fetch، و WebAssembly كلها تعمل بشكل سليم.
 *
 * جسر FlashkiAndroid يوفّر: نطق أصلي أوفلاين (TextToSpeech → ملفات WAV)،
 * حفظ ملف النسخة الاحتياطية في مجلد التنزيلات، إدارة زر الرجوع،
 * وإبقاء الشاشة مضاءة أثناء المراجعة.
 */
public class MainActivity extends Activity {

    private static final String HOST = "appassets.flashki.local";
    private static final String START_URL = "https://" + HOST + "/index.html";
    static final String VERSION_NAME = "__VERSION_NAME__";

    private WebView webView;
    private volatile boolean backEnabled = false;
    private volatile boolean keepScreenOn = false;

    /* ── أذونات التشغيل ── */
    private static final int PERM_MIC = 8101;
    private static final int PERM_NOTIF = 8102;
    private final Object permCbLock = new Object();
    private String micPermCb;
    private String notifPermCb;
    private volatile boolean micGranted = false;
    private volatile boolean notifGranted = false;

    /* ── TTS ── */
    private TextToSpeech tts;
    private final Object ttsLock = new Object();
    private volatile boolean ttsReady = false;
    private volatile boolean ttsFailed = false;
    private CountDownLatch ttsInitLatch;
    private volatile String doneUtterance;
    private CountDownLatch synthLatch;
    /* نطق مباشر: معرف النداء الجاري + هل بدأ فعلاً (يُبلَّغ لـJS) */
    private final Object speakCbLock = new Object();
    private String speakCbId;
    private volatile boolean speakStarted;

    private static final String NOTIF_CHANNEL = "review_reminders";
    private static final String PREFS = "flashki_reminders";
    static final int ALARM_DUE = 4201;
    static final int ALARM_DAILY = 4202;
    private static final int REQ_ALARM_DUE = 4301;
    private static final int REQ_ALARM_DAILY = 4302;

    private ValueCallback<Uri[]> fileCallback;
    private static final int FILE_CHOOSER_CODE = 7001;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        setContentView(webView);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setTextZoom(100); /* تكبير خط النظام يكسر التخطيط — التطبيق يحترم تفضيل اللغة حرفياً */

        /* ── User-Agent بصيغة Edge — إلزامي لعمل صوت مايكروسوفت على الهاتف ──
            خادم TTS يرفض مصافحة WebSocket (رمز 403) ما لم يكن UA يحوي
            "Edg/<نفس الإصدار Major> المذكور في Sec-MS-GEC-Version" — تحقق حي
            2026-11-05: Edg/124 وبدون Edg → 403، و Edg/143 → نجاح.
            نفس UA المستخدم في src-tauri/src/edge_tts.rs لذلك يعمل سطح المكتب.
            ملاحظة: حدّث هذا السطر مع GEC_VERSION في src/js/tts.js و SEC_MS_GEC_VERSION
            في edge_tts.rs معاً عند تحديث مايكروسوفت لإصدارها. */
        s.setUserAgentString("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0");

        webView.setWebViewClient(new FlashkiClient());
        webView.setWebChromeClient(new FlashkiChrome());
        webView.addJavascriptInterface(new Bridge(), "FlashkiAndroid");
        webView.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, true);

        micGranted = selfPermission(Manifest.permission.RECORD_AUDIO);
        notifGranted = Build.VERSION.SDK_INT < 33 || selfPermission("android.permission.POST_NOTIFICATIONS");
        ensureNotificationChannel();
        scheduleDailyCheck(this); /* فحص المساء اليومي — يعيد جدولة نفسه من المستقبل */
        initTts();
        webView.loadUrl(START_URL);
    }

    private boolean selfPermission(String perm) {
        try { return checkSelfPermission(perm) == PackageManager.PERMISSION_GRANTED; }
        catch (Exception e) { return false; }
    }

    /* ═══════════ قناة إشعارات المراجعة ═══════════ */

    private void ensureNotificationChannel() {
        try {
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (nm == null || Build.VERSION.SDK_INT < 26) return;
            NotificationChannel ch = new NotificationChannel(NOTIF_CHANNEL,
                    "مراجعة البطاقات", NotificationManager.IMPORTANCE_DEFAULT);
            ch.setDescription("تنبيهات البطاقات المستحقة والمراجعة اليومية");
            ch.enableLights(false);
            ch.enableVibration(true);
            nm.createNotificationChannel(ch);
        } catch (Exception e) {
            android.util.Log.w("Flashki", "channel failed", e);
        }
    }

    /* ═══════════ خدمة الأصول: نطاق وهمي يقرأ من assets/web ═══════════ */

    private class FlashkiClient extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri url = request.getUrl();
            if (url == null || !HOST.equals(url.getHost())) return null; /* الشبكة تمر عادي */
            return serveAsset(url.getPath(), request.isForMainFrame());
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri url = request.getUrl();
            String scheme = url.getScheme() == null ? "" : url.getScheme();
            if ("https".equals(scheme) && HOST.equals(url.getHost())) return false;
            try { startActivity(new Intent(Intent.ACTION_VIEW, url)); } catch (Exception ignored) {}
            return true;
        }

        @Override
        public boolean onRenderProcessGone(WebView view, android.webkit.RenderProcessGoneDetail detail) {
            /* لا تدع التطبيق يموت مع عملية العرض — أعد بناء الويب فيو */
            recreate();
            return true;
        }
    }

    private WebResourceResponse serveAsset(String rawPath, boolean mainFrame) {
        String path = rawPath == null || rawPath.isEmpty() || "/".equals(rawPath) ? "/index.html" : rawPath;
        if (path.contains("..")) return notFound();
        String assetPath = "web" + path;
        InputStream is = null;
        try {
            is = getAssets().open(assetPath);
        } catch (IOException e) {
            try { is = getAssets().open(assetPath + ".html"); } catch (IOException ignored) {}
            if (is == null && mainFrame) {
                try { is = getAssets().open("web/index.html"); path = "/index.html"; } catch (IOException ignored) {}
            }
            if (is == null) return notFound();
        }
        String mime = mimeOf(path);
        String encoding = (mime.startsWith("text/") || mime.contains("json") || mime.contains("svg")) ? "utf-8" : null;
        WebResourceResponse resp = new WebResourceResponse(mime, encoding, is);
        return resp;
    }

    private static WebResourceResponse notFound() {
        return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", null,
                new java.io.ByteArrayInputStream(new byte[0]));
    }

    private static String mimeOf(String path) {
        String p = path.toLowerCase(Locale.US);
        int dot = p.lastIndexOf('.');
        String ext = dot < 0 ? "" : p.substring(dot + 1);
        switch (ext) {
            case "html": case "htm": return "text/html";
            case "js": return "text/javascript";
            case "mjs": return "text/javascript";
            case "css": return "text/css";
            case "json": case "map": return "application/json";
            case "sql": return "text/plain";
            case "wasm": return "application/wasm";
            case "png": return "image/png";
            case "jpg": case "jpeg": return "image/jpeg";
            case "webp": return "image/webp";
            case "gif": return "image/gif";
            case "svg": return "image/svg+xml";
            case "ico": return "image/x-icon";
            case "woff": return "font/woff";
            case "woff2": return "font/woff2";
            case "ttf": return "font/ttf";
            case "otf": return "font/otf";
            case "mp3": return "audio/mpeg";
            case "wav": return "audio/wav";
            case "ogg": return "audio/ogg";
            case "txt": return "text/plain";
            default: return "application/octet-stream";
        }
    }

    /* ═══════════ ChromeClient: console + اختيار الملفات + JS dialogs ═══════════ */

    private class FlashkiChrome extends WebChromeClient {
        @Override
        public boolean onConsoleMessage(ConsoleMessage m) {
            android.util.Log.d("FlashkiWeb", "[" + m.messageLevel() + "] " + m.message()
                    + " @" + m.sourceId() + ":" + m.lineNumber());
            return true;
        }

        /* تسجيل الصوت (الميكروفون في الإضافة اليدوية): الويب فيو يرفض getUserMedia
           افتراضياً — نمنحه AUDIO_CAPTURE بمجرد إذن RECORD_AUDIO الممنوح من النظام */
        @Override
        public void onPermissionRequest(final PermissionRequest request) {
            runOnUiThread(() -> {
                try {
                    if (micGranted && request != null
                            && request.getResources() != null) {
                        boolean wantsAudio = false;
                        for (String r : request.getResources()) {
                            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r)) wantsAudio = true;
                        }
                        if (wantsAudio) {
                            request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
                            return;
                        }
                    }
                    request.deny();
                } catch (Exception e) {
                    try { request.deny(); } catch (Exception ignored) {}
                }
            });
        }

        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (fileCallback != null) fileCallback.onReceiveValue(null);
            fileCallback = callback;
            try {
                Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("*/*");
                String[] accept = params.getAcceptTypes();
                List<String> mimes = new ArrayList<>();
                if (accept != null) {
                    for (String a : accept) {
                        if (a == null) continue;
                        for (String part : a.split(",")) {
                            String t = part.trim();
                            if (t.isEmpty()) continue;
                            if (t.startsWith(".") && t.equalsIgnoreCase(".json")) t = "application/json";
                            if (t.contains("/")) mimes.add(t);
                        }
                    }
                }
                if (!mimes.isEmpty()) intent.putExtra(Intent.EXTRA_MIME_TYPES, mimes.toArray(new String[0]));
                startActivityForResult(intent, FILE_CHOOSER_CODE);
            } catch (Exception e) {
                fileCallback = null;
                return false;
            }
            return true;
        }

        @Override
        public boolean onJsAlert(WebView view, String url, String message, JsResult result) {
            new AlertDialog.Builder(MainActivity.this)
                    .setMessage(message)
                    .setPositiveButton(android.R.string.ok, (d, w) -> result.confirm())
                    .setOnCancelListener(d -> result.cancel())
                    .show();
            return true;
        }

        @Override
        public boolean onJsConfirm(WebView view, String url, String message, JsResult result) {
            new AlertDialog.Builder(MainActivity.this)
                    .setMessage(message)
                    .setPositiveButton(android.R.string.ok, (d, w) -> result.confirm())
                    .setNegativeButton(android.R.string.cancel, (d, w) -> result.cancel())
                    .setOnCancelListener(d -> result.cancel())
                    .show();
            return true;
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == FILE_CHOOSER_CODE && fileCallback != null) {
            fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
            fileCallback = null;
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        boolean granted = false;
        for (int g : grantResults) if (g == PackageManager.PERMISSION_GRANTED) granted = true;
        String cb = null;
        synchronized (permCbLock) {
            if (requestCode == PERM_MIC) { micGranted = granted; cb = micPermCb; micPermCb = null; }
            else if (requestCode == PERM_NOTIF) { notifGranted = granted; cb = notifPermCb; notifPermCb = null; }
        }
        if (cb != null) {
            final String fcb = cb;
            webView.evaluateJavascript(
                    "window.__fkPermDone && window.__fkPermDone(" + jsStr(fcb) + "," + granted + ");", null);
        }
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
    }

    /* ═══════════ الجسر: window.FlashkiAndroid ═══════════ */

    private class Bridge {

        /** نطق أصلي أوفلاين: يولّد WAV في الخلفية ويعيد النتيجة عبر __fkNativeTtsDone(id, b64). */
        @JavascriptInterface
        public void ttsSynthesize(final String text, final String localeHint, final String ratePct, final String callbackId) {
            new Thread(() -> {
                String b64 = synthesizeNative(text, localeHint, ratePct);
                final String payload = b64 == null ? "" : b64;
                runOnUiThread(() -> {
                    if (webView == null) return;
                    webView.evaluateJavascript(
                            "window.__fkNativeTtsDone && window.__fkNativeTtsDone(" +
                                    jsStr(callbackId) + "," + jsStr(payload) + ");", null);
                });
            }, "flashki-tts").start();
        }

        @JavascriptInterface
        public void ttsStop() {
            try { if (tts != null) tts.stop(); } catch (Exception ignored) {}
        }

        /** HTTP POST أصلي بلا قيود CORS — طلبات Gemini تمر حتمية عبره لأن الويب
            فيو يحجب أحياناً preflight للأصل الوهمي فيظهر "Failed to fetch" والشبكة
            سليمة. يعيد النتيجة عبر window.__fkHttpDone(id, status, body) في خيط
            منفصل؛ status=-1 يعني فشل شبكة (DNS/مهلة) و>=400 يعني خطأ HTTP بنصه. */
        @JavascriptInterface
        public void httpPost(final String url, final String jsonBody, final String callbackId) {
            new Thread(() -> {
                int status;
                String body;
                try {
                    javax.net.ssl.HttpsURLConnection conn =
                            (javax.net.ssl.HttpsURLConnection) new java.net.URL(url).openConnection();
                    conn.setRequestMethod("POST");
                    conn.setConnectTimeout(15000);
                    conn.setReadTimeout(150000);
                    conn.setDoOutput(true);
                    conn.setUseCaches(false);
                    conn.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                    byte[] out = jsonBody == null ? new byte[0] : jsonBody.getBytes("UTF-8");
                    try (java.io.OutputStream os = conn.getOutputStream()) {
                        os.write(out);
                    }
                    status = conn.getResponseCode();
                    InputStream is = status >= 400 ? conn.getErrorStream() : conn.getInputStream();
                    ByteArrayOutputStream bos = new ByteArrayOutputStream();
                    if (is != null) {
                        byte[] buf = new byte[8192];
                        int n;
                        while ((n = is.read(buf)) > 0) bos.write(buf, 0, n);
                        is.close();
                    }
                    body = bos.toString("UTF-8");
                    conn.disconnect();
                } catch (Exception e) {
                    android.util.Log.w("Flashki", "httpPost failed", e);
                    status = -1;
                    body = String.valueOf(e.getMessage() == null ? "network error" : e.getMessage());
                }
                final int fStatus = status;
                final String fBody = body;
                runOnUiThread(() -> {
                    if (webView == null) return;
                    webView.evaluateJavascript(
                            "window.__fkHttpDone && window.__fkHttpDone(" + jsStr(callbackId) + "," +
                                    fStatus + "," + jsStr(fBody) + ");", null);
                });
            }, "flashki-http").start();
        }

        /* ── أذونات الميكروفون والإشعارات: يطلب إذن النظام ثم يعيد عبر
              window.__fkPermDone(cbId, granted) — granted=false يعني رفض المستخدم ── */
        @JavascriptInterface
        public void ensureMicPermission(final String callbackId) {
            if (micGranted) { firePermDone(callbackId, true); return; }
            synchronized (permCbLock) { micPermCb = callbackId; }
            runOnUiThread(() -> requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, PERM_MIC));
        }

        @JavascriptInterface
        public void ensureNotifPermission(final String callbackId) {
            if (notifGranted || Build.VERSION.SDK_INT < 33) { firePermDone(callbackId, true); return; }
            synchronized (permCbLock) { notifPermCb = callbackId; }
            runOnUiThread(() -> requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, PERM_NOTIF));
        }

        /* ── نطق مباشر عبر محرك الهاتف (تشغيل فوري بلا ملفات) — الأسرع والأضمن على
              الأجهزة التي يفشل فيها synthesizeToFile. يعيد window.__fkNativeSpeakDone(
              cbId, phase) حيث phase: 'start' بدأ الصوت فعلاً | 'end' انتهى | 'error'
              فشل المحرك أو اللغة غير متوفرة. ── */
        @JavascriptInterface
        public void ttsSpeakDirect(final String text, final String localeHint, final String ratePct, final String callbackId) {
            new Thread(() -> speakDirectNative(text, localeHint, ratePct, callbackId), "flashki-tts-direct").start();
        }

        /* حالة نطق الهاتف: جاهزية + عدد الأصوات + اللغات المغطاة فعلياً
           (كي تعرض الإعدادات ما يستطيع الهاتف نطقه بلا شبكة) */
        @JavascriptInterface
        public String ttsInfo() {
            ensureTts();
            if (!ttsReady || tts == null) return "{\"ready\":false}";
            Set<Voice> voices = tts.getVoices();
            int n = voices == null ? 0 : voices.size();
            java.util.TreeSet<String> langs = new java.util.TreeSet<>();
            if (voices != null) {
                for (Voice v : voices) {
                    if (v == null || v.getLocale() == null) continue;
                    String l = v.getLocale().getLanguage();
                    if (l != null && l.length() >= 2) langs.add(l.toLowerCase(Locale.US));
                }
            }
            StringBuilder sb = new StringBuilder("{\"ready\":true,\"voices\":").append(n).append(",\"langs\":[");
            boolean first = true;
            for (String l : langs) {
                if (!first) sb.append(',');
                sb.append('"').append(l).append('"');
                first = false;
            }
            sb.append("]}");
            return sb.toString();
        }

        /** حفظ ملف النسخة الاحتياطية في مجلد التنزيلات — يعيد المسار أو "". */
        @JavascriptInterface
        public String saveExportFile(final String fileName, final String base64) {
            try {
                byte[] bytes = Base64.decode(base64, Base64.NO_WRAP);
                ContentValues cv = new ContentValues();
                cv.put(MediaStore.MediaColumns.DISPLAY_NAME, fileName);
                cv.put(MediaStore.MediaColumns.MIME_TYPE, "application/json");
                cv.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Flashki");
                Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
                if (uri == null) return "";
                try (java.io.OutputStream os = getContentResolver().openOutputStream(uri)) {
                    if (os == null) return "";
                    os.write(bytes);
                }
                final String path = "Download/Flashki/" + fileName;
                runOnUiThread(() -> Toast.makeText(MainActivity.this,
                        "📁 " + path, Toast.LENGTH_LONG).show());
                return path;
            } catch (Exception e) {
                android.util.Log.w("Flashki", "export failed", e);
                return "";
            }
        }

        /** حالة زر الرجوع الأصلي — صحيح يعني أن للواجهة ما تُغلق/مكان تعود إليه. */
        @JavascriptInterface
        public void setBackEnabled(boolean enabled) {
            backEnabled = enabled;
        }

        @JavascriptInterface
        public void setKeepScreenOn(final boolean on) {
            if (keepScreenOn == on) return;
            keepScreenOn = on;
            runOnUiThread(() -> {
                if (on) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            });
        }

        @JavascriptInterface
        public String getAppInfo() {
            return "{\"platform\":\"android\",\"version\":\"" + VERSION_NAME + "\"}";
        }

        /* ── إشعارات المراجعة ───────────────────────────────────────────
           تحديث حالة البيانات (يقرأها مستقبل المنبه لحساب نص التذكير) +
           جدولة منبه عند أقرب وقت استحقاق بطاقات + إلغاء عند التعطيل. */
        @JavascriptInterface
        public void updateReminderState(final int dueCount, final long nextDueTs, final long lastOpenTs) {
            prefs().edit()
                    .putInt("dueCount", Math.max(0, dueCount))
                    .putLong("nextDueTs", nextDueTs)
                    .putLong("lastOpenTs", lastOpenTs)
                    .apply();
        }

        /**
         * نصوص إشعارات الفحص المسائي بلغة الواجهة الحالية — يرسلها JS عند كل
         * مزامنة (وبعد تبديل اللغة) لأن المنبه قد يطلق والتطبيق مغلق فلا
         * يستطيع قراءة i18n. العربية هي الاحتياط الأخير إن لم تُرسل بعد.
         */
        @JavascriptInterface
        public void saveReminderTexts(String json) {
            try {
                org.json.JSONObject o = new org.json.JSONObject(json == null ? "" : json);
                SharedPreferences.Editor ed = prefs().edit();
                if (o.has("awayTitle"))   ed.putString("txt_away_title",   o.getString("awayTitle"));
                if (o.has("awayText"))    ed.putString("txt_away_text",    o.getString("awayText"));
                if (o.has("forgotTitle")) ed.putString("txt_forgot_title", o.getString("forgotTitle"));
                if (o.has("forgotText"))  ed.putString("txt_forgot_text",  o.getString("forgotText"));
                if (o.has("dueTitle"))    ed.putString("txt_due_title",    o.getString("dueTitle"));
                if (o.has("dueText"))     ed.putString("txt_due_text",     o.getString("dueText"));
                if (o.has("channel"))     ed.putString("txt_channel",      o.getString("channel"));
                ed.apply();
            } catch (Exception e) {
                android.util.Log.w("Flashki", "saveReminderTexts failed", e);
            }
        }

        @JavascriptInterface
        public void scheduleDueAlarm(final long atTs, final String title, final String text) {
            scheduleDueAlarmCtx(MainActivity.this, atTs, title, text);
        }

        @JavascriptInterface
        public void cancelDueAlarm() {
            AlarmManager am = (AlarmManager) getSystemService(ALARM_SERVICE);
            if (am == null) return;
            am.cancel(alarmPendingIntent(MainActivity.this, ALARM_DUE, REQ_ALARM_DUE));
        }

        @JavascriptInterface
        public void setNotificationsEnabled(final boolean enabled) {
            prefs().edit().putBoolean("notifEnabled", enabled).apply();
            if (!enabled) {
                AlarmManager am = (AlarmManager) getSystemService(ALARM_SERVICE);
                if (am != null) {
                    am.cancel(alarmPendingIntent(MainActivity.this, ALARM_DUE, REQ_ALARM_DUE));
                    am.cancel(alarmPendingIntent(MainActivity.this, ALARM_DAILY, REQ_ALARM_DAILY));
                }
            }
        }

        @JavascriptInterface
        public String notificationsState() {
            boolean en = prefs().getBoolean("notifEnabled", true);
            return "{\"enabled\":" + en + ",\"granted\":" + notifGranted + "}";
        }
    }

    private static String jsStr(String s) {
        if (s == null) return "''";
        StringBuilder sb = new StringBuilder("'");
        for (char c : s.toCharArray()) {
            if (c == '\'' || c == '\\') sb.append('\\').append(c);
            else if (c == '\n') sb.append("\\n");
            else if (c == '\r') sb.append("\\r");
            else if (c < 0x20) sb.append(String.format("\\u%04x", (int) c));
            else sb.append(c);
        }
        return sb.append('\'').toString();
    }

    private void firePermDone(final String cbId, final boolean granted) {
        runOnUiThread(() -> {
            if (webView == null) return;
            webView.evaluateJavascript(
                    "window.__fkPermDone && window.__fkPermDone(" + jsStr(cbId) + "," + granted + ");", null);
        });
    }

    /* ── النطق المباشر: تشغيل عبر المحرك بدون توليد ملف ── */

    private void speakDirectNative(String text, String localeHint, String ratePct, String cbId) {
        ensureTts();
        boolean ok = false;
        synchronized (ttsLock) {
            if (tts != null && ttsReady && text != null && !text.trim().isEmpty()) {
                Voice v = pickVoice(localeHint);
                String lang = "", ctry = "";
                if (localeHint != null && !localeHint.isEmpty()) {
                    String[] parts = localeHint.replace('_', '-').split("-");
                    lang = parts.length > 0 ? parts[0] : "";
                    ctry = parts.length > 1 ? parts[1] : "";
                }
                int setRes = TextToSpeech.SUCCESS;
                if (v != null) {
                    tts.setVoice(v);
                } else {
                    Locale loc = ctry.isEmpty() ? new Locale(lang) : new Locale(lang, ctry);
                    setRes = tts.setLanguage(loc);
                    if (setRes == TextToSpeech.LANG_MISSING_DATA || setRes == TextToSpeech.LANG_NOT_SUPPORTED) {
                        /* آخر فرصة: أي صوت بنفس اللغة الأساسية مهما بلدُه */
                        Voice any = anyVoiceForLanguage(lang);
                        if (any != null) { tts.setVoice(any); setRes = TextToSpeech.SUCCESS; }
                    }
                }
                if (setRes != TextToSpeech.LANG_MISSING_DATA && setRes != TextToSpeech.LANG_NOT_SUPPORTED) {
                    tts.setSpeechRate(rateFromPct(ratePct));
                    synchronized (speakCbLock) { speakCbId = cbId; speakStarted = false; }
                    android.os.Bundle params = new android.os.Bundle();
                    params.putCharSequence(TextToSpeech.Engine.KEY_PARAM_UTTERANCE_ID, cbId);
                    int r = tts.speak(text, TextToSpeech.QUEUE_FLUSH, params, cbId);
                    ok = (r == TextToSpeech.SUCCESS);
                }
            }
        }
        if (!ok) fireSpeakPhase(cbId, "error");
    }

    private static float rateFromPct(String ratePct) {
        float rate = 1.0f;
        try {
            if (ratePct != null && !ratePct.isEmpty()) {
                int pct = Integer.parseInt(ratePct.trim().replace("%", ""));
                rate = Math.max(0.5f, Math.min(2.0f, 1.0f + pct / 100.0f));
            }
        } catch (NumberFormatException ignored) {}
        return rate;
    }

    /** أي صوت متاح للغة (بغضّ البلد) — يُستخدم حين يفشل setLanguage للصيغة الكاملة. */
    private Voice anyVoiceForLanguage(String lang) {
        if (tts == null || lang == null || lang.isEmpty()) return null;
        Set<Voice> voices = tts.getVoices();
        if (voices == null) return null;
        Voice best = null;
        for (Voice v : voices) {
            if (v == null || v.getLocale() == null) continue;
            if (!lang.equalsIgnoreCase(v.getLocale().getLanguage())) continue;
            boolean installed = v.getFeatures() == null
                    || !v.getFeatures().contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED);
            if (installed) return v;
            if (best == null) best = v;
        }
        return best;
    }

    private void fireSpeakPhase(final String cbId, final String phase) {
        runOnUiThread(() -> {
            if (webView == null) return;
            webView.evaluateJavascript(
                    "window.__fkNativeSpeakDone && window.__fkNativeSpeakDone(" +
                            jsStr(cbId) + "," + jsStr(phase) + ");", null);
        });
    }

    /* ═══════════ إشعارات: منبهات وجدولة (تُستدعى أيضاً من المستقبلات) ═══════════ */

    private SharedPreferences prefs() {
        return getSharedPreferences(PREFS, MODE_PRIVATE);
    }

    private static PendingIntent alarmPendingIntent(android.content.Context ctx, int alarmId, int reqCode) {
        Intent i = new Intent(ctx, ReviewAlarmReceiver.class);
        i.setAction("com.flashki.app.REVIEW_ALARM");
        i.putExtra("alarmId", alarmId);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= 23) flags |= PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getBroadcast(ctx, reqCode, i, flags);
    }

    static void scheduleDueAlarmCtx(android.content.Context ctx, long atTs, String title, String text) {
        try {
            AlarmManager am = (AlarmManager) ctx.getSystemService(android.app.Activity.ALARM_SERVICE);
            if (am == null || atTs <= System.currentTimeMillis()) return;
            Intent i = new Intent(ctx, ReviewAlarmReceiver.class);
            i.setAction("com.flashki.app.REVIEW_ALARM");
            i.putExtra("alarmId", ALARM_DUE);
            i.putExtra("title", title);
            i.putExtra("text", text);
            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= 23) flags |= PendingIntent.FLAG_IMMUTABLE;
            PendingIntent pi = PendingIntent.getBroadcast(ctx, REQ_ALARM_DUE, i, flags);
            /* setAndAllowWhileIdle: دقة كافية للتنبيهات مع وفر في البطارية
               (بلا إذن SCHEDULE_EXACT_ALARM ولا بثّ دقيق يوقظ الجهاز حتمياً) */
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atTs, pi);
        } catch (Exception e) {
            android.util.Log.w("Flashki", "schedule due failed", e);
        }
    }

    /** جدولة فحص المساء اليومي (يُعاد جدولته ذاتياً بعد كل إطلاق). */
    static void scheduleDailyCheck(android.content.Context ctx) {
        try {
            java.util.Calendar cal = java.util.Calendar.getInstance();
            cal.set(java.util.Calendar.HOUR_OF_DAY, 20);
            cal.set(java.util.Calendar.MINUTE, 0);
            cal.set(java.util.Calendar.SECOND, 0);
            if (cal.getTimeInMillis() <= System.currentTimeMillis()) cal.add(java.util.Calendar.DAY_OF_YEAR, 1);
            AlarmManager am = (AlarmManager) ctx.getSystemService(android.app.Activity.ALARM_SERVICE);
            if (am == null) return;
            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= 23) flags |= PendingIntent.FLAG_IMMUTABLE;
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, cal.getTimeInMillis(),
                    alarmPendingIntent(ctx, ALARM_DAILY, REQ_ALARM_DAILY));
        } catch (Exception e) {
            android.util.Log.w("Flashki", "schedule daily failed", e);
        }
    }

    /** بناء الإشعار وإطلاقه — يُستخدم من ReviewAlarmReceiver. */
    static void postNotification(android.content.Context ctx, String title, String text) {
        try {
            NotificationManager nm = (NotificationManager) ctx.getSystemService(android.app.Activity.NOTIFICATION_SERVICE);
            if (nm == null) return;
            if (Build.VERSION.SDK_INT >= 26) {
                /* اسم القناة بلغة المستخدم (أرسلها JS عبر saveReminderTexts) — عربي احتياط */
                SharedPreferences pr = ctx.getSharedPreferences("flashki_reminders", android.content.Context.MODE_PRIVATE);
                String chName = pr.getString("txt_channel", "مراجعة البطاقات");
                if (chName == null || chName.isEmpty()) chName = "مراجعة البطاقات";
                NotificationChannel ch = new NotificationChannel(NOTIF_CHANNEL,
                        chName, NotificationManager.IMPORTANCE_DEFAULT);
                nm.createNotificationChannel(ch);
            }
            Intent open = new Intent(ctx, MainActivity.class);
            open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= 23) flags |= PendingIntent.FLAG_IMMUTABLE;
            PendingIntent pi = PendingIntent.getActivity(ctx, 9001, open, flags);
            Notification.Builder b = Build.VERSION.SDK_INT >= 26
                    ? new Notification.Builder(ctx, NOTIF_CHANNEL)
                    : new Notification.Builder(ctx);
            b.setSmallIcon(R.mipmap.ic_launcher)
                    .setContentTitle(title)
                    .setContentText(text)
                    .setStyle(new Notification.BigTextStyle().bigText(text))
                    .setAutoCancel(true)
                    .setContentIntent(pi);
            if (Build.VERSION.SDK_INT < 26) b.setPriority(Notification.PRIORITY_DEFAULT);
            nm.notify(5101, b.build());
        } catch (Exception e) {
            android.util.Log.w("Flashki", "notify failed", e);
        }
    }

    /* ═══════════ محرك النطق الأصلي ═══════════ */

    private void initTts() {
        ttsInitLatch = new CountDownLatch(1);
        try {
            tts = new TextToSpeech(getApplicationContext(), status -> {
                ttsReady = (status == TextToSpeech.SUCCESS);
                ttsFailed = !ttsReady;
                if (ttsReady && tts != null) {
                    tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                        @Override public void onStart(String utteranceId) {
                            if (isDirectSpeak(utteranceId)) fireSpeakPhase(utteranceId, "start");
                        }
                        @Override public void onDone(String utteranceId) {
                            if (isDirectSpeak(utteranceId)) {
                                fireSpeakPhase(utteranceId, "end");
                                synchronized (speakCbLock) { speakCbId = null; }
                                return;
                            }
                            doneUtterance = utteranceId;
                            CountDownLatch l = synthLatch;
                            if (l != null) l.countDown();
                        }
                        @Override public void onError(String utteranceId) {
                            if (isDirectSpeak(utteranceId)) {
                                fireSpeakPhase(utteranceId, "error");
                                synchronized (speakCbLock) { speakCbId = null; }
                                return;
                            }
                            doneUtterance = null;
                            CountDownLatch l = synthLatch;
                            if (l != null) l.countDown();
                        }
                        /* متاح من API 23 — يُستدعى عند فشل الشبكة في الأصوات السحابية */
                        @Override public void onError(String utteranceId, int errorCode) {
                            onError(utteranceId);
                        }
                    });
                }
                CountDownLatch l = ttsInitLatch;
                if (l != null) l.countDown();
            });
        } catch (Exception e) {
            ttsFailed = true;
            CountDownLatch l = ttsInitLatch;
            if (l != null) l.countDown();
        }
    }

    private void ensureTts() {
        if (ttsInitLatch != null) {
            try { ttsInitLatch.await(6, TimeUnit.SECONDS); } catch (InterruptedException ignored) {}
        }
    }

    /** مطابقة صوت لموقع لغوي: يفضّل الأصوات المحلية (أوفلاين) ثم شبكية. */
    private Voice pickVoice(String localeHint) {
        if (tts == null || !ttsReady) return null;
        String lang = "", ctry = "";
        if (localeHint != null && !localeHint.isEmpty()) {
            String hint = localeHint.replace('_', '-');
            String[] parts = hint.split("-");
            lang = parts.length > 0 ? parts[0].toLowerCase(Locale.US) : "";
            ctry = parts.length > 1 ? parts[1].toLowerCase(Locale.US) : "";
        }
        Set<Voice> voices = tts.getVoices();
        if (voices == null || voices.isEmpty()) return null;
        Voice best = null;
        int bestScore = -1;
        for (Voice v : voices) {
            if (v == null) continue;
            Locale vl = v.getLocale();
            if (vl == null) continue;
            boolean langMatch = vl.getLanguage() != null && vl.getLanguage().equalsIgnoreCase(lang);
            if (lang.isEmpty()) continue;
            boolean ctryMatch = langMatch && !ctry.isEmpty()
                    && vl.getCountry() != null && vl.getCountry().equalsIgnoreCase(ctry);
            if (!langMatch) continue;
            boolean local = (v.getFeatures() != null && v.getFeatures().contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED))
                    ? false : true;
            int score = (ctryMatch ? 4 : 0) + (local ? 2 : 0) + (v.getQuality() >= Voice.QUALITY_HIGH ? 1 : 0);
            if (score > bestScore) { bestScore = score; best = v; }
        }
        return best;
    }

    private String synthesizeNative(String text, String localeHint, String ratePct) {
        if (text == null || text.trim().isEmpty()) return null;
        ensureTts();
        synchronized (ttsLock) {
            if (tts == null || !ttsReady) return null;
            Voice v = pickVoice(localeHint);
            String lang = "", ctry = "";
            if (localeHint != null && !localeHint.isEmpty()) {
                String[] parts = localeHint.replace('_', '-').split("-");
                lang = parts.length > 0 ? parts[0] : "";
                ctry = parts.length > 1 ? parts[1] : "";
            }
            int setRes;
            if (v != null) {
                tts.setVoice(v);
                setRes = TextToSpeech.SUCCESS;
            } else {
                Locale loc = ctry.isEmpty() ? new Locale(lang) : new Locale(lang, ctry);
                setRes = tts.setLanguage(loc);
            }
            if (setRes == TextToSpeech.LANG_MISSING_DATA || setRes == TextToSpeech.LANG_NOT_SUPPORTED) {
                if (v == null) return null;
            }
            float rate = 1.0f;
            try {
                if (ratePct != null && !ratePct.isEmpty()) {
                    String t = ratePct.trim().replace("%", "");
                    int pct = Integer.parseInt(t);
                    rate = Math.max(0.5f, Math.min(2.0f, 1.0f + pct / 100.0f));
                }
            } catch (NumberFormatException ignored) {}
            tts.setSpeechRate(rate);

            try {
                String key = sha1(text + "|" + lang + "-" + ctry + "|" + ratePct);
                File dir = new File(getFilesDir(), "tts");
                if (!dir.exists()) dir.mkdirs();
                trimTtsCache(dir, 90);
                File out = new File(dir, key + ".wav");
                if (out.exists() && out.length() > 44) return fileToB64(out);

                File tmp = new File(dir, key + ".tmp");
                doneUtterance = null;
                synthLatch = new CountDownLatch(1);
                BundleCompat params = new BundleCompat();
                params.putCharSequence(TextToSpeech.Engine.KEY_PARAM_UTTERANCE_ID, key);
                int r = tts.synthesizeToFile(text, params.bundle, tmp, key);
                if (r != TextToSpeech.SUCCESS) return null;
                boolean ok = synthLatch.await(45, TimeUnit.SECONDS);
                if (!ok || doneUtterance == null || !tmp.exists() || tmp.length() <= 44) {
                    tmp.delete();
                    return null;
                }
                if (!tmp.renameTo(out)) {
                    String b = fileToB64(tmp);
                    tmp.delete();
                    return b;
                }
                return fileToB64(out);
            } catch (Exception e) {
                android.util.Log.w("Flashki", "native synth failed", e);
                return null;
            }
        }
    }

    /** غلاف بسيط يتفادى اختلاف Bundle بين مستويات الـ API — يستخدم android.os.Bundle مباشرة. */
    private static class BundleCompat {
        final android.os.Bundle bundle = new android.os.Bundle();
        void putCharSequence(String k, CharSequence v) { bundle.putCharSequence(k, v); }
    }

    private static void trimTtsCache(File dir, int maxFiles) {
        File[] files = dir.listFiles((d, n) -> n.endsWith(".wav"));
        if (files == null || files.length <= maxFiles) return;
        Arrays.sort(files, Comparator.comparingLong(File::lastModified));
        for (int i = 0; i < files.length - maxFiles; i++) files[i].delete();
    }

    private static String fileToB64(File f) throws IOException {
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        try (FileInputStream fis = new FileInputStream(f)) {
            byte[] buf = new byte[8192];
            int n;
            while ((n = fis.read(buf)) > 0) bos.write(buf, 0, n);
        }
        return Base64.encodeToString(bos.toByteArray(), Base64.NO_WRAP);
    }

    private static String sha1(String s) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-1");
            byte[] d = md.digest(s.getBytes("UTF-8"));
            StringBuilder sb = new StringBuilder();
            for (byte b : d) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (Exception e) {
            return String.valueOf(s.hashCode());
        }
    }

    private boolean isDirectSpeak(String utteranceId) {
        if (utteranceId == null) return false;
        synchronized (speakCbLock) { return utteranceId.equals(speakCbId); }
    }

    /* ═══════════ الرجوع والحياة ═══════════ */

    @Override
    public void onBackPressed() {
        if (backEnabled && webView != null) {
            webView.evaluateJavascript("if(window.__fkBack)window.__fkBack();", null);
        } else {
            moveTaskToBack(true); /* لا نقتل التطبيق — يعود كما تركه */
        }
    }

    @Override
    protected void onPause() {
        /* وفر البطارية: إيقاف كل مؤقتات/رسم الويب فيو بالخلفية + قطع النطق */
        try { if (tts != null) tts.stop(); } catch (Exception ignored) {}
        if (webView != null) {
            webView.onPause();
            webView.pauseTimers();
        }
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) {
            webView.resumeTimers();
            webView.onResume();
        }
    }

    @Override
    protected void onDestroy() {
        if (tts != null) { try { tts.stop(); tts.shutdown(); } catch (Exception ignored) {} }
        if (webView != null) webView.destroy();
        super.onDestroy();
    }
}
