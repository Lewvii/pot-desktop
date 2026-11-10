# Built-in Edge speech

Pot uses Microsoft's online Edge Read Aloud service by default. It needs an internet connection but no API key, Python installation, local model, or plugin. Text submitted for speech is sent to Microsoft. This is an unofficial integration and may require updates when Microsoft changes the service.

New installations select Edge automatically. Built-in Lingva speech is no longer available. On upgrade, all Lingva speech instances are removed, including instances with custom addresses. If the list has no Edge instance, Edge replaces the first Lingva entry. Existing Edge instances, voice settings, speech plugins, and their relative order are preserved. The migration checks the current list on startup and configuration reload and writes only when Lingva entries remain, including configurations marked as migrated by an earlier version. Restored backups are migrated before the frontend loads their settings. Lingva translation remains available.

The default voice follows the text language. Settings > Services > Text to speech > Microsoft Edge accepts an optional voice ID, such as `en-US-AriaNeural` or `zh-CN-XiaoxiaoNeural`. Leave it empty for automatic selection.

This integration follows the feature proposed in [pot-app/pot-desktop#1073](https://github.com/pot-app/pot-desktop/pull/1073) by acking-you. It uses `msedge-tts` 0.4.1 for the current service protocol. It keeps the existing WebAudio player and returns MP3 bytes for every voice. It corrects the proposal's automatic voice selection and default priority without adding a native audio player or unrelated configuration changes. The Edge icon comes from that proposal.

The original proposal leaves the English automatic voice unassigned. Its automatic mode plays audio in Rust but returns no audio bytes to the frontend player. Its default service list also keeps Lingva first, so adding Edge alone does not repair default playback. This implementation treats each language as a mapping to a voice ID and uses one audio-byte contract for automatic and custom voices.

Requests follow Pot's proxy switch, host, and port. The no-proxy list accepts `*`, exact host names, and domain suffixes for the Edge speech host. Each request has a 30-second deadline and a 16 MiB audio limit. The stream receiver yields on an unexpected EOF so an incomplete connection cannot bypass that deadline.

Verification commands:

```sh
node --test tests/edge-tts/*.test.mjs
node --experimental-vm-modules --test tests/config/store.test.mjs
pnpm build
cargo test --release --manifest-path src-tauri/Cargo.toml --locked edge_tts
cargo test --release --manifest-path src-tauri/Cargo.toml --locked tts_defaults
cargo test --release --manifest-path src-tauri/Cargo.toml --locked live_english_and_chinese_audio -- --ignored --nocapture
```

The live test calls the online service and saves English and Chinese MP3 files in the system temporary directory. It is ignored in offline test runs. Successful generation alone does not verify the desktop playback controls.

The initial Edge integration was verified on Windows on 2026-11-10. The three Node tests, five Rust tests, frontend build, and Cargo release check passed. The explicitly run live test returned 14,256 English audio bytes and 15,264 Chinese audio bytes through the final stream implementation. Chromium WebAudio decoded both files successfully.

During that initial verification, an isolated desktop build migrated the old default Lingva configuration to Edge first. The user confirmed normal audible speech during desktop testing. Playback interruption and other operating systems were not separately tested. The installed application was not replaced.

After built-in Lingva speech was removed, verification on Windows on 2026-11-10 passed the three Node tests, nine Rust tests, and frontend build. The six migration tests cover named instances, duplicate Lingva entries, existing Edge settings, plugin order, exact provider IDs, empty lists, and repeated startup. All 14 locale edits were checked to preserve every translation outside the removed Lingva speech entry.

Three additional Node tests exercise the actual frontend store module with mocked Tauri boundaries. They verify migration before the initial load, migration before a watched backup reload, and preservation of loaded settings when backend reload fails. Desktop startup and backup restoration were not repeated after this change because the isolated application launch was blocked by the execution policy.
