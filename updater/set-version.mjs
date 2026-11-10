import { readFile, writeFile, appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { normalizeVersion } from './manifest.mjs';

export function setCargoVersion(source, name, version, lock = false) {
    let changed = false;
    const section = lock ? /\[\[package\]\][\s\S]*?(?=\n\[\[package\]\]|$)/g : /\[package\][\s\S]*?(?=\n\[|$)/g;
    const result = source.replace(section, (block) => {
        if (!new RegExp(`^name = "${name}"\\r?$`, 'm').test(block)) return block;
        changed = true;
        return block.replace(/^version = "[^"]+"/m, `version = "${version}"`);
    });
    if (!changed) throw new Error(`Cargo package ${name} not found`);
    return result;
}

export async function setVersion(root = '.', env = process.env) {
    const packagePath = `${root}/package.json`;
    const configPath = `${root}/src-tauri/tauri.conf.json`;
    const pkg = JSON.parse(await readFile(packagePath, 'utf8'));
    const version = normalizeVersion(env.GITHUB_REF_TYPE === 'tag' ? env.GITHUB_REF_NAME : pkg.version);
    const config = JSON.parse(await readFile(configPath, 'utf8'));
    pkg.version = version;
    config.package.version = version;
    await writeFile(packagePath, JSON.stringify(pkg, null, 4) + '\n');
    await writeFile(configPath, JSON.stringify(config, null, 4) + '\n');
    for (const file of ['Cargo.toml', 'Cargo.lock']) {
        const path = `${root}/src-tauri/${file}`;
        await writeFile(path, setCargoVersion(await readFile(path, 'utf8'), pkg.name, version, file === 'Cargo.lock'));
    }
    if (env.GITHUB_OUTPUT) await appendFile(env.GITHUB_OUTPUT, `VERSION=${version}\n`);
    return version;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    console.log(await setVersion());
}
