package com.flashki.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

/**
 * Flashki — إعادة جدولة منبهات المراجعة بعد إعادة تشغيل الجهاز
 * (المنبهات لا تنجو من الإقلاع). يقرأ الحالة المحفوظة ويبرمج:
 *  - منبه الاستحقاق القادم إن كان في المستقبل وضمن 7 أيام.
 *  - الفحص اليومي المسائي.
 */
public class BootReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        try {
            String action = intent == null ? null : intent.getAction();
            if (action == null || !Intent.ACTION_BOOT_COMPLETED.equals(action)) return;

            SharedPreferences prefs = context.getSharedPreferences("flashki_reminders", Context.MODE_PRIVATE);
            if (prefs.getBoolean("notifEnabled", true)) {
                long nextDue = prefs.getLong("nextDueTs", 0);
                long now = System.currentTimeMillis();
                if (nextDue > now && nextDue - now < 7L * 24 * 60 * 60 * 1000) {
                    int due = prefs.getInt("dueCount", 0);
                    MainActivity.scheduleDueAlarmCtx(context, nextDue,
                            "حان وقت المراجعة ⏰",
                            due > 0 ? "لديك " + due + " بطاقة بانتظار المراجعة"
                                    : "لديك بطاقات بانتظار المراجعة");
                }
            }
            MainActivity.scheduleDailyCheck(context);
        } catch (Exception e) {
            android.util.Log.w("Flashki", "boot receiver failed", e);
        }
    }
}
