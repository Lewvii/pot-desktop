import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { SourceTextModule, SyntheticModule } from 'node:vm';

const source = await readFile(new URL('../../src/utils/store.js', import.meta.url), 'utf8');

async function loadStoreModule() {
    const state = { disk: ['lingva_tts'], loaded: null, calls: [], watcher: null };
    state.reload = async () => {
        state.disk = ['edge_tts'];
    };
    class Store {
        async load() {
            state.calls.push('frontend load');
            state.loaded = [...state.disk];
        }
    }
    const imports = {
        'tauri-plugin-store-api': { Store },
        '@tauri-apps/api/path': {
            appConfigDir: async () => '/config',
            join: async (...parts) => parts.join('/'),
        },
        'tauri-plugin-fs-watch-api': {
            watch: async (_path, callback) => {
                state.watcher = callback;
                return () => {};
            },
        },
        '@tauri-apps/api': {
            invoke: async (command) => {
                assert.equal(command, 'reload_store');
                state.calls.push('backend reload');
                await state.reload();
            },
        },
    };
    const module = new SourceTextModule(source);
    await module.link((name) => {
        const values = imports[name];
        assert.ok(values, `Unexpected import: ${name}`);
        return new SyntheticModule(Object.keys(values), function () {
            for (const [key, value] of Object.entries(values)) this.setExport(key, value);
        });
    });
    await module.evaluate();
    return { state, initStore: module.namespace.initStore };
}

test('new windows load migrated configuration before rendering', async () => {
    const { state, initStore } = await loadStoreModule();
    await initStore();
    assert.deepEqual(state.calls, ['backend reload', 'frontend load']);
    assert.deepEqual(state.loaded, ['edge_tts']);
    assert.equal(typeof state.watcher, 'function');
});

test('restored backups wait for backend migration before frontend reload', async () => {
    const { state, initStore } = await loadStoreModule();
    await initStore();
    state.calls = [];
    state.disk = ['lingva_tts@old'];
    let finishReload;
    state.reload = () => new Promise((resolve) => {
        finishReload = () => {
            state.disk = ['edge_tts'];
            resolve();
        };
    });
    const pending = state.watcher();
    assert.deepEqual(state.calls, ['backend reload']);
    assert.deepEqual(state.loaded, ['edge_tts']);
    finishReload();
    await pending;
    assert.deepEqual(state.calls, ['backend reload', 'frontend load']);
    assert.deepEqual(state.loaded, ['edge_tts']);
});

test('failed backend reload does not expose restored legacy configuration', async () => {
    const { state, initStore } = await loadStoreModule();
    await initStore();
    state.calls = [];
    state.disk = ['lingva_tts'];
    state.reload = async () => { throw new Error('Reload failed'); };
    await assert.rejects(state.watcher(), /Reload failed/);
    assert.deepEqual(state.calls, ['backend reload']);
    assert.deepEqual(state.loaded, ['edge_tts']);
});
