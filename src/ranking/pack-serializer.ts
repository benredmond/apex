import { gzip } from 'zlib';
import { promisify } from 'util';
import { PatternPack } from './types.js';

const gzipAsync = promisify(gzip);

/**
 * PackSerializer - Handles JSON serialization with minification
 * Produces canonical, minified JSON and optional compression metrics
 */
export class PackSerializer {
  /**
   * Serialize PatternPack to minified JSON
   */
  serialize(pack: PatternPack): string {
    // Sort keys recursively for canonical output
    const canonical = this.canonicalize(pack);
    
    // Minify (no whitespace)
    return JSON.stringify(canonical);
  }

  /**
   * Serialize with pretty printing (for debugging)
   */
  serializePretty(pack: PatternPack): string {
    const canonical = this.canonicalize(pack);
    return JSON.stringify(canonical, null, 2);
  }

  /**
   * Get size metrics including optional gzip
   */
  async getMetrics(
    pack: PatternPack
  ): Promise<{
    json: string;
    bytes: number;
    gzipBytes?: number;
  }> {
    const json = this.serialize(pack);
    const bytes = Buffer.byteLength(json, 'utf8');
    
    // Calculate gzip size for monitoring (not used for budget)
    let gzipBytes: number | undefined;
    try {
      const compressed = await gzipAsync(json, { level: 1 });
      gzipBytes = compressed.length;
    } catch (error) {
      // Gzip is optional, ignore errors
    }
    
    return { json, bytes, gzipBytes };
  }

  /**
   * Recursively sort object keys for canonical representation
   */
  private canonicalize(obj: any): any {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.canonicalize(item));
    }
    
    // Sort object keys
    const sorted: any = {};
    const keys = Object.keys(obj).sort();
    
    for (const key of keys) {
      sorted[key] = this.canonicalize(obj[key]);
    }
    
    return sorted;
  }

  /**
   * Calculate size of a value when serialized
   */
  estimateSize(value: any): number {
    // Quick estimation without full serialization
    if (value === null) return 4; // "null"
    if (typeof value === 'boolean') return value ? 4 : 5; // "true" or "false"
    if (typeof value === 'number') return value.toString().length;
    if (typeof value === 'string') return value.length + 2; // +2 for quotes
    
    if (Array.isArray(value)) {
      let size = 2; // brackets
      for (let i = 0; i < value.length; i++) {
        if (i > 0) size += 1; // comma
        size += this.estimateSize(value[i]);
      }
      return size;
    }
    
    if (typeof value === 'object') {
      let size = 2; // braces
      const keys = Object.keys(value);
      for (let i = 0; i < keys.length; i++) {
        if (i > 0) size += 1; // comma
        size += keys[i].length + 3; // "key":
        size += this.estimateSize(value[keys[i]]);
      }
      return size;
    }
    
    return 0;
  }
}