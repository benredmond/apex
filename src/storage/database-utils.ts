/**
 * Database utility functions for robust SQLite operations
 */

import type { DatabaseAdapter } from "./database-adapter.js";

const DEFAULT_MAX_RETRIES = 5;
const DEFAULT_RETRY_DELAY = 100; // ms

export interface RetryOptions {
  maxRetries?: number;
  retryDelay?: number;
  exponentialBackoff?: boolean;
}

/**
 * Execute a database operation with retry logic for SQLITE_BUSY errors
 * 
 * @param operation The database operation to execute
 * @param options Retry configuration options
 * @returns The result of the operation
 */
export async function withRetry<T>(
  operation: () => T,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = DEFAULT_MAX_RETRIES,
    retryDelay = DEFAULT_RETRY_DELAY,
    exponentialBackoff = true
  } = options;
  
  let lastError: Error | undefined;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return operation();
    } catch (error: any) {
      lastError = error;
      
      // Check if this is a SQLITE_BUSY error
      const isBusyError = 
        error.code === 'SQLITE_BUSY' ||
        error.message?.includes('database is locked') ||
        error.message?.includes('SQLITE_BUSY');
      
      if (!isBusyError || attempt === maxRetries - 1) {
        // Not a busy error or last attempt - throw immediately
        throw error;
      }
      
      // Calculate delay with optional exponential backoff
      const delay = exponentialBackoff 
        ? retryDelay * Math.pow(2, attempt)
        : retryDelay;
      
      // Log retry attempt
      if (process.env.APEX_DEBUG) {
        console.error(
          `[Database] SQLITE_BUSY - Retry ${attempt + 1}/${maxRetries} after ${delay}ms`
        );
      }
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  // Should never reach here, but TypeScript needs this
  throw lastError || new Error('Retry logic failed unexpectedly');
}

/**
 * Execute a transaction with retry logic
 * 
 * @param db The database adapter
 * @param operation The transaction operation
 * @param options Retry configuration options
 * @returns The result of the transaction
 */
export async function transactionWithRetry<T>(
  db: DatabaseAdapter,
  operation: () => T,
  options: RetryOptions = {}
): Promise<T> {
  return withRetry(() => {
    const transaction = db.transaction(operation);
    return transaction();
  }, options);
}

/**
 * Check if a table exists in the database
 * 
 * @param db The database adapter
 * @param tableName The name of the table to check
 * @returns True if the table exists
 */
export function tableExists(
  db: DatabaseAdapter,
  tableName: string
): boolean {
  const result = db.prepare(`
    SELECT name FROM sqlite_master 
    WHERE type = 'table' AND name = ?
  `).get(tableName);
  
  return result !== undefined;
}

/**
 * Check if a trigger exists in the database
 * 
 * @param db The database adapter
 * @param triggerName The name of the trigger to check
 * @returns True if the trigger exists
 */
export function triggerExists(
  db: DatabaseAdapter,
  triggerName: string
): boolean {
  const result = db.prepare(`
    SELECT name FROM sqlite_master 
    WHERE type = 'trigger' AND name = ?
  `).get(triggerName);
  
  return result !== undefined;
}

/**
 * Safely drop a trigger if it exists
 * 
 * @param db The database adapter
 * @param triggerName The name of the trigger to drop
 */
export function dropTriggerIfExists(
  db: DatabaseAdapter,
  triggerName: string
): void {
  db.exec(`DROP TRIGGER IF EXISTS ${triggerName}`);
}

/**
 * Get database pragma value
 * 
 * @param db The database adapter
 * @param pragma The pragma name
 * @returns The pragma value
 */
export function getPragma(
  db: DatabaseAdapter,
  pragma: string
): any {
  return db.pragma(pragma);
}

/**
 * Set database pragma value with error handling
 * 
 * @param db The database adapter
 * @param pragma The pragma name
 * @param value The pragma value
 */
export function setPragma(
  db: DatabaseAdapter,
  pragma: string,
  value: any
): void {
  try {
    db.pragma(`${pragma} = ${value}`);
  } catch (error) {
    console.error(`Failed to set pragma ${pragma}:`, error);
    // Don't throw - some pragmas might not be available
  }
}