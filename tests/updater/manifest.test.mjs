import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { generateManifest, normalizeVersion, releaseOptions, writeManifest } from '../../updater/manifest.mjs';
import { assertNoDowngrade, checkChannel } from '../../updater/check-channel.mjs';

const repository = 'Lewvii/pot-desktop';
const suffixes = [
    'aarch64.app.tar.gz',
    'x64.app.tar.gz',
    'x64-setup.nsis.zip',
    'x86-setup.nsis.zip',
    'arm64-setup.nsis.zip',
    'amd64.AppImage.tar.gz',
    'x64_fix_webview2_runtime-setup.nsis.zip',
    'x86_fix_webview2_runtime-setup.nsis.zip',
    'arm64_fix_webview2_runtime-setup.nsis.zip',
];

function fixture(tag = 'v3.0.9') {
    const assets = suffixes.flatMap((suffix) =>
        ['', '.sig'].map((ext) => {
            const name = `pot_3.0.9_${suffix}${ext}`;
            return { name, browser_download_url: `https://github.com/${repository}/releases/download/${tag}/${name}` };
        })
    );
    const release = {
        tag_name: tag,
        body: 'Release notes',
        published_at: '2026-11-10T01:00:00Z',
        draft: false,
        prerelease: false,
        assets,
    };
    const calls = [];
    const fetchImpl = async (url, options) => {
        calls.push({ url, options });
        if (url === `https://api.github.com/repos/${repository}/releases/tags/${tag}`) return Response.json(release);
        assert.ok(assets.some((asset) => asset.browser_download_url === url));
        return new Response('fixture-signature\n');
    };
    return { repository, tag, token: 'fixture-token', fetchImpl, release, calls };
}

test('exact release and fork asset metadata produce the six supported normal platforms', async () => {
    const input = fixture();
    const manifest = await generateManifest('normal', input);
    assert.equal(manifest.name, '3.0.9');
    assert.equal(manifest.notes, input.release.body);
    assert.equal(manifest.pub_date, input.release.published_at);
    assert.deepEqual(Object.keys(manifest.platforms), [
        'darwin-aarch64',
        'darwin-x86_64',
        'windows-x86_64',
        'windows-i686',
        'windows-aarch64',
        'linux-x86_64',
    ]);
    assert.match(manifest.platforms['linux-x86_64'].url, /pot_3\.0\.9_amd64\.AppImage\.tar\.gz$/);
    assert.equal(manifest.platforms['windows-i686'].signature, 'fixture-signature');
    assert.equal(input.calls.length, 7);
    assert.equal(input.calls[0].options.headers.Authorization, 'Bearer fixture-token');
    assert.ok(input.calls.slice(1).every((call) => !call.options?.headers?.Authorization));
    assert.ok(input.calls.every((call) => !call.url.includes('/latest')));
});

test('fixed-runtime channel contains only its three Windows packages', async () => {
    const manifest = await generateManifest('fixedRuntime', fixture('3.0.9'));
    assert.deepEqual(Object.keys(manifest.platforms), ['windows-x86_64', 'windows-i686', 'windows-aarch64']);
    assert.ok(
        Object.values(manifest.platforms).every(({ url }) => url.endsWith('_fix_webview2_runtime-setup.nsis.zip'))
    );
});

test('release environment requires an exact stable tag and accepts an optional v', () => {
    assert.equal(normalizeVersion('v3.0.9'), '3.0.9');
    assert.equal(normalizeVersion('3.0.9'), '3.0.9');
    for (const tag of [undefined, 'master', 'v3.0.9-beta', '03.0.9', '3.0', 'updater'])
        assert.throws(() => normalizeVersion(tag));
    assert.deepEqual(releaseOptions({ RELEASE_TAG: 'v3.0.9', GITHUB_REF_NAME: 'master' }), {
        repository,
        tag: 'v3.0.9',
        token: undefined,
    });
    assert.throws(() => releaseOptions({ RELEASE_TAG: '3.0.9', GITHUB_REPOSITORY: '../bad' }));
});

test('unpublished, mismatched, missing, duplicate, and foreign assets fail generation', async () => {
    const mutations = [
        (r) => {
            r.draft = true;
        },
        (r) => {
            r.prerelease = true;
        },
        (r) => {
            r.tag_name = 'v3.0.8';
        },
        (r) => {
            r.published_at = null;
        },
        (r) => {
            r.assets.shift();
        },
        (r) => {
            r.assets.splice(1, 1);
        },
        (r) => {
            r.assets.push(r.assets[0]);
        },
        (r) => {
            r.assets[0].browser_download_url = 'https://example.com/package';
        },
        (r) => {
            r.assets[1].browser_download_url = r.assets[1].browser_download_url.replace('/v3.0.9/', '/v3.0.8/');
        },
    ];
    for (const mutate of mutations) {
        const input = fixture();
        mutate(input.release);
        await assert.rejects(generateManifest('normal', input));
    }
});

test('failed requests and empty signatures remove stale output', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'pot-updater-'));
    const output = join(directory, 'update.json');
    try {
        for (const failure of ['release-http', 'signature-http', 'empty-signature']) {
            const input = fixture();
            const originalFetch = input.fetchImpl;
            input.fetchImpl = async (url, options) => {
                if (failure === 'release-http' || (failure === 'signature-http' && url.endsWith('.sig')))
                    return new Response('', { status: 503 });
                if (failure === 'empty-signature' && url.endsWith('.sig')) return new Response(' \n');
                return originalFetch(url, options);
            };
            await writeFile(output, 'stale');
            await assert.rejects(writeManifest('normal', input, output));
            await assert.rejects(readFile(output), { code: 'ENOENT' });
        }
        await writeManifest('normal', fixture(), output);
        assert.equal(JSON.parse(await readFile(output)).name, '3.0.9');
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test('publication prevents older workflow runs overwriting a newer channel', async () => {
    assert.doesNotThrow(() => assertNoDowngrade('3.0.9', 'v3.0.9'));
    assert.doesNotThrow(() => assertNoDowngrade('3.0.9', '3.0.10'));
    assert.throws(() => assertNoDowngrade('3.1.0', '3.0.10'));
    await assert.rejects(
        checkChannel({ repository, tag: '3.0.9', fetchImpl: async () => Response.json({ name: '3.0.10' }) }),
        /older/
    );
    await checkChannel({ repository, tag: '3.0.9', fetchImpl: async () => new Response('', { status: 404 }) });
    await assert.rejects(
        checkChannel({ repository, tag: '3.0.9', fetchImpl: async () => new Response('', { status: 500 }) }),
        /HTTP 500/
    );
});

test('both CLI entrypoints fail with a nonzero exit and remove stale output when no release tag is set', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'pot-updater-cli-'));
    const env = { ...process.env };
    delete env.RELEASE_TAG;
    delete env.GITHUB_REF_NAME;
    try {
        for (const [script, output] of [
            ['updater.mjs', 'update.json'],
            ['updater-for-fix-runtime.mjs', 'update-fix-runtime.json'],
        ]) {
            await writeFile(join(directory, output), 'stale');
            const result = spawnSync(
                process.execPath,
                [fileURLToPath(new URL(`../../updater/${script}`, import.meta.url))],
                { cwd: directory, env, encoding: 'utf8' }
            );
            assert.equal(result.status, 1);
            assert.match(result.stderr, /Expected a stable version tag/);
            await assert.rejects(readFile(join(directory, output)), { code: 'ENOENT' });
        }
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});
