-- ============================================================
-- Flashki — SQLite Schema (FINAL v2.0)
-- كل الحقول الجديدة مدمجة: cards.lang, cards.cefr, cards.example*,
-- ai_generations.prompt_used, user_profile في settings
-- الملف يُنفَّذ عند الإقلاع في البيئتين:
--   Tauri  : tauri-plugin-sql → flashki.db (WAL)
--   Browser: sql.js WASM (نفس الاستعلامات حرفياً)
-- ============================================================

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ---------- سجل التوليدات (قبل cards بسبب المفتاح الأجنبي) ----------
CREATE TABLE IF NOT EXISTS ai_generations (
  id             TEXT PRIMARY KEY,
  deck_id        TEXT,
  source_type    TEXT NOT NULL DEFAULT 'text' CHECK (source_type IN ('text','image')),
  source_preview TEXT DEFAULT '',
  cards_count    INTEGER NOT NULL DEFAULT 0 CHECK (cards_count >= 0),
  prompt_used    TEXT DEFAULT '',
  created_at     INTEGER NOT NULL
);

-- ---------- الأقسام ----------
CREATE TABLE IF NOT EXISTS decks (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT DEFAULT '',
  icon        TEXT DEFAULT '📚',
  color       TEXT DEFAULT '#8b5cf6',
  position    INTEGER DEFAULT 0 CHECK (position >= 0),
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  deleted_at  INTEGER
);

-- ---------- البطاقات ----------
CREATE TABLE IF NOT EXISTS cards (
  id                  TEXT PRIMARY KEY,
  deck_id             TEXT NOT NULL REFERENCES decks(id),
  front               TEXT NOT NULL,
  back                TEXT NOT NULL,
  hint                TEXT DEFAULT '',
  tags                TEXT DEFAULT '[]',
  audio_front         TEXT,
  audio_back          TEXT,
  image_path          TEXT,
  generated_from      TEXT REFERENCES ai_generations(id) ON DELETE SET NULL,
  lang                TEXT,                                     -- لغة البطاقة (اختياري — NULL = كشف تلقائي)
  cefr                TEXT CHECK (cefr IS NULL OR cefr IN ('A1','A2','B1','B2','C1','C2')),
  example             TEXT DEFAULT '',                          -- جملة مثال بلغة الهدف
  example_translation TEXT DEFAULT '',                          -- ترجمة المثال للغة الأم
  ease_factor         REAL NOT NULL DEFAULT 2.5 CHECK (ease_factor BETWEEN 1.3 AND 3.0),
  interval_days       INTEGER NOT NULL DEFAULT 0 CHECK (interval_days >= 0),
  repetitions         INTEGER NOT NULL DEFAULT 0 CHECK (repetitions >= 0),
  lapses              INTEGER NOT NULL DEFAULT 0 CHECK (lapses >= 0),
  status              TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','learning','review','suspended')),
  due_date            INTEGER NOT NULL,
  suspended_until     INTEGER,
  last_review_at      INTEGER,
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL,
  deleted_at          INTEGER
);

-- ---------- المراجعات ----------
CREATE TABLE IF NOT EXISTS reviews (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id              TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  deck_id              TEXT NOT NULL,
  rating               INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 4),   -- 1=again 2=hard 3=good 4=easy
  reviewed_at          INTEGER NOT NULL,
  reviewed_local_date  TEXT NOT NULL,
  duration_ms          INTEGER NOT NULL DEFAULT 0 CHECK (duration_ms >= 0),
  session_id           TEXT
);

-- ---------- الجلسات ----------
CREATE TABLE IF NOT EXISTS sessions (
  id             TEXT PRIMARY KEY,
  deck_id        TEXT,
  mode           TEXT NOT NULL DEFAULT 'normal' CHECK (mode IN ('normal','cram')),
  started_at     INTEGER NOT NULL,
  ended_at       INTEGER,
  reviewed_count INTEGER NOT NULL DEFAULT 0 CHECK (reviewed_count >= 0),
  correct_count  INTEGER NOT NULL DEFAULT 0 CHECK (correct_count <= reviewed_count)
);

-- ---------- الإعدادات (key/value — تشمل user_profile JSON وtts_voice_*) ----------
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- ---------- البيانات الوصفية (schema_version إلخ) ----------
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);

-- ---------- الفهارس (جزئية — تستبعد المحذوف ناعماً) ----------
CREATE INDEX IF NOT EXISTS idx_cards_due      ON cards(due_date, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cards_deck     ON cards(deck_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cards_cefr     ON cards(cefr) WHERE deleted_at IS NULL AND cefr IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cards_generated ON cards(generated_from) WHERE generated_from IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reviews_card   ON reviews(card_id);
CREATE INDEX IF NOT EXISTS idx_reviews_date   ON reviews(reviewed_local_date, deck_id);
CREATE INDEX IF NOT EXISTS idx_reviews_deck   ON reviews(deck_id, reviewed_at);
CREATE INDEX IF NOT EXISTS idx_decks_deleted  ON decks(deleted_at) WHERE deleted_at IS NOT NULL;

-- استعلام الإحصائيات الرسمي (مرجعي):
-- SELECT reviewed_local_date AS d, COUNT(*) AS total,
--        SUM(CASE WHEN rating >= 2 THEN 1 ELSE 0 END) AS correct
-- FROM reviews GROUP BY d ORDER BY d DESC LIMIT 30;
