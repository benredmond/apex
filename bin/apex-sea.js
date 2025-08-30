#!/usr/bin/env node

/**
 * APEX Single Executable Application Entry Point
 * 
 * This file serves as the entry point for the compiled binary.
 * For SEA compatibility, we'll spawn the main process instead of using dynamic imports.
 */

const { spawn } = require('child_process');
const path = require('path');

// Set up environment for bundled execution
process.env.APEX_BINARY_MODE = 'true';

// Get the path to the main CLI (relative to where this will be executed from)
const cliPath = path.join(__dirname, '..', 'src', 'cli', 'apex.js');

// Spawn the main CLI process
const child = spawn(process.execPath, [cliPath, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: process.env
});

child.on('exit', (code) => {
  process.exit(code || 0);
});

child.on('error', (err) => {
  console.error('Failed to start APEX:', err.message);
  process.exit(1);
});