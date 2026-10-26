/* Flashki — Tauri core.
   محلي 100%: البيانات على جهاز المستخدم (SQLite عبر tauri-plugin-sql).
   الاتصال الخارجي الوحيد: Gemini (توليد البطاقات) + Edge TTS (النطق).
   التحديثات: tauri-plugin-updater (فحص من الإعدادات). */

use base64::Engine;
use serde_json::json;
use tauri::Manager;

mod gemini;
mod edge_tts;

#[tauri::command]
async fn gemini_generate(
    api_key: String,
    model: String,
    prompt: String,
    json_mode: Option<bool>,
    schema: Option<serde_json::Value>,
    use_thinking: Option<bool>,
) -> Result<serde_json::Value, String> {
    let model = model.trim().to_string();
    if model.is_empty() || !model.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '.') {
        return Err("invalid model name".into());
    }
    if api_key.trim().is_empty() {
        return Err("missing API key".into());
    }
    if prompt.trim().is_empty() {
        return Err("empty prompt".into());
    }
    let (text, usage) = gemini::generate(
        &api_key,
        &model,
        &prompt,
        json_mode.unwrap_or(true),
        schema,
        use_thinking.unwrap_or(true),
    )
    .await?;
    Ok(json!({ "text": text, "usage": usage }))
}

/* النطق: Edge TTS عبر WebSocket — يعيد MP3 بترميز base64 (يُخزَّن ويُشغَّل محلياً) */
#[tauri::command]
async fn edge_tts_synthesize(
    text: String,
    voice: String,
    rate: Option<String>,
) -> Result<String, String> {
    if text.trim().is_empty() {
        return Err("empty text".into());
    }
    if !voice.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        return Err("invalid voice".into());
    }
    let rate = rate.unwrap_or_else(|| "+0%".to_string());
    edge_tts::synthesize(&text, &voice, &rate).await
}

/* ───── صور البطاقات: {app_data}/images/{card_id}.{png|jpg|webp} ───── */

const IMAGE_MAGIC_OK: fn(&[u8]) -> Option<&'static str> = |b| {
    if b.starts_with(&[0x89, b'P', b'N', b'G']) {
        Some("png")
    } else if b.starts_with(&[0xFF, 0xD8, 0xFF]) {
        Some("jpg")
    } else if b.len() > 12 && &b[0..4] == b"RIFF" && &b[8..12] == b"WEBP" {
        Some("webp")
    } else {
        None
    }
};

fn valid_id(s: &str) -> bool {
    !s.is_empty() && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

#[tauri::command]
fn save_card_image(
    app: tauri::AppHandle,
    card_id: String,
    data_base64: String,
) -> Result<String, String> {
    if !valid_id(&card_id) {
        return Err("invalid card id".into());
    }
    /* JS يرسل إما base64 خالص أو data URL — نقبل الاثنين */
    let payload = data_base64.split(',').last().unwrap_or("").trim();
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(payload)
        .map_err(|e| format!("bad base64: {}", e))?;
    if bytes.len() < 12 {
        return Err("image too small".into());
    }
    if bytes.len() > 8 * 1024 * 1024 {
        return Err("image too large (max 8MB)".into());
    }
    let ext = IMAGE_MAGIC_OK(&bytes).ok_or("unsupported image (png/jpg/webp only)")?;
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("images");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let file = dir.join(format!("{}.{}", card_id, ext));
    std::fs::write(&file, &bytes).map_err(|e| e.to_string())?;
    Ok(format!("images/{}.{}", card_id, ext))
}

#[tauri::command]
fn load_card_image(app: tauri::AppHandle, path: String) -> Result<String, String> {
    /* مسار آمن فقط: images/<اسم ملف بسيط> — لا .. ولا مسارات مطلقة */
    let ok = path.starts_with("images/")
        && !path.contains("..")
        && path[8..]
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_');
    if !ok {
        return Err("invalid image path".into());
    }
    let full = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join(&path);
    let bytes = std::fs::read(&full).map_err(|e| e.to_string())?;
    let mime = match full.extension().and_then(|e| e.to_str()).unwrap_or("") {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        _ => return Err("unsupported extension".into()),
    };
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:{};base64,{}", mime, b64))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:flashki.db", vec![])
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            gemini_generate,
            edge_tts_synthesize,
            save_card_image,
            load_card_image
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
