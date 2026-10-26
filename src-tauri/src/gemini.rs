/* Flashki — Gemini call (the only AI endpoint; the key stays local).
   v2: thinkingConfig(budget=0) حتى لا يستهلك النموذج الرصيد في "التفكير"،
   maxOutputTokens صريح، استخراج نص الرد + تسجيل usageMetadata في اللوج. */

use serde_json::json;

const GEMINI_BASE: &str = "https://generativelanguage.googleapis.com/v1beta/models";

/* json_mode: responseMimeType=application/json (+ responseSchema اختياري).
   يعيد (نص_الرد, usageMetadata) — lib.rs يغلّفهما كائن JSON للواجهة. */
pub async fn generate(
    api_key: &str,
    model: &str,
    prompt: &str,
    json_mode: bool,
    schema: Option<serde_json::Value>,
    use_thinking: bool,
) -> Result<(String, serde_json::Value), String> {
    let url = format!("{}/{}:generateContent", GEMINI_BASE, model);
    let mut gc = json!({
        "temperature": 0.4,
        "maxOutputTokens": 4096
    });
    /* thinkingBudget=0 يوقف "التفكير" على 2.5+ — بدونه يلتهم النموذج الرموز في
       thoughtsTokenCount ويعيد نصاً فارغاً (finishReason=MAX_TOKENS) */
    if use_thinking {
        gc["thinkingConfig"] = json!({ "thinkingBudget": 0 });
    }
    if json_mode {
        gc["responseMimeType"] = json!("application/json");
        if let Some(s) = schema {
            gc["responseSchema"] = s;
        }
    }
    let body = json!({
        "contents": [{ "parts": [{ "text": prompt }] }],
        "generationConfig": gc
    });

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(90))
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .post(&url)
        .query(&[("key", api_key.trim())])
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("network error: {}", e))?;

    let status = resp.status();
    let text = resp.text().await.map_err(|e| e.to_string())?;

    let data: serde_json::Value = serde_json::from_str(&text)
        .unwrap_or_else(|_| json!({ "raw": text }));

    if !status.is_success() {
        let msg = data["error"]["message"].as_str().unwrap_or(text.trim());
        return Err(format!("Gemini API {} : {}", status, msg));
    }

    let usage = data.get("usageMetadata").cloned().unwrap_or_else(|| json!({}));
    eprintln!("[flashki] gemini {} usage: {}", model, usage);

    let out = data["candidates"][0]["content"]["parts"]
        .as_array()
        .map(|parts| {
            parts
                .iter()
                .filter_map(|p| p["text"].as_str())
                .collect::<Vec<&str>>()
                .join("")
        })
        .unwrap_or_default();

    if out.trim().is_empty() {
        let finish = data["candidates"][0]["finishReason"].as_str().unwrap_or("?");
        return Err(format!(
            "empty response (finishReason={}, usage={})",
            finish, usage
        ));
    }
    Ok((out, usage))
}
