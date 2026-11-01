/**
 * Finalizes a successful apply.mjs patch for a signed Android release.
 * The Android namespace stays upstream's; the installable app ID is separate.
 * Usage: node prepare-production.mjs upstream v2.0.20 1
 */
import fs from 'node:fs';
import path from 'node:path';

const repo = path.resolve(process.argv[2] || 'upstream');
const tag = process.argv[3];
const revision = Number(process.argv[4] || 1);
const match = /^v(\d+)\.(\d+)\.(\d+)$/.exec(tag || '');
if (!match || !Number.isSafeInteger(revision) || revision < 1 || revision > 999) {
    throw Error('Usage: node prepare-production.mjs upstream vMAJOR.MINOR.PATCH REVISION(1..999)');
}
const [major, minor, patch] = match.slice(1).map(Number);
if (minor > 99 || patch > 999) throw Error('Version out of supported range for versionCode scheme');
const versionCode = major * 100_000_000 + minor * 1_000_000 + patch * 1000 + revision;
if (versionCode >= 2100000000) throw Error('Android versionCode overflow');
const version = `${major}.${minor}.${patch}`;
if (JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8')).version !== version) {
    throw Error(`Source package.json version does not match supplied tag ${tag}`);
}
const gradleFile = path.join(repo, 'src-tauri/gen/android/app/build.gradle.kts');
let gradle = fs.readFileSync(gradleFile, 'utf8');
function replaceExactlyOnce(src, from, to, label) {
    const parts = src.split(from);
    if (parts.length !== 2) throw Error(`${label}: expected exactly one anchor; got ${parts.length - 1}`);
    return parts.join(to);
}
gradle = replaceExactlyOnce(gradle,
    'applicationId = "org.litefin.app"',
    'applicationId = "org.litefin.app.trickplay"', 'production app ID');
gradle = replaceExactlyOnce(gradle,
    'versionCode = tauriProperties.getProperty("tauri.android.versionCode", "1").toInt()',
    `versionCode = ${versionCode}`, 'Android versionCode');
gradle = replaceExactlyOnce(gradle,
    'versionName = tauriProperties.getProperty("tauri.android.versionName", "1.0")',
    `versionName = "${version}-trickplay.${revision}"`, 'Android versionName');
const manifestFile = path.join(repo, 'src-tauri/gen/android/app/src/main/AndroidManifest.xml');
let manifest = fs.readFileSync(manifestFile, 'utf8');
manifest = replaceExactlyOnce(manifest,
    'android:label="Litefin Trickplay Test"',
    'android:label="Litefin Trickplay"', 'production display name');
// Keep Tauri's identifier aligned with the Gradle app ID, but do not alter
// generated Kotlin's original namespace (org.litefin.app).
const configFile = path.join(repo, 'src-tauri/tauri.conf.json');
const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
if (config.identifier !== 'org.litefin.app') throw Error(`Unexpected Tauri identifier: ${config.identifier}`);
config.identifier = 'org.litefin.app.trickplay';
config.productName = 'Litefin Trickplay';
fs.writeFileSync(gradleFile, gradle);
fs.writeFileSync(manifestFile, manifest);
fs.writeFileSync(configFile, JSON.stringify(config, null, 2) + '\n');
console.log(`Prepared unsigned release ${tag}-trickplay.${revision}, versionCode=${versionCode}, ID=org.litefin.app.trickplay`);
