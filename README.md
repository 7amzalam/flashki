# Flashki — Smart Flashcard App (Tauri 2)

A **fully local** spaced repetition flashcard app: all your data is stored on your device, serverless, with AI card generation (Google Gemini only) via an in-app backend core.

## Technical Architecture

| Layer | Technology |
|---|---|
| Frontend | Pure HTML/CSS/JS (Original design) |
| Storage | Local IndexedDB on user device |
| Algorithm | SM-2 for spaced repetition (Anki style) |
| AI Backend | In-app Rust core connecting to Gemini only |
| Packaging | Tauri 2 (Windows · Linux · macOS · Android soon) |

```
flashki/
├── src/                 ← Frontend
│   ├── index.html
│   ├── css/             ← Styles + Local fonts (Tajawal)
│   ├── js/              ← Logic: db, srs, store, tts, audio, ai, render, handlers, app
│   └── assets/fonts/
├── src-tauri/           ← Tauri core (Rust)
│   ├── src/main.rs      ← Entry point
│   ├── src/lib.rs       ← gemini_generate command (Connecting to Gemini from backend)
│   ├── tauri.conf.json  ← Window and bundle settings
│   ├── capabilities/    ← Window permissions
│   └── icons/           ← App icons (all sizes)
└── package.json
```

---

## 1) Prerequisites Installation (One-time only)

### Windows
1. **Microsoft Edge WebView2** — Pre-installed in Windows 11 and updated Windows 10.
2. **Rust**: Download `rustup-init.exe` from https://rustup.rs and run it.
3. **Node.js 20+**: From https://nodejs.org (LTS version).
4. **Visual Studio Build Tools**: From https://visualstudio.microsoft.com/visual-cpp-build-tools/
   - During installation choose: **Desktop development with C++**.

### Linux (Ubuntu / Debian)
```bash
sudo apt update
sudo apt install -y build-essential curl wget file libx11-dev libasound2-dev \
  libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev

# Rust
curl --proto '=https' --tlsv1.2 -sSf [https://sh.rustup.rs](https://sh.rustup.rs) | sh
source "$HOME/.cargo/env"

# Node.js (if not installed)
curl -fsSL [https://deb.nodesource.com/setup_20.x](https://deb.nodesource.com/setup_20.x) | sudo -E bash -
sudo apt install -y nodejs
```

Verify everything is ready:
```bash
rustc --version && node --version && npm --version
```

---

## 2) First Run (Development Mode)

From inside the project folder:

```bash
npm install        # Installs Tauri CLI tools (first time only)
npm run dev        # Builds the core and opens the app window
```

> First run takes several minutes (Rust compilation), subsequent runs are fast.
> Upon success, the **Flashki** window will open with initial data ready for testing.

### Testing the Frontend in Browser Only (Without Rust — For Quick Testing)
```bash
npm run web
# Then open http://localhost:5173
```
In browser mode, everything works except that Gemini connection happens directly from the browser instead of the core (useful for testing the interface).

---

## 3) Enabling AI (Gemini)

1. Open https://aistudio.google.com/apikey and sign in with a Google account.
2. Click **Create API key** and copy the key (starts with `AIza...`).
3. In the app: **Settings ← AI Integration ← Gemini API Key** and paste the key then **Save**.
   - The key is saved **locally on your device only** and is not exported with backups.
4. Try: **Add Cards ← With AI** → Paste any study text → Choose number of cards → **Generate Cards** → Review generated cards → Save selected to your section.

The model can be changed from the settings file, default is `gemini-2.5-flash`.

---

## 4) Building the Distribution Version (Installers)

```bash
npm run build
```

Outputs:
- **Windows**: `src-tauri/target/release/bundle/msi/*.msi` and `bundle/nsis/*-setup.exe`
- **Linux**: `bundle/deb/*.deb` and `bundle/appimage/*.AppImage`

These files are what you distribute to users — no server needed, every user installs the app and runs it locally on their device.

### Changing the App Icon in the Future
Place a square 1024x1024 PNG image then:
```bash
npm run icon
```

---

## 5) Android Step (Later when desktop version is ready)

```bash
rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
# Requires installing Android Studio + Android SDK then:
npm run tauri android init
npm run tauri android dev
npm run tauri android build   # Produces .apk / .aab for the store
```

---

## Currently Implemented (First Round)

- All original design screens are connected to real logic: Home, Sections, Browse, Highlight Search, Real Statistics (Bar chart + Heatmap + Learning streaks), Add, Settings.
- **Data**: Local IndexedDB — sections, cards, review logs, and settings + initial data (4 sections, 20 cards) for first run.
- **Review Session**: Building a queue of due + new cards (with daily limit), sorting (shuffle/sequential/hardest first), direction (normal/reverse), 4-tier rating updating SM-2 scheduling immediately, keyboard shortcuts (Space to flip, 1-4 to rate, Esc to exit), session end screen with real statistics.
- **AI**: Text → Cards via Gemini (from Rust core) with two-sided option and contextual examples — **PDF feature has been removed as requested**.
- **Audio**: Real microphone recording for both sides and playback during review, and automatic or manual TTS pronunciation (Arabic/English).
- **Data**: Full JSON backup export/import (with audio recordings), and a master reset button.

## Common Issues and Solutions

| Issue | Solution |
|---|---|
| `error: Microsoft Visual C++ 14.0 or greater is required` (Windows) | Install Visual Studio Build Tools with "Desktop development with C++" workload |
| `failed to run custom build command` or missing `webkit2gtk` (Linux) | Install libwebkit2gtk-4.1-dev and libgtk-3-dev packages from the section above |
| `cargo: command not found` | Reopen terminal after installing rustup or run `source "$HOME/.cargo/env"` |
| Font appears different on first run without internet | Fonts are loaded locally inside the project — make sure `src/assets/fonts` folder exists |
| Gemini connection failed | Check the key in settings, internet connection, and quota usage in Google AI Studio |
| Microphone not working (Windows) | Check microphone permission for Flashki app in privacy settings |
