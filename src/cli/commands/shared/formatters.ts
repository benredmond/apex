// [PAT:OUTPUT:FORMATTER] ★★★★☆ (89 uses, 94% success) - Flexible output formatting
// [PAT:BUILD:MODULE:ESM] ★★★☆☆ (3 uses, 100% success) - ES modules with .js extensions

import * as Table from "cli-table3";
import chalk from "chalk";
import * as yaml from "js-yaml";

/**
 * Base formatter interface for flexible output formatting
 */
export interface Formatter {
  format(data: any): string;
}

/**
 * JSON formatter for machine-readable output
 */
export class JSONFormatter implements Formatter {
  private indent: number;

  constructor(indent: number = 2) {
    this.indent = indent;
  }

  format(data: any): string {
    return JSON.stringify(data, null, this.indent);
  }
}

/**
 * Table formatter for human-readable CLI output
 */
export class TableFormatter implements Formatter {
  format(data: any): string {
    // Handle empty data
    if (!data || (Array.isArray(data) && data.length === 0)) {
      return chalk.gray("No data to display");
    }

    // Handle single object
    if (!Array.isArray(data)) {
      data = [data];
    }

    // Special formatting for pattern data
    if (data[0]?.pattern_id || data[0]?.id) {
      return this.formatPatternTable(data);
    }

    // Special formatting for statistics
    if (data[0]?.total_patterns !== undefined) {
      return this.formatStatsTable(data[0]);
    }

    // Generic table formatting
    const keys = Object.keys(data[0] || {});
    if (keys.length === 0) {
      return chalk.gray("No data to display");
    }

    const table = new (Table as any)({
      head: keys.map((k) => chalk.cyan(k)),
      style: {
        head: [],
        border: [],
      },
    });

    for (const row of data) {
      table.push(
        keys.map((key) => {
          const value = row[key];
          if (value === null || value === undefined) {
            return chalk.gray("-");
          }
          if (typeof value === "boolean") {
            return value ? chalk.green("✓") : chalk.red("✗");
          }
          if (typeof value === "object") {
            return JSON.stringify(value);
          }
          return String(value);
        }),
      );
    }

    return table.toString();
  }

  /**
   * Format pattern-specific table with trust scores
   */
  private formatPatternTable(patterns: any[]): string {
    const table = new (Table as any)({
      head: [
        chalk.cyan("ID"),
        chalk.cyan("Title"),
        chalk.cyan("Trust"),
        chalk.cyan("Uses"),
        chalk.cyan("Success"),
        chalk.cyan("Type"),
      ],
      style: {
        head: [],
        border: [],
      },
      colWidths: [30, 40, 10, 8, 10, 15],
    });

    for (const pattern of patterns) {
      const id = pattern.pattern_id || pattern.id;
      const trust = this.formatTrustScore(pattern.trust_score || 0);
      const uses = pattern.usage_count || 0;
      const success = pattern.success_rate
        ? `${Math.round(pattern.success_rate * 100)}%`
        : "-";
      const type = pattern.type || "-";
      const title = pattern.title || pattern.summary || "-";

      table.push([
        chalk.yellow(id),
        title.length > 37 ? title.substring(0, 37) + "..." : title,
        trust,
        uses.toString(),
        success,
        chalk.gray(type),
      ]);
    }

    return table.toString();
  }

  /**
   * Format statistics table
   */
  private formatStatsTable(stats: any): string {
    const table = new (Table as any)({
      style: {
        head: [],
        border: [],
      },
      colWidths: [25, 40],
    });

    const rows = [
      [chalk.cyan("Total Patterns"), stats.total_patterns || 0],
      [chalk.cyan("Active Patterns"), stats.active_patterns || 0],
      [chalk.cyan("Pending Patterns"), stats.pending_patterns || 0],
      [
        chalk.cyan("Average Trust Score"),
        this.formatTrustScore(stats.avg_trust_score || 0),
      ],
      [chalk.cyan("Total Uses"), stats.total_uses || 0],
      [
        chalk.cyan("Success Rate"),
        `${Math.round((stats.overall_success_rate || 0) * 100)}%`,
      ],
      [chalk.cyan("Last Updated"), stats.last_updated || "Never"],
    ];

    for (const [label, value] of rows) {
      table.push([label, String(value)]);
    }

    return table.toString();
  }

  /**
   * Format trust score as star rating
   */
  private formatTrustScore(score: number): string {
    const stars = Math.round(score * 5);
    const filled = "★".repeat(stars);
    const empty = "☆".repeat(5 - stars);

    if (stars >= 4) {
      return chalk.green(filled + empty);
    } else if (stars >= 2) {
      return chalk.yellow(filled + empty);
    } else {
      return chalk.red(filled + empty);
    }
  }
}

/**
 * YAML formatter for configuration-friendly output
 */
export class YAMLFormatter implements Formatter {
  format(data: any): string {
    return yaml.dump(data, {
      indent: 2,
      lineWidth: 120,
      sortKeys: false,
    });
  }
}

/**
 * Factory for creating formatters based on format type
 */
export class FormatterFactory {
  static create(format: string = "table"): Formatter {
    switch (format.toLowerCase()) {
      case "json":
        return new JSONFormatter();
      case "yaml":
      case "yml":
        return new YAMLFormatter();
      case "table":
      default:
        return new TableFormatter();
    }
  }
}

/**
 * Format a single value for display
 */
export function formatValue(value: any): string {
  if (value === null || value === undefined) {
    return chalk.gray("-");
  }
  if (typeof value === "boolean") {
    return value ? chalk.green("✓") : chalk.red("✗");
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

/**
 * Format duration in milliseconds to human-readable string
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}
