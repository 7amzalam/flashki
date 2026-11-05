/* أداة اختبار تطويرية فقط — تُحمَّل من index.html عندما يحمل الرابط ?android=1
   تحاكي جسر FlashkiAndroid كي تُختبر مسارات أندرويد في متصفح سطح المكتب.
   لا تُحمل أبداً في الإنتاج (شرط الرابط) ولا تؤثر على APK. */
window.FlashkiAndroid = {
  _calls: [],
  _log: function () { this._calls.push(Array.prototype.slice.call(arguments)); },
  ttsSynthesize: function (t, v, r, id) {
    this._log('ttsSynthesize', String(t).slice(0, 24), v, r);
    var self = this;
    /* نجاح بنسبة 70% كي تُختبر الشللة والسقوط للنطق المباشر */
    setTimeout(function () {
      window.__fkNativeTtsDone && window.__fkNativeTtsDone(id, Math.random() < 0.7 ? 'UklGRg==' : '');
      if (Math.random() >= 0.7) self._log('ttsSynthesize→null (فشل مقصود للاختبار)');
    }, 90);
  },
  ttsSpeakDirect: function (t, v, r, id) {
    this._log('ttsSpeakDirect', String(t).slice(0, 24), v, r);
    setTimeout(function () {
      window.__fkNativeSpeakDone && window.__fkNativeSpeakDone(id, 'start');
      setTimeout(function () { window.__fkNativeSpeakDone && window.__fkNativeSpeakDone(id, 'end'); }, 400);
    }, 70);
  },
  ttsStop: function () { this._log('ttsStop'); },
  ttsInfo: function () { return JSON.stringify({ ready: true, voices: 14, langs: ['ar', 'en', 'de', 'fr', 'es', 'tr'] }); },
  ensureMicPermission: function (id) { this._log('ensureMicPermission'); setTimeout(function () { window.__fkPermDone && window.__fkPermDone(id, true); }, 60); },
  ensureNotifPermission: function (id) { this._log('ensureNotifPermission'); setTimeout(function () { window.__fkPermDone && window.__fkPermDone(id, true); }, 60); },
  updateReminderState: function (d, n, l) { this._log('updateReminderState', d, n, l); },
  saveReminderTexts: function (json) { this._log('saveReminderTexts', json); },
  scheduleDueAlarm: function (ts, t, x) { this._log('scheduleDueAlarm', ts, t, x); },
  cancelDueAlarm: function () { this._log('cancelDueAlarm'); },
  setNotificationsEnabled: function (b) { this._log('setNotificationsEnabled', b); },
  notificationsState: function () { return '{"enabled":true,"granted":true}'; },
  setBackEnabled: function (b) { this._log('setBackEnabled', b); },
  setKeepScreenOn: function (b) { this._log('setKeepScreenOn', b); },
  getAppInfo: function () { return '{"platform":"android","version":"1.6.0-test"}'; },
  httpPost: function (u, b, id) { this._log('httpPost', u.slice(0, 40)); setTimeout(function () { window.__fkHttpDone && window.__fkHttpDone(id, 401, '{"error":"stub"}'); }, 100); },
  saveExportFile: function (n) { this._log('saveExportFile', n); return 'Download/Flashki/' + n; }
};
console.log('[dev] FlashkiAndroid stub active');
