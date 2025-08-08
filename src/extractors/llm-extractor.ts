import { spawn } from "child_process";
import { LLMExtractionResponseSchema, type BookPattern } from "./schemas.js";

// [ARCH:SECURITY:SPAWN_NO_SHELL] ★★★★★ - Use spawn for subprocess security
// [FIX:ASYNC:UNHANDLED_REJECTION] ★★★★☆ - Comprehensive error handling

export class LLMExtractor {
  private rateLimitDelay = 1000; // Start with 1 second delay
  private maxRetries = 3;
  private lastCallTime = 0;

  /**
   * Extract patterns from chapter text using LLM via secure subprocess
   */
  async extractPatternsFromChapter(
    chapterText: string,
    chapterNumber?: number,
    bookTitle?: string,
  ): Promise<BookPattern[]> {
    // Rate limiting
    await this.enforceRateLimit();

    const prompt = this.buildExtractionPrompt(
      chapterText,
      chapterNumber,
      bookTitle,
    );

    let attempts = 0;
    let lastError: Error | null = null;

    while (attempts < this.maxRetries) {
      try {
        const response = await this.callLLMSecurely(prompt);
        return this.validateAndParseResponse(response);
      } catch (error) {
        lastError = error as Error;
        attempts++;

        if (attempts < this.maxRetries) {
          console.log(`[LLMExtractor] Attempt ${attempts} failed, retrying...`);
          await this.backoff(attempts);
        }
      }
    }

    throw new Error(
      `[LLMExtractor] Failed after ${this.maxRetries} attempts: ${lastError?.message}`,
    );
  }

  /**
   * Build extraction prompt for LLM
   */
  private buildExtractionPrompt(
    chapterText: string,
    chapterNumber?: number,
    bookTitle?: string,
  ): string {
    const contextInfo =
      chapterNumber && bookTitle
        ? `from Chapter ${chapterNumber} of "${bookTitle}"`
        : "";

    return `Extract reusable code patterns and best practices ${contextInfo}.

Analyze the following text and extract concrete, actionable patterns with code examples.

For each pattern found, provide:
1. A clear, descriptive title
2. A comprehensive description explaining the pattern
3. The category (e.g., NAMING, FUNCTIONS, TESTING, ERROR_HANDLING, etc.)
4. A code example demonstrating the pattern
5. Tags that help categorize the pattern
6. Key insight (what makes this pattern valuable)
7. When to use this pattern
8. Common pitfalls to avoid

Format your response as JSON with this structure:
{
  "patterns": [
    {
      "title": "Use Intention-Revealing Names",
      "description": "Variable and function names should clearly express their purpose",
      "category": "NAMING",
      "code": {
        "language": "javascript",
        "snippet": "// Good\\nconst elapsedTimeInDays = ...;\\n\\n// Bad\\nconst d = ...;",
        "context": "Variable naming in time calculations"
      },
      "tags": ["naming", "readability", "clean-code"],
      "keyInsight": "Code is read far more often than written",
      "whenToUse": "Always, especially for variables with business meaning",
      "commonPitfalls": ["Using abbreviations", "Using generic names like data or info"]
    }
  ],
  "metadata": {
    "chapterTitle": "Meaningful Names",
    "mainConcepts": ["naming", "readability"],
    "extractionConfidence": 0.9
  }
}

Text to analyze (first 4000 characters):
${chapterText.substring(0, 4000)}

Remember to:
- Focus on concrete, reusable patterns with actual code examples
- Prefer patterns that solve common problems
- Include both positive patterns (what to do) and anti-patterns (what to avoid)
- Ensure code snippets are syntactically valid`;
  }

  /**
   * Call LLM using secure subprocess with spawn
   * [ARCH:SECURITY:SPAWN_NO_SHELL] - No shell interpretation of arguments
   */
  private async callLLMSecurely(prompt: string): Promise<string> {
    return new Promise((resolve, reject) => {
      // Write prompt to stdin instead of passing as argument to avoid shell interpretation
      // Use full path to claude CLI
      const claudePath = "/Users/ben/.claude/local/claude";
      console.log(`[LLMExtractor] Calling Claude CLI at: ${claudePath}`);

      const child = spawn(claudePath, ["-p"], {
        stdio: ["pipe", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";
      let timedOut = false;

      // Set a timeout - increased for complex prompts
      const timeout = setTimeout(() => {
        timedOut = true;
        child.kill();
        reject(new Error("Claude CLI call timed out after 120 seconds"));
      }, 120000); // 120 seconds for complex book extraction prompts

      child.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      child.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      child.on("error", (error) => {
        clearTimeout(timeout);
        reject(new Error(`Failed to spawn claude process: ${error.message}`));
      });

      child.on("close", (code) => {
        clearTimeout(timeout);
        if (timedOut) return;

        if (code !== 0) {
          console.error(
            `[LLMExtractor] Claude exited with code ${code}. Stderr: ${stderr}`,
          );
          reject(
            new Error(`claude process exited with code ${code}: ${stderr}`),
          );
        } else {
          console.log(
            `[LLMExtractor] Claude responded with ${stdout.length} characters`,
          );
          resolve(stdout);
        }
      });

      // Write prompt to stdin and close
      console.log(
        `[LLMExtractor] Sending prompt (${prompt.length} characters)`,
      );
      child.stdin.write(prompt);
      child.stdin.end();
    });
  }

  /**
   * Validate and parse LLM response using Zod schema
   * [ARCH:VALIDATION:ZOD_SCHEMA] ★★★★★ - Schema validation for LLM responses
   */
  private validateAndParseResponse(response: string): BookPattern[] {
    try {
      // Try to extract JSON from response (LLM might include extra text)
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found in LLM response");
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const validated = LLMExtractionResponseSchema.parse(parsed);

      return validated.patterns;
    } catch (error) {
      console.error("[LLMExtractor] Failed to parse LLM response:", error);
      throw new Error(`Invalid LLM response format: ${error}`);
    }
  }

  /**
   * Enforce rate limiting between LLM calls
   */
  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastCall = now - this.lastCallTime;

    if (timeSinceLastCall < this.rateLimitDelay) {
      await this.sleep(this.rateLimitDelay - timeSinceLastCall);
    }

    this.lastCallTime = Date.now();
  }

  /**
   * Exponential backoff for retries
   */
  private async backoff(attempt: number): Promise<void> {
    const delay = Math.min(1000 * Math.pow(2, attempt), 30000); // Max 30 seconds
    await this.sleep(delay);
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
