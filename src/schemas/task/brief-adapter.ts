/**
 * TaskBrief adapter for backward compatibility
 * Handles conversion between old (string tl_dr) and new (string[] tl_dr) interfaces
 */

import type { TaskBrief as OldTaskBrief } from "./types.js";
import type { TaskBrief as NewTaskBrief } from "./brief-types.js";

/**
 * Convert new TaskBrief format to old format for backward compatibility
 */
export function newToOldTaskBrief(newBrief: NewTaskBrief): OldTaskBrief {
  return {
    tl_dr: Array.isArray(newBrief.tl_dr)
      ? newBrief.tl_dr.join(". ")
      : newBrief.tl_dr,
    objectives: newBrief.objectives,
    constraints: newBrief.constraints,
    acceptance_criteria: newBrief.acceptance_criteria,
    plan: newBrief.plan.map((step) => ({
      step: step.step,
      action: step.action,
      files: step.files,
    })),
    facts: newBrief.facts.map((f) => (typeof f === "string" ? f : f.fact)),
    snippets: newBrief.snippets.map((s) => ({
      code: s.code,
      language: s.language,
      description: s.description,
    })),
    risks_and_gotchas: newBrief.risks_and_gotchas,
    open_questions: newBrief.open_questions.map((q) =>
      typeof q === "string" ? q : q.question,
    ),
    test_scaffold: Array.isArray(newBrief.test_scaffold)
      ? newBrief.test_scaffold
          .map((t) => t.scaffold || `// ${t.description}`)
          .join("\n\n")
      : newBrief.test_scaffold || "",
  };
}

/**
 * Convert old TaskBrief format to new format
 */
export function oldToNewTaskBrief(oldBrief: OldTaskBrief): NewTaskBrief {
  return {
    tl_dr: oldBrief.tl_dr,
    objectives: oldBrief.objectives,
    constraints: oldBrief.constraints,
    acceptance_criteria: oldBrief.acceptance_criteria,
    plan: oldBrief.plan.map((step) => ({
      step: step.step,
      action: step.action,
      files: step.files,
    })),
    facts: oldBrief.facts.map((fact) => ({
      fact: fact,
      source_refs: [],
    })),
    snippets: oldBrief.snippets.map((s) => ({
      code: s.code,
      language: s.language,
      description: s.description,
    })),
    risks_and_gotchas: oldBrief.risks_and_gotchas,
    open_questions: oldBrief.open_questions.map((q) => ({
      question: q,
    })),
    in_flight: [],
    test_scaffold: oldBrief.test_scaffold,
    drilldowns: {
      prior_impls: [],
      files: [],
    },
    provenance: {
      generated_at: new Date().toISOString(),
      sources: ["adapter"],
    },
  };
}
