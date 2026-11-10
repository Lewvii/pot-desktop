use futures_util::io::{AsyncRead, AsyncWrite};
use msedge_tts::tts::{
    stream::{
        tokio_runtime::{
            msedge_tts_split_async, msedge_tts_split_proxy_async, ReceiverAsync, SenderAsync,
        },
        SynthesizedResponse,
    },
    SpeechConfig,
};
use std::time::Duration;

const MAX_TEXT_BYTES: usize = 16_000;
const MAX_AUDIO_BYTES: usize = 16 * 1024 * 1024;

fn proxy_for_settings(
    enabled: bool,
    host: &str,
    port: Option<u64>,
    no_proxy: &str,
) -> Result<Option<String>, String> {
    const SPEECH_HOST: &str = "speech.platform.bing.com";
    if !enabled
        || no_proxy.split(',').any(|entry| {
            let entry = entry.trim().to_ascii_lowercase();
            let domain = entry
                .strip_prefix("*.")
                .unwrap_or(&entry)
                .trim_start_matches('.');
            entry == "*"
                || !domain.is_empty()
                    && (SPEECH_HOST == domain || SPEECH_HOST.ends_with(&format!(".{domain}")))
        })
    {
        return Ok(None);
    }
    let host = host.trim();
    if host.is_empty() || host.contains(['/', '@', ' ', '\r', '\n']) {
        return Err("Check the proxy host in Pot settings".into());
    }
    let port = port
        .and_then(|value| u16::try_from(value).ok())
        .filter(|value| *value != 0)
        .ok_or_else(|| "Check the proxy port in Pot settings".to_string())?;
    Ok(Some(format!("http://{host}:{port}")))
}

fn speech_text(text: &str, voice: &str) -> Result<String, String> {
    if text.trim().is_empty() {
        return Err("Enter text to read aloud".into());
    }
    if text.len() > MAX_TEXT_BYTES {
        return Err("Text is too long for one speech request (maximum 16000 bytes)".into());
    }
    if voice.len() > 128
        || !voice.ends_with("Neural")
        || !voice
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
    {
        return Err("Invalid Edge voice ID".into());
    }
    let mut escaped = String::with_capacity(text.len());
    for character in text.chars() {
        match character {
            '&' => escaped.push_str("&amp;"),
            '<' => escaped.push_str("&lt;"),
            '>' => escaped.push_str("&gt;"),
            '\'' => escaped.push_str("&apos;"),
            '"' => escaped.push_str("&quot;"),
            '\t' | '\n' | '\r' => escaped.push(character),
            character if character.is_control() => escaped.push(' '),
            character => escaped.push(character),
        }
    }
    Ok(escaped)
}

#[tauri::command]
pub async fn edge_tts(text: String, voice: String) -> Result<Vec<u8>, String> {
    let enabled = crate::config::get("proxy_enable")
        .and_then(|value| value.as_bool())
        .unwrap_or(false);
    let host = crate::config::get("proxy_host")
        .and_then(|value| value.as_str().map(str::to_owned))
        .unwrap_or_default();
    let port = crate::config::get("proxy_port").and_then(|value| value.as_u64());
    let no_proxy = crate::config::get("no_proxy")
        .and_then(|value| value.as_str().map(str::to_owned))
        .unwrap_or_default();
    let proxy = proxy_for_settings(enabled, &host, port, &no_proxy)?;
    synthesize_speech(text, voice, proxy).await
}

async fn synthesize_speech(
    text: String,
    voice: String,
    proxy: Option<String>,
) -> Result<Vec<u8>, String> {
    let text = speech_text(&text, &voice)?;
    let config = SpeechConfig {
        voice_name: voice,
        audio_format: "audio-24khz-48kbitrate-mono-mp3".into(),
        pitch: 0,
        rate: 0,
        volume: 0,
    };
    tokio::time::timeout(Duration::from_secs(30), async {
        if let Some(proxy) = proxy {
            let (sender, receiver) = msedge_tts_split_proxy_async(&proxy).await?;
            collect_audio(sender, receiver, &text, &config).await
        } else {
            let (sender, receiver) = msedge_tts_split_async().await?;
            collect_audio(sender, receiver, &text, &config).await
        }
    })
    .await
    .map_err(|_| "Edge speech request timed out. Please retry.".to_string())?
    .map_err(|_| {
        "Unable to generate Edge speech. Check your connection and Pot proxy settings, then retry."
            .to_string()
    })
}

async fn collect_audio<T: AsyncRead + AsyncWrite + Unpin>(
    mut sender: SenderAsync<T>,
    mut receiver: ReceiverAsync<T>,
    text: &str,
    config: &SpeechConfig,
) -> msedge_tts::error::Result<Vec<u8>> {
    sender.send(text, config).await?;
    let mut audio = Vec::new();
    while receiver.can_read().await {
        match receiver.read().await? {
            Some(SynthesizedResponse::AudioBytes(bytes)) => {
                if audio.len().saturating_add(bytes.len()) > MAX_AUDIO_BYTES {
                    return Err(msedge_tts::error::Error::UnexpectedMessage(
                        "Speech audio exceeds the size limit".into(),
                    ));
                }
                audio.extend_from_slice(&bytes);
            }
            Some(SynthesizedResponse::AudioMetadata(_)) => {}
            None => {
                // The library leaves can_read set on EOF. Yield so the request deadline still applies.
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        }
    }
    if audio.is_empty() {
        return Err(msedge_tts::error::Error::UnexpectedMessage(
            "Edge speech service returned no audio".into(),
        ));
    }
    Ok(audio)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn escapes_text_without_allowing_ssml_injection() {
        assert_eq!(
            speech_text("A & B <voice>\"'\u{0}", "en-US-AriaNeural").unwrap(),
            "A &amp; B &lt;voice&gt;&quot;&apos; "
        );
    }

    #[test]
    fn rejects_invalid_requests_before_connecting() {
        assert!(speech_text(" ", "en-US-AriaNeural").is_err());
        assert!(speech_text(&"a".repeat(MAX_TEXT_BYTES + 1), "en-US-AriaNeural").is_err());
        assert!(speech_text("hello", "auto").is_err());
        assert!(speech_text("hello", "en-US-'AriaNeural").is_err());
    }

    #[test]
    fn follows_explicit_proxy_settings_and_domain_exclusions() {
        assert_eq!(proxy_for_settings(false, "", None, "").unwrap(), None);
        assert_eq!(
            proxy_for_settings(true, "127.0.0.1", Some(7890), "localhost").unwrap(),
            Some("http://127.0.0.1:7890".into())
        );
        for excluded in [
            "*",
            "bing.com",
            ".bing.com",
            "*.bing.com",
            "speech.platform.bing.com",
        ] {
            assert_eq!(
                proxy_for_settings(true, "127.0.0.1", Some(7890), excluded).unwrap(),
                None
            );
        }
        assert!(proxy_for_settings(true, "", Some(7890), "").is_err());
        assert!(proxy_for_settings(true, "127.0.0.1", Some(70000), "").is_err());
    }

    #[test]
    #[ignore = "Calls Microsoft's online speech service"]
    fn live_english_and_chinese_audio() {
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        runtime.block_on(async {
            for (text, voice, file) in [
                (
                    "This is a speech test.",
                    "en-US-AriaNeural",
                    "pot-edge-en.mp3",
                ),
                (
                    "你好，这是语音测试。",
                    "zh-CN-XiaoxiaoNeural",
                    "pot-edge-zh.mp3",
                ),
            ] {
                let audio = synthesize_speech(text.into(), voice.into(), None)
                    .await
                    .unwrap();
                assert!(audio.len() > 1000);
                std::fs::write(std::env::temp_dir().join(file), &audio).unwrap();
                println!("{voice}: {} audio bytes", audio.len());
            }
        });
    }
}
