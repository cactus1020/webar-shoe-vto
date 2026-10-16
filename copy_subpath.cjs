const fs = require('fs');
const path = require('path');
const dist = path.join(__dirname, 'dist');
const subpath = path.join(dist, 'shoe_vto');
if (!fs.existsSync(subpath)) {
  fs.mkdirSync(subpath, { recursive: true });
}
// Include measurement references and studio at the same base path as the app.
['assets', 'models', 'wasm', 'calibration', 'index.html', 'studio.html'].forEach(item => {
  const src = path.join(dist, item);
  const dst = path.join(subpath, item);
  if (fs.existsSync(src)) {
    fs.cpSync(src, dst, { recursive: true });
  }
});

// Also copy root wasm and mjs files into dist/shoe_vto/
if (fs.existsSync(dist)) {
  fs.readdirSync(dist).forEach(file => {
    if (file.endsWith('.wasm') || file.endsWith('.mjs')) {
      fs.copyFileSync(path.join(dist, file), path.join(subpath, file));
    }
  });
}
console.log('Duplicated static files and WASM runtime to dist/shoe_vto for direct routing.');
