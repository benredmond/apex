import { performance } from 'perf_hooks';
import { rankPatterns, PatternMeta, Signals } from '../src/ranking/index.js';

interface BenchmarkResult {
  name: string;
  patternCount: number;
  iterations: number;
  timings: {
    p50: number;
    p95: number;
    p99: number;
    mean: number;
  };
  candidateCounts: {
    min: number;
    max: number;
    mean: number;
  };
}

function generateSyntheticPatterns(count: number): PatternMeta[] {
  const patterns: PatternMeta[] = [];
  const types = ['LANG', 'CODEBASE', 'MIGRATION', 'TEST', 'POLICY'];
  const languages = ['typescript', 'javascript', 'python', 'go', 'rust'];
  const frameworks = ['express', 'react', 'vue', 'django', 'fastapi'];
  
  for (let i = 0; i < count; i++) {
    const type = types[Math.floor(Math.random() * types.length)];
    const lang = languages[Math.floor(Math.random() * languages.length)];
    const fw = frameworks[Math.floor(Math.random() * frameworks.length)];
    
    patterns.push({
      id: `BENCH.${type}:${i}`,
      type,
      scope: {
        paths: [
          `src/**/*.${lang}`,
          `lib/**/*.${lang}`,
          `services/${fw}/**/*`,
        ],
        languages: [lang],
        frameworks: [{ 
          name: fw, 
          range: `^${Math.floor(Math.random() * 5)}.0.0` 
        }],
      },
      trust: {
        alpha: Math.floor(Math.random() * 50) + 1,
        beta: Math.floor(Math.random() * 10) + 1,
      },
      metadata: {
        lastReviewed: new Date(
          Date.now() - Math.random() * 365 * 86400000
        ).toISOString(),
        halfLifeDays: 90,
        repo: Math.random() > 0.5 ? 'bench/repo' : undefined,
        org: Math.random() > 0.3 ? 'BENCH' : undefined,
      },
    });
  }
  
  return patterns;
}

function generateQuery(): Signals {
  const paths = [
    'src/api/gateway.ts',
    'lib/utils/helper.js',
    'services/express/routes.ts',
  ];
  const languages = ['typescript', 'javascript'];
  const frameworks = [
    { name: 'express', version: '4.18.2' },
    { name: 'react', version: '18.2.0' },
  ];
  
  return {
    paths: paths.slice(0, Math.floor(Math.random() * 3) + 1),
    languages: languages.slice(0, Math.floor(Math.random() * 2) + 1),
    frameworks: frameworks.slice(0, Math.floor(Math.random() * 2)),
    repo: Math.random() > 0.5 ? 'bench/repo' : undefined,
    org: Math.random() > 0.3 ? 'BENCH' : undefined,
  };
}

async function runBenchmark(
  patternCount: number,
  iterations: number
): Promise<BenchmarkResult> {
  console.log(`\nGenerating ${patternCount} synthetic patterns...`);
  const patterns = generateSyntheticPatterns(patternCount);
  
  console.log(`Running ${iterations} iterations...`);
  const timings: number[] = [];
  const candidateCounts: number[] = [];
  
  // Warmup
  for (let i = 0; i < 5; i++) {
    await rankPatterns(patterns, generateQuery(), 10);
  }
  
  // Actual benchmark
  const progressInterval = Math.max(1, Math.floor(iterations / 20));
  
  for (let i = 0; i < iterations; i++) {
    if (i % progressInterval === 0) {
      process.stdout.write(`\r  Progress: ${Math.floor(i / iterations * 100)}%`);
    }
    
    const query = generateQuery();
    const start = performance.now();
    
    const results = await rankPatterns(patterns, query, 10);
    
    const end = performance.now();
    timings.push(end - start);
    
    // Track candidate count (would need to expose this from the ranking system)
    candidateCounts.push(results.length);
  }
  
  process.stdout.write('\r  Progress: 100%\n');
  
  // Calculate statistics
  timings.sort((a, b) => a - b);
  const p50 = timings[Math.floor(timings.length * 0.5)];
  const p95 = timings[Math.floor(timings.length * 0.95)];
  const p99 = timings[Math.floor(timings.length * 0.99)];
  const mean = timings.reduce((a, b) => a + b) / timings.length;
  
  return {
    name: `${patternCount} patterns`,
    patternCount,
    iterations,
    timings: { p50, p95, p99, mean },
    candidateCounts: {
      min: Math.min(...candidateCounts),
      max: Math.max(...candidateCounts),
      mean: candidateCounts.reduce((a, b) => a + b) / candidateCounts.length,
    },
  };
}

async function main() {
  console.log('Pattern Ranking Performance Benchmark');
  console.log('=====================================');
  
  const configs = [
    { patterns: 1000, iterations: 100 },
    { patterns: 5000, iterations: 50 },
    { patterns: 10000, iterations: 30 },
    { patterns: 20000, iterations: 20 },
  ];
  
  const results: BenchmarkResult[] = [];
  
  for (const config of configs) {
    const result = await runBenchmark(config.patterns, config.iterations);
    results.push(result);
  }
  
  // Print results table
  console.log('\nResults Summary:');
  console.log('================\n');
  
  console.log('| Patterns | Iterations | P50 (ms) | P95 (ms) | P99 (ms) | Mean (ms) |');
  console.log('|----------|------------|----------|----------|----------|-----------|');
  
  for (const result of results) {
    console.log(
      `| ${result.patternCount.toString().padStart(8)} | ` +
      `${result.iterations.toString().padStart(10)} | ` +
      `${result.timings.p50.toFixed(1).padStart(8)} | ` +
      `${result.timings.p95.toFixed(1).padStart(8)} | ` +
      `${result.timings.p99.toFixed(1).padStart(8)} | ` +
      `${result.timings.mean.toFixed(1).padStart(9)} |`
    );
  }
  
  console.log('\nTarget Performance:');
  console.log('- P50: <1500ms ✓');
  console.log('- P95: <3000ms ✓');
  
  // Check if targets are met
  const tenKResult = results.find(r => r.patternCount === 10000);
  if (tenKResult) {
    console.log('\n10K Pattern Performance:');
    console.log(`- P50: ${tenKResult.timings.p50.toFixed(1)}ms ${tenKResult.timings.p50 < 1500 ? '✅' : '❌'}`);
    console.log(`- P95: ${tenKResult.timings.p95.toFixed(1)}ms ${tenKResult.timings.p95 < 3000 ? '✅' : '❌'}`);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { runBenchmark, generateSyntheticPatterns };