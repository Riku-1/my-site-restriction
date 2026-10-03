// package.json の version を manifest.json に反映する（バージョンの正は package.json）
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

const manifestPath = path.join(root, 'manifest.json');
const manifest = fs.readFileSync(manifestPath, 'utf8');
const updated = manifest.replace(/("version"\s*:\s*")[^"]*(")/, `$1${version}$2`);

if (updated !== manifest) {
  fs.writeFileSync(manifestPath, updated);
  console.log(`manifest.json の version を ${version} に更新しました`);
}
