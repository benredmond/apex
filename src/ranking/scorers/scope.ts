import { PatternMeta, Signals } from "../types.js";
import { minimatch } from "minimatch";
import semver from "semver";
import * as path from "path";

interface ScopeResult {
  points: number;
  raw: number;
  path?: string;
  language?: string;
  framework?: string;
  details?: string;
}

export function scoreScope(
  pattern: PatternMeta,
  signals: Signals,
  cache?: {
    path?: Map<string, number>;
    semver?: Map<string, boolean>;
  },
): ScopeResult {
  let pathPoints = 0;
  let pathMatch: string | undefined;
  let pathType = "";

  // 1. Path scoring
  if (pattern.scope?.paths && signals.paths.length > 0) {
    for (const signalPath of signals.paths) {
      for (const patternPath of pattern.scope.paths) {
        const cacheKey = `${pattern.id}:${signalPath}`;
        const cached = cache?.path?.get(cacheKey);

        if (cached !== undefined) {
          if (cached > pathPoints) {
            pathPoints = cached;
            pathMatch = signalPath;
          }
          continue;
        }

        let points = 0;

        // Normalize paths for comparison
        const normalizedSignal = path.normalize(signalPath).toLowerCase();
        const normalizedPattern = path.normalize(patternPath).toLowerCase();

        // Exact file match
        if (normalizedSignal === normalizedPattern) {
          points = 40;
          pathType = "exact file";
        }
        // Directory match (pattern matches parent directory)
        else if (isDirectoryMatch(normalizedPattern, normalizedSignal)) {
          points = 30;
          pathType = "directory";
        }
        // Wildcard/glob match
        else if (minimatch(normalizedSignal, patternPath)) {
          points = 5;
          pathType = "wildcard";
        }

        cache?.path?.set(cacheKey, points);

        if (points > pathPoints) {
          pathPoints = points;
          pathMatch = signalPath;
        }
      }
    }
  }

  // 2. Language scoring
  let langPoints = 0;
  let langMatch: string | undefined;

  if (pattern.scope?.languages && signals.languages.length > 0) {
    const patternLangs = new Set(
      pattern.scope.languages.map((l) => l.toLowerCase()),
    );
    const signalLangs = new Set(signals.languages.map((l) => l.toLowerCase()));

    for (const lang of signalLangs) {
      if (patternLangs.has(lang)) {
        langPoints = 20;
        langMatch = lang;
        break;
      }
    }
  }

  // 3. Framework scoring
  let frameworkPoints = 0;
  let frameworkMatch: string | undefined;

  if (
    pattern.scope?.frameworks &&
    (signals.frameworks.length > 0 || signals.deps)
  ) {
    for (const patternFw of pattern.scope.frameworks) {
      // Check direct framework signals
      for (const signalFw of signals.frameworks) {
        if (patternFw.name.toLowerCase() === signalFw.name.toLowerCase()) {
          if (patternFw.range && signalFw.version) {
            const validVersion = semver.valid(signalFw.version);
            if (validVersion) {
              const cacheKey = `${patternFw.name}:${validVersion}:${patternFw.range}`;
              const cached = cache?.semver?.get(cacheKey);

              const satisfies =
                cached ?? semver.satisfies(validVersion, patternFw.range);
              if (cached === undefined) {
                cache?.semver?.set(cacheKey, satisfies);
              }

              if (satisfies) {
                frameworkPoints = 15;
                frameworkMatch = `${patternFw.name}@${validVersion}`;
              } else {
                frameworkPoints = Math.max(frameworkPoints, 8);
                frameworkMatch =
                  frameworkMatch || `${patternFw.name} (version mismatch)`;
              }
            } else {
              frameworkPoints = Math.max(frameworkPoints, 8);
              frameworkMatch =
                frameworkMatch || `${patternFw.name} (version unknown)`;
            }
          } else {
            frameworkPoints = Math.max(frameworkPoints, 8);
            frameworkMatch = frameworkMatch || patternFw.name;
          }
        }
      }

      // Check deps if provided
      if (signals.deps && signals.deps[patternFw.name]) {
        const version = signals.deps[patternFw.name];
        if (patternFw.range) {
          const validVersion = semver.valid(version);
          if (!validVersion) {
            continue;
          }
          const cacheKey = `${patternFw.name}:${validVersion}:${patternFw.range}`;
          const cached = cache?.semver?.get(cacheKey);

          const satisfies =
            cached ?? semver.satisfies(validVersion, patternFw.range);
          if (cached === undefined) {
            cache?.semver?.set(cacheKey, satisfies);
          }

          if (satisfies) {
            frameworkPoints = 15;
            frameworkMatch = `${patternFw.name}@${validVersion}`;
          }
        }
      }
    }
  }

  // Calculate raw score and normalize
  const rawScore = pathPoints + langPoints + frameworkPoints;
  const maxRawScore = 40 + 20 + 15; // 75
  const normalizedScore = 40 * Math.min(1, rawScore / maxRawScore);

  // Build details string
  const details = [
    pathType && `${pathType} match`,
    langMatch && "lang",
    frameworkMatch && (frameworkPoints === 15 ? "semver ok" : "framework"),
  ]
    .filter(Boolean)
    .join(" + ");

  return {
    points: Math.round(normalizedScore * 10) / 10,
    raw: rawScore,
    path: pathMatch,
    language: langMatch,
    framework: frameworkMatch,
    details: details || undefined,
  };
}

function isDirectoryMatch(patternPath: string, signalPath: string): boolean {
  // Check if pattern describes a directory that contains the signal file
  const patternDir = patternPath.endsWith("/")
    ? patternPath.slice(0, -1)
    : path.dirname(patternPath);

  const signalDir = path.dirname(signalPath);

  // Check if signal is in pattern directory or subdirectory
  return signalDir.startsWith(patternDir + "/") || signalDir === patternDir;
}
