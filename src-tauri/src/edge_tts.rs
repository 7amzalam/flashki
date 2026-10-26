/* Flashki — Microsoft Edge TTS over WebSocket.
   بروتوكول DRM v2 (CS64-SHA256) منقول من edge-tts 7.3.1 drm.py
   والتحقق: تطابق 9/9 مع بايثون على طوابع زمنية مختلفة + توليد MP3 حي ناجح.
   الخوارزمية بمقابلة JS في src/js/tts.js (نفس المصدر المُتحقق منه). */

use base64::Engine as _;
use futures_util::{SinkExt, StreamExt};
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::http::HeaderValue;
use tokio_tungstenite::tungstenite::Message;

const TRUSTED_CLIENT_TOKEN: &str = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const SEC_MS_GEC_VERSION: &str = "2-143.0.3650.75";
const UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0";
const ORIGIN: &str = "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold";
const WIN_EPOCH: u64 = 11_644_473_600;

/* ─── DRM v2: SHA-256 متغيّر الإقلاع (IV مخصص) + CS64 ─── */

const SHA256_INITIAL: [u32; 8] = [
    0x6A09E667, 0xBB67AE85, 0x3C6EF372, 0xA54FF53A, 0x510E527F, 0x9B05688C, 0x1F83D9AB, 0x5BE0CD19,
];
const SHA256_STATE: [u32; 8] = [
    0xFD9FBEA2, 0x91243CE7, 0xBE499094, 0xCD2E1E0A, 0x6C006F49, 0x04BD35AB, 0xFEB0A7E4, 0x03EFFBD2,
];
const SHA256_SCHEDULE: [u32; 14] = [
    0xEB24BF9E, 0x1558691F, 0xA0C09EE2, 0x0CFA32BA, 0xA622EE8C, 0xD1DD9491, 0xC0DD25A0,
    0xF9E70AB6, 0xF0C31573, 0x7058CE4E, 0x7188E606, 0x00E5AB33, 0xD258B060, 0x72766564,
];
const ROUND_CONSTANTS: [u32; 64] = [
    0x428A2F98, 0x71374491, 0xB5C0FBCF, 0xE9B5DBA5, 0x3956C25B, 0x59F111F1, 0x923F82A4, 0xAB1C5ED5,
    0xD807AA98, 0x12835B01, 0x243185BE, 0x550C7DC3, 0x72BE5D74, 0x80DEB1FE, 0x9BDC06A7, 0xC19BF174,
    0xE49B69C1, 0xEFBE4786, 0x0FC19DC6, 0x240CA1CC, 0x2DE92C6F, 0x4A7484AA, 0x5CB0A9DC, 0x76F988DA,
    0x983E5152, 0xA831C66D, 0xB00327C8, 0xBF597FC7, 0xC6E00BF3, 0xD5A79147, 0x06CA6351, 0x14292967,
    0x27B70A85, 0x2E1B2138, 0x4D2C6DFC, 0x53380D13, 0x650A7354, 0x766A0ABB, 0x81C2C92E, 0x92722C85,
    0xA2BFE8A1, 0xA81A664B, 0xC24B8B70, 0xC76C51A3, 0xD192E819, 0xD6990624, 0xF40E3585, 0x106AA070,
    0x19A4C116, 0x1E376C08, 0x2748774C, 0x34B0BCB5, 0x391C0CB3, 0x4ED8AA4A, 0x5B9CCA4F, 0x682E6FF3,
    0x748F82EE, 0x78A5636F, 0x84C87814, 0x8CC70208, 0x90BEFFFA, 0xA4506CEB, 0xBEF9A3F7, 0xC67178F2,
];
const SHA256_ADJUSTMENT: u32 = 0xC9DC06A7;
const SIGMA0_ADJUSTMENT: u32 = 0x059C0B80;
const SIGMA1_ADJUSTMENT: u32 = 0x000B92C0;
const CS64_COEFFICIENTS: [(u32, u32); 14] = [
    (0xE82E91B1, 0xB32700D0), (0x44DE24C6, 0x88DFF51D), (0x3BEB65BC, 0x29514038), (0xC89C5933, 0xB328CBDF),
    (0x8D1EC211, 0xD405B4D5), (0x314EF5D5, 0x26E55F3C), (0xE92491B1, 0x607801C6), (0xF0A5B9D5, 0x82B2C1FB),
    (0x06064CF3, 0xFA51A3DA), (0xDA79FA60, 0x207CC464), (0xBED20560, 0x3C3C74F3), (0x89F9C9F8, 0xD2D14B61),
    (0x35FA38C6, 0xBB04A2C1), (0xCB49E3C6, 0xC5626167),
];
const CS64_FACTOR: u32 = 0x82893933;
const CS64_ADJUSTMENT0: u32 = 0xF2F90B1A;
const CS64_ADJUSTMENT1: u32 = 0x0B1A0000;

fn block_constants() -> [u32; 64] {
    let mut k = ROUND_CONSTANTS;
    k[14] = SHA256_ADJUSTMENT;
    k
}

fn rol16(value: u32) -> u32 { value.rotate_left(16) }

/* σ0/σ1 — الصيغة المركبة المبهمة (مساوية لـ σ القياسية بعد التقصير) */
fn sigma0(value: u32) -> u32 {
    (value >> 7) ^ value.wrapping_shl(25) ^ (value >> 18) ^ value.wrapping_shl(14) ^ (value >> 3)
}
fn sigma1(value: u32) -> u32 {
    (value >> 17) ^ value.wrapping_shl(15) ^ (value >> 19) ^ value.wrapping_shl(13) ^ (value >> 10)
}

fn sha256_rounds(state: &[u32; 8], words: &[u32; 64], constants: &[u32; 64], first_round: usize) -> [u32; 8] {
    let (mut a, mut b, mut c, mut d, mut e, mut f, mut g, mut h) =
        (state[0], state[1], state[2], state[3], state[4], state[5], state[6], state[7]);
    for index in first_round..64 {
        let t1 = h
            .wrapping_add(e.rotate_right(6) ^ e.rotate_right(11) ^ e.rotate_right(25))
            .wrapping_add(g ^ (e & (f ^ g)))
            .wrapping_add(constants[index])
            .wrapping_add(words[index]);
        let t2 = (a.rotate_right(2) ^ a.rotate_right(13) ^ a.rotate_right(22))
            .wrapping_add((a & b) | (c & (a | b)));
        h = g; g = f; f = e;
        e = d.wrapping_add(t1);
        d = c; c = b; b = a;
        a = t1.wrapping_add(t2);
    }
    [a, b, c, d, e, f, g, h]
}

fn expand_schedule(words: &mut Vec<u32>, first_word: usize) {
    for index in first_word..64 {
        let (x, y) = (words[index - 2], words[index - 15]);
        let s1 = (x >> 17) ^ x.wrapping_shl(15) ^ (x >> 19) ^ x.wrapping_shl(13) ^ (x >> 10);
        let s0 = (y >> 7) ^ y.wrapping_shl(25) ^ (y >> 18) ^ y.wrapping_shl(14) ^ (y >> 3);
        words.push(s1.wrapping_add(words[index - 7]).wrapping_add(s0).wrapping_add(words[index - 16]));
    }
}

/* الحالة الابتدائية المخصصة من أول 7 بايتات */
fn sha256_init(data7: &[u8]) -> [u32; 8] {
    let mut words: Vec<u32> = vec![0; 14];
    words.push(((data7[0] as u32) << 16) | ((data7[1] as u32) << 8) | (data7[2] as u32));
    words.push(((data7[3] as u32) << 24) | ((data7[4] as u32) << 16) | ((data7[5] as u32) << 8) | (data7[6] as u32));
    for index in 16..30 {
        let mut value = SHA256_SCHEDULE[index - 16];
        if index - 2 >= 14 {
            value = value.wrapping_add(if index == 16 {
                sigma1(words[index - 2]) ^ SIGMA1_ADJUSTMENT
            } else {
                sigma1(words[index - 2])
            });
        }
        if index - 7 >= 14 {
            value = value.wrapping_add(words[index - 7]);
        }
        if index - 15 >= 14 {
            value = value.wrapping_add(if index == 29 {
                sigma0(words[index - 15]) ^ SIGMA0_ADJUSTMENT
            } else {
                sigma0(words[index - 15])
            });
        }
        words.push(value);
    }
    words.push(
        sigma1(words[28])
            .wrapping_add(words[23])
            .wrapping_add(sigma0(words[15]))
            .wrapping_add(words[14])
            .wrapping_add(SHA256_ADJUSTMENT)
            .wrapping_sub(ROUND_CONSTANTS[14]),
    );
    expand_schedule(&mut words, 31);
    let mut w = [0u32; 64];
    w.copy_from_slice(&words[..64]);
    let working = sha256_rounds(&SHA256_STATE, &w, &block_constants(), 14);
    let mut out = [0u32; 8];
    for i in 0..8 { out[i] = SHA256_INITIAL[i].wrapping_add(working[i]); }
    out
}

fn sha256_digest(data: &[u8]) -> [u8; 32] {
    assert!(data.len() >= 7, "token salt must contain at least seven bytes");
    let length = 57usize + data.len();
    let mut padded: Vec<u8> = data[7..].to_vec();
    padded.push(0x80);
    /* modulo بايثون دائماً موجب: (55 - length) % 64 */
    let zeros_py = ((55i64 - length as i64).rem_euclid(64)) as usize;
    for _ in 0..zeros_py { padded.push(0x00); }
    padded.extend_from_slice(&((length as u64) * 8).to_be_bytes());

    let mut state = sha256_init(&data[..7]);
    for block in padded.chunks(64) {
        let mut words = [0u32; 16];
        for (j, w) in words.iter_mut().enumerate() {
            *w = u32::from_be_bytes([block[j * 4], block[j * 4 + 1], block[j * 4 + 2], block[j * 4 + 3]]);
        }
        let mut full = words.to_vec();
        expand_schedule(&mut full, 16);
        let mut w64 = [0u32; 64];
        w64.copy_from_slice(&full[..64]);
        let working = sha256_rounds(&state, &w64, &ROUND_CONSTANTS, 0);
        for i in 0..8 { state[i] = state[i].wrapping_add(working[i]); }
    }
    let mut out = [0u8; 32];
    for i in 0..8 { out[i * 4..i * 4 + 4].copy_from_slice(&state[i].to_be_bytes()); }
    out
}

fn words_le4_even(data: &[u8]) -> Vec<u32> {
    let mut padded = data.to_vec();
    while padded.len() % 4 != 0 { padded.push(0x00); }
    let mut words: Vec<u32> = padded
        .chunks(4)
        .map(|c| u32::from_le_bytes([c[0], c[1], c[2], c[3]]))
        .collect();
    if words.len() % 2 != 0 { words.push(0); }
    words
}

fn cs64_digest(data: &[u8], digest: &[u8; 32]) -> (u32, u32) {
    let key_a = u32::from_le_bytes([digest[0], digest[1], digest[2], digest[3]]) | 1;
    let key_b = u32::from_le_bytes([digest[4], digest[5], digest[6], digest[7]]) | 1;
    let factor_a = key_a.wrapping_mul(CS64_FACTOR);
    let factor_b = key_b.wrapping_mul(CS64_FACTOR);

    let mut terms: Vec<u32> = CS64_COEFFICIENTS
        .iter()
        .enumerate()
        .map(|(i, (coef, _))| if i % 2 == 0 { factor_a.wrapping_mul(*coef) } else { factor_b.wrapping_mul(*coef) })
        .collect();
    let mut offsets: Vec<u32> = CS64_COEFFICIENTS.iter().map(|(_, off)| *off).collect();

    for (index, word) in words_le4_even(&[[0u8].as_slice(), data].concat()).into_iter().enumerate() {
        let mut term = word.wrapping_mul(if index % 2 == 0 { key_a } else { key_b });
        let mut offset = rol16(word).wrapping_mul(if index % 2 == 0 { 0xEF05_69FB } else { 0xC317_13DB });
        if index == 0 {
            term = term.wrapping_add(CS64_ADJUSTMENT0.wrapping_mul(factor_a));
            offset = offset.wrapping_add(CS64_ADJUSTMENT1);
        }
        terms.push(term);
        offsets.push(offset);
    }

    let mut swap_acc: u32 = 0;
    let mut swap_last: u32 = 0;
    let mut state: u32 = 0;
    let mut acc: u32 = 0;
    let mut index = 0;
    while index < terms.len() {
        let (x, y) = (terms[index], terms[index + 1]);
        let t = rol16(offsets[index].wrapping_add(x));
        let q = t.wrapping_mul(0x76F5_0F34);
        swap_acc = swap_acc.wrapping_add(rol16(q).wrapping_mul(0xC3EF_EA97).wrapping_add(q));
        let t = rol16(offsets[index + 1].wrapping_add(y));
        let q = t.wrapping_mul(0x1881_CE3C);
        swap_last = rol16(q).wrapping_mul(0x35BD_1EC9).wrapping_add(q);
        swap_acc = swap_acc.wrapping_add(swap_last);

        state = state.wrapping_mul(key_a).wrapping_add(x);
        state = rol16(state).wrapping_mul(0xCF98_B111);
        state = rol16(state).wrapping_mul(0x8708_5B9F);
        state = rol16(state).wrapping_mul(0x12CE_B96D);
        state = rol16(state).wrapping_mul(0x257E_1D83);
        acc = acc.wrapping_add(state);
        let t = state.wrapping_mul(key_b).wrapping_add(y);
        let t = rol16(t).wrapping_mul(0xA274_16F5);
        let t = rol16(t).wrapping_mul(0xD383_96FF);
        state = rol16(rol16(t).wrapping_mul(0x7C93_2B89)).wrapping_mul(0xBFA4_9F69);
        acc = acc.wrapping_add(state);
        index += 2;
    }
    (swap_last ^ state, swap_acc ^ acc)
}

/* التوكن v2: "CS64(16hex LE)-SHA256(64hex)" من ticks مقربة لـ5 دقائق */
pub fn generate_sec_ms_gec_v2(unix_timestamp: u64) -> String {
    let mut ticks = unix_timestamp + WIN_EPOCH;
    ticks -= ticks % 300;
    ticks *= 10_000_000;
    let s = format!("{}{}", ticks, TRUSTED_CLIENT_TOKEN);
    let bytes = s.as_bytes();
    let digest = sha256_digest(bytes);
    let (w1, w2) = cs64_digest(bytes, &digest);
    format!(
        "{}{}-{}",
        hex_le(w1),
        hex_le(w2),
        digest.iter().map(|b| format!("{:02X}", b)).collect::<String>()
    )
}

fn hex_le(v: u32) -> String {
    format!("{:02X}{:02X}{:02X}{:02X}", v & 0xFF, (v >> 8) & 0xFF, (v >> 16) & 0xFF, (v >> 24) & 0xFF)
}

/* ─── X-Timestamp بنسق JS Date.toString ─── */
fn js_date_string() -> String {
    const DAYS: [&str; 7] = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const MONTHS: [&str; 12] = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let days = (secs / 86400) as i64;
    let wday = ((days + 4).rem_euclid(7)) as usize; /* 1970-01-01 = خميس */
    /* تاريخ مدني من الأيام (Howard Hinnant) */
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    let sod = secs % 86400;
    format!(
        "{} {} {:02} {} {:02}:{:02}:{:02} GMT+0000 (Coordinated Universal Time)",
        DAYS[wday],
        MONTHS[(m - 1) as usize],
        d,
        y,
        sod / 3600,
        (sod % 3600) / 60,
        sod % 60
    )
}

fn rand_hex(n: usize) -> String {
    /* بذرة عشوائية كافية لمعرّف الاتصال */
    use std::time::{SystemTime, UNIX_EPOCH};
    let mut seed = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_nanos() as u64
        ^ (std::process::id() as u64) << 32;
    let mut out = String::with_capacity(n);
    let mut i = 0;
    while i < n {
        seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        let chunk = format!("{:016x}", seed);
        for c in chunk.chars() {
            if out.len() < n { out.push(c); i += 1; }
        }
    }
    out
}

fn escape_xml(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;")
        .replace('"', "&quot;").replace('\'', "&apos;")
}

/* التوليد الكامل: WebSocket → MP3 → base64 */
pub async fn synthesize(text: &str, voice: &str, rate: &str) -> Result<String, String> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let gec = generate_sec_ms_gec_v2(now);
    let conn_id = rand_hex(16);

    let url = format!(
        "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken={}&Sec-MS-GEC={}&Sec-MS-GEC-Version={}&ConnectionId={}",
        TRUSTED_CLIENT_TOKEN, gec, SEC_MS_GEC_VERSION, conn_id
    );

    let mut request = url
        .into_client_request()
        .map_err(|e| format!("bad ws url: {}", e))?;
    let headers = request.headers_mut();
    headers.insert("Origin", HeaderValue::from_static(ORIGIN));
    headers.insert("User-Agent", HeaderValue::from_static(UA));
    headers.insert("Pragma", HeaderValue::from_static("no-cache"));
    headers.insert("Cache-Control", HeaderValue::from_static("no-cache"));
    headers.insert("Accept-Encoding", HeaderValue::from_static("gzip, deflate, br, zstd"));
    headers.insert("Accept-Language", HeaderValue::from_static("en-US,en;q=0.9"));

    let (ws, _response) = tokio_tungstenite::connect_async(request)
        .await
        .map_err(|e| format!("edge tts connect failed: {}", e))?;
    let (mut write, mut read) = ws.split();

    let date = js_date_string();
    let config = format!(
        "X-Timestamp:{date}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{}",
        r#"{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}"#
    );
    write.send(Message::Text(config)).await.map_err(|e| e.to_string())?;

    let locale: String = voice.split('-').take(2).collect::<Vec<_>>().join("-");
    let ssml = format!(
        "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='{}'><voice name='{}'><prosody pitch='+0Hz' rate='{}' volume='+0%'>{}</prosody></voice></speak>",
        locale, voice, rate, escape_xml(text)
    );
    let ssml_msg = format!(
        "X-RequestId:{}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:{}Z\r\nPath:ssml\r\n\r\n{}",
        rand_hex(32), date, ssml
    );
    write.send(Message::Text(ssml_msg)).await.map_err(|e| e.to_string())?;

    let mut audio: Vec<u8> = Vec::new();
    let deadline = tokio::time::Duration::from_secs(20);
    let result = tokio::time::timeout(deadline, async {
        while let Some(msg) = read.next().await {
            match msg {
                Ok(Message::Binary(data)) => {
                    if data.len() > 2 {
                        let header_len = u16::from_be_bytes([data[0], data[1]]) as usize;
                        if data.len() > 2 + header_len {
                            audio.extend_from_slice(&data[2 + header_len..]);
                        }
                    }
                }
                Ok(Message::Text(t)) => {
                    if t.contains("Path:turn.end") { break; }
                }
                Ok(Message::Close(_)) => break,
                Ok(_) => {}
                Err(e) => return Err(format!("ws read error: {}", e)),
            }
        }
        Ok(())
    })
    .await;

    let _ = write.close().await;
    match result {
        Ok(Ok(())) => {}
        Ok(Err(e)) => return Err(e),
        Err(_) => return Err("edge tts timeout".into()),
    }

    if audio.is_empty() {
        return Err("edge tts: empty audio".into());
    }
    Ok(base64::engine::general_purpose::STANDARD.encode(&audio))
}

/* ─── اختبارات: مطابقة الصف للبايت مع edge-tts 7.3.1 (drm.py) ─── */
#[cfg(test)]
mod tests {
    use super::*;

    /* القيم المرجعية مولّدة من: python3 -c "import edge_tts.drm as drm; print(drm.generate_sec_ms_gec_v2(TS))" */
    #[test]
    fn gec_v2_matches_reference() {
        let cases: [(u64, &str); 5] = [
            (1730000000, "50065ABF67B90F95-49BDAF24D28ECEB38DAEEC84DEAA71E91F92945EA8A47921C58FB4F8F79A4F5E"),
            (1729999000, "DD1A70C226FABEA7-4702001EA7A61F26404F5DD1E67F893A5FDF0085C5D2C158103D4CC4A503D1E1"),
            (1769000000, "3B85628412ADEAB6-BC6F2D3D2F4852824851E7C28771A8792B361B66FD63FE2151A8995D2690D585"),
            (1700000000, "2CD23A2CA0B2595A-F3C846C370E05F9CC83ACC5F995C5F5D87A4D0F14CE8936A0F902E64099E38A2"),
            (1000000000, "5E9153719FADA922-14D2A75113EC5862E17303287DCDB197E3A671DF9FCC53C100D6B27928384B98"),
        ];
        for (ts, expected) in cases {
            assert_eq!(generate_sec_ms_gec_v2(ts), expected, "mismatch for ts={}", ts);
        }
    }
}
