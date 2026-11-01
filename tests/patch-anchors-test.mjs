import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function makeTree() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'litefin-trickplay-test-'));
    const write = (p, text) => {
        fs.mkdirSync(path.dirname(path.join(root,p)), { recursive: true });
        fs.writeFileSync(path.join(root,p),text);
    };
    write('package.json', '{"version":"2.0.20"}');
    write('src/player/osd/OSDController.js', `import { TrickplayManager } from './TrickplayManager.js';
class OSDController {
    constructor(){
        this._seekDirection = null;
        // Focus & Track State
    }
    handleInput(key, e) {}
    confirmPendingSeek(key = 'enter', e = null) {}
    _handleBack() {}
    _clearSeekState(restorePlayback = true) {}
}`);
    write('src/pages/PlayerPage.js', `class PlayerPage {
  configure() {
    this.on('key:rewind', () => {
      if (this._osd) {
                    this._osd._executeAction('rewind');
                } else if (this._player) {}
    });
    this.on('key:fastForward', () => {
      if (this._osd) {
                    this._osd._executeAction('fastForward');
                } else if (this._player) {}
    });
    const callbacks = {
      onSeekForward: () => {
                if (this._osd) this._osd._executeAction('fastForward');
      },
      onSeekBackward: () => {
                if (this._osd) this._osd._executeAction('rewind');
      }
    };
  }
}`);
    write('src-tauri/gen/android/app/build.gradle.kts', 'buildTypes {\n        getByName("debug") {\n       }\n}\n');
    write('src-tauri/gen/android/app/src/main/AndroidManifest.xml', '<application android:label="@string/app_name"/>');
    return root;
}

test('patcher applies exactly once and is idempotence-safe', () => {
    const root=makeTree();
    try {
        const cmd = ['apply.mjs', root];
        const first=spawnSync(process.execPath, cmd, { cwd: dir, encoding: 'utf8' });
        assert.equal(first.status,0,first.stderr);
        const p=fs.readFileSync(path.join(root,'src/pages/PlayerPage.js'),'utf8');
        assert.match(p,/startContinuousTrickplay\('fastForward', e\)/);
        assert.match(p,/startContinuousTrickplay\('rewind'\)\)/);
        const osd=fs.readFileSync(path.join(root,'src/player/osd/OSDController.js'),'utf8');
        assert.match(osd,/new ContinuousTrickplay\(this\)/);
        assert.match(osd,/continuousTrickplay\.cancel\(\)/);
        const gradle=fs.readFileSync(path.join(root,'src-tauri/gen/android/app/build.gradle.kts'),'utf8');
        assert.match(gradle,/applicationIdSuffix = "\.trickplaytest"/);
        const copy=fs.readFileSync(path.join(root,'tests/continuous-trickplay.test.mjs'),'utf8');
        assert.match(copy,/\.\.\/src\/player\/osd\/ContinuousTrickplay\.js/);
        const second=spawnSync(process.execPath, cmd, { cwd: dir, encoding: 'utf8' });
        assert.notEqual(second.status,0);
        assert.match(second.stderr,/Already patched/);
    } finally { fs.rmSync(root,{recursive:true,force:true}); }
});
