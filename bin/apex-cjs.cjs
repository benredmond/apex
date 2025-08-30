#!/usr/bin/env node

/**
 * APEX CommonJS Entry Point for pkg compilation
 * Direct execution approach - no spawning, no dynamic imports
 */

// Set environment flag
process.env.APEX_BINARY_MODE = 'true';

// Try to execute the bundled CLI script directly
const path = require('path');

try {
  // Use bundled CommonJS file for pkg compatibility
  const bundledPath = path.join(__dirname, '..', 'dist', 'apex-bundled.cjs');
  require(bundledPath);
} catch (error) {
  console.error('Failed to start APEX:', error.message);
  if (process.env.DEBUG) {
    console.error('Error Stack:', error.stack);
  }
  process.exit(1);
}