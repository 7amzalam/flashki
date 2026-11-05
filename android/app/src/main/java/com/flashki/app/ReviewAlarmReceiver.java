package com.flashki.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

/**
 * Flashki — مستقبل منبهات المراجعة.
 *
 * نوعا المنبه:
 *  - ALARM_DUE:  منبه مبرمج من الواجهة عند أقرب وقت استحقاق بطاقات — النص يأتي جاهزاً
 *                في الـ extras (يحسبه JS من بيانات SM-2 وقت الجدولة).
 *  - ALARM_DAILY: فحص مسائي (20:00) يقرأ الحالة المحفوظة في prefs ويقرر:
 *                بطاقات مستحقة → «نسيت اليوم؟»، غياب طويل → «لم تدخل منذ فترة»،
 *                وإلا يصمت. ثم يعيد جدولة نفسه لليلة الغد.
 *
 * كل النصوص تُقرأ من prefs (أرسلها JS بلغة الواجهة عبر saveReminderTexts) —
 * المنبه قد يطلق والتطبيق مغلق فلا يمكن قراءة i18n وقتها؛ العربية هي
 * الاحتياط الأخير إذا لم تصل ترجمة بعد (تثبيت أول قبل فتح الواجهة).
 * كلاهما يصمت إذا عطّل المستخدم الإشعارات من إعدادات التطبيق.
 */
public class ReviewAlarmReceiver extends BroadcastReceiver {

    private static String txt(SharedPreferences p, String key, String arFallback) {
        String v = p.getString(key, null);
        return (v == null || v.isEmpty()) ? arFallback : v;
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        try {
            SharedPreferences prefs = context.getSharedPreferences("flashki_reminders", Context.MODE_PRIVATE);
            if (!prefs.getBoolean("notifEnabled", true)) return;

            int alarmId = intent.getIntExtra("alarmId", MainActivity.ALARM_DUE);
            if (alarmId == MainActivity.ALARM_DUE) {
                String title = intent.getStringExtra("title");
                String text = intent.getStringExtra("text");
                if (title == null || title.isEmpty())
                    title = txt(prefs, "txt_due_title", "حان وقت المراجعة ⏰");
                if (text == null || text.isEmpty())
                    text = txt(prefs, "txt_due_text", "لديك بطاقات بانتظار المراجعة");
                MainActivity.postNotification(context, title, text);
                return;
            }

            /* ── الفحص اليومي المسائي ── */
            long now = System.currentTimeMillis();
            long lastOpen = prefs.getLong("lastOpenTs", 0);
            int dueCount = prefs.getInt("dueCount", 0);

            if (lastOpen > 0 && now - lastOpen >= 36L * 60 * 60 * 1000) {
                MainActivity.postNotification(context,
                        txt(prefs, "txt_away_title", "لم تدخل منذ فترة 🌙"),
                        txt(prefs, "txt_away_text", "بطاقاتك تنتظرك — عودة سريعة تكفي لإبقاء تقدمك آمناً"));
            } else if (dueCount > 0) {
                String ft = txt(prefs, "txt_forgot_text",
                        "لديك " + dueCount + " بطاقة تحتاج إلى المراجعة — دقيقتان تكفيان");
                ft = ft.replace("{n}", String.valueOf(dueCount)); /* قالب {n} من JS */
                MainActivity.postNotification(context,
                        txt(prefs, "txt_forgot_title", "نسيت اليوم؟ 🔥"), ft);
            }
            /* لا إشعار إذا راجع المستخدم اليوم ولم يبق مستحق — صمت ذكي */

            MainActivity.scheduleDailyCheck(context); /* لليلة الغد */
        } catch (Exception e) {
            android.util.Log.w("Flashki", "alarm receiver failed", e);
        }
    }
}
