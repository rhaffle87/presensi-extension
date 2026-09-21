const fs        = require('fs');
const path      = require('path');
const { execSync, spawnSync } = require('child_process');
const JavaScriptObfuscator = require('javascript-obfuscator');
const archiver  = require('archiver');

const OUT_DIR     = path.join(__dirname, 'dist');
const RELEASE_ZIP = path.join(__dirname, 'release.zip');
const KEY_FILE    = path.join(__dirname, 'key.pem');
const CRX_FILE    = path.join(OUT_DIR, 'presensi-extension.crx');

// Files to copy exactly as they are
const FILES_TO_COPY = [
  'manifest.json',
  'popup.html',
  'compat.js',
  'storage-bridge.js',
  'README.md',
  'INSTALL.md'
];

// Directories to copy
const DIRS_TO_COPY = [
  'icons',
  'options',
  'lib',        // Leaflet map library
  'background'  // service-worker.js isn't obfuscated to prevent breaking MV3 registration
];

async function build() {
  console.log('Starting build process...');

  // 1. Clean and create output directory
  if (fs.existsSync(OUT_DIR)) {
    fs.rmSync(OUT_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(OUT_DIR);

  // 2. Obfuscate content.js (Stealthy signature masking without breaking browser runtime)
  console.log('Obfuscating content.js...');
  const contentJsRaw = fs.readFileSync(path.join(__dirname, 'content.js'), 'utf8');
  const obfuscatedResult = JavaScriptObfuscator.obfuscate(contentJsRaw, {
    compact: true,
    controlFlowFlattening: false,
    deadCodeInjection: false,
    debugProtection: false, // Must be false to allow DevTools without infinite recursion
    disableConsoleOutput: false, // Must be false to not break host site console/frameworks
    identifierNamesGenerator: 'hexadecimal',
    log: false,
    numbersToExpressions: false,
    renameGlobals: false,
    selfDefending: false, // Must be false: conflicts with Function.prototype.toString proxy
    simplify: true,
    splitStrings: true,
    splitStringsChunkLength: 10,
    stringArray: true,
    stringArrayEncoding: ['base64'],
    stringArrayIndexShift: true,
    stringArrayRotate: true,
    stringArrayShuffle: true,
    stringArrayThreshold: 0.75,
    unicodeEscapeSequence: false
  });

  fs.writeFileSync(path.join(OUT_DIR, 'content.js'), obfuscatedResult.getObfuscatedCode());

  // 2.5. Obfuscate popup.js (Safe UI obfuscation)
  console.log('Obfuscating popup.js...');
  const popupJsRaw = fs.readFileSync(path.join(__dirname, 'popup.js'), 'utf8');
  const obfuscatedPopup = JavaScriptObfuscator.obfuscate(popupJsRaw, {
    compact: true,
    controlFlowFlattening: false,
    deadCodeInjection: false,
    debugProtection: false,
    disableConsoleOutput: false,
    identifierNamesGenerator: 'hexadecimal',
    log: false,
    numbersToExpressions: false,
    renameGlobals: false,
    selfDefending: false,
    simplify: true,
    stringArray: true,
    stringArrayEncoding: ['base64'],
    stringArrayThreshold: 0.75,
    unicodeEscapeSequence: false
  });

  fs.writeFileSync(path.join(OUT_DIR, 'popup.js'), obfuscatedPopup.getObfuscatedCode());

  // 3. Copy static files
  console.log('Copying static files...');
  for (const file of FILES_TO_COPY) {
    if (fs.existsSync(path.join(__dirname, file))) {
      fs.copyFileSync(path.join(__dirname, file), path.join(OUT_DIR, file));
    }
  }

  // 4. Copy directories
  console.log('Copying static directories...');
  for (const dir of DIRS_TO_COPY) {
    if (fs.existsSync(path.join(__dirname, dir))) {
      fs.cpSync(path.join(__dirname, dir), path.join(OUT_DIR, dir), { recursive: true });
    }
  }

  // 5. Zip it up for GitHub Releases (Load unpacked distribution)
  console.log('Packaging release.zip...');
  const output  = fs.createWriteStream(RELEASE_ZIP);
  const archive = archiver('zip', { zlib: { level: 9 } });

  await new Promise((resolve, reject) => {
    output.on('close', resolve);
    archive.on('error', reject);
    archive.on('warning', (err) => {
      if (err.code === 'ENOENT') console.warn(err);
      else reject(err);
    });
    archive.pipe(output);
    archive.directory(OUT_DIR, false);
    archive.finalize();
  });

  const zipBytes = fs.statSync(RELEASE_ZIP).size;
  console.log(`  release.zip created (${(zipBytes / 1024).toFixed(1)} KB)`);

  // 6. CRX packaging (optional, requires Google Chrome installed)
  await packCrx();

  console.log('\nBuild complete!');
  console.log(`  release.zip → ${RELEASE_ZIP}`);
  if (fs.existsSync(CRX_FILE)) {
    const crxKB = (fs.statSync(CRX_FILE).size / 1024).toFixed(1);
    console.log(`  .crx        → ${CRX_FILE} (${crxKB} KB)`);
  }
}

/**
 * Packs the dist/ directory into a signed .crx extension using the system Chrome binary.
 * Generates key.pem on first run (appended to .gitignore automatically).
 * Falls back gracefully if Chrome is not installed.
 */
async function packCrx() {
  console.log('\nAttempting CRX packaging...');

  // Ensure key.pem is in .gitignore
  const gitignorePath = path.join(__dirname, '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    const gi = fs.readFileSync(gitignorePath, 'utf8');
    if (!gi.includes('key.pem')) {
      fs.appendFileSync(gitignorePath, '\n# CRX signing key (NEVER commit this)\nkey.pem\n');
      console.log('  Added key.pem to .gitignore');
    }
  }

  // Find Chrome binary (Windows + Linux + macOS candidates)
  const chromeCandidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  ];
  let chromeBin = null;
  for (const c of chromeCandidates) {
    if (fs.existsSync(c)) { chromeBin = `"${c}"`; break; }
  }
  if (!chromeBin) {
    try { execSync('google-chrome --version', { stdio: 'ignore' }); chromeBin = 'google-chrome'; } catch (_) {}
  }
  if (!chromeBin) {
    try { execSync('chromium --version', { stdio: 'ignore' }); chromeBin = 'chromium'; } catch (_) {}
  }

  if (!chromeBin) {
    console.log('  ⚠ Chrome not found. Skipping CRX packaging.');
    console.log('    To pack manually (run in CMD as admin):');
    console.log('    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --pack-extension=dist --pack-extension-key=key.pem');
    return;
  }

  // First run: generate key by packing without specifying one (Chrome auto-generates)
  if (!fs.existsSync(KEY_FILE)) {
    console.log('  Generating new key.pem (first-time setup)...');
    spawnSync(chromeBin, [`--pack-extension=${OUT_DIR}`], {
      shell: true,
      encoding: 'utf8'
    });
    const autoPem = OUT_DIR + '.pem';
    if (fs.existsSync(autoPem)) {
      fs.renameSync(autoPem, KEY_FILE);
      console.log(`  key.pem saved to: ${KEY_FILE}`);
    }
    // Clean up any .crx Chrome may have produced in the first pass
    const autoTmpCrx = OUT_DIR + '.crx';
    if (fs.existsSync(autoTmpCrx)) fs.unlinkSync(autoTmpCrx);
  }

  // Pack with the saved key
  spawnSync(chromeBin, [
    `--pack-extension=${OUT_DIR}`,
    `--pack-extension-key=${KEY_FILE}`
  ], { shell: true, encoding: 'utf8' });

  // Chrome writes the .crx next to the dist folder, move it into dist/
  const autoOutCrx = OUT_DIR + '.crx';
  if (fs.existsSync(autoOutCrx)) {
    fs.renameSync(autoOutCrx, CRX_FILE);
    console.log(`  ✓ CRX packed successfully`);
  } else {
    console.log('  ⚠ CRX not produced — Chrome may have printed an error above.');
  }
}

build().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});
