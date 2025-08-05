// Security-first FTS5 query parser and builder
// Based on Gemini architecture review recommendations

export type ASTNodeType = "TERM" | "AND" | "OR" | "NOT" | "PHRASE";

export interface ASTNode {
  type: ASTNodeType;
  value?: string;
  children?: ASTNode[];
}

export interface ParseResult {
  ast: ASTNode;
  ftsQuery: string;
}

export class FTSQueryParser {
  private position = 0;
  private input = "";

  /**
   * Parse user input into a safe FTS5 query
   * Critical for preventing SQL injection
   */
  parse(userInput: string): ParseResult {
    if (!userInput || userInput.trim().length === 0) {
      throw new Error("Query cannot be empty");
    }

    // Limit query length to prevent DoS
    if (userInput.length > 500) {
      throw new Error("Query too long (max 500 characters)");
    }

    this.input = userInput.trim();
    this.position = 0;

    const ast = this.parseExpression();
    const ftsQuery = this.astToFtsQuery(ast);

    return { ast, ftsQuery };
  }

  private parseExpression(): ASTNode {
    const terms: ASTNode[] = [];

    while (this.position < this.input.length) {
      // Skip whitespace
      this.skipWhitespace();

      if (this.position >= this.input.length) break;

      // Check for operators
      if (this.consumeKeyword("AND")) {
        // Handle explicit AND
        continue;
      } else if (this.consumeKeyword("OR")) {
        // For MVP, treat OR as separate terms (FTS5 default behavior)
        continue;
      } else if (this.consumeKeyword("NOT")) {
        // Parse NOT expression
        const term = this.parseTerm();
        terms.push({
          type: "NOT",
          children: [term],
        });
      } else {
        // Parse regular term
        terms.push(this.parseTerm());
      }
    }

    // If multiple terms, combine with implicit AND
    if (terms.length === 0) {
      throw new Error("No valid search terms found");
    } else if (terms.length === 1) {
      return terms[0];
    } else {
      return {
        type: "AND",
        children: terms,
      };
    }
  }

  private parseTerm(): ASTNode {
    this.skipWhitespace();

    if (this.position >= this.input.length) {
      throw new Error("Unexpected end of query");
    }

    // Check for quoted phrase
    if (this.input[this.position] === '"') {
      return this.parsePhrase();
    }

    // Parse word
    return this.parseWord();
  }

  private parsePhrase(): ASTNode {
    const startPos = this.position;
    this.position++; // Skip opening quote

    let phrase = "";
    while (
      this.position < this.input.length &&
      this.input[this.position] !== '"'
    ) {
      phrase += this.input[this.position];
      this.position++;
    }

    if (this.position >= this.input.length) {
      throw new Error("Unclosed quote in query");
    }

    this.position++; // Skip closing quote

    if (phrase.length === 0) {
      throw new Error("Empty phrase not allowed");
    }

    return {
      type: "PHRASE",
      value: phrase,
    };
  }

  private parseWord(): ASTNode {
    let word = "";

    while (
      this.position < this.input.length &&
      !this.isWordBoundary(this.input[this.position])
    ) {
      word += this.input[this.position];
      this.position++;
    }

    if (word.length === 0) {
      throw new Error("Empty term not allowed");
    }

    // Validate term doesn't contain dangerous characters
    if (this.containsDangerousChars(word)) {
      throw new Error("Invalid characters in search term");
    }

    return {
      type: "TERM",
      value: word,
    };
  }

  private skipWhitespace(): void {
    while (
      this.position < this.input.length &&
      /\s/.test(this.input[this.position])
    ) {
      this.position++;
    }
  }

  private isWordBoundary(char: string): boolean {
    return /[\s"()]/.test(char);
  }

  private consumeKeyword(keyword: string): boolean {
    const savedPos = this.position;
    this.skipWhitespace();

    const upperKeyword = keyword.toUpperCase();
    const remainingInput = this.input.slice(this.position).toUpperCase();

    if (remainingInput.startsWith(upperKeyword)) {
      // Check if followed by word boundary
      const afterKeyword = this.position + keyword.length;
      if (
        afterKeyword >= this.input.length ||
        this.isWordBoundary(this.input[afterKeyword])
      ) {
        this.position += keyword.length;
        return true;
      }
    }

    this.position = savedPos;
    return false;
  }

  private containsDangerousChars(term: string): boolean {
    // Block SQL injection attempts
    const dangerous = /[;'`\\]|--|\*\/|\/\*/;
    return dangerous.test(term);
  }

  /**
   * Convert AST to safe FTS5 query string
   * Critical: This is where we ensure safety
   */
  astToFtsQuery(node: ASTNode): string {
    switch (node.type) {
      case "TERM":
        // Escape quotes for FTS5 safety
        const sanitized = node.value!.replace(/"/g, '""');
        return `"${sanitized}"`;

      case "PHRASE":
        // Phrases are already extracted safely
        const phraseEscaped = node.value!.replace(/"/g, '""');
        return `"${phraseEscaped}"`;

      case "AND":
        // FTS5 implicit AND between terms
        return node
          .children!.map((child) => this.astToFtsQuery(child))
          .join(" ");

      case "OR":
        // FTS5 OR syntax
        return `(${node.children!.map((child) => this.astToFtsQuery(child)).join(" OR ")})`;

      case "NOT":
        // FTS5 NOT syntax
        return `NOT ${this.astToFtsQuery(node.children![0])}`;

      default:
        throw new Error(`Unknown AST node type: ${node.type}`);
    }
  }
}

/**
 * Convenience function for safe FTS5 query building
 */
export function sanitizeFtsQuery(userInput: string): string {
  const parser = new FTSQueryParser();
  const result = parser.parse(userInput);
  return result.ftsQuery;
}

/**
 * Build a compound FTS5 query from multiple fields
 */
export function buildCompoundFtsQuery(fields: Record<string, string>): string {
  const parser = new FTSQueryParser();
  const queries: string[] = [];

  for (const [field, value] of Object.entries(fields)) {
    if (value && value.trim()) {
      try {
        const sanitized = parser.parse(value.trim()).ftsQuery;
        // Column-specific search in FTS5
        queries.push(`${field}:${sanitized}`);
      } catch (err) {
        // Skip invalid field queries
        console.warn(`Skipping invalid query for field ${field}: ${err}`);
      }
    }
  }

  return queries.join(" ");
}
