/**
 * Applies experimental continuous FF/REW to an extracted Litefin v2.0.20 tree.
 * Strict anchors intentionally fail on changed upstream source rather than
 * quietly producing a damaged APK. Usage: node apply.mjs /path/to/litefin
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const bundleRoot = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(process.argv[2] || '.');
// Git checkout and release archives can use different newline conventions.
const read = rel => fs.readFileSync(path.join(repo, rel), 'utf8').replace(/\r\n?/g, '\n');
const write = (rel, content) => fs.writeFileSync(path.join(repo, rel), content);

function replaceOne(source, needle, replacement, label) {
    const pieces = source.split(needle);
    if (pieces.length !== 2) {
        throw Error(`${label}: expected exactly one original source anchor; found ${pieces.length - 1}. Use Litefin v2.0.20.`);
    }
    return pieces.join(replacement);
}
function insertAfter(source, needle, insertion, label) {
    return replaceOne(source, needle, needle + insertion, label);
}

const version = JSON.parse(read('package.json')).version;
if (version !== '2.0.20') throw Error(`Expected Litefin v2.0.20, got ${version}.`);
const osdPath = 'src/player/osd/OSDController.js';
const playerPath = 'src/pages/PlayerPage.js';
let osd = read(osdPath);
let player = read(playerPath);
if (osd.includes('ContinuousTrickplay')) throw Error('Already patched; refusing to patch twice.');

osd = insertAfter(osd,
    "import { TrickplayManager } from './TrickplayManager.js';",
    "\nimport ContinuousTrickplay from './ContinuousTrickplay.js';", 'OSD import');
// Anchor to the *unique constructor comment*, not a fragile two-line substring.
// Validate the nearby field so we fail safely if upstream rearranges the class.
const constructorMarker = /^([ \t]*)\/\/ Focus & Track State[^\n]*$/gm;
const constructorMatches = [...osd.matchAll(constructorMarker)];
if (constructorMatches.length !== 1) {
    const hint = osd.split('\n').filter(line => /Focus|_seekDirection/.test(line)).slice(0, 8).join(' | ');
    throw Error(`OSD constructor marker: expected one match, found ${constructorMatches.length}. Nearby lines: ${hint}`);
}
const constructorPos = constructorMatches[0].index;
if (!/this\._seekDirection\s*=\s*null\s*;\s*$/.test(osd.slice(Math.max(0, constructorPos - 130), constructorPos))) {
    throw Error('OSD constructor marker is not immediately after _seekDirection initialization; upstream layout changed.');
}
osd = osd.replace(constructorMarker,
    (_full, indent) => `${indent}this._continuousTrickplay = new ContinuousTrickplay(this);\n${indent}// Focus & Track State`);
osd = insertAfter(osd,
    '    handleInput(key, e) {',
    `\n        // Continuous scan owns OK/Play and Back; D-pad cancels before normal navigation.\n        if (this._continuousTrickplay?.active && ['left', 'right', 'up', 'down'].includes(key)) {\n            this._continuousTrickplay.cancel();\n        }`, 'OSD key handler');
osd = replaceOne(osd,
    '    handleInput(key, e) {',
    `    startContinuousTrickplay(direction, event = null) {\n        return this._continuousTrickplay.press(direction, event);\n    }\n    handleInput(key, e) {`, 'Public scan entry point');
osd = insertAfter(osd,
    "    confirmPendingSeek(key = 'enter', e = null) {",
    `\n        // Always RESUME after Play or OK in continuous mode, including if paused beforehand.\n        if (this._continuousTrickplay?.active) {\n            this._continuousTrickplay.stop();\n            key = key === 'pause' ? 'pause' : 'play';\n        }`, 'Seek confirmation');
osd = insertAfter(osd,
    '    _handleBack() {',
    `\n        if (this._continuousTrickplay?.cancel()) return true;`, 'Back cancel');
osd = insertAfter(osd,
    '    _clearSeekState(restorePlayback = true) {',
    `\n        this._continuousTrickplay?.stop();`, 'Seek state teardown');

// Physical media keys only. D-pad and clickable skip controls remain unchanged.
player = replaceOne(player, "this.on('key:rewind', () => {", "this.on('key:rewind', (e) => {", 'Rewind listener');
player = replaceOne(player, "this.on('key:fastForward', () => {", "this.on('key:fastForward', (e) => {", 'FastForward listener');
player = replaceOne(player,
    "                    this._osd._executeAction('rewind');\n                } else if",
    "                    if (!this._osd.startContinuousTrickplay('rewind', e)) this._osd._executeAction('rewind');\n                } else if",
    'Physical rewind');
player = replaceOne(player,
    "                    this._osd._executeAction('fastForward');\n                } else if",
    "                    if (!this._osd.startContinuousTrickplay('fastForward', e)) this._osd._executeAction('fastForward');\n                } else if",
    'Physical fast forward');
player = replaceOne(player,
    "if (this._osd) this._osd._executeAction('fastForward');",
    "if (this._osd) { if (!this._osd.startContinuousTrickplay('fastForward')) this._osd._executeAction('fastForward'); }",
    'MediaSession fast forward');
player = replaceOne(player,
    "if (this._osd) this._osd._executeAction('rewind');",
    "if (this._osd) { if (!this._osd.startContinuousTrickplay('rewind')) this._osd._executeAction('rewind'); }",
    'MediaSession rewind');

// Distinct Android application ID, retaining original Kotlin namespace.
const gradlePath = 'src-tauri/gen/android/app/build.gradle.kts';
let gradle = read(gradlePath);
gradle = insertAfter(gradle,
    '        getByName("debug") {',
    '\n            applicationIdSuffix = ".trickplaytest"', 'Distinct debug package ID');
const manifestPath = 'src-tauri/gen/android/app/src/main/AndroidManifest.xml';
let manifest = read(manifestPath);
manifest = replaceOne(manifest,
    'android:label="@string/app_name"',
    'android:label="Litefin Trickplay Test"', 'App display label');

// Commit only after ALL anchors have passed.
fs.copyFileSync(path.join(bundleRoot, 'src/ContinuousTrickplay.js'), path.join(repo, 'src/player/osd/ContinuousTrickplay.js'));
const testsDest = path.join(repo, 'tests/continuous-trickplay.test.mjs');
fs.mkdirSync(path.dirname(testsDest), { recursive: true });
const testContent = fs.readFileSync(path.join(bundleRoot, 'tests/continuous-trickplay.test.mjs'), 'utf8')
    .replace("'../src/ContinuousTrickplay.js'", "'../src/player/osd/ContinuousTrickplay.js'");
fs.writeFileSync(testsDest, testContent);
write(osdPath, osd);
write(playerPath, player);
write(gradlePath, gradle);
write(manifestPath, manifest);
console.log('Patched Litefin v2.0.20 (v0.2): 4x / 8x / 16x / 32x continuous scan; separate Android debug app.');
