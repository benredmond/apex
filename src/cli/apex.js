#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

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

    spinner.text = 'Gathering project information...';

    // Prompt for project details
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'projectName',
        message: 'Project name:',
        default: path.basename(process.cwd())
      },
      {
        type: 'list',
        name: 'projectType',
        message: 'Project type:',
        choices: [
          'Full-stack Web Application',
          'Frontend Application',
          'Backend API',
          'CLI Tool',
          'Library/Package',
          'Other'
        ]
      },
      {
        type: 'confirm',
        name: 'useGemini',
        message: 'Enable Gemini integration for complex tasks?',
        default: false
      }
    ]);

    spinner.text = 'Creating APEX directory structure...';

    // Create directory structure
    const apexDirs = [
      '.apex/00_SYSTEM',
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
      '.apex/12_TEMPLATES'
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
      '.claude/commands/apex/05_system'
    ];

    for (const dir of claudeDirs) {
      await fs.ensureDir(dir);
    }

    spinner.text = 'Creating configuration files...';

    // Create manifest.json
    const manifest = {
      project: {
        name: answers.projectName,
        type: answers.projectType,
        description: '',
        version: '0.1.0',
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      apex: {
        version: '0.1.0',
        intelligence: {
          patterns: 0,
          trust_threshold: 0.8,
          gemini_enabled: answers.useGemini
        }
      }
    };

    await fs.writeJson('.apex/00_SYSTEM/manifest.json', manifest, { spaces: 2 });

    // Create CONVENTIONS.md
    const conventions = `# Conventions

## Patterns

<!-- APEX Intelligence will populate this file with discovered patterns -->
<!-- Patterns are automatically promoted from CONVENTIONS.pending.md -->
`;

    await fs.writeFile('.apex/CONVENTIONS.md', conventions);

    // Create CONVENTIONS.pending.md
    const pendingConventions = `# Pending Conventions

## Patterns Being Tested

<!-- New patterns are added here and promoted after successful use -->
`;

    await fs.writeFile('.apex/CONVENTIONS.pending.md', pendingConventions);

    // Create failures.jsonl
    await fs.writeFile('.apex/09_LEARNING/failures.jsonl', '');

    // Create config
    const config = {
      apex: {
        geminiApiKey: answers.useGemini ? '' : null,
        patternPromotionThreshold: 3,
        trustScoreThreshold: 0.8,
        complexityThreshold: 5,
        enableAutoPatterns: true
      }
    };

    await fs.writeJson('.apex/config.json', config, { spaces: 2 });

    spinner.succeed('APEX initialized successfully!');

    console.log(chalk.green('\n✨ APEX Intelligence is ready!\n'));
    console.log('Next steps:');
    console.log(chalk.cyan('  1. Start your AI coding assistant (Claude, Cursor, etc.)'));
    console.log(chalk.cyan('  2. Run: /apex system.prime'));
    console.log(chalk.cyan('  3. Create your first task: /apex plan.task "Your task description"'));
    console.log(chalk.cyan('  4. Execute it: /apex execute.task T001\n'));

    if (answers.useGemini) {
      console.log(chalk.yellow('⚠️  Remember to add your Gemini API key to .apex/config.json\n'));
    }
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

// Prime command
program
  .command('prime')
  .description('Prime APEX Intelligence with project context')
  .action(async () => {
    console.log(chalk.cyan('\n🧠 Priming APEX Intelligence...\n'));
    console.log('Copy and paste this into your AI assistant:\n');
    console.log(chalk.green('---BEGIN APEX PRIME---'));
    console.log('I am working with APEX (Autonomous Pattern-Enhanced eXecution).');
    console.log('APEX Intelligence is active. Load project context from .apex/');
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
      { name: 'Manifest file', path: '.apex/00_SYSTEM/manifest.json', required: true },
      { name: 'Conventions', path: '.apex/CONVENTIONS.md', required: true },
      { name: 'Config file', path: '.apex/config.json', required: false },
      { name: 'Claude integration', path: '.claude/commands/apex', required: false }
    ];

    let allGood = true;

    spinner.stop();
    console.log(chalk.cyan('\n🔍 APEX System Verification\n'));

    for (const check of checks) {
      const exists = fs.existsSync(check.path);
      const status = exists ? chalk.green('✓') : (check.required ? chalk.red('✗') : chalk.yellow('○'));
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

program.parse(process.argv);