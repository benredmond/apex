#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { createPatternsCommand } from './commands/patterns.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const program = new Command();

// ASCII art for APEX
const logo = `
    ___    ____  _______  __
   /   |  / __ \\/ ____/ |/ /
  / /| | / /_/ / __/  |   / 
 / ___ |/ ____/ /___ /   |  
/_/  |_/_/   /_____//_/|_|  
                            
Autonomous Pattern-Enhanced eXecution
`;

program
  .name('apex')
  .description('APEX Intelligence - AI-powered development workflow')
  .version('0.1.0');

// Init command
program
  .command('init')
  .description('Initialize APEX in your project')
  .option('-f, --force', 'Force initialization even if APEX already exists')
  .action(async (options) => {
    console.log(chalk.cyan(logo));
    console.log(chalk.bold('🚀 Initializing APEX Intelligence...\n'));

    const spinner = ora('Checking current directory...').start();

    // Check if already initialized
    if (fs.existsSync('.apex') && !options.force) {
      spinner.fail('APEX already initialized in this project');
      console.log(chalk.yellow('\nUse --force to reinitialize'));
      process.exit(1);
    }

    spinner.succeed('Initial checks complete');

    // Prompt for project details
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'projectName',
        message: 'Project name:',
        default: path.basename(process.cwd()),
      },
    ]);

    const spinner2 = ora('Creating APEX directory structure...').start();

    // Create directory structure
    const apexDirs = [
      '.apex/01_PROJECT_DOCS',
      '.apex/02_PLANNING/MILESTONES',
      '.apex/03_ACTIVE_SPRINTS',
      '.apex/04_GENERAL_TASKS',
      '.apex/05_ARCHIVED_SPRINTS',
      '.apex/06_QUALITY',
      '.apex/07_EXECUTION',
      '.apex/08_ARCHITECTURE_DECISIONS',
      '.apex/09_LEARNING/patterns',
      '.apex/10_KNOWLEDGE',
      '.apex/11_STATE_OF_PROJECT',
      '.apex/12_TEMPLATES',
    ];

    for (const dir of apexDirs) {
      await fs.ensureDir(dir);
    }

    // Create Claude commands structure (if Claude is detected)
    const claudeDirs = [
      '.claude/commands/apex/01_plan',
      '.claude/commands/apex/02_execute',
      '.claude/commands/apex/03_quality',
      '.claude/commands/apex/04_finalize',
      '.claude/commands/apex/05_system',
      '.claude/agents',
    ];

    for (const dir of claudeDirs) {
      await fs.ensureDir(dir);
    }

    // Copy command templates
    spinner2.text = 'Installing APEX command templates...';

    const templatePath = path.join(
      __dirname,
      '../../templates/.claude/commands/apex',
    );
    const targetPath = '.claude/commands/apex';

    if (await fs.pathExists(templatePath)) {
      await fs.copy(templatePath, targetPath, { overwrite: true });
    }

    // Copy agent templates
    spinner2.text = 'Installing APEX agent templates...';

    const agentTemplatePath = path.join(
      __dirname,
      '../../templates/.claude/agents',
    );
    const targetAgentsPath = '.claude/agents';

    if (await fs.pathExists(agentTemplatePath)) {
      await fs.copy(agentTemplatePath, targetAgentsPath, { overwrite: true });
      const agentFiles = await fs.readdir(agentTemplatePath);
      spinner2.text = `Installed ${agentFiles.length} agent templates...`;
    }

    spinner2.text = 'Creating configuration files...';

    // Create PROJECT_MANIFEST.md
    const projectManifest = `# PROJECT MANIFEST - ${answers.projectName}

## Project Overview
- **Name**: ${answers.projectName}
- **Status**: Active
- **Created**: ${new Date().toISOString()}
- **Last Updated**: ${new Date().toISOString()}

## Milestones
<!-- Milestones will be added here by plan.milestone command -->

## Active Work
- **Current Milestone**: None
- **Current Sprint**: None
- **Total Tasks**: 0
- **Completed Tasks**: 0

## Notes
This manifest is automatically updated by APEX commands.
`;

    await fs.writeFile('.apex/00_PROJECT_MANIFEST.md', projectManifest);

    // Copy template files
    const apexTemplatePath = path.join(__dirname, '../../templates/.apex');

    if (await fs.pathExists(apexTemplatePath)) {
      // Copy pattern files
      const templateFiles = [
        'CONVENTIONS.md',
        'CONVENTIONS.pending.md',
        'PATTERN_GUIDE.md',
        'PATTERN_EXAMPLES.md',
        'INTELLIGENCE_TRIGGERS.md',
      ];

      for (const file of templateFiles) {
        const srcPath = path.join(apexTemplatePath, file);
        const destPath = path.join('.apex', file);
        if (await fs.pathExists(srcPath)) {
          await fs.copy(srcPath, destPath);
        }
      }
    } else {
      // Fallback - create basic files if templates not found
      const conventions = `# Conventions

## Patterns

<!-- APEX Intelligence will populate this file with discovered patterns -->
<!-- Patterns are automatically promoted from CONVENTIONS.pending.md -->
`;

      await fs.writeFile('.apex/CONVENTIONS.md', conventions);

      const pendingConventions = `# Pending Conventions

## Patterns Being Tested

<!-- New patterns are added here and promoted after successful use -->
`;

      await fs.writeFile('.apex/CONVENTIONS.pending.md', pendingConventions);
    }

    // Create failures.jsonl
    await fs.writeFile('.apex/09_LEARNING/failures.jsonl', '');

    // Create PATTERN_METADATA.json
    const patternMetadata = {
      patterns: {},
      metadata: {
        created_at: new Date().toISOString(),
        last_updated: new Date().toISOString(),
        total_patterns: 0,
        promotion_threshold: 3,
      },
    };
    await fs.writeJson('.apex/PATTERN_METADATA.json', patternMetadata, {
      spaces: 2,
    });

    // Create TASK_LEARNINGS.md
    const taskLearnings = `# Task Learnings

## Overview
This file captures key learnings from completed tasks to inform future work.

## Learnings Log

<!-- APEX Intelligence will populate this file with learnings extracted from tasks -->
<!-- Format: [DATE] TASK_ID: Learning description -->
`;
    await fs.writeFile('.apex/09_LEARNING/TASK_LEARNINGS.md', taskLearnings);

    // Create config
    const config = {
      apex: {
        patternPromotionThreshold: 3,
        trustScoreThreshold: 0.8,
        complexityThreshold: 5,
        enableAutoPatterns: true,
      },
    };

    await fs.writeJson('.apex/config.json', config, { spaces: 2 });

    spinner2.succeed('APEX initialized successfully!');

    console.log(chalk.green('\n✨ APEX Intelligence is ready!\n'));
    console.log('Next steps:');
    console.log(
      chalk.cyan(
        '  1. Open your AI coding assistant (Claude Code, Cursor, etc.)',
      ),
    );
    console.log(
      chalk.cyan(
        '  2. Create your first task: /create_task "Your task description"',
      ),
    );
    console.log(chalk.cyan('  3. Execute it: /task T001\n'));
    console.log(
      chalk.dim(
        '  For more commands, see the README or run /prime to load APEX context\n',
      ),
    );
  });

// Patterns command
program
  .command('patterns')
  .description('View and manage APEX patterns')
  .option('-a, --all', 'Show all patterns including pending')
  .option('-s, --stats', 'Show pattern statistics')
  .action(async (options) => {
    const spinner = ora('Loading patterns...').start();

    try {
      const conventionsPath = '.apex/CONVENTIONS.md';
      const pendingPath = '.apex/CONVENTIONS.pending.md';

      if (!fs.existsSync(conventionsPath)) {
        spinner.fail('APEX not initialized. Run "apex init" first.');
        process.exit(1);
      }

      spinner.stop();

      console.log(chalk.cyan('\n📚 APEX Intelligence Patterns\n'));

      // Read and display patterns
      const conventions = await fs.readFile(conventionsPath, 'utf-8');
      const patternMatches = conventions.match(/\[.*?\]/g) || [];

      console.log(chalk.bold(`Active Patterns: ${patternMatches.length}`));

      if (options.all) {
        const pending = await fs.readFile(pendingPath, 'utf-8');
        const pendingMatches = pending.match(/\[.*?\]/g) || [];
        console.log(chalk.yellow(`Pending Patterns: ${pendingMatches.length}`));
      }

      if (options.stats) {
        // TODO: Implement pattern statistics
        console.log(chalk.gray('\nPattern statistics coming soon...'));
      }
    } catch (error) {
      spinner.fail('Error loading patterns');
      console.error(error);
    }
  });

// Pattern lint command
program
  .command('pattern-lint <pattern>')
  .description('Validate APEX pattern files')
  .option('-v, --verbose', 'Show detailed validation output')
  .action(async (pattern, options) => {
    const { lintPatterns } = await import('./commands/pattern-lint.js');
    await lintPatterns(pattern, options);
  });

// Prime command
program
  .command('prime')
  .description('Prime APEX Intelligence with project context')
  .action(async () => {
    console.log(chalk.cyan('\n🧠 Priming APEX Intelligence...\n'));
    console.log('Copy and paste this into your AI assistant:\n');
    console.log(chalk.green('---BEGIN APEX PRIME---'));
    console.log(
      'I am working with APEX (Autonomous Pattern-Enhanced eXecution).',
    );
    console.log(
      'APEX Intelligence is active. Load project context from .apex/',
    );
    console.log('Pattern recognition enabled. Failure prevention active.');
    console.log('Use /apex commands for structured workflow.');
    console.log(chalk.green('---END APEX PRIME---\n'));
  });

// Verify command
program
  .command('verify')
  .description('Verify APEX installation and configuration')
  .action(async () => {
    const spinner = ora('Verifying APEX installation...').start();

    const checks = [
      { name: 'APEX directory', path: '.apex', required: true },
      {
        name: 'Project manifest',
        path: '.apex/00_PROJECT_MANIFEST.md',
        required: true,
      },
      { name: 'Conventions', path: '.apex/CONVENTIONS.md', required: true },
      { name: 'Config file', path: '.apex/config.json', required: false },
      {
        name: 'Claude integration',
        path: '.claude/commands/apex',
        required: false,
      },
      { name: 'Agent templates', path: '.claude/agents', required: false },
    ];

    let allGood = true;

    spinner.stop();
    console.log(chalk.cyan('\n🔍 APEX System Verification\n'));

    for (const check of checks) {
      const exists = fs.existsSync(check.path);
      const status = exists
        ? chalk.green('✓')
        : check.required
          ? chalk.red('✗')
          : chalk.yellow('○');
      console.log(`${status} ${check.name}`);

      if (check.required && !exists) {
        allGood = false;
      }
    }

    if (allGood) {
      console.log(chalk.green('\n✨ APEX is properly configured!\n'));
    } else {
      console.log(chalk.red('\n⚠️  Some required components are missing.'));
      console.log(chalk.yellow('Run "apex init" to fix issues.\n'));
    }
  });

// Add patterns command
program.addCommand(createPatternsCommand());

program.parse(process.argv);
