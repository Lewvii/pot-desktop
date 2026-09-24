// Run: node src/services/translate/deepseek/check.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('./index.jsx', import.meta.url), 'utf8')
    .replace(/^import .*;$/gm, '')
    .replace(/^export \* .*;$/gm, '')
    .replace('export async function', 'async function');
let response = { ok: true, data: { choices: [{ message: { content: '  你好  ' }, finish_reason: 'stop' }] } };
const calls = [];
const { translate } = vm.runInNewContext(`${source}\n({ translate })`, {
    URL,
    Body: { json: (payload) => payload },
    fetch: async (url, request) => {
        calls.push({ url, request });
        return response;
    },
});
await assert.rejects(translate('hello', 'Auto', 'Chinese'), /API key/);
assert.equal(calls.length, 0);
const options = {
    config: { apiKey: 'test-key', model: 'deepseek-flash', requestPath: 'https://api.deepseek.com/chat/completions' },
};
for (const model of ['deepseek-flash', 'deepseek-v4-pro']) {
    assert.equal(
        await translate('hello', 'Auto', 'Chinese', { config: { ...options.config, apiKey: ' test-key ', model } }),
        '你好'
    );
    const { url, request } = calls.at(-1);
    assert.equal(url, 'https://api.deepseek.com/chat/completions');
    assert.equal(request.headers.Authorization, 'Bearer test-key');
    assert.equal(request.body.model, model);
    assert.equal(request.body.thinking.type, 'enabled');
    assert.equal(request.body.reasoning_effort, 'high');
    assert.equal(request.body.stream, false);
    assert.equal(request.body.messages[1].content, 'Translate into Chinese:\nhello');
}
for (const requestPath of ['https://gateway.example/v1', 'https://gateway.example/v1/chat/completions/']) {
    await translate('hello', 'Auto', 'Chinese', {
        config: { ...options.config, requestPath, model: ' custom-model ' },
    });
    assert.equal(calls.at(-1).url, requestPath);
    assert.equal(calls.at(-1).request.body.model, 'custom-model');
}
const callCount = calls.length;
for (const config of [
    { requestPath: '' },
    { requestPath: undefined },
    { requestPath: 'gateway.example/v1' },
    { requestPath: 'ftp://gateway.example' },
    { requestPath: 'https://user:secret@gateway.example' },
    { model: ' ' },
    { model: undefined },
]) {
    await assert.rejects(translate('hello', 'Auto', 'Chinese', { config: { ...options.config, ...config } }));
}
assert.equal(calls.length, callCount);
response = { ok: false, status: 429, data: { error: { message: 'Rate limit' } } };
await assert.rejects(translate('hello', 'Auto', 'Chinese', options), /HTTP 429\nRate limit/);
response = { ok: true, data: {} };
await assert.rejects(translate('hello', 'Auto', 'Chinese', options), /invalid translation/);
response.data = { choices: [{ message: { content: 'partial' }, finish_reason: 'length' }] };
await assert.rejects(translate('hello', 'Auto', 'Chinese', options), /truncated/);
console.log('DeepSeek request checks passed');
