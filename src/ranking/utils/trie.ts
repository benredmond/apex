export class PathTrieNode {
  children: Map<string, PathTrieNode> = new Map();
  patternIds: Set<number> = new Set();
  isGlob: boolean = false;
}

export class PathTrie {
  root: PathTrieNode = new PathTrieNode();
  
  insert(path: string, patternId: number): void {
    const tokens = this.tokenizePath(path);
    let node = this.root;
    
    for (const token of tokens) {
      if (!node.children.has(token)) {
        node.children.set(token, new PathTrieNode());
      }
      node = node.children.get(token)!;
      
      // Mark glob tokens
      if (token.includes('*') || token.includes('?')) {
        node.isGlob = true;
      }
    }
    
    node.patternIds.add(patternId);
  }
  
  findCandidates(path: string): Set<number> {
    const tokens = this.tokenizePath(path);
    const candidates = new Set<number>();
    
    // Traverse trie to find matching patterns
    this.traverse(this.root, tokens, 0, candidates);
    
    return candidates;
  }
  
  private traverse(
    node: PathTrieNode,
    tokens: string[],
    tokenIndex: number,
    candidates: Set<number>
  ): void {
    // Add all pattern IDs at this node
    for (const id of node.patternIds) {
      candidates.add(id);
    }
    
    if (tokenIndex >= tokens.length) {
      return;
    }
    
    const currentToken = tokens[tokenIndex];
    
    // Exact match
    if (node.children.has(currentToken)) {
      this.traverse(
        node.children.get(currentToken)!,
        tokens,
        tokenIndex + 1,
        candidates
      );
    }
    
    // Check glob patterns
    for (const [childToken, childNode] of node.children) {
      if (childNode.isGlob && this.matchGlobToken(childToken, currentToken)) {
        this.traverse(childNode, tokens, tokenIndex + 1, candidates);
      }
      
      // Handle ** (match any depth)
      if (childToken === '**') {
        // Match zero directories
        this.traverse(childNode, tokens, tokenIndex, candidates);
        // Match one or more directories
        for (let i = tokenIndex; i < tokens.length; i++) {
          this.traverse(childNode, tokens, i + 1, candidates);
        }
      }
    }
  }
  
  private tokenizePath(path: string): string[] {
    // Normalize and split path
    const normalized = path.toLowerCase().replace(/\\/g, '/');
    const tokens = normalized.split('/').filter(t => t.length > 0);
    
    // Also split on dots for file extensions
    const result: string[] = [];
    for (const token of tokens) {
      if (token.includes('.') && !token.startsWith('.')) {
        const parts = token.split('.');
        result.push(parts[0]); // filename
        for (let i = 1; i < parts.length; i++) {
          result.push('.' + parts[i]); // extensions
        }
      } else {
        result.push(token);
      }
    }
    
    return result;
  }
  
  private matchGlobToken(pattern: string, token: string): boolean {
    // Simple glob matching for * and ?
    if (pattern === '*') return true;
    
    let regex = pattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
      
    return new RegExp(`^${regex}$`).test(token);
  }
}