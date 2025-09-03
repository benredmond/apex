/**
 * Subprocess Runner Helper
 * [PAT:AUTO:nYDVmugt] ★★★★★ - Subprocess isolation for Jest ESM module linking issues
 * 
 * This helper provides a reusable pattern for running tests in isolated Node.js
 * subprocesses to avoid Jest's "module is already linked" error.
 */

import { spawn } from 'child_process';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface RunScriptOptions {
  /**
   * Additional environment variables to pass to the subprocess
   */
  env?: Record<string, string>;
  
  /**
   * Timeout in milliseconds (default: 15000)
   */
  timeout?: number;
  
  /**
   * Whether to print stdout/stderr for debugging (default: false)
   */
  debug?: boolean;
}

/**
 * Run a script in an isolated Node.js subprocess
 * 
 * The script should output "SUCCESS" to stdout when tests pass,
 * or "FAIL: <reason>" when tests fail.
 * 
 * @param scriptPath - Path to the .mjs script to execute
 * @param options - Optional configuration
 * @returns Promise that resolves to true if script succeeds, false if it fails
 */
export async function runScript(
  scriptPath: string, 
  options: RunScriptOptions = {}
): Promise<boolean> {
  const { 
    env = {}, 
    timeout = 15000, 
    debug = false 
  } = options;

  return new Promise((resolve, reject) => {
    const proc = spawn('node', [scriptPath], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        NODE_PATH: path.join(__dirname, '../../node_modules'),
        ...env
      }
    });
    
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    
    // Set timeout
    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill('SIGTERM');
      reject(new Error(`Script timed out after ${timeout}ms`));
    }, timeout);
    
    proc.stdout.on('data', (data) => {
      const output = data.toString();
      stdout += output;
      if (debug) {
        console.log('[subprocess stdout]:', output);
      }
    });
    
    proc.stderr.on('data', (data) => {
      const output = data.toString();
      stderr += output;
      if (debug) {
        console.error('[subprocess stderr]:', output);
      }
    });
    
    proc.on('close', (code) => {
      clearTimeout(timer);
      
      if (timedOut) {
        return; // Already rejected due to timeout
      }
      
      if (code === 0 && stdout.includes('SUCCESS')) {
        resolve(true);
      } else if (stdout.includes('FAIL:')) {
        // Extract failure reason
        const failMatch = stdout.match(/FAIL:\s*(.+)/);
        const reason = failMatch ? failMatch[1] : 'Unknown reason';
        reject(new Error(`Test failed: ${reason}`));
      } else if (code !== 0) {
        reject(new Error(`Process exited with code ${code}: ${stderr || stdout}`));
      } else {
        reject(new Error(`Script failed: ${stderr || stdout}`));
      }
    });
    
    proc.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

/**
 * Helper to generate import paths for scripts
 */
export function getImportPath(modulePath: string): string {
  return path.resolve(__dirname, '../..', modulePath).replace(/\\/g, '/');
}

/**
 * Helper to generate database initialization code for scripts with debug logging
 */
export function generateDatabaseInit(dbPath: string): string {
  return `
    // Initialize database with migrations
    const { AutoMigrator } = await import("${getImportPath('dist/migrations/auto-migrator.js')}");
    const migrator = new AutoMigrator("${dbPath}");
    const migrationSuccess = await migrator.autoMigrate({ silent: true });
    
    if (!migrationSuccess) {
      console.log("FAIL: Migration failed");
      process.exit(1);
    }
    
    // Create missing facet tables that are needed for repository operations
    // [PAT:ADAPTER:DELEGATION] ★★★★☆ - Use DatabaseAdapterFactory for compatibility
    const { DatabaseAdapterFactory } = await import("${getImportPath('dist/storage/database-adapter.js')}");
    const adapter = await DatabaseAdapterFactory.create("${dbPath}");
    const fixDb = adapter.getInstance();
    
    console.log("[DEBUG] Creating missing facet tables");
    
    // Create missing facet tables with proper schema
    const facetTableSQL = [
      \`CREATE TABLE IF NOT EXISTS pattern_languages (
        pattern_id TEXT NOT NULL,
        lang TEXT NOT NULL,
        PRIMARY KEY (pattern_id, lang),
        FOREIGN KEY (pattern_id) REFERENCES patterns(id) ON DELETE CASCADE
      )\`,
      \`CREATE TABLE IF NOT EXISTS pattern_frameworks (
        pattern_id TEXT NOT NULL,
        framework TEXT NOT NULL,
        semver TEXT,
        PRIMARY KEY (pattern_id, framework),
        FOREIGN KEY (pattern_id) REFERENCES patterns(id) ON DELETE CASCADE
      )\`,
      \`CREATE TABLE IF NOT EXISTS pattern_paths (
        pattern_id TEXT NOT NULL,
        glob TEXT NOT NULL,
        PRIMARY KEY (pattern_id, glob),
        FOREIGN KEY (pattern_id) REFERENCES patterns(id) ON DELETE CASCADE
      )\`,
      \`CREATE TABLE IF NOT EXISTS pattern_repos (
        pattern_id TEXT NOT NULL,
        repo_glob TEXT NOT NULL,
        PRIMARY KEY (pattern_id, repo_glob),
        FOREIGN KEY (pattern_id) REFERENCES patterns(id) ON DELETE CASCADE
      )\`,
      \`CREATE TABLE IF NOT EXISTS pattern_task_types (
        pattern_id TEXT NOT NULL,
        task_type TEXT NOT NULL,
        PRIMARY KEY (pattern_id, task_type),
        FOREIGN KEY (pattern_id) REFERENCES patterns(id) ON DELETE CASCADE
      )\`,
      \`CREATE TABLE IF NOT EXISTS pattern_envs (
        pattern_id TEXT NOT NULL,
        env TEXT NOT NULL,
        PRIMARY KEY (pattern_id, env),
        FOREIGN KEY (pattern_id) REFERENCES patterns(id) ON DELETE CASCADE
      )\`
    ];
    
    for (const sql of facetTableSQL) {
      try {
        fixDb.exec(sql);
      } catch (error) {
        console.log(\`[DEBUG] Error creating facet table: \${error.message}\`);
      }
    }
    
    adapter.close();
    console.log("[DEBUG] Facet tables creation completed");

    // Minimal debug logging for database state
    console.log("[DEBUG] Database initialized at:", "${dbPath}");
    console.log("[DEBUG] Database diagnostics complete - reduced to avoid connection conflicts");
  `;
}