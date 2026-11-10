import { pathToFileURL } from 'node:url';
import { normalizeVersion, releaseOptions } from './manifest.mjs';

export function assertNoDowngrade(current, candidate) {
    const oldParts = normalizeVersion(current).split('.').map(BigInt);
    const newParts = normalizeVersion(candidate).split('.').map(BigInt);
    for (let i = 0; i < oldParts.length; i++) {
        if (newParts[i] > oldParts[i]) return;
        if (newParts[i] < oldParts[i])
            throw new Error(`Refusing to replace updater ${current} with older ${candidate}`);
    }
}

export async function checkChannel({ repository, tag, fetchImpl = fetch }) {
    const candidate = normalizeVersion(tag);
    for (const file of ['update.json', 'update-fix-runtime.json']) {
        const response = await fetchImpl(`https://github.com/${repository}/releases/download/updater/${file}`, {
            cache: 'no-store',
        });
        if (response.status === 404) continue;
        if (!response.ok) throw new Error(`HTTP ${response.status} checking current ${file}`);
        const current = await response.json();
        assertNoDowngrade(current.name || current.version, candidate);
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    await checkChannel(releaseOptions());
}
