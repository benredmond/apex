#!/usr/bin/env node

/**
 * Build script for creating APEX binaries using pkg
 */

import { execSync } from 'child_process';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

async function buildPkgBinary(platform = process.platform, arch = process.arch) {
  console.log(`🔨 Building APEX binary for ${platform}-${arch}...`);

  try {
    // Step 1: Ensure we have a built dist directory
    console.log('📦 Building TypeScript...');
    execSync('npm run build', { cwd: rootDir, stdio: 'inherit' });

    // Step 2: Bundle CLI for pkg compatibility
    console.log('🔗 Bundling CLI for pkg compatibility...');
    execSync('npm run bundle', { cwd: rootDir, stdio: 'inherit' });

    // Step 3: Define target mapping
    // Note: @yao-pkg/pkg v6.6.0 supports up to node22
    // Using node22 for better compatibility with current Node versions
    const targets = {
      'darwin-x64': 'node22-macos-x64',
      'darwin-arm64': 'node22-macos-arm64',
      'linux-x64': 'node22-linux-x64',
      'linux-arm64': 'node22-linux-arm64',
      'win32-x64': 'node22-win-x64',
      'win32-arm64': 'node22-win-arm64'
    };

    const binaryNames = {
      'darwin-x64': 'apex-darwin-x64',
      'darwin-arm64': 'apex-darwin-arm64',
      'linux-x64': 'apex-linux-x64',
      'linux-arm64': 'apex-linux-arm64',
      'win32-x64': 'apex-win32-x64.exe',
      'win32-arm64': 'apex-win32-arm64.exe'
    };

    const platformKey = `${platform}-${arch}`;
    const target = targets[platformKey];
    const binaryName = binaryNames[platformKey];

    if (!target || !binaryName) {
      throw new Error(`Unsupported platform: ${platformKey}`);
    }

    // Step 4: Create pkg binary
    console.log(`🏗️ Creating binary with pkg for ${target}...`);
    
    const outputPath = path.join(rootDir, 'binaries', binaryName);
    await fs.ensureDir(path.dirname(outputPath));

    // Use @yao-pkg/pkg to create the binary
    const pkgCommand = [
      'npx @yao-pkg/pkg',
      '--target', target,
      '--output', `"${outputPath}"`,
      '--compress', 'GZip',
      '--config', 'pkg.config.json',
      'dist/apex-bundled.cjs'
    ].join(' ');

    execSync(pkgCommand, { cwd: rootDir, stdio: 'inherit' });

    console.log(`✅ Binary created successfully: ${outputPath}`);
    
    // Step 5: Test the binary
    console.log('🧪 Testing binary...');
    try {
      execSync(`"${outputPath}" --version`, { stdio: 'inherit', timeout: 10000 });
      console.log('✅ Binary test passed!');
    } catch (error) {
      console.warn('⚠️ Binary test failed, but binary was created');
      console.warn('This might be normal for cross-platform builds');
    }

  } catch (error) {
    console.error('❌ Failed to build binary:', error.message);
    process.exit(1);
  }
}

async function installPkg() {
  console.log('📦 Installing pkg...');
  try {
    execSync('npm install --save-dev pkg', { cwd: rootDir, stdio: 'inherit' });
  } catch (error) {
    console.error('Failed to install pkg:', error.message);
    throw error;
  }
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--all')) {
    // Build for all platforms
    const platforms = [
      ['darwin', 'x64'],
      ['darwin', 'arm64'],
      ['linux', 'x64'],
      ['linux', 'arm64'],
      ['win32', 'x64'],
      ['win32', 'arm64']
    ];

    for (const [platform, arch] of platforms) {
      await buildPkgBinary(platform, arch);
    }
    return;
  }

  const platform = args[0] || process.platform;
  const arch = args[1] || process.arch;

  // Check if pkg is available
  try {
    execSync('npx pkg --version', { cwd: rootDir, stdio: 'ignore' });
  } catch (error) {
    await installPkg();
  }

  await buildPkgBinary(platform, arch);
}

if (import.meta.url === `file://${__filename}`) {
  main().catch(console.error);
}