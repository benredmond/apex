import chalk from 'chalk';
import ora from 'ora';
import path from 'path';
import { validatePatternFile } from '../../../dist/schemas/pattern/validators.js';
import { glob } from 'glob';

export async function lintPattern(filePath, options = {}) {
  const spinner = ora(`Validating ${filePath}...`).start();

  try {
    const result = await validatePatternFile(filePath);

    if (result.valid && result.data) {
      spinner.succeed(`✓ Valid ${result.data.type} pattern: ${result.data.id}`);

      // Show pattern details if verbose
      if (options.verbose) {
        console.log(chalk.dim(`  Version: ${result.data.pattern_version}`));
        console.log(
          chalk.dim(`  Trust: ${(result.data.trust_score * 100).toFixed(0)}%`),
        );
        console.log(
          chalk.dim(`  Tags: ${result.data.tags?.join(', ') || 'none'}`),
        );
      }

      // Show warnings if any
      if (result.warnings && result.warnings.length > 0) {
        console.log(chalk.yellow('\n  Warnings:'));
        result.warnings.forEach((warning) => {
          console.log(chalk.yellow(`    - ${warning}`));
        });
      }

      return { success: true, warnings: result.warnings?.length || 0 };
    } else {
      spinner.fail('✗ Invalid pattern');

      if (result.errors) {
        console.log(chalk.red('\n  Errors:'));
        result.errors.forEach((error) => {
          const prefix = error.path ? `${error.path}: ` : '';
          console.log(chalk.red(`    - ${prefix}${error.message}`));
        });
      }

      return { success: false, errors: result.errors?.length || 1 };
    }
  } catch (error) {
    spinner.fail(`Failed to validate ${filePath}`);
    console.log(chalk.red(`  ${error.message}`));
    return { success: false, errors: 1 };
  }
}

export async function lintPatterns(pattern, options = {}) {
  console.log(chalk.cyan('🔍 Validating APEX patterns...\n'));

  // Find all pattern files matching the glob
  const files = await glob(pattern, {
    nodir: true,
    absolute: true,
  });

  if (files.length === 0) {
    console.log(chalk.yellow('No pattern files found matching:', pattern));
    return;
  }

  console.log(chalk.dim(`Found ${files.length} file(s) to validate\n`));

  // Track results
  let totalFiles = 0;
  let validFiles = 0;
  let totalWarnings = 0;
  let totalErrors = 0;

  // Validate each file
  for (const file of files) {
    const relativePath = path.relative(process.cwd(), file);
    const result = await lintPattern(relativePath, options);

    totalFiles++;
    if (result.success) {
      validFiles++;
      totalWarnings += result.warnings || 0;
    } else {
      totalErrors += result.errors || 0;
    }

    if (totalFiles < files.length) {
      console.log(); // Add spacing between files
    }
  }

  // Summary
  console.log('\n' + chalk.bold('Summary:'));
  console.log(`  Total files: ${totalFiles}`);
  console.log(`  Valid: ${chalk.green(validFiles)}`);
  console.log(`  Invalid: ${chalk.red(totalFiles - validFiles)}`);

  if (totalWarnings > 0) {
    console.log(`  Warnings: ${chalk.yellow(totalWarnings)}`);
  }

  if (totalErrors > 0) {
    console.log(`  Errors: ${chalk.red(totalErrors)}`);
  }

  // Exit code
  if (totalFiles === validFiles) {
    console.log(chalk.green('\n✅ All patterns are valid!'));
    process.exit(0);
  } else {
    console.log(chalk.red('\n❌ Some patterns have errors'));
    process.exit(1);
  }
}
