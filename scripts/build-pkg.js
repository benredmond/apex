#!/usr/bin/env node

// PKG Binary Build Script
// Uses @yao-pkg/pkg to create cross-platform binaries

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { build } from 'esbuild';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('🔧 Building APEX Binary with pkg...');

async function buildWithPkg() {
  try {
    // Step 1: Build TypeScript to JavaScript
    console.log('📦 Compiling TypeScript...');
    execSync('npm run build', { cwd: rootDir, stdio: 'inherit' });

    // Step 2: Bundle to single CommonJS file with esbuild
    console.log('🎯 Bundling with esbuild...');
    await build({
      entryPoints: [path.join(rootDir, 'src/cli/apex-pkg-entry.js')],
      bundle: true,
      platform: 'node',
      format: 'cjs',
      target: 'node22', // Target Node.js 22 for node:sqlite support
      outfile: path.join(rootDir, 'dist/apex-bundled.cjs'),
      external: [
        // External modules that should not be bundled
        'better-sqlite3', // Will not be used in binary mode
        'node:sqlite',    // Built into Node.js runtime
        'fsevents',       // macOS file watching (optional)
        'chokidar',       // File watching (optional)
        '@parcel/watcher' // Another file watcher (optional)
      ],
      banner: {
        js: '// APEX Binary Bundle - Generated with esbuild for pkg'
      },
      inject: [path.join(__dirname, 'import-meta-shim.js')],
      define: {
        'import.meta.url': 'importMetaUrl'
      },
      minify: false, // Don't minify for better debugging
      sourcemap: false,
    });

    // Step 3: Create a pkg entry point that handles initialization properly
    console.log('📝 Creating pkg entry point...');
    const pkgEntryContent = `#!/usr/bin/env node

// PKG Entry Point for APEX
// This file serves as the entry point for pkg binaries

// Set environment variable to indicate binary mode
process.env.APEX_BINARY_MODE = "true";

// Handle uncaught exceptions gracefully
process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});

// Import and run the bundled CLI
const { program } = require("./apex-bundled.cjs");

// Parse command line arguments
program.parseAsync(process.argv)
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("CLI Error:", error);
    process.exit(1);
  });
`;

    writeFileSync(
      path.join(rootDir, 'dist/apex-pkg-main.js'),
      pkgEntryContent
    );

    // Step 4: Run pkg to create binaries
    console.log('📦 Creating binaries with pkg...');
    
    // Create binaries directory if it doesn't exist
    mkdirSync(path.join(rootDir, 'binaries'), { recursive: true });

    // Build for current platform only (faster for testing)
    const platform = process.platform;
    const arch = process.arch;
    const target = `node22-${platform}-${arch}`;
    
    console.log(`🎯 Building for target: ${target}`);
    
    const pkgCmd = `npx @yao-pkg/pkg dist/apex-pkg-main.js --target ${target} --output binaries/apex-${platform}-${arch} --compress GZip`;
    
    execSync(pkgCmd, { cwd: rootDir, stdio: 'inherit' });

    console.log('✅ Binary built successfully!');
    console.log(`📍 Output: binaries/apex-${platform}-${arch}`);
    
    // Step 5: Test the binary
    console.log('🧪 Testing binary...');
    try {
      const testOutput = execSync(`binaries/apex-${platform}-${arch} --version`, { 
        cwd: rootDir, 
        encoding: 'utf8',
        timeout: 5000 
      });
      console.log(`✅ Binary test passed: ${testOutput.trim()}`);
    } catch (error) {
      console.error('❌ Binary test failed:', error.message);
      // Don't exit with error - binary might still work
      console.log('⚠️ Binary created but test failed. You may need to sign it on macOS.');
      console.log('Run: codesign -s - binaries/apex-darwin-arm64');
    }

  } catch (error) {
    console.error('❌ Build failed:', error);
    process.exit(1);
  }
}

buildWithPkg();