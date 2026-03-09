---
name: apex:review-plan
description: Run iterative adversarial review on a task plan before implementation
argument-hint: [task-identifier]
---

Use the `apex:review-plan` skill to run a fresh adversarial review loop against the current task plan.

The skill revises the task's `<plan>` section after each in-scope `VERDICT: REVISE` and stops when the reviewer returns `VERDICT: APPROVED`, when the loop reaches 5 rounds, or when the task must return to `/apex:research` or `/apex:plan` because the inputs are too weak for safe review.

Pass the provided argument as the task identifier.
