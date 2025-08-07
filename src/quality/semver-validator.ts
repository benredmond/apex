/**
 * Semver validation for pattern version constraints
 * [APE-29] Validates version compatibility for patterns
 */

import semver from "semver";

export interface SemverConstraint {
  package?: string;
  constraint: string;
  currentVersion?: string;
}

export interface ValidationResult {
  valid: boolean;
  satisfies: boolean;
  warnings: string[];
  errors: string[];
}

export class SemverValidator {
  /**
   * Validate semver constraints for a pattern
   */
  validateConstraints(
    constraints: string | SemverConstraint[],
    currentVersions?: Map<string, string>,
  ): ValidationResult {
    const result: ValidationResult = {
      valid: true,
      satisfies: true,
      warnings: [],
      errors: [],
    };

    // Parse constraints if provided as JSON string
    let parsedConstraints: SemverConstraint[];
    try {
      if (typeof constraints === "string") {
        parsedConstraints = JSON.parse(constraints);
      } else {
        parsedConstraints = constraints;
      }
    } catch (error) {
      result.valid = false;
      result.errors.push(`Invalid constraint format: ${error.message}`);
      return result;
    }

    // Validate each constraint
    for (const constraint of parsedConstraints) {
      const validationResult = this.validateSingleConstraint(
        constraint,
        currentVersions,
      );

      if (!validationResult.valid) {
        result.valid = false;
        result.errors.push(...validationResult.errors);
      }

      if (!validationResult.satisfies) {
        result.satisfies = false;
      }

      result.warnings.push(...validationResult.warnings);
    }

    return result;
  }

  /**
   * Validate a single semver constraint
   */
  private validateSingleConstraint(
    constraint: SemverConstraint,
    currentVersions?: Map<string, string>,
  ): ValidationResult {
    const result: ValidationResult = {
      valid: true,
      satisfies: true,
      warnings: [],
      errors: [],
    };

    // Validate constraint syntax
    if (!semver.validRange(constraint.constraint)) {
      result.valid = false;
      result.errors.push(
        `Invalid semver range: ${constraint.constraint}${
          constraint.package ? ` for ${constraint.package}` : ""
        }`,
      );
      return result;
    }

    // Check if current version satisfies constraint
    if (currentVersions && constraint.package) {
      const currentVersion = currentVersions.get(constraint.package);

      if (currentVersion) {
        // Clean version string (remove 'v' prefix if present)
        const cleanVersion = currentVersion.replace(/^v/, "");

        if (!semver.valid(cleanVersion)) {
          result.warnings.push(
            `Current version ${currentVersion} for ${constraint.package} is not a valid semver`,
          );
        } else if (!semver.satisfies(cleanVersion, constraint.constraint)) {
          result.satisfies = false;
          result.warnings.push(
            `${constraint.package}@${currentVersion} does not satisfy ${constraint.constraint}`,
          );
        }
      } else {
        result.warnings.push(
          `No version information available for ${constraint.package}`,
        );
      }
    }

    // Check for overly restrictive constraints
    if (this.isOverlyRestrictive(constraint.constraint)) {
      result.warnings.push(
        `Constraint ${constraint.constraint} may be overly restrictive`,
      );
    }

    return result;
  }

  /**
   * Check if a constraint is overly restrictive
   */
  private isOverlyRestrictive(constraint: string): boolean {
    // Check for exact version pinning (considered restrictive)
    if (/^\d+\.\d+\.\d+$/.test(constraint)) {
      return true;
    }

    // Check for very narrow ranges
    try {
      const range = semver.Range(constraint);
      // If range only includes a single minor version, it's restrictive
      // This is a simplified check - could be enhanced
      const rangeString = range.toString();
      if (rangeString.includes(">=") && rangeString.includes("<")) {
        const parts = rangeString.split(" ");
        if (parts.length === 3) {
          // Format: ">=X.Y.Z <X.Y+1.0"
          const lower = parts[0].replace(">=", "");
          const upper = parts[2].replace("<", "");

          const lowerMinor = semver.minor(lower);
          const upperMinor = semver.minor(upper);

          if (upperMinor - lowerMinor <= 1) {
            return true;
          }
        }
      }
    } catch {
      // If we can't parse the range, assume it's not restrictive
    }

    return false;
  }

  /**
   * Suggest a more flexible constraint
   */
  suggestFlexibleConstraint(constraint: string): string {
    // If it's an exact version, suggest caret range
    if (/^\d+\.\d+\.\d+$/.test(constraint)) {
      return `^${constraint}`;
    }

    // If it's a tilde range, suggest caret
    if (constraint.startsWith("~")) {
      return constraint.replace("~", "^");
    }

    // Return original if we can't improve it
    return constraint;
  }

  /**
   * Check compatibility between two patterns
   */
  checkPatternCompatibility(
    pattern1Constraints: string | SemverConstraint[],
    pattern2Constraints: string | SemverConstraint[],
  ): {
    compatible: boolean;
    conflicts: Array<{
      package: string;
      constraint1: string;
      constraint2: string;
      reason: string;
    }>;
  } {
    const conflicts: Array<{
      package: string;
      constraint1: string;
      constraint2: string;
      reason: string;
    }> = [];

    // Parse constraints
    let constraints1: SemverConstraint[];
    let constraints2: SemverConstraint[];

    try {
      constraints1 =
        typeof pattern1Constraints === "string"
          ? JSON.parse(pattern1Constraints)
          : pattern1Constraints;
      constraints2 =
        typeof pattern2Constraints === "string"
          ? JSON.parse(pattern2Constraints)
          : pattern2Constraints;
    } catch (error) {
      return {
        compatible: false,
        conflicts: [
          {
            package: "unknown",
            constraint1: String(pattern1Constraints),
            constraint2: String(pattern2Constraints),
            reason: "Invalid constraint format",
          },
        ],
      };
    }

    // Check for conflicts
    for (const c1 of constraints1) {
      for (const c2 of constraints2) {
        if (c1.package === c2.package) {
          // Check if ranges intersect
          const intersection = semver.intersects(c1.constraint, c2.constraint);

          if (!intersection) {
            conflicts.push({
              package: c1.package || "unknown",
              constraint1: c1.constraint,
              constraint2: c2.constraint,
              reason: "Version ranges do not intersect",
            });
          }
        }
      }
    }

    return {
      compatible: conflicts.length === 0,
      conflicts,
    };
  }

  /**
   * Extract version constraints from package.json content
   */
  extractFromPackageJson(packageJsonContent: string): SemverConstraint[] {
    try {
      const packageJson = JSON.parse(packageJsonContent);
      const constraints: SemverConstraint[] = [];

      // Extract from dependencies
      if (packageJson.dependencies) {
        for (const [pkg, version] of Object.entries(packageJson.dependencies)) {
          constraints.push({
            package: pkg,
            constraint: version as string,
          });
        }
      }

      // Extract from devDependencies if specified
      if (packageJson.devDependencies) {
        for (const [pkg, version] of Object.entries(
          packageJson.devDependencies,
        )) {
          constraints.push({
            package: pkg,
            constraint: version as string,
          });
        }
      }

      // Extract from peerDependencies
      if (packageJson.peerDependencies) {
        for (const [pkg, version] of Object.entries(
          packageJson.peerDependencies,
        )) {
          constraints.push({
            package: pkg,
            constraint: version as string,
          });
        }
      }

      return constraints;
    } catch (error) {
      throw new Error(`Failed to parse package.json: ${error.message}`);
    }
  }
}
