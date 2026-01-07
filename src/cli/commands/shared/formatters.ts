// [PAT:OUTPUT:FORMATTER] ★★★★☆ (89 uses, 94% success) - Flexible output formatting
// [PAT:BUILD:MODULE:ESM] ★★★☆☆ (3 uses, 100% success) - ES modules with .js extensions

import Table from "cli-table3";
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

    // Check for task data
    if (
      data[0]?.task_type !== undefined ||
      data[0]?.current_phase !== undefined
    ) {
      return this.formatTaskTable(data);
    }

    // Check for task statistics
    if (data[0]?.total_tasks !== undefined) {
      return this.formatTaskStatsTable(data[0]);
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
        chalk.cyan("Pattern"),
        chalk.cyan("Trust & Usage"),
        chalk.cyan("Description"),
        chalk.cyan("Last Used"),
      ],
      style: {
        head: [],
        border: [],
      },
      colWidths: [35, 25, 45, 20],
    });

    for (const pattern of patterns) {
      const id = pattern.pattern_id || pattern.id;
      const trust = this.formatTrustScore(pattern.trust_score || 0);
      const uses = pattern.usage_count || 0;
      const success = pattern.success_rate
        ? `${Math.round(pattern.success_rate * 100)}%`
        : "-";
      const type = pattern.type || "PATTERN";
      const title = pattern.title || pattern.summary || "-";
      const lastUsed = pattern.last_used
        ? this.formatRelativeTime(new Date(pattern.last_used))
        : "Never";

      // Add emoji based on pattern type
      const emoji = this.getPatternEmoji(id, type);

      // Format the pattern ID with emoji
      const formattedId = `${emoji} ${chalk.yellow(id)}`;

      // Format trust and usage info
      const trustInfo = `${trust}\n${chalk.dim(`${uses} uses, ${success} success`)}`;

      // Format description with wrapping for long text
      const description =
        title.length > 42 ? title.substring(0, 42) + "..." : title;

      table.push([formattedId, trustInfo, description, chalk.dim(lastUsed)]);
    }

    return table.toString();
  }

  /**
   * Get emoji for pattern type
   */
  private getPatternEmoji(id: string, type: string): string {
    // Check pattern ID prefixes first
    if (id.startsWith("FIX:")) return "🔧";
    if (id.startsWith("PAT:")) return "📋";
    if (id.startsWith("ANTI:")) return "⚠️";
    if (id.startsWith("CODE:")) return "💻";
    if (id.startsWith("TEST:")) return "🧪";
    if (id.startsWith("ARCH:")) return "🏗️";

    // Fallback to type-based emojis
    switch (type.toUpperCase()) {
      case "FIX":
        return "🔧";
      case "PATTERN":
        return "📋";
      case "ANTI":
        return "⚠️";
      case "CODE":
        return "💻";
      case "TEST":
        return "🧪";
      case "ARCHITECTURE":
        return "🏗️";
      default:
        return "📝";
    }
  }

  /**
   * Format relative time for display
   */
  private formatRelativeTime(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
    return `${Math.floor(diffDays / 30)}mo ago`;
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

  /**
   * Format task-specific table
   */
  private formatTaskTable(tasks: any[]): string {
    const table = new (Table as any)({
      head: [
        chalk.cyan("ID"),
        chalk.cyan("Title"),
        chalk.cyan("Type"),
        chalk.cyan("Status"),
        chalk.cyan("Phase"),
        chalk.cyan("Updated"),
      ],
      style: {
        head: [],
        border: [],
      },
      colWidths: [25, 35, 12, 12, 12, 20],
    });

    for (const task of tasks) {
      const id = task.id || "-";
      const title = task.intent
        ? task.intent.length > 32
          ? task.intent.substring(0, 32) + "..."
          : task.intent
        : "-";
      const type = task.task_type || "-";
      const status = this.formatTaskStatus(task.status);
      const phase = this.formatPhase(task.current_phase);
      const updated = task.updated_at
        ? new Date(task.updated_at).toLocaleDateString()
        : "-";

      table.push([
        chalk.yellow(id.substring(0, 22)),
        title,
        chalk.gray(type),
        status,
        phase,
        chalk.gray(updated),
      ]);
    }

    return table.toString();
  }

  /**
   * Format task statistics table
   */
  private formatTaskStatsTable(stats: any): string {
    const table = new (Table as any)({
      style: {
        head: [],
        border: [],
      },
      colWidths: [25, 40],
    });

    const rows = [
      [chalk.cyan("Total Tasks"), stats.total_tasks || 0],
      [chalk.cyan("Active Tasks"), stats.active_tasks || 0],
      [chalk.cyan("Completed Tasks"), stats.completed_tasks || 0],
      [chalk.cyan("Failed Tasks"), stats.failed_tasks || 0],
      [
        chalk.cyan("Completion Rate"),
        stats.completion_rate
          ? `${Math.round(stats.completion_rate * 100)}%`
          : "0%",
      ],
      [chalk.cyan("Avg Duration"), stats.avg_duration || "N/A"],
      [chalk.cyan("This Week"), stats.tasks_this_week || 0],
      [chalk.cyan("Last Updated"), stats.last_updated || "Never"],
    ];

    for (const [label, value] of rows) {
      table.push([label, String(value)]);
    }

    return table.toString();
  }

  /**
   * Format task status with colors
   */
  private formatTaskStatus(status: string): string {
    switch (status) {
      case "active":
        return chalk.blue("● Active");
      case "completed":
        return chalk.green("✓ Completed");
      case "failed":
        return chalk.red("✗ Failed");
      case "blocked":
        return chalk.yellow("⚠ Blocked");
      default:
        return chalk.gray(status || "-");
    }
  }

  /**
   * Format phase with colors
   */
  private formatPhase(phase: string): string {
    if (!phase) return chalk.gray("-");

    const phaseColors: Record<string, typeof chalk> = {
      RESEARCH: chalk.gray,
      ARCHITECT: chalk.magenta,
      BUILDER: chalk.blue,
      BUILDER_VALIDATOR: chalk.yellow,
      VALIDATOR: chalk.yellow,
      REVIEWER: chalk.cyan,
      DOCUMENTER: chalk.green,
    };

    const color = phaseColors[phase] || chalk.gray;
    return color(phase.substring(0, 10));
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
