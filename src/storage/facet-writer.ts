import type { DatabaseAdapter } from "./database-adapter.js";
import { escapeIdentifier, tableExists } from "./database-utils.js";

const normalizeTags = (value: unknown): string[] => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((tag) => (typeof tag === "string" ? tag.trim() : ""))
      .filter((tag) => tag.length > 0);
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed
          .map((tag) => (typeof tag === "string" ? tag.trim() : ""))
          .filter((tag) => tag.length > 0);
      }
    } catch {
      return value
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0);
    }
  }
  return [];
};

export class FacetWriter {
  constructor(private db: DatabaseAdapter) {}

  upsertFacets(patternId: string, pattern: any): void {
    const safeDeleteFromTable = (tableName: string) => {
      try {
        if (tableExists(this.db, tableName)) {
          this.db
            .prepare(
              `DELETE FROM ${escapeIdentifier(tableName)} WHERE pattern_id = ?`,
            )
            .run(patternId);
        }
      } catch (error: any) {
        console.warn(
          `Warning: Could not delete from ${tableName}:`,
          error?.message ?? error,
        );
      }
    };

    safeDeleteFromTable("pattern_languages");
    safeDeleteFromTable("pattern_frameworks");
    safeDeleteFromTable("pattern_tags");
    safeDeleteFromTable("pattern_paths");
    safeDeleteFromTable("pattern_repos");
    safeDeleteFromTable("pattern_task_types");
    safeDeleteFromTable("pattern_envs");

    const tags = normalizeTags(pattern?.tags);
    if (tags.length > 0 && tableExists(this.db, "pattern_tags")) {
      const insertTag = this.db.prepare(
        "INSERT INTO pattern_tags (pattern_id, tag) VALUES (?, ?)",
      );
      for (const tag of tags) {
        insertTag.run(patternId, tag);
      }
    }

    const scope = pattern?.scope || {};

    if (
      Array.isArray(scope.languages) &&
      scope.languages.length > 0 &&
      tableExists(this.db, "pattern_languages")
    ) {
      const insertLang = this.db.prepare(
        "INSERT INTO pattern_languages (pattern_id, lang) VALUES (?, ?)",
      );
      for (const lang of scope.languages) {
        insertLang.run(patternId, lang);
      }
    }

    if (
      Array.isArray(scope.frameworks) &&
      scope.frameworks.length > 0 &&
      tableExists(this.db, "pattern_frameworks")
    ) {
      const insertFramework = this.db.prepare(
        "INSERT INTO pattern_frameworks (pattern_id, framework, semver) VALUES (?, ?, ?)",
      );
      for (const fw of scope.frameworks) {
        if (typeof fw === "string") {
          insertFramework.run(patternId, fw, null);
        } else if (fw && typeof fw === "object" && fw.name) {
          const semver = fw.semver || fw.version || fw.range || null;
          insertFramework.run(patternId, fw.name, semver);
        }
      }

      if (pattern?.semver_constraints?.dependencies) {
        for (const [framework, version] of Object.entries(
          pattern.semver_constraints.dependencies,
        )) {
          const alreadyAdded = scope.frameworks.some(
            (fw: any) =>
              (typeof fw === "string" && fw === framework) ||
              (fw && typeof fw === "object" && fw.name === framework),
          );
          if (!alreadyAdded && typeof version === "string") {
            insertFramework.run(patternId, framework, version);
          }
        }
      }
    }

    if (
      Array.isArray(scope.paths) &&
      scope.paths.length > 0 &&
      tableExists(this.db, "pattern_paths")
    ) {
      const insertPath = this.db.prepare(
        "INSERT INTO pattern_paths (pattern_id, glob) VALUES (?, ?)",
      );
      for (const path of scope.paths) {
        insertPath.run(patternId, path);
      }
    }

    if (
      Array.isArray(scope.repos) &&
      scope.repos.length > 0 &&
      tableExists(this.db, "pattern_repos")
    ) {
      const insertRepo = this.db.prepare(
        "INSERT INTO pattern_repos (pattern_id, repo_glob) VALUES (?, ?)",
      );
      for (const repo of scope.repos) {
        insertRepo.run(patternId, repo);
      }
    }

    if (
      Array.isArray(scope.task_types) &&
      scope.task_types.length > 0 &&
      tableExists(this.db, "pattern_task_types")
    ) {
      const insertTaskType = this.db.prepare(
        "INSERT INTO pattern_task_types (pattern_id, task_type) VALUES (?, ?)",
      );
      for (const taskType of scope.task_types) {
        insertTaskType.run(patternId, taskType);
      }
    }

    if (
      Array.isArray(scope.envs) &&
      scope.envs.length > 0 &&
      tableExists(this.db, "pattern_envs")
    ) {
      const insertEnv = this.db.prepare(
        "INSERT INTO pattern_envs (pattern_id, env) VALUES (?, ?)",
      );
      for (const env of scope.envs) {
        insertEnv.run(patternId, env);
      }
    }
  }
}
