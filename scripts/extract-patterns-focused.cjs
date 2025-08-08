const fs = require('fs');
const { spawn } = require('child_process');

async function extractFocusedPatterns() {
  console.log('='.repeat(80));
  console.log('🎯 FOCUSED PATTERN EXTRACTION TEST');
  console.log('='.repeat(80));
  
  // Use a specific Clean Code example that we know has good patterns
  const cleanCodeExample = `
From Clean Code Chapter 3: Functions

BAD CODE:
public void pay(Employee e, double hours, double rate) {
  if (e.flags & HOURLY_FLAG) {
    // calculate hourly pay
    double pay = hours * rate;
    e.totalPay += pay;
  } else if (e.flags & SALARIED_FLAG) {
    // calculate salaried pay
    double pay = e.salary / 26;
    e.totalPay += pay;
  }
}

GOOD CODE:
public void pay(Employee e, double hours, double rate) {
  if (e.isHourly()) {
    e.totalPay += calculateHourlyPay(hours, rate);
  } else if (e.isSalaried()) {
    e.totalPay += calculateSalariedPay();
  }
}

private double calculateHourlyPay(double hours, double rate) {
  return hours * rate;
}

private double calculateSalariedPay() {
  return salary / 26;
}
`;

  // Very focused prompt
  const prompt = `Extract 2 SPECIFIC coding patterns from this Clean Code example.

Focus on ACTIONABLE techniques with BEFORE/AFTER code.

JSON only:
{
  "patterns": [
    {
      "title": "specific technique name",
      "description": "what to do and why",
      "category": "REFACTORING",
      "code": {
        "language": "java",
        "snippet": "BEFORE and AFTER code example",
        "context": "when to apply"
      },
      "tags": ["refactoring"],
      "keyInsight": "core benefit",
      "whenToUse": "specific situation",
      "commonPitfalls": ["specific mistake"]
    }
  ]
}

Example:
${cleanCodeExample}`;

  console.log('\n📤 Sending focused prompt to Claude...');
  console.log(`Prompt length: ${prompt.length} characters (much smaller)`);
  
  const claudePath = '/Users/ben/.claude/local/claude';
  const child = spawn(claudePath, ['-p'], {
    stdio: ['pipe', 'pipe', 'pipe']
  });
  
  let stdout = '';
  let stderr = '';
  
  const timeout = setTimeout(() => {
    console.log('⏰ Timeout - killing process after 90 seconds');
    child.kill();
  }, 90000); // 90 seconds timeout
  
  child.stdout.on('data', (data) => {
    stdout += data.toString();
  });
  
  child.stderr.on('data', (data) => {
    stderr += data.toString();
  });
  
  child.on('close', (code) => {
    clearTimeout(timeout);
    console.log(`\nProcess exited with code: ${code}`);
    
    if (stdout) {
      try {
        const jsonMatch = stdout.match(/\{[\s\S]*"patterns"[\s\S]*\}/);
        if (jsonMatch) {
          const result = JSON.parse(jsonMatch[0]);
          
          console.log('\n' + '='.repeat(80));
          console.log('✅ EXTRACTION SUCCESSFUL');
          console.log('='.repeat(80));
          
          if (result.patterns && result.patterns.length > 0) {
            console.log(`\nExtracted ${result.patterns.length} patterns:\n`);
            
            result.patterns.forEach((pattern, i) => {
              console.log(`[Pattern ${i + 1}] ${pattern.title}`);
              console.log('─'.repeat(60));
              console.log(`📝 Description: ${pattern.description}`);
              console.log(`🏷️  Category: ${pattern.category}`);
              
              // Check quality indicators
              const hasBeforeAfter = pattern.code?.snippet && 
                                     (pattern.code.snippet.toLowerCase().includes('before') || 
                                      pattern.code.snippet.toLowerCase().includes('bad'));
              const isSpecific = pattern.whenToUse && 
                                pattern.whenToUse.length > 20 && 
                                !pattern.whenToUse.toLowerCase().includes('always');
              const hasRealPitfall = pattern.commonPitfalls && 
                                    pattern.commonPitfalls.length > 0 &&
                                    pattern.commonPitfalls[0].length > 15;
              
              console.log(`\n✅ Quality Checks:`);
              console.log(`  ${hasBeforeAfter ? '✅' : '❌'} Has Before/After example`);
              console.log(`  ${isSpecific ? '✅' : '❌'} Specific usage context`);
              console.log(`  ${hasRealPitfall ? '✅' : '❌'} Concrete pitfalls`);
              
              if (pattern.code?.snippet) {
                console.log(`\n💻 Code Example:`);
                const lines = pattern.code.snippet.split('\\n').slice(0, 5);
                lines.forEach(line => console.log(`  ${line}`));
                if (pattern.code.snippet.split('\\n').length > 5) {
                  console.log(`  ... (${pattern.code.snippet.split('\\n').length - 5} more lines)`);
                }
              }
              
              console.log(`\n🎯 Key Insight: ${pattern.keyInsight || 'None'}`);
              console.log(`📍 When to Use: ${pattern.whenToUse || 'Not specified'}`);
              
              if (pattern.commonPitfalls && pattern.commonPitfalls.length > 0) {
                console.log(`⚠️  Pitfalls:`);
                pattern.commonPitfalls.forEach(p => console.log(`  • ${p}`));
              }
              
              // Overall pattern quality
              const qualityScore = [hasBeforeAfter, isSpecific, hasRealPitfall].filter(x => x).length;
              console.log(`\n📊 Pattern Quality: ${qualityScore}/3 ${qualityScore === 3 ? '🌟 EXCELLENT' : qualityScore === 2 ? '✅ GOOD' : '⚠️  NEEDS IMPROVEMENT'}`);
              console.log('');
            });
            
            // Final assessment
            console.log('='.repeat(80));
            console.log('📈 QUALITY COMPARISON');
            console.log('='.repeat(80));
            console.log('\nPrevious extraction problems:');
            console.log('  ❌ Too abstract (e.g., "Code represents requirements")');
            console.log('  ❌ No actionable examples');
            console.log('  ❌ Philosophical rather than practical');
            
            console.log('\nCurrent extraction improvements:');
            const avgBeforeAfter = result.patterns.filter(p => 
              p.code?.snippet && (p.code.snippet.toLowerCase().includes('before') || 
                                 p.code.snippet.toLowerCase().includes('bad'))
            ).length / result.patterns.length;
            
            if (avgBeforeAfter > 0.5) {
              console.log('  ✅ Concrete before/after examples');
              console.log('  ✅ Actionable refactoring techniques');
              console.log('  ✅ Specific application contexts');
            } else {
              console.log('  ⚠️  Still need more concrete examples');
            }
            
          } else {
            console.log('No patterns found');
          }
        } else {
          console.log('Could not parse JSON');
          console.log('Response:', stdout.substring(0, 500));
        }
      } catch (e) {
        console.log('Error:', e.message);
        console.log('Response:', stdout.substring(0, 500));
      }
    } else {
      console.log('No response received');
    }
    
    if (stderr) {
      console.log('Stderr:', stderr);
    }
  });
  
  child.stdin.write(prompt);
  child.stdin.end();
}

extractFocusedPatterns().catch(console.error);