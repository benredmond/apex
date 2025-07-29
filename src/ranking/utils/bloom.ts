export class BloomFilter {
  private bits: Uint8Array;
  private size: number;
  private hashCount: number;
  
  constructor(expectedItems: number = 100, falsePositiveRate: number = 0.1) {
    // Calculate optimal size and hash count
    this.size = Math.ceil(-expectedItems * Math.log(falsePositiveRate) / (Math.log(2) ** 2));
    this.hashCount = Math.ceil(this.size / expectedItems * Math.log(2));
    
    // Round up to nearest byte
    const byteSize = Math.ceil(this.size / 8);
    this.bits = new Uint8Array(byteSize);
  }
  
  add(item: string): void {
    const hashes = this.getHashes(item);
    for (const hash of hashes) {
      const index = hash % this.size;
      const byteIndex = Math.floor(index / 8);
      const bitIndex = index % 8;
      this.bits[byteIndex] |= (1 << bitIndex);
    }
  }
  
  contains(item: string): boolean {
    const hashes = this.getHashes(item);
    for (const hash of hashes) {
      const index = hash % this.size;
      const byteIndex = Math.floor(index / 8);
      const bitIndex = index % 8;
      if ((this.bits[byteIndex] & (1 << bitIndex)) === 0) {
        return false;
      }
    }
    return true;
  }
  
  private getHashes(item: string): number[] {
    const hashes: number[] = [];
    
    // Use simple hash functions with different seeds
    for (let i = 0; i < this.hashCount; i++) {
      let hash = i;
      for (let j = 0; j < item.length; j++) {
        hash = ((hash << 5) - hash) + item.charCodeAt(j);
        hash = hash & hash; // Convert to 32-bit integer
      }
      hashes.push(Math.abs(hash));
    }
    
    return hashes;
  }
}

export class PathBloomFilter {
  private filter: BloomFilter;
  
  constructor(paths: string[]) {
    // Estimate tokens from paths
    const estimatedTokens = paths.reduce((sum, path) => {
      return sum + path.split(/[\/.]/).length;
    }, 0);
    
    this.filter = new BloomFilter(estimatedTokens, 0.1);
    
    // Add all path tokens
    for (const path of paths) {
      const tokens = this.tokenizePath(path);
      for (const token of tokens) {
        this.filter.add(token);
      }
    }
  }
  
  mightMatch(path: string): boolean {
    const tokens = this.tokenizePath(path);
    
    // If any token is not in the filter, path cannot match
    for (const token of tokens) {
      if (!this.filter.contains(token)) {
        return false;
      }
    }
    
    return true;
  }
  
  private tokenizePath(path: string): string[] {
    return path.toLowerCase()
      .split(/[\/.]/)
      .filter(t => t.length > 0);
  }
}