import { rm, writeFile } from 'node:fs/promises';

const platforms = {
    normal: {
        'darwin-aarch64': 'aarch64.app.tar.gz',
        'darwin-x86_64': 'x64.app.tar.gz',
        'windows-x86_64': 'x64-setup.nsis.zip',
        'windows-i686': 'x86-setup.nsis.zip',
        'windows-aarch64': 'arm64-setup.nsis.zip',
        'linux-x86_64': 'amd64.AppImage.tar.gz',
    },
    fixedRuntime: {
        'windows-x86_64': 'x64_fix_webview2_runtime-setup.nsis.zip',
        'windows-i686': 'x86_fix_webview2_runtime-setup.nsis.zip',
        'windows-aarch64': 'arm64_fix_webview2_runtime-setup.nsis.zip',
    },
};

export function normalizeVersion(tag) {
    const version = tag?.replace(/^v/, '');
    if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
        throw new Error(`Expected a stable version tag such as v3.0.9, received ${tag}`);
    }
    return version;
}

export function releaseOptions(env = process.env) {
    const repository = env.GITHUB_REPOSITORY || 'Lewvii/pot-desktop';
    if (!/^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_][A-Za-z0-9_.-]*$/.test(repository))
        throw new Error('Invalid GITHUB_REPOSITORY');
    const tag = env.RELEASE_TAG || env.GITHUB_REF_NAME;
    normalizeVersion(tag);
    return { repository, tag, token: env.GITHUB_TOKEN };
}

async function request(url, fetchImpl, options) {
    const response = await fetchImpl(url, options);
    if (!response.ok) throw new Error(`HTTP ${response.status} fetching ${url}`);
    return response;
}

export async function generateManifest(channel, { repository, tag, token, fetchImpl = fetch }) {
    const mapping = platforms[channel];
    if (!mapping) throw new Error(`Unknown updater channel ${channel}`);
    const version = normalizeVersion(tag);
    const response = await request(
        `https://api.github.com/repos/${repository}/releases/tags/${encodeURIComponent(tag)}`,
        fetchImpl,
        {
            headers: {
                Accept: 'application/vnd.github+json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
        }
    );
    const release = await response.json();
    if (release.tag_name !== tag || release.draft || release.prerelease) {
        throw new Error('Updater requires the exact published stable release');
    }
    if (!release.published_at || !Number.isFinite(Date.parse(release.published_at))) {
        throw new Error('Release has no valid publication date');
    }
    if (!Array.isArray(release.assets)) throw new Error('Release has no assets');
    const assets = new Map();
    for (const asset of release.assets) {
        if (assets.has(asset.name)) throw new Error(`Duplicate release asset ${asset.name}`);
        assets.set(asset.name, asset);
    }
    function assetUrl(name) {
        const asset = assets.get(name);
        if (!asset) throw new Error(`Missing release asset ${name}`);
        const expected = `https://github.com/${repository}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(name)}`;
        if (asset.browser_download_url !== expected) throw new Error(`Unexpected release asset URL for ${name}`);
        return asset.browser_download_url;
    }
    const entries = await Promise.all(
        Object.entries(mapping).map(async ([platform, suffix]) => {
            const name = `pot_${version}_${suffix}`;
            const url = assetUrl(name);
            const signatureUrl = assetUrl(`${name}.sig`);
            const signature = (await (await request(signatureUrl, fetchImpl)).text()).trim();
            if (!signature) throw new Error(`Empty signature for ${name}`);
            return [platform, { signature, url }];
        })
    );
    return {
        name: version,
        notes: release.body || '',
        pub_date: release.published_at,
        platforms: Object.fromEntries(entries),
    };
}

export async function writeManifest(channel, options, output) {
    await rm(output, { force: true });
    try {
        const manifest = await generateManifest(channel, options);
        await writeFile(output, JSON.stringify(manifest, null, 4) + '\n');
    } catch (error) {
        await rm(output, { force: true });
        throw error;
    }
}

export async function runManifest(channel) {
    const output = channel === 'normal' ? 'update.json' : 'update-fix-runtime.json';
    try {
        await rm(output, { force: true });
        await writeManifest(channel, releaseOptions(), output);
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}
