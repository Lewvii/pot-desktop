import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setCargoVersion, setVersion } from '../../updater/set-version.mjs';

test('Cargo version replacement changes only the application package', () => {
    const lock =
        '[[package]]\r\nname = "other"\r\nversion = "1.0.0"\r\n\r\n[[package]]\r\nname = "pot"\r\nversion = "3.0.8"\r\ndependencies = []\r\n';
    const updated = setCargoVersion(lock, 'pot', '3.0.9', true);
    assert.match(updated, /name = "other"\r\nversion = "1.0.0"/);
    assert.match(updated, /name = "pot"\r\nversion = "3.0.9"/);
    assert.throws(() => setCargoVersion(lock, 'missing', '3.0.9', true));
});

test('tag versions update all build metadata while branches retain package version', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'pot-version-'));
    try {
        await mkdir(join(directory, 'src-tauri'));
        await writeFile(join(directory, 'package.json'), JSON.stringify({ name: 'pot', version: '3.0.8' }));
        await writeFile(
            join(directory, 'src-tauri/tauri.conf.json'),
            JSON.stringify({ package: { version: '3.0.8' }, tauri: { updater: { pubkey: 'preserve-key' } } })
        );
        await writeFile(
            join(directory, 'src-tauri/Cargo.toml'),
            '[package]\nname = "pot"\nversion = "3.0.8"\n\n[dependencies]\nother = "1.0.0"\n'
        );
        await writeFile(join(directory, 'src-tauri/Cargo.lock'), '[[package]]\nname = "pot"\nversion = "3.0.8"\n');
        assert.equal(await setVersion(directory, { GITHUB_REF_TYPE: 'branch', GITHUB_REF_NAME: 'master' }), '3.0.8');
        assert.equal(await setVersion(directory, { GITHUB_REF_TYPE: 'tag', GITHUB_REF_NAME: 'v3.0.9' }), '3.0.9');
        assert.equal(JSON.parse(await readFile(join(directory, 'package.json'))).version, '3.0.9');
        const config = JSON.parse(await readFile(join(directory, 'src-tauri/tauri.conf.json')));
        assert.equal(config.package.version, '3.0.9');
        assert.equal(config.tauri.updater.pubkey, 'preserve-key');
        assert.match(await readFile(join(directory, 'src-tauri/Cargo.toml'), 'utf8'), /version = "3.0.9"/);
        assert.match(await readFile(join(directory, 'src-tauri/Cargo.lock'), 'utf8'), /version = "3.0.9"/);
        await assert.rejects(setVersion(directory, { GITHUB_REF_TYPE: 'tag', GITHUB_REF_NAME: 'v3.0.9-beta' }));
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});
