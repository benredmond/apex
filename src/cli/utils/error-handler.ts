/**
 * Enhanced error handling with helpful suggestions
 */

import chalk from "chalk";
import { ApexConfig } from "../../config/apex-config.js";

interface ErrorSuggestion {
  pattern: RegExp | string;
  message: string;
  suggestions: string[];
}

export class ErrorHandler {
  // Valid commands for typo detection
  private static readonly VALID_COMMANDS = [
    "start",
    "patterns",
    "tasks",
    "doctor",
    "mcp",
    "list",
    "search",
    "stats",
    "setup",
    "verify",
  ];

  private static readonly ERROR_SUGGESTIONS: ErrorSuggestion[] = [
    {
      pattern: /no such table|table.*not found/i,
      message: "Database not initialized",
      suggestions: ["Run: apex start", "Run: apex doctor"],
    },
    {
      pattern: /no such column|column.*not found/i,
      message: "Database schema outdated",
      suggestions: [
        "Run: apex doctor (auto-fixes)",
        "Delete patterns.db and run: apex start",
      ],
    },
    {
      pattern: /ENOENT|no such file/i,
      message: "File or directory not found",
      suggestions: ["Check the file path", "Run: apex start"],
    },
    {
      pattern: /command not found|unknown command/i,
      message: "Command not recognized",
      suggestions: ["Run: apex --help", "Check spelling"],
    },
    {
      pattern: /MCP.*not.*config/i,
      message: "MCP not configured",
      suggestions: [
        "Run: apex mcp setup",
        "Restart your AI assistant after setup",
      ],
    },
    {
      pattern: /permission denied/i,
      message: "Permission issue",
      suggestions: ["Check file permissions", "Try with sudo (if appropriate)"],
    },
    {
      pattern: /timeout|timed out/i,
      message: "Operation timed out",
      suggestions: [
        "Check network connection",
        "Try again",
        "Run: apex doctor",
      ],
    },
    {
      pattern: /out of memory/i,
      message: "Memory issue",
      suggestions: [
        "Close other applications",
        "Increase Node.js memory: NODE_OPTIONS='--max-old-space-size=4096'",
      ],
    },
  ];

  /**
   * Handle an error with helpful suggestions
   */
  static handle(error: Error | any, context?: string): void {
    // Format the main error message
    const errorMessage = error?.message || String(error);

    console.error(chalk.red("\n❌ Error:"), errorMessage);

    if (context) {
      console.error(chalk.dim(`   Context: ${context}`));
    }

    // Find matching suggestions
    const suggestion = this.findSuggestion(errorMessage);

    if (suggestion) {
      console.log(chalk.yellow(`\n💡 ${suggestion.message}:`));

      for (const tip of suggestion.suggestions) {
        console.log(chalk.cyan(`   → ${tip}`));
      }
    } else {
      // Generic suggestions
      console.log(chalk.yellow("\n💡 Try:"));
      console.log(chalk.cyan("   → apex doctor"), "- Check system health");
      console.log(chalk.cyan("   → apex --help"), "- View available commands");
    }

    // Show stack trace in debug mode
    if (process.env.DEBUG || process.env.APEX_DEBUG) {
      console.error(chalk.dim("\n📋 Stack trace:"));
      console.error(chalk.dim(error?.stack || "No stack trace available"));
    } else {
      console.log(chalk.dim("\n(Run with DEBUG=1 for more details)"));
    }

    process.exit(1);
  }

  /**
   * Find matching error suggestion
   */
  private static findSuggestion(errorMessage: string): ErrorSuggestion | null {
    for (const suggestion of this.ERROR_SUGGESTIONS) {
      if (typeof suggestion.pattern === "string") {
        if (errorMessage.includes(suggestion.pattern)) {
          return suggestion;
        }
      } else if (suggestion.pattern.test(errorMessage)) {
        return suggestion;
      }
    }

    return null;
  }

  /**
   * Create a did-you-mean suggestion
   */
  static didYouMean(input: string, options: string[]): string | null {
    // Simple Levenshtein distance
    const distances = options.map((option) => ({
      option,
      distance: this.levenshteinDistance(
        input.toLowerCase(),
        option.toLowerCase(),
      ),
    }));

    // Sort by distance
    distances.sort((a, b) => a.distance - b.distance);

    // If close enough match, suggest it
    if (distances[0] && distances[0].distance <= 2) {
      return distances[0].option;
    }

    return null;
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private static levenshteinDistance(a: string, b: string): number {
    const matrix = [];

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1,
          );
        }
      }
    }

    return matrix[b.length][a.length];
  }

  /**
   * Handle unknown command with did-you-mean suggestions
   */
  static handleUnknownCommand(command: string): void {
    console.error(chalk.red(`\n❌ Error: Unknown command '${command}'`));

    // Try to find a similar command
    const suggestion = this.didYouMean(command, this.VALID_COMMANDS);

    if (suggestion) {
      console.log(chalk.yellow("\n💡 Did you mean:"));
      console.log(chalk.cyan(`   → apex ${suggestion}`));
    } else {
      console.log(chalk.yellow("\n💡 Available commands:"));
      console.log(chalk.cyan("   → apex start"), "    - Initialize APEX");
      console.log(chalk.cyan("   → apex patterns"), " - Manage patterns");
      console.log(chalk.cyan("   → apex tasks"), "    - Manage tasks");
      console.log(chalk.cyan("   → apex doctor"), "   - Check system health");
      console.log(chalk.cyan("   → apex mcp"), "      - MCP integration");
    }

    console.log(chalk.dim("\nRun 'apex --help' for more information"));
    process.exit(1);
  }
}
