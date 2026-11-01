import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const home = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'litefin-prod-'));
  const put = (file, data) => {
    const p = path.join(root, file);
    fs.mkdirSync(path.dirname(p), {recursive: true});
    fs.writeFileSync(p, data);
  };
  put('package.json', JSON.stringify({version:'2.0.20'}));
  put('src-tauri/tauri.conf.json', JSON.stringify({identifier:'org.litefin.app',productName:'Litefin'}));
  put('src-tauri/gen/android/app/src/main/AndroidManifest.xml', '<application android:label="Litefin Trickplay Test"/>');
  put('src-tauri/gen/android/app/build.gradle.kts', `android {
    namespace = "org.litefin.app"
    defaultConfig {
      applicationId = "org.litefin.app"
      versionCode = tauriProperties.getProperty("tauri.android.versionCode", "1").toInt()
      versionName = tauriProperties.getProperty("tauri.android.versionName", "1.0")
    }
  }`);
  return root;
}
test('production preparation uses distinct ID, deterministic increasing Android version code', () => {
  const dir = fixture();
  try {
    let p = spawnSync(process.execPath, ['prepare-production.mjs',dir,'v2.0.20','1'], {cwd:home,encoding:'utf8'});
    assert.equal(p.status, 0, p.stderr);
    const gradle = fs.readFileSync(path.join(dir,'src-tauri/gen/android/app/build.gradle.kts'),'utf8');
    assert.match(gradle, /applicationId = "org\.litefin\.app\.trickplay"/);
    assert.match(gradle, /versionCode = 200020001/);
    assert.match(gradle, /versionName = "2\.0\.20-trickplay\.1"/);
    const conf = JSON.parse(fs.readFileSync(path.join(dir,'src-tauri/tauri.conf.json'),'utf8'));
    assert.equal(conf.identifier,'org.litefin.app');
    assert.equal(conf.productName,'Litefin Trickplay');
    p = spawnSync(process.execPath, ['prepare-production.mjs',dir,'v2.0.20','1'], {cwd:home,encoding:'utf8'});
    assert.notEqual(p.status,0,'cannot configure same source twice');
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
test('production preparation rejects mismatched upstream tag',()=>{
  const dir=fixture();
  try {
    const p=spawnSync(process.execPath,['prepare-production.mjs',dir,'v2.0.30','1'],{cwd:home,encoding:'utf8'});
    assert.notEqual(p.status,0);
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
