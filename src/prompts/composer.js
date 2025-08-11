/**
 * Prompt Composer for Non-Claude AI Platforms
 * 
 * This module takes the exact Claude command templates and inlines
 * subagent calls to create identical prompts for non-Claude platforms.
 */

import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";
import chalk from "chalk";
import { getSubagentDefinitions } from "./subagents.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Generate composed prompts for non-Claude platforms
 * These prompts contain the EXACT same content as Claude sees,
 * but with subagent calls expanded inline.
 */
export async function generateComposedPrompts() {
  const outputDir = path.join(process.cwd(), "apex-prompts");
  await fs.ensureDir(outputDir);

  console.log(chalk.dim("Generating APEX prompts for non-Claude platforms..."));

  // Process the main execute task command
  const taskCommandPath = path.join(__dirname, "..", "commands", "execute", "task.md");
  
  if (await fs.pathExists(taskCommandPath)) {
    const taskContent = await fs.readFile(taskCommandPath, "utf8");
    const composedContent = await composeExactPrompt(taskContent);
    
    const outputPath = path.join(outputDir, "execute-task.md");
    await fs.writeFile(outputPath, composedContent);
    
    console.log(chalk.green(`  ✓ Generated: execute-task.md`));
  }

  // Add other commands as they become available
  // For now, we only have the task.md command

  return outputDir;
}

/**
 * Compose a prompt with subagents inlined EXACTLY
 * Preserves all content from the original, just expands subagent blocks
 */
async function composeExactPrompt(commandContent) {
  let result = commandContent;
  const subagentDefinitions = getSubagentDefinitions();
  
  // Find all subagent Task blocks
  const subagentPattern = /<Task\s+subagent_type="([^"]+)"(?:\s+description="([^"]+)")?\s*>([\s\S]*?)<\/Task>/g;
  
  let matches = [];
  let match;
  
  // Collect all matches first
  while ((match = subagentPattern.exec(commandContent)) !== null) {
    matches.push({
      fullMatch: match[0],
      subagentType: match[1],
      description: match[2] || "",
      promptContent: match[3]
    });
  }
  
  // Replace each match with inlined content
  for (const m of matches) {
    const subagentImpl = subagentDefinitions[m.subagentType];
    
    if (!subagentImpl) {
      console.warn(chalk.yellow(`  ⚠️  Unknown subagent type: ${m.subagentType}`));
      continue;
    }
    
    // Create the exact inlined replacement
    const replacement = `<!-- BEGIN INLINED SUBAGENT: ${m.subagentType} -->
${m.promptContent}

**${m.subagentType} Implementation:**

${subagentImpl}
<!-- END INLINED SUBAGENT: ${m.subagentType} -->`;
    
    // Replace the Task block with the inlined version
    result = result.replace(m.fullMatch, replacement);
  }
  
  // Add header explaining this is a composed prompt
  const header = `<!-- 
APEX COMPOSED PROMPT FOR NON-CLAUDE AI PLATFORMS
Generated from: src/commands/execute/task.md
This contains the EXACT same content Claude sees, with subagents inlined.
-->

`;
  
  return header + result;
}