#!/usr/bin/env node

// SEA (Single Executable Application) Build Script
// Replaces pkg-based binary compilation with Node.js SEA approach

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, copyFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { build } from 'esbuild';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('🔧 Building APEX SEA Binary...');

async function buildSEA() {
  try {
    // Step 1: Build TypeScript to JavaScript
    console.log('📦 Compiling TypeScript...');
    execSync('npm run build', { cwd: rootDir, stdio: 'inherit' });

    // Step 2: Bundle to single CommonJS file with esbuild
    console.log('🎯 Bundling with esbuild...');
    await build({
      entryPoints: [path.join(rootDir, 'src/cli/apex-sea-entry.js')],
      bundle: true,
      platform: 'node',
      format: 'cjs',
      target: 'node20', // Match Node.js runtime
      outfile: path.join(rootDir, 'dist/apex-bundled.cjs'),
      external: [
        // External modules that should not be bundled
        'better-sqlite3', // Will not be used in SEA mode
        'node:sqlite'     // Built into Node.js runtime
      ],
      banner: {
        js: '// APEX SEA Bundle - Generated with esbuild'
      },
      minify: true,
      sourcemap: false,
    });

    // Step 3: Generate SEA configuration
    console.log('⚙️ Generating SEA configuration...');
    const seaConfig = {
      main: 'dist/apex-bundled.cjs',
      output: 'sea-prep.blob',
      disableExperimentalSEAWarning: true,
      useSnapshot: false,
      useCodeCache: true
    };

    writeFileSync(
      path.join(rootDir, 'sea-config.json'), 
      JSON.stringify(seaConfig, null, 2)
    );

    // Step 4: Generate SEA blob
    console.log('🫧 Generating SEA blob...');
    execSync(
      'node --experimental-sea-config sea-config.json',
      { cwd: rootDir, stdio: 'inherit' }
    );

    // Step 5: Copy Node.js binary
    console.log('📋 Copying Node.js binary...');
    const platform = process.platform;
    const binaryName = platform === 'win32' ? 'apex.exe' : 'apex';
    const nodePath = process.execPath;
    const outputPath = path.join(rootDir, 'binaries', `apex-${platform}-${process.arch}`);
    
    copyFileSync(nodePath, outputPath);

    // Step 6: Inject SEA blob into binary
    console.log('💉 Injecting SEA blob...');
    
    // Check if postject is available
    try {
      execSync('which postject', { stdio: 'pipe' });
    } catch (error) {
      console.error('❌ postject not found. Install with: npm install -g postject');
      process.exit(1);
    }

    const postjectCmd = `postject "${outputPath}" NODE_SEA_BLOB sea-prep.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2`;
    execSync(postjectCmd, { cwd: rootDir, stdio: 'inherit' });

    // Step 7: Make binary executable (Unix systems)
    if (platform !== 'win32') {
      execSync(`chmod +x "${outputPath}"`);
    }

    console.log('✅ SEA binary built successfully!');
    console.log(`📍 Output: ${outputPath}`);
    
    // Step 8: Test the binary
    console.log('🧪 Testing binary...');
    try {
      const testOutput = execSync(`"${outputPath}" --version`, { 
        cwd: rootDir, 
        encoding: 'utf8',
        timeout: 10000 
      });
      console.log(`✅ Binary test passed: ${testOutput.trim()}`);
    } catch (error) {
      console.error('❌ Binary test failed:', error.message);
      process.exit(1);
    }

  } catch (error) {
    console.error('❌ SEA build failed:', error);
    process.exit(1);
  }
}

// Run the build
buildSEA();