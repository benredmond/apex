/**
 * BudgetManager - Tracks byte-level size during PatternPack construction
 * Implements incremental tracking to avoid O(n²) serialization complexity
 */
export class BudgetManager {
  private budget: number;
  private used: number = 0;
  private approximateMode: boolean = true;
  private validationInterval: number = 10;
  private operationCount: number = 0;

  constructor(budget: number = 8192) {
    this.budget = budget;
  }

  /**
   * Add bytes to the running total
   */
  addBytes(bytes: number): void {
    this.used += bytes;
    this.operationCount++;
  }

  /**
   * Calculate string size in JSON (includes quotes)
   */
  stringSize(str: string): number {
    return str.length + 2; // +2 for quotes
  }

  /**
   * Calculate field size in JSON object
   */
  fieldSize(key: string, value: string | number | boolean): number {
    let size = this.stringSize(key) + 1; // +1 for colon
    
    if (typeof value === 'string') {
      size += this.stringSize(value);
    } else if (typeof value === 'number') {
      size += value.toString().length;
    } else if (typeof value === 'boolean') {
      size += value ? 4 : 5; // "true" or "false"
    }
    
    return size;
  }

  /**
   * Calculate array overhead
   */
  arrayOverhead(itemCount: number): number {
    return 2 + Math.max(0, itemCount - 1); // brackets + commas
  }

  /**
   * Calculate object overhead
   */
  objectOverhead(fieldCount: number): number {
    return 2 + Math.max(0, fieldCount - 1); // braces + commas
  }

  /**
   * Check if adding bytes would exceed budget
   */
  willFit(bytes: number): boolean {
    return this.used + bytes <= this.budget;
  }

  /**
   * Get remaining bytes in budget
   */
  getRemaining(): number {
    return Math.max(0, this.budget - this.used);
  }

  /**
   * Get current byte usage
   */
  getUsed(): number {
    return this.used;
  }

  /**
   * Get budget limit
   */
  getBudget(): number {
    return this.budget;
  }

  /**
   * Check if validation is needed
   */
  needsValidation(): boolean {
    return this.approximateMode && 
           (this.operationCount % this.validationInterval === 0 ||
            this.getRemaining() < this.budget * 0.1); // or < 10% remaining
  }

  /**
   * Update actual size after validation
   */
  updateActualSize(actualBytes: number): void {
    this.used = actualBytes;
    this.operationCount = 0;
  }

  /**
   * Reset the budget manager
   */
  reset(): void {
    this.used = 0;
    this.operationCount = 0;
  }

  /**
   * Get usage percentage
   */
  getUsagePercent(): number {
    return (this.used / this.budget) * 100;
  }
}