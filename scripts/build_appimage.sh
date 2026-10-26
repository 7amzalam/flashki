#!/bin/bash
# Build the Flashki AppImage locally in "deb-style" (~5 MB instead of ~90 MB).
# Tools (linuxdeploy, AppRun) downloaded once into .build-env/xdg-cache/tauri.
# Usage: bash scripts/build_appimage.sh   (sandbox: FLASHKI_TOOLS_DIR override)
set -e
FK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ST="$FK_DIR/src-tauri"
VERSION=$(grep -m1 '"version"' "$ST/tauri.conf.json" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')
[ -n "$VERSION" ] || { echo "cannot read version from tauri.conf.json"; exit 1; }

TOOLS_DIR="${FLASHKI_TOOLS_DIR:-$FK_DIR/.build-env/xdg-cache/tauri}"
mkdir -p "$TOOLS_DIR"
REAL="$TOOLS_DIR/linuxdeploy-x86_64.AppImage"
APPRUN="$TOOLS_DIR/AppRun-x86_64"
PLUGIN="$TOOLS_DIR/linuxdeploy-plugin-appimage-x86_64.AppImage"

dl() { echo "== downloading $(basename "$2") =="; curl -sfL --retry 3 -o "$2" "$1" && chmod +x "$2"; }
[ -x "$REAL" ]    || dl https://github.com/linuxdeploy/linuxdeploy/releases/download/continuous/linuxdeploy-x86_64.AppImage "$REAL"
[ -x "$PLUGIN" ]  || dl https://github.com/linuxdeploy/linuxdeploy-plugin-appimage/releases/download/continuous/linuxdeploy-plugin-appimage-x86_64.AppImage "$PLUGIN"
[ -x "$APPRUN" ]  || dl https://github.com/AppImage/AppImageKit/releases/download/continuous/AppRun-x86_64 "$APPRUN"
ln -sf "$(basename "$PLUGIN")" "$TOOLS_DIR/linuxdeploy-plugin-appimage"

[ -x "$ST/target/release/flashki" ] || { echo "release binary missing — run: npm run tauri build -- --bundles deb"; exit 1; }

export PATH="$TOOLS_DIR:$PATH"
export APPIMAGE_EXTRACT_AND_RUN=1

AD="$ST/target/release/bundle/appimage/Flashki.AppDir"
rm -rf "$ST/target/release/bundle/appimage"
mkdir -p "$AD/usr/bin" "$AD/usr/share/applications" "$AD/usr/share/icons/hicolor/512x512/apps"

cp "$ST/target/release/flashki" "$AD/usr/bin/flashki"
chmod +x "$AD/usr/bin/flashki"

cat > "$AD/usr/share/applications/Flashki.desktop" <<'DEOF'
[Desktop Entry]
Type=Application
Name=Flashki
Exec=flashki
Icon=Flashki
Categories=Education;
Comment=Smart flashcards with spaced repetition
Terminal=false
DEOF

cp "$APPRUN" "$AD/AppRun" && chmod +x "$AD/AppRun"
cp "$ST/icons/icon.png" "$AD/Flashki.png"
ln -sf Flashki.png "$AD/.DirIcon"
cp "$ST/icons/icon.png" "$AD/usr/share/icons/hicolor/512x512/apps/Flashki.png"
ln -sf usr/share/applications/Flashki.desktop "$AD/Flashki.desktop"

echo "=== AppDir ready: $(du -sh "$AD" | cut -f1) ==="

# linuxdeploy — exclude ALL system libs → deb-style AppImage (runs from $ST: output goes to CWD)
cd "$ST"
"$REAL" --appimage-extract-and-run \
  --verbosity 2 \
  --appdir "$AD" \
  --desktop-file "$AD/usr/share/applications/Flashki.desktop" \
  --icon-file "$AD/Flashki.png" \
  --exclude-library 'lib*' \
  --output appimage 2>&1 | tail -12

OUT="$ST/target/release/bundle/appimage/Flashki_${VERSION}_amd64.AppImage"
CAND=$(ls -t "$ST"/Flashki*.AppImage "$ST/target/release/bundle/appimage"/Flashki*.AppImage 2>/dev/null | head -1)
if [ -n "$CAND" ] && [ -f "$CAND" ]; then mv "$CAND" "$OUT"; fi

echo "=== FINAL ==="
ls -lh "$OUT" && echo "APPIMAGE_BUILD_OK"
