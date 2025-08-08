const fs = require('fs');
const pdfParse = require('pdf-parse/lib/pdf-parse.js');
const { spawn } = require('child_process');

async function extractQualityPatterns() {
  const pdfPath = '/Users/ben/Downloads/Clean Code ( PDFDrive.com ).pdf';
  
  console.log('='.repeat(80));
  console.log('🎯 HIGH-QUALITY PATTERN EXTRACTION - Clean Code');
  console.log('='.repeat(80));
  
  // Target pages 40-60 where actual code examples should be
  console.log('\n📖 Extracting pages 40-60 (code-heavy sections)...');
  const dataBuffer = fs.readFileSync(pdfPath);
  
  const pdfData = await pdfParse(dataBuffer, {
    pagerender: (pageData) => {
      const pageNum = pageData.pageIndex + 1;
      // Get pages with actual code examples
      if (pageNum >= 40 && pageNum <= 60) {
        return pageData.getTextContent().then(text => {
          const strings = text.items.map(item => item.str);
          return strings.join(' ');
        });
      }
      return '';
    }
  });
  
  console.log(`✓ Extracted ${pdfData.text.length} characters from pages 40-60`);
  
  // Look for code sections (usually marked with Listing or code blocks)
  const text = pdfData.text;
  
  // Find sections with code indicators
  const codeIndicators = [
    'Listing',
    'private',
    'public',
    'function',
    'class',
    'int ',
    'String ',
    'void ',
    'return',
    '();',
    '{}',
    'if \\(',
    'for \\(',
    'while \\('
  ];
  
  // Find the most code-dense section
  let bestSection = '';
  let bestScore = 0;
  
  for (let i = 0; i < text.length - 3000; i += 500) {
    const section = text.substring(i, i + 3000);
    let score = 0;
    
    codeIndicators.forEach(indicator => {
      const matches = (section.match(new RegExp(indicator, 'g')) || []).length;
      score += matches;
    });
    
    if (score > bestScore) {
      bestScore = score;
      bestSection = section;
    }
  }
  
  console.log(`\n📊 Found code-dense section with score: ${bestScore}`);
  console.log('\n📝 Sample of content (first 500 chars):');
  console.log('-'.repeat(60));
  console.log(bestSection.substring(0, 500));
  console.log('-'.repeat(60));
  
  // Create a much more specific prompt for actionable patterns
  const prompt = `You are extracting ACTIONABLE coding patterns from Clean Code.

CRITICAL: Extract only SPECIFIC, IMMEDIATELY APPLICABLE techniques that developers can use TODAY.
NOT philosophical observations or abstract principles.

Each pattern MUST have:
1. A specific technique or rule (not a vague principle)
2. REAL code showing BEFORE and AFTER
3. Concrete situations when to apply it
4. Specific mistakes to avoid

Return ONLY this JSON structure:
{
  "patterns": [
    {
      "title": "Extract Method When You See Comments",
      "description": "Replace explanatory comments with well-named extracted methods",
      "category": "REFACTORING",
      "code": {
        "language": "java",
        "snippet": "// BEFORE:\\nif (employee.flags & HOURLY_FLAG) {\\n  // calculate hourly pay\\n  pay = hours * rate;\\n}\\n\\n// AFTER:\\nif (employee.isHourly()) {\\n  pay = calculateHourlyPay(hours, rate);\\n}",
        "context": "When comments explain what code does"
      },
      "tags": ["refactoring", "readability", "methods"],
      "keyInsight": "The method name replaces the need for the comment",
      "whenToUse": "Whenever you write a comment explaining what the next few lines do",
      "commonPitfalls": ["Extracting too many tiny methods", "Creating methods used only once"]
    }
  ],
  "metadata": {
    "chapterTitle": "Functions",
    "mainConcepts": ["method extraction", "naming"],
    "extractionConfidence": 0.95
  }
}

Text from Clean Code:
"""
${bestSection}
"""

Remember: Only ACTIONABLE patterns with REAL code examples. No abstract philosophy.`;

  console.log(`\n📤 Calling Claude with improved prompt...`);
  console.log(`Prompt focuses on: ACTIONABLE patterns with REAL code`);
  console.log(`Prompt length: ${prompt.length} characters`);
  
  const claudePath = '/Users/ben/.claude/local/claude';
  
  const child = spawn(claudePath, ['-p'], {
    stdio: ['pipe', 'pipe', 'pipe']
  });
  
  let stdout = '';
  let stderr = '';
  let responded = false;
  
  const timeout = setTimeout(() => {
    if (!responded) {
      console.log('⏰ Timeout after 45 seconds');
      child.kill('SIGTERM');
    }
  }, 45000);
  
  child.stdout.on('data', (data) => {
    stdout += data.toString();
    if (!responded) {
      console.log('📥 Receiving response from Claude...');
      responded = true;
    }
  });
  
  child.stderr.on('data', (data) => {
    stderr += data.toString();
  });
  
  child.on('close', (code) => {
    clearTimeout(timeout);
    
    if (stdout) {
      try {
        const jsonMatch = stdout.match(/\{[\s\S]*"patterns"[\s\S]*\}/);
        if (jsonMatch) {
          const result = JSON.parse(jsonMatch[0]);
          
          console.log('\n' + '='.repeat(80));
          console.log('🎯 IMPROVED PATTERN EXTRACTION RESULTS');
          console.log('='.repeat(80));
          
          if (result.patterns && result.patterns.length > 0) {
            console.log(`\n✅ Extracted ${result.patterns.length} patterns\n`);
            
            // Quality scoring function
            function scorePattern(pattern) {
              const scores = {
                hasSpecificTitle: pattern.title && pattern.title.length > 10 && !pattern.title.includes('Code'),
                hasActionableDescription: pattern.description && pattern.description.length > 30,
                hasRealCode: pattern.code?.snippet && pattern.code.snippet.includes('BEFORE') && pattern.code.snippet.includes('AFTER'),
                hasConcreteContext: pattern.whenToUse && pattern.whenToUse.length > 20 && !pattern.whenToUse.includes('Always'),
                hasPracticalInsight: pattern.keyInsight && pattern.keyInsight.length > 15,
                hasSpecificPitfalls: Array.isArray(pattern.commonPitfalls) && 
                                     pattern.commonPitfalls.length > 0 && 
                                     pattern.commonPitfalls[0].length > 10
              };
              
              const score = Object.values(scores).filter(v => v).length;
              return { score, max: Object.keys(scores).length, details: scores };
            }
            
            let totalScore = 0;
            let hasBeforeAfter = 0;
            let actionableCount = 0;
            
            result.patterns.forEach((pattern, i) => {
              const { score, max, details } = scorePattern(pattern);
              totalScore += score;
              
              console.log(`\n[Pattern ${i + 1}] ${pattern.title}`);
              console.log('─'.repeat(60));
              console.log(`📈 Quality Score: ${score}/${max} (${Math.round(score/max * 100)}%)`);
              
              // Quality indicators
              const indicators = [];
              if (details.hasRealCode) {
                indicators.push('✅ Has Before/After');
                hasBeforeAfter++;
              } else {
                indicators.push('❌ No Before/After');
              }
              
              if (details.hasConcreteContext) {
                indicators.push('✅ Specific Context');
                actionableCount++;
              } else {
                indicators.push('❌ Vague Context');
              }
              
              if (details.hasSpecificPitfalls) {
                indicators.push('✅ Real Pitfalls');
              } else {
                indicators.push('❌ Generic Pitfalls');
              }
              
              console.log(`🏷️  ${indicators.join(' | ')}`);
              
              // Show the pattern details
              console.log(`\n📝 Category: ${pattern.category}`);
              console.log(`📖 Description: ${pattern.description?.substring(0, 100)}${pattern.description?.length > 100 ? '...' : ''}`);
              
              if (pattern.code?.snippet) {
                const codePreview = pattern.code.snippet.substring(0, 150).replace(/\\n/g, '\n  ');
                console.log(`💻 Code Example:\n  ${codePreview}${pattern.code.snippet.length > 150 ? '...' : ''}`);
              }
              
              console.log(`🎯 Key Insight: ${pattern.keyInsight?.substring(0, 80) || 'Missing'}`);
              console.log(`📍 When to Use: ${pattern.whenToUse?.substring(0, 80) || 'Missing'}`);
              
              if (pattern.commonPitfalls && pattern.commonPitfalls.length > 0) {
                console.log(`⚠️  Pitfalls: ${pattern.commonPitfalls[0].substring(0, 60)}${pattern.commonPitfalls.length > 1 ? ` (+${pattern.commonPitfalls.length - 1} more)` : ''}`);
              }
              
              // Pattern quality verdict
              if (score >= 5) {
                console.log(`\n✅ HIGH QUALITY - Actionable pattern with concrete examples`);
              } else if (score >= 3) {
                console.log(`\n⚠️  MEDIUM QUALITY - Useful but needs more specificity`);
              } else {
                console.log(`\n❌ LOW QUALITY - Too abstract or incomplete`);
              }
            });
            
            // Overall assessment
            console.log('\n' + '='.repeat(80));
            console.log('📊 OVERALL QUALITY METRICS');
            console.log('='.repeat(80));
            
            const avgScore = totalScore / result.patterns.length;
            const maxPossible = 6;
            const percentageScore = Math.round(avgScore / maxPossible * 100);
            
            console.log(`\n📈 Average Quality Score: ${avgScore.toFixed(1)}/${maxPossible} (${percentageScore}%)`);
            console.log(`💻 Patterns with Before/After: ${hasBeforeAfter}/${result.patterns.length}`);
            console.log(`🎯 Actionable Patterns: ${actionableCount}/${result.patterns.length}`);
            
            // Improvement assessment
            console.log('\n' + '='.repeat(80));
            console.log('🔄 IMPROVEMENT ANALYSIS');
            console.log('='.repeat(80));
            
            console.log('\n📊 Compared to previous extraction:');
            
            if (percentageScore > 60) {
              console.log('✅ SIGNIFICANT IMPROVEMENT - Patterns are now actionable');
              console.log('   • Better code examples');
              console.log('   • More specific guidance');
              console.log('   • Concrete application contexts');
            } else if (percentageScore > 40) {
              console.log('⚠️  MODERATE IMPROVEMENT - Getting better but need more specificity');
              console.log('   • Add more before/after examples');
              console.log('   • Make contexts more specific');
            } else {
              console.log('❌ MINIMAL IMPROVEMENT - Still too abstract');
              console.log('   • Need to find better source text with code');
              console.log('   • Prompt needs to be even more specific');
            }
            
            // Final recommendations
            console.log('\n💡 Next Steps for Better Quality:');
            if (hasBeforeAfter < result.patterns.length) {
              console.log('   1. Extract from pages with actual code listings (60-100)');
            }
            if (actionableCount < result.patterns.length) {
              console.log('   2. Focus on "how to" rather than "what is"');
            }
            console.log('   3. Look for sections with refactoring examples');
            console.log('   4. Target specific techniques like "Extract Method", "Rename Variable"');
            
          } else {
            console.log('❌ No patterns extracted');
          }
        } else {
          console.log('❌ Could not parse JSON from response');
          console.log('Response preview:', stdout.substring(0, 500));
        }
      } catch (e) {
        console.log('❌ Error:', e.message);
      }
    } else {
      console.log('❌ No response received');
    }
    
    if (stderr) {
      console.log('\nStderr:', stderr);
    }
  });
  
  child.stdin.write(prompt);
  child.stdin.end();
}

console.log('Starting improved pattern extraction...\n');
extractQualityPatterns().catch(console.error);