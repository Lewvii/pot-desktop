import assert from 'node:assert/strict';
import test from 'node:test';
import { createEdgeTts, Language } from '../../src/services/tts/edge/client.js';

test('automatic language voices return the audio bytes expected by the existing player', async () => {
    for (const [language, voice] of [
        ['en', 'en-US-AriaNeural'],
        ['zh_cn', 'zh-CN-XiaoxiaoNeural'],
        ['zh_tw', 'zh-TW-HsiaoChenNeural'],
        ['ja', 'ja-JP-NanamiNeural'],
    ]) {
        const audio = [73, 68, 51, 0, 12];
        const tts = createEdgeTts(async (command, args) => {
            assert.equal(command, 'edge_tts');
            assert.deepEqual(args, { text: 'hello', voice });
            return audio;
        });
        assert.equal(await tts('hello', Language[language]), audio);
    }
});

test('custom voices override automatic selection and blank settings retain defaults', async () => {
    const received = [];
    const tts = createEdgeTts(async (_command, args) => {
        received.push(args.voice);
        return [1];
    });
    await tts('hello', Language.en, { config: { voice: ' en-GB-SoniaNeural ' } });
    await tts('hello', Language.en, { config: { voice: ' ' } });
    assert.deepEqual(received, ['en-GB-SoniaNeural', 'en-US-AriaNeural']);
});

test('unsupported language and remote failures remain failures rather than empty audio', async () => {
    let calls = 0;
    const tts = createEdgeTts(async () => {
        calls++;
        throw new Error('Service unavailable');
    });
    await assert.rejects(tts('hello', undefined), /Language not supported/);
    assert.equal(calls, 0);
    await assert.rejects(tts('hello', Language.en), /Service unavailable/);
});
