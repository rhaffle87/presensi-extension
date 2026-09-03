const fs = require('fs');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');
const archiver = require('archiver');

const OUT_DIR = path.join(__dirname, 'dist');
const RELEASE_ZIP = path.join(__dirname, 'release.zip');

// Files to copy exactly as they are
const FILES_TO_COPY = [
  'manifest.json',
  'popup.html',
  'compat.js',
  'storage-bridge.js',
  'README.md'
];

// Directories to copy
const DIRS_TO_COPY = [
  'icons',
  'options',
  'lib', // Leaflet map library
  'background' // service-worker.js isn't obfuscated to prevent breaking MV3 registration
];

async function build() {
  console.log('Starting build process...');

  // 1. Clean and create output directory
  if (fs.existsSync(OUT_DIR)) {
    fs.rmSync(OUT_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(OUT_DIR);

  // 2. Obfuscate content.js (The most sensitive script dealing with anti-cheat)
  console.log('Obfuscating content.js...');
  const contentJsRaw = fs.readFileSync(path.join(__dirname, 'content.js'), 'utf8');
  const obfuscatedResult = JavaScriptObfuscator.obfuscate(contentJsRaw, {
    compact: true,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.75,
    deadCodeInjection: true,
    deadCodeInjectionThreshold: 0.4,
    debugProtection: true, // Prevents DevTools opening (stealth)
    debugProtectionInterval: 0,
    disableConsoleOutput: true,
    identifierNamesGenerator: 'hexadecimal',
    log: false,
    numbersToExpressions: true,
    renameGlobals: false,
    selfDefending: true,
    simplify: true,
    splitStrings: true,
    splitStringsChunkLength: 10,
    stringArray: true,
    stringArrayCallsTransform: true,
    stringArrayCallsTransformThreshold: 0.5,
    stringArrayEncoding: ['base64'],
    stringArrayIndexShift: true,
    stringArrayRotate: true,
    stringArrayShuffle: true,
    stringArrayWrappersCount: 1,
    stringArrayWrappersChainedCalls: true,
    stringArrayWrappersParametersMaxCount: 2,
    stringArrayWrappersType: 'variable',
    stringArrayThreshold: 0.75,
    unicodeEscapeSequence: false
  });
  
  fs.writeFileSync(path.join(OUT_DIR, 'content.js'), obfuscatedResult.getObfuscatedCode());

  // 2.5. Obfuscate popup.js (Less aggressive to avoid breaking Chrome Extension UI APIs)
  console.log('Obfuscating popup.js...');
  const popupJsRaw = fs.readFileSync(path.join(__dirname, 'popup.js'), 'utf8');
  const obfuscatedPopup = JavaScriptObfuscator.obfuscate(popupJsRaw, {
    compact: true,
    controlFlowFlattening: false, // Too heavy for UI
    deadCodeInjection: false,     // Too heavy for UI
    debugProtection: false,       // Will break extension popup
    disableConsoleOutput: true,
    identifierNamesGenerator: 'hexadecimal',
    log: false,
    numbersToExpressions: true,
    renameGlobals: false,
    simplify: true,
    stringArray: true,
    stringArrayEncoding: ['base64'],
    stringArrayWrappersType: 'variable',
    unicodeEscapeSequence: false
  });
  
  fs.writeFileSync(path.join(OUT_DIR, 'popup.js'), obfuscatedPopup.getObfuscatedCode());

  // 3. Copy other files
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

  // 5. Zip it up for GitHub Releases
  console.log('Packaging release.zip...');
  const output = fs.createWriteStream(RELEASE_ZIP);
  const archive = archiver('zip', { zlib: { level: 9 } });

  output.on('close', function() {
    console.log(`Build complete! release.zip created (${archive.pointer()} bytes)`);
  });

  archive.on('warning', function(err) {
    if (err.code === 'ENOENT') console.warn(err);
    else throw err;
  });

  archive.on('error', function(err) {
    throw err;
  });

  archive.pipe(output);
  archive.directory(OUT_DIR, false);
  await archive.finalize();
}

build().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});
