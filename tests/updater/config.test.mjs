import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('every bundle uses the fork channel and the same updater verification key', async () => {
    const root = new URL('../../src-tauri/', import.meta.url);
    const main = JSON.parse(await readFile(new URL('tauri.conf.json', root)));
    assert.equal(main.tauri.allowlist.process.relaunch, true);
    for (const file of ['tauri.conf.json', 'webview.x64.json', 'webview.x86.json', 'webview.arm64.json']) {
        const {
            tauri: { updater },
        } = JSON.parse(await readFile(new URL(file, root)));
        assert.equal(updater.active, true);
        assert.equal(updater.dialog, false);
        assert.equal(updater.pubkey, main.tauri.updater.pubkey);
        assert.ok(
            Buffer.from(updater.pubkey, 'base64').toString().startsWith('untrusted comment: minisign public key:')
        );
        assert.deepEqual(updater.endpoints, [
            `https://github.com/Lewvii/pot-desktop/releases/download/updater/${file === 'tauri.conf.json' ? 'update' : 'update-fix-runtime'}.json`,
        ]);
    }
    const cargo = await readFile(new URL('Cargo.toml', root), 'utf8');
    assert.match(cargo, /"updater"/);
    assert.match(cargo, /"process-relaunch"/);
});
