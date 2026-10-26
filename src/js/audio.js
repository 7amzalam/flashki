/* Flashki — audio.js : real microphone recording via MediaRecorder */
(function () {
  'use strict';
  var App = window.App = window.App || {};
  var U = App.util;

  var REC_MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus', ''];

  function pickMime() {
    if (typeof MediaRecorder === 'undefined') return '';
    for (var i = 0; i < REC_MIME_CANDIDATES.length; i++) {
      var m = REC_MIME_CANDIDATES[i];
      if (!m) return '';
      try { if (MediaRecorder.isTypeSupported(m)) return m; } catch (e) {}
    }
    return '';
  }

  function supported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && typeof MediaRecorder !== 'undefined');
  }

  /* container = .voice-recorder element */
  function toggle(container) {
    if (container._recState === 'recording') { stop(container); return; }
    if (container._blob) { play(container); return; }
    if (container._recState === 'starting') return;
    if (!supported()) { U.toast(App.t('recDenied'), 'error'); return; }

    container._recState = 'starting';
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      var opts = {};
      var mime = pickMime();
      if (mime) opts.mimeType = mime;
      var rec;
      try { rec = new MediaRecorder(stream, opts); }
      catch (e) { rec = new MediaRecorder(stream); }
      var chunks = [];
      rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
      rec.onstop = function () {
        stream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) {} });
        var type = rec.mimeType || mime || 'audio/webm';
        var blob = new Blob(chunks, { type: type });
        container._blob = blob;
        container._recState = 'idle';
        if (blob.size < 800) { U.toast(App.t('recTooShort'), 'error'); container._blob = null; paintIdle(container); return; }
        container.classList.remove('recording');
        container.classList.add('has-audio');
        var timeEl = container.querySelector('.rec-time');
        if (timeEl) timeEl.textContent = fmtSecs(container._seconds || 0);
        U.toast(App.t('recSaved'), 'success');
      };
      container._recorder = rec;
      container._chunks = chunks;
      container._seconds = 0;
      container._recState = 'recording';
      container.classList.add('recording');
      container.classList.remove('has-audio');
      var timeEl = container.querySelector('.rec-time');
      if (timeEl) timeEl.textContent = '0:00';
      rec.start(250);
      if (container._interval) clearInterval(container._interval);
      container._interval = setInterval(function () {
        container._seconds++;
        if (timeEl) timeEl.textContent = fmtSecs(container._seconds);
      }, 1000);
    }).catch(function () {
      container._recState = 'idle';
      U.toast(App.t('recDenied'), 'error');
    });
  }

  function stop(container) {
    if (container._interval) { clearInterval(container._interval); container._interval = null; }
    try { if (container._recorder && container._recorder.state !== 'inactive') container._recorder.stop(); } catch (e) {}
  }

  function play(container) {
    if (!container._blob) return;
    try {
      if (container._audio) { try { container._audio.pause(); } catch (e) {} }
      var url = URL.createObjectURL(container._blob);
      var a = new Audio(url);
      container._audio = a;
      a.onended = function () { URL.revokeObjectURL(url); };
      a.play();
    } catch (e) { U.toast(App.t('recDenied'), 'error'); }
  }

  function clear(container) {
    stop(container);
    container._blob = null;
    container._seconds = 0;
    paintIdle(container);
  }

  function paintIdle(container) {
    container.classList.remove('recording', 'has-audio');
    var timeEl = container.querySelector('.rec-time');
    if (timeEl) timeEl.textContent = '0:00';
  }

  /* attach a saved blob into a recorder container (edit mode) */
  function attach(container, blob) {
    container._blob = blob || null;
    container._seconds = 0;
    if (blob) {
      container.classList.add('has-audio');
      var timeEl = container.querySelector('.rec-time');
      if (timeEl) timeEl.textContent = '—';
    } else paintIdle(container);
  }

  function fmtSecs(s) {
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  App.audio = { supported: supported, toggle: toggle, play: play, clear: clear, attach: attach };
})();
