// [PAT:CLI:COMMANDER] ★★★★☆ (245 uses, 92% success) - Commander.js CLI framework
// [FIX:ASYNC:ERROR] ★★★★★ (234 uses, 98% success) - Proper async error handling
// [PAT:BUILD:MODULE:ESM] ★★★☆☆ (3 uses, 100% success) - ES modules with .js extensions

import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import * as fs from "fs-extra";
import * as path from "path";
import { getSharedMCPClient } from "./shared/mcp-client.js";
import { FormatterFactory } from "./shared/formatters.js";
import { withProgress, ProgressTracker } from "./shared/progress.js";
import { createPatternRepository } from "../../storage/index.js";

/**
 * Create the pack command for managing pattern packs
 * Packs are collections of related patterns that can be shared and installed
 */
export function createPackCommand(): Command {
  const pack = new Command("pack").description(
    "Manage pattern packs for sharing and reuse",
  );

  pack
    .command("list")
    .description("List available and installed pattern packs")
    .option("--installed", "Show only installed packs")
    .option("--available", "Show available packs from registry")
    .option("-f, --format <type>", "Output format (json|table|yaml)", "table")
    .action(async (options) => {
      try {
        const spinner = ora("Fetching packs...").start();

        // Get packs from repository or registry
        const repository = await createPatternRepository();

        // For now, list local packs from .apex/patterns directory
        const packsDir = path.join(process.cwd(), ".apex", "patterns", "packs");
        let packs: any[] = [];

        if (await fs.pathExists(packsDir)) {
          const packDirs = await fs.readdir(packsDir);

          for (const packName of packDirs) {
            const packPath = path.join(packsDir, packName);
            const manifestPath = path.join(packPath, "pack.json");

            if (await fs.pathExists(manifestPath)) {
              const manifest = await fs.readJson(manifestPath);
              packs.push({
                name: packName,
                version: manifest.version || "1.0.0",
                description: manifest.description || "",
                patterns: manifest.patterns?.length || 0,
                installed: true,
                path: packPath,
              });
            }
          }
        }

        // If available flag, fetch from registry (placeholder)
        if (options.available) {
          // In future, this would fetch from a pattern pack registry
          const availablePacks = [
            {
              name: "web-patterns",
              version: "2.0.0",
              description: "Web development patterns",
              patterns: 45,
              installed: false,
            },
            {
              name: "api-patterns",
              version: "1.5.0",
              description: "REST API patterns",
              patterns: 32,
              installed: false,
            },
            {
              name: "test-patterns",
              version: "1.2.0",
              description: "Testing patterns",
              patterns: 28,
              installed: false,
            },
          ];
          packs = [...packs, ...availablePacks];
        }

        spinner.stop();

        if (packs.length === 0) {
          console.log(chalk.yellow("No pattern packs found"));
          return;
        }

        // Filter based on options
        if (options.installed) {
          packs = packs.filter((p) => p.installed);
        }

        console.log(chalk.bold(`\nFound ${packs.length} pack(s):\n`));

        // Format and display
        const formatter = FormatterFactory.create(options.format);
        console.log(formatter.format(packs));
      } catch (error) {
        console.error(
          chalk.red("Error:"),
          error instanceof Error ? error.message : error,
        );
        process.exit(1);
      }
    });

  pack
    .command("install <pack-name>")
    .description("Install a pattern pack from registry or local file")
    .option("--source <path>", "Install from local path instead of registry")
    .option("--force", "Force installation even if pack exists")
    .action(async (packName: string, options) => {
      try {
        const progress = new ProgressTracker([
          "Downloading pack",
          "Validating patterns",
          "Installing patterns",
          "Updating index",
        ]);

        progress.start();

        // Use MCP client for pack installation
        const mcpClient = getSharedMCPClient();

        // Step 1: Download/locate pack
        progress.updateText("Downloading pack...");

        let packSource: string;
        if (options.source) {
          // Local installation
          packSource = path.resolve(options.source);
          if (!(await fs.pathExists(packSource))) {
            progress.fail(`Pack source not found: ${packSource}`);
            process.exit(1);
          }
        } else {
          // Registry installation (placeholder)
          // In future, this would download from registry
          packSource = packName;
        }

        progress.nextStep();

        // Step 2: Validate patterns
        progress.updateText("Validating patterns...");

        const result = await mcpClient.call("installPack", {
          name: packName,
          source: packSource,
          force: options.force,
        });

        if (!result.success) {
          progress.fail(`Failed to install pack: ${result.error}`);
          process.exit(1);
        }

        progress.nextStep();

        // Step 3: Install patterns
        progress.updateText("Installing patterns...");

        const installPath = path.join(
          process.cwd(),
          ".apex",
          "patterns",
          "packs",
          packName,
        );
        await fs.ensureDir(installPath);

        // Copy patterns (simplified for now)
        if (options.source && (await fs.pathExists(packSource))) {
          await fs.copy(packSource, installPath, { overwrite: options.force });
        }

        progress.nextStep();

        // Step 4: Update index
        progress.updateText("Updating pattern index...");

        const repository = await createPatternRepository();
        await repository.rebuild();

        progress.succeed(
          chalk.green(`✓ Pack ${packName} installed successfully`),
        );

        // Display installation summary
        if (result.data) {
          console.log(
            chalk.gray(
              `  Patterns installed: ${result.data.patterns_count || 0}`,
            ),
          );
          console.log(chalk.gray(`  Location: ${installPath}`));
        }
      } catch (error) {
        console.error(
          chalk.red("Error:"),
          error instanceof Error ? error.message : error,
        );
        process.exit(1);
      }
    });

  pack
    .command("create <name>")
    .description("Create a new pattern pack from existing patterns")
    .option(
      "--from-patterns <dir>",
      "Source directory containing patterns",
      ".apex/patterns",
    )
    .option("--description <text>", "Pack description")
    .option("--version <version>", "Pack version", "1.0.0")
    .option("--output <dir>", "Output directory", ".")
    .action(async (name: string, options) => {
      try {
        const spinner = ora("Creating pattern pack...").start();

        // Validate source directory
        const sourceDir = path.resolve(options.fromPatterns);
        if (!(await fs.pathExists(sourceDir))) {
          spinner.fail(`Source directory not found: ${sourceDir}`);
          process.exit(1);
        }

        // Create pack structure
        const packDir = path.join(options.output, `${name}-pack`);
        await fs.ensureDir(packDir);
        await fs.ensureDir(path.join(packDir, "patterns"));

        // Find and copy pattern files
        const patternFiles: string[] = [];
        const files = await fs.readdir(sourceDir);

        for (const file of files) {
          if (file.endsWith(".yaml") || file.endsWith(".yml")) {
            const sourcePath = path.join(sourceDir, file);
            const destPath = path.join(packDir, "patterns", file);
            await fs.copy(sourcePath, destPath);
            patternFiles.push(file);
          }
        }

        // Create pack manifest
        const manifest = {
          name,
          version: options.version,
          description: options.description || `Pattern pack: ${name}`,
          created: new Date().toISOString(),
          patterns: patternFiles,
          metadata: {
            apex_version: "0.1.0",
            pattern_count: patternFiles.length,
          },
        };

        await fs.writeJson(path.join(packDir, "pack.json"), manifest, {
          spaces: 2,
        });

        // Create README
        const readme = `# ${name} Pattern Pack

${options.description || `A collection of ${patternFiles.length} APEX patterns.`}

## Installation

\`\`\`bash
apex pack install ${name} --source ./${name}-pack
\`\`\`

## Patterns Included

${patternFiles.map((f) => `- ${f}`).join("\n")}

## Version

${options.version}

Generated on ${new Date().toISOString()}
`;

        await fs.writeFile(path.join(packDir, "README.md"), readme);

        spinner.succeed(chalk.green(`✓ Pattern pack created: ${packDir}`));

        console.log(chalk.gray(`  Patterns included: ${patternFiles.length}`));
        console.log(
          chalk.gray(`  Manifest: ${path.join(packDir, "pack.json")}`),
        );
        console.log(chalk.gray(`\nTo install this pack locally:`));
        console.log(
          chalk.cyan(`  apex pack install ${name} --source ${packDir}`),
        );
      } catch (error) {
        console.error(
          chalk.red("Error:"),
          error instanceof Error ? error.message : error,
        );
        process.exit(1);
      }
    });

  pack
    .command("remove <pack-name>")
    .description("Remove an installed pattern pack")
    .option("--keep-patterns", "Keep patterns but remove pack metadata")
    .action(async (packName: string, options) => {
      try {
        const spinner = ora(`Removing pack ${packName}...`).start();

        const packPath = path.join(
          process.cwd(),
          ".apex",
          "patterns",
          "packs",
          packName,
        );

        if (!(await fs.pathExists(packPath))) {
          spinner.fail(`Pack not found: ${packName}`);
          process.exit(1);
        }

        if (options.keepPatterns) {
          // Only remove pack metadata
          const manifestPath = path.join(packPath, "pack.json");
          if (await fs.pathExists(manifestPath)) {
            await fs.remove(manifestPath);
          }
        } else {
          // Remove entire pack
          await fs.remove(packPath);
        }

        // Rebuild index
        const repository = await createPatternRepository();
        await repository.rebuild();

        spinner.succeed(chalk.green(`✓ Pack ${packName} removed`));
      } catch (error) {
        console.error(
          chalk.red("Error:"),
          error instanceof Error ? error.message : error,
        );
        process.exit(1);
      }
    });

  return pack;
}

// Note: MCP server tools for packs (apex_pack_install, apex_pack_list, apex_pack_create)
// will need to be implemented in the MCP server to support these commands
