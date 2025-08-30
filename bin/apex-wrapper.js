#!/usr/bin/env node

/**
 * APEX Binary Wrapper
 * 
 * This wrapper script:
 * 1. Detects the current platform
 * 2. Attempts to execute the appropriate pre-compiled binary
 * 3. Falls back to the Node.js version if binary is not available
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import path from 'path';
import process from 'process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Platform detection
const platform = process.platform;
const arch = process.arch;

// Map platform/arch to binary names
const binaryMap = {
  'darwin-x64': 'apex-darwin-x64',
  'darwin-arm64': 'apex-darwin-arm64',
  'linux-x64': 'apex-linux-x64',
  'linux-arm64': 'apex-linux-arm64',
  'win32-x64': 'apex-win32-x64.exe',
  'win32-arm64': 'apex-win32-arm64.exe'
};

const platformKey = `${platform}-${arch}`;
const binaryName = binaryMap[platformKey];

async function executeBinary() {
  // Skip binary execution if APEX_FORCE_JS environment variable is set
  if (process.env.APEX_FORCE_JS === '1') {
    return false;
  }

  if (!binaryName) {
    return false;
  }

  const binaryPath = path.join(__dirname, '..', 'binaries', binaryName);
  
  if (!existsSync(binaryPath)) {
    return false;
  }

  return new Promise((resolve, reject) => {
    const child = spawn(binaryPath, process.argv.slice(2), {
      stdio: 'inherit',
      env: process.env
    });

    child.on('exit', (code) => {
      process.exit(code || 0);
    });

    child.on('error', (err) => {
      // If binary execution fails, we'll fall back to JS
      resolve(false);
    });

    // If we get here, binary started successfully
    resolve(true);
  });
}

async function executeJavaScript() {
  // Fallback to the current JavaScript implementation
  const jsEntryPoint = path.join(__dirname, '..', 'src', 'cli', 'apex.js');
  
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [jsEntryPoint, ...process.argv.slice(2)], {
      stdio: 'inherit',
      env: process.env
    });

    child.on('exit', (code) => {
      process.exit(code || 0);
    });

    child.on('error', (err) => {
      console.error('Failed to execute APEX:', err.message);
      process.exit(1);
    });
  });
}

async function main() {
  // Try binary first
  const binaryExecuted = await executeBinary();
  
  if (!binaryExecuted) {
    // Fall back to JavaScript
    await executeJavaScript();
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled promise rejection:', reason);
  process.exit(1);
});

main().catch((err) => {
  console.error('Error executing APEX:', err);
  process.exit(1);
});