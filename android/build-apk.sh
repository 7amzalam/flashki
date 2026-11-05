#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# build-apk.sh — بناء حزمة أندرويد لـ Flashki بلا Gradle
# المتطلبات: JDK 11+ (javac)، Android build-tools 34 (aapt2/d8/apksigner)،
#            platform android-34 (android.jar)، zip، unzip، python3 (اختياري للإصدار)
# الاستخدام: ./build-apk.sh [release|debug]
# المتغيرات (اختيارية):
#   BT_DIR     مجلد build-tools (يحتوي aapt2, d8, apksigner)
#   AJAR       مسار android.jar
#   JAVA_HOME  مجلد JDK
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

PROJ="$(cd "$(dirname "$0")/.." && pwd)"          # جذر المشروع
ANDROID_DIR="$PROJ/android"
BUILD="$ANDROID_DIR/build"
DIST="$ANDROID_DIR/dist"
MODE="${1:-release}"

# ── اكتشاف الأدوات ──────────────────────────────────────────────────
for cand in "$ANDROID_DIR/sdk" "$HOME/Android/Sdk" "${ANDROID_HOME:-}" "${ANDROID_SDK_ROOT:-}"; do
  [ -n "$cand" ] && [ -d "$cand/build-tools/35.0.0" ] && BT_DIR="${BT_DIR:-$cand/build-tools/35.0.0}"
  [ -n "$cand" ] && [ -f "$cand/platforms/android-34/android.jar" ] && AJAR="${AJAR:-$cand/platforms/android-34/android.jar}"
done
BT_DIR="${BT_DIR:?لم يُعثر على build-tools 34 — مرر BT_DIR=/path/build-tools/35.0.0}"
AJAR="${AJAR:?لم يُعثر على android.jar — مرر AJAR=/path/platforms/android-34/android.jar}"
JAVA_HOME="${JAVA_HOME:-$JAVA_HOME}"
JAVAC="${JAVA_HOME:+$JAVA_HOME/bin/javac}"; JAVAC="${JAVAC:-javac}"
JAVA="${JAVA_HOME:+$JAVA_HOME/bin/java}";   JAVA="${JAVA:-java}"

AAPT2="$BT_DIR/aapt2"; D8="$BT_DIR/d8"; APKSIGNER="$BT_DIR/apksigner"; ZIPALIGN="$BT_DIR/zipalign"

# ── الإصدار من package.json ────────────────────────────────────────
VN=$(python3 -c "import json;print(json.load(open('$PROJ/package.json'))['version'])")
VC=$(python3 -c "v='$VN'.split('.');print(int(v[0])*100+int(v[1])*10+int(v[2]))")
echo "► Flashki android v$VN (code $VC) — $MODE"

# ── مزامنة أصول الويب (src → assets/web) ───────────────────────────
rm -rf "$BUILD"
ASSETS="$BUILD/assets/web"
mkdir -p "$ASSETS" "$BUILD/java" "$BUILD/classes" "$DIST"
cp -r "$PROJ/src/." "$ASSETS/"
mkdir -p "$BUILD/java/com/flashki/app"
for jf in MainActivity.java ReviewAlarmReceiver.java BootReceiver.java; do
  sed -e "s/__VERSION_NAME__/$VN/g" "$ANDROID_DIR/app/src/main/java/com/flashki/app/$jf" \
      > "$BUILD/java/com/flashki/app/$jf"
done

# ── 1) الموارد ─────────────────────────────────────────────────────
echo "► aapt2 compile+link"
"$AAPT2" compile --dir "$ANDROID_DIR/app/src/main/res" -o "$BUILD/res.zip"
"$AAPT2" link -o "$BUILD/base.apk" -I "$AJAR" \
  --java "$BUILD/gen" \
  --manifest "$ANDROID_DIR/app/src/main/AndroidManifest.xml" \
  --min-sdk-version 29 --target-sdk-version 34 \
  --version-code "$VC" --version-name "$VN" \
  -A "$BUILD/assets" "$BUILD/res.zip"

# ── 2) تجميع الجافا ────────────────────────────────────────────────
echo "► javac"
"$JAVAC" -source 8 -target 8 -encoding UTF-8 \
  -classpath "$AJAR" -d "$BUILD/classes" \
  "$BUILD/java/com/flashki/app/MainActivity.java" \
  "$BUILD/java/com/flashki/app/ReviewAlarmReceiver.java" \
  "$BUILD/java/com/flashki/app/BootReceiver.java" \
  "$BUILD/gen/com/flashki/app/R.java" 2> >(grep -v "^warning:" >&2 || true)

# ── 3) dex ─────────────────────────────────────────────────────────
echo "► d8"
"$JAVA_HOME/bin/jar" cf "$BUILD/classes.jar" -C "$BUILD/classes" .
"$JAVA" -cp "$BT_DIR/lib/d8.jar" com.android.tools.r8.D8 \
  --release --lib "$AJAR" --min-api 29 \
  --output "$BUILD" "$BUILD/classes.jar"
[ -f "$BUILD/classes.dex" ] || { echo "✗ classes.dex missing"; exit 1; }

# ── 4) حزم dex داخل APK ────────────────────────────────────────────
echo "► pack"
(cd "$BUILD" && zip -q -j base.apk classes.dex)

# ── 5) محاذاة + توقيع ──────────────────────────────────────────────
KS="$ANDROID_DIR/keystore/flashki-release.jks"
KS_ALIAS="flashki"
if [ ! -f "$KS" ]; then
  echo "✗ لا يوجد keystore — أنشئه أولاً (راجع android/keystore/README.md)"; exit 1
fi
source "$ANDROID_DIR/keystore/KEYS.env" 2>/dev/null || true
KSPASS="${KSPASS:?KSPASS غير معرف — اكتبه في android/keystore/KEYS.env}"

"$ZIPALIGN" -f 4 "$BUILD/base.apk" "$BUILD/aligned.apk"

if [ "$MODE" = "debug" ]; then
  OUT="$DIST/flashki-android-v$VN-debug.apk"
  "$APKSIGNER" sign --ks "$KS" --ks-key-alias "$KS_ALIAS" --ks-pass "pass:$KSPASS" \
    --out "$OUT" "$BUILD/aligned.apk"
else
  OUT="$DIST/flashki-android-v$VN.apk"
  "$APKSIGNER" sign --ks "$KS" --ks-key-alias "$KS_ALIAS" --ks-pass "pass:$KSPASS" \
    --out "$OUT" "$BUILD/aligned.apk"
fi

"$APKSIGNER" verify --print-certs "$OUT" | head -4
echo "✔ $OUT ($(du -h "$OUT" | cut -f1))"
