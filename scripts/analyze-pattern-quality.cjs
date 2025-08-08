const fs = require('fs');
const pdfParse = require('pdf-parse/lib/pdf-parse.js');
const { spawn } = require('child_process');

async function analyzePatternQuality() {
  const pdfPath = '/Users/ben/Downloads/Clean Code ( PDFDrive.com ).pdf';
  
  console.log('='.repeat(80));
  console.log('PATTERN QUALITY ANALYSIS - Clean Code Extraction');
  console.log('='.repeat(80));
  
  // Get a better sample - pages 32-36 should have Chapter 1 actual content
  console.log('\n📖 Extracting Clean Code Chapter 1 (pages 32-36)...');
  const dataBuffer = fs.readFileSync(pdfPath);
  
  const pdfData = await pdfParse(dataBuffer, {
    pagerender: (pageData) => {
      const pageNum = pageData.pageIndex + 1;
      // Get the actual Chapter 1 content pages
      if (pageNum >= 32 && pageNum <= 36) {
        return pageData.getTextContent().then(text => {
          const strings = text.items.map(item => item.str);
          return strings.join(' ');
        });
      }
      return '';
    }
  });
  
  console.log(`✓ Extracted ${pdfData.text.length} characters`);
  
  // Clean up text
  const cleanedText = pdfData.text
    .replace(/\s+/g, ' ')
    .replace(/\[PAGE \d+\]/g, '')
    .trim();
  
  console.log('\n📝 Sample of actual content:');
  console.log('-'.repeat(60));
  console.log(cleanedText.substring(0, 500) + '...');
  console.log('-'.repeat(60));
  
  // Create a more specific prompt for higher quality patterns
  const prompt = `You are analyzing Chapter 1 of "Clean Code" by Robert C. Martin.

Extract 5-7 HIGH-QUALITY software engineering patterns. Each pattern must be:
1. CONCRETE - Specific actionable guidance, not vague principles
2. REUSABLE - Applicable across different codebases
3. VALUABLE - Solves a real problem developers face
4. EXAMPLE-DRIVEN - Include real code examples when possible

Focus on patterns about:
- Code quality principles
- Naming conventions
- Code organization
- Refactoring approaches
- Professional practices

Return ONLY valid JSON:
{
  "patterns": [
    {
      "title": "Descriptive pattern name",
      "description": "Clear explanation of what this pattern does and why",
      "category": "NAMING|FUNCTIONS|REFACTORING|CODE_QUALITY|TESTING|ARCHITECTURE",
      "code": {
        "language": "javascript",
        "snippet": "// Actual code example\\nconst code = 'example';",
        "context": "When/where to use this"
      },
      "tags": ["relevant", "tags"],
      "keyInsight": "The crucial learning or principle",
      "whenToUse": "Specific situations where this applies",
      "commonPitfalls": ["Specific mistakes to avoid"]
    }
  ],
  "metadata": {
    "chapterTitle": "Clean Code",
    "mainConcepts": ["concepts covered"],
    "extractionConfidence": 0.9
  }
}

Chapter content:
"""
${cleanedText.substring(0, 4000)}
"""

Extract patterns that developers can immediately apply to improve their code.`;

  console.log(`\n📤 Calling Claude for pattern extraction...`);
  console.log(`Prompt length: ${prompt.length} characters`);
  
  const claudePath = '/Users/ben/.claude/local/claude';
  
  const child = spawn(claudePath, ['-p'], {
    stdio: ['pipe', 'pipe', 'pipe']
  });
  
  let stdout = '';
  let stderr = '';
  
  const timeout = setTimeout(() => {
    console.log('⏰ Timeout - killing process');
    child.kill();
  }, 45000);
  
  child.stdout.on('data', (data) => {
    stdout += data.toString();
  });
  
  child.stderr.on('data', (data) => {
    stderr += data.toString();
  });
  
  child.on('close', (code) => {
    clearTimeout(timeout);
    
    if (stdout) {
      try {
        // Parse the response
        const jsonMatch = stdout.match(/\{[\s\S]*"patterns"[\s\S]*\}/);
        if (jsonMatch) {
          const result = JSON.parse(jsonMatch[0]);
          
          console.log('\n' + '='.repeat(80));
          console.log('📊 PATTERN QUALITY ASSESSMENT');
          console.log('='.repeat(80));
          
          if (result.patterns && result.patterns.length > 0) {
            console.log(`\n✅ Extracted ${result.patterns.length} patterns\n`);
            
            // Analyze each pattern
            result.patterns.forEach((pattern, i) => {
              console.log(`\n[Pattern ${i + 1}] ${pattern.title}`);
              console.log('─'.repeat(60));
              
              // Quality metrics
              const metrics = {
                hasDescription: !!pattern.description && pattern.description.length > 20,
                hasCode: !!pattern.code?.snippet,
                hasContext: !!pattern.whenToUse && pattern.whenToUse.length > 10,
                hasInsight: !!pattern.keyInsight && pattern.keyInsight.length > 10,
                hasPitfalls: Array.isArray(pattern.commonPitfalls) && pattern.commonPitfalls.length > 0,
                hasValidCategory: ['NAMING', 'FUNCTIONS', 'REFACTORING', 'CODE_QUALITY', 'TESTING', 'ARCHITECTURE'].includes(pattern.category)
              };
              
              const qualityScore = Object.values(metrics).filter(v => v).length;
              const maxScore = Object.keys(metrics).length;
              
              console.log(`📈 Quality Score: ${qualityScore}/${maxScore} (${Math.round(qualityScore/maxScore * 100)}%)`);
              
              // Show details
              console.log(`\n📝 Category: ${pattern.category}`);
              console.log(`📖 Description: ${pattern.description?.substring(0, 100)}${pattern.description?.length > 100 ? '...' : ''}`);
              
              if (pattern.code?.snippet) {
                console.log(`💻 Has Code Example: ✅`);
                console.log(`   ${pattern.code.snippet.substring(0, 80).replace(/\n/g, '\\n')}${pattern.code.snippet.length > 80 ? '...' : ''}`);
              } else {
                console.log(`💻 Has Code Example: ❌`);
              }
              
              console.log(`🎯 Key Insight: ${pattern.keyInsight ? '✅' : '❌'} ${pattern.keyInsight?.substring(0, 60) || 'Missing'}${pattern.keyInsight?.length > 60 ? '...' : ''}`);
              console.log(`📍 When to Use: ${pattern.whenToUse ? '✅' : '❌'} ${pattern.whenToUse?.substring(0, 60) || 'Missing'}${pattern.whenToUse?.length > 60 ? '...' : ''}`);
              console.log(`⚠️  Pitfalls: ${metrics.hasPitfalls ? `✅ (${pattern.commonPitfalls.length} listed)` : '❌ None listed'}`);
              
              // Quality assessment
              console.log(`\n🏆 Assessment:`);
              if (qualityScore >= 5) {
                console.log(`   ✅ HIGH QUALITY - Ready for production use`);
              } else if (qualityScore >= 3) {
                console.log(`   ⚠️  MEDIUM QUALITY - Needs enhancement`);
              } else {
                console.log(`   ❌ LOW QUALITY - Requires significant improvement`);
              }
            });
            
            // Overall statistics
            console.log('\n' + '='.repeat(80));
            console.log('📊 OVERALL QUALITY METRICS');
            console.log('='.repeat(80));
            
            const avgScore = result.patterns.reduce((sum, pattern) => {
              const metrics = {
                hasDescription: !!pattern.description && pattern.description.length > 20,
                hasCode: !!pattern.code?.snippet,
                hasContext: !!pattern.whenToUse && pattern.whenToUse.length > 10,
                hasInsight: !!pattern.keyInsight && pattern.keyInsight.length > 10,
                hasPitfalls: Array.isArray(pattern.commonPitfalls) && pattern.commonPitfalls.length > 0,
                hasValidCategory: ['NAMING', 'FUNCTIONS', 'REFACTORING', 'CODE_QUALITY', 'TESTING', 'ARCHITECTURE'].includes(pattern.category)
              };
              return sum + Object.values(metrics).filter(v => v).length;
            }, 0) / result.patterns.length;
            
            const withCode = result.patterns.filter(p => p.code?.snippet).length;
            const withInsights = result.patterns.filter(p => p.keyInsight && p.keyInsight.length > 10).length;
            const withPitfalls = result.patterns.filter(p => Array.isArray(p.commonPitfalls) && p.commonPitfalls.length > 0).length;
            
            console.log(`\n📈 Average Quality Score: ${avgScore.toFixed(1)}/6 (${Math.round(avgScore/6 * 100)}%)`);
            console.log(`💻 Patterns with Code Examples: ${withCode}/${result.patterns.length} (${Math.round(withCode/result.patterns.length * 100)}%)`);
            console.log(`🎯 Patterns with Key Insights: ${withInsights}/${result.patterns.length} (${Math.round(withInsights/result.patterns.length * 100)}%)`);
            console.log(`⚠️  Patterns with Pitfalls: ${withPitfalls}/${result.patterns.length} (${Math.round(withPitfalls/result.patterns.length * 100)}%)`);
            
            // Categories distribution
            const categories = {};
            result.patterns.forEach(p => {
              categories[p.category] = (categories[p.category] || 0) + 1;
            });
            
            console.log(`\n📂 Category Distribution:`);
            Object.entries(categories).forEach(([cat, count]) => {
              console.log(`   ${cat}: ${count} patterns`);
            });
            
            // Final verdict
            console.log('\n' + '='.repeat(80));
            console.log('🎯 FINAL QUALITY VERDICT');
            console.log('='.repeat(80));
            
            if (avgScore >= 5) {
              console.log(`\n✅ EXCELLENT QUALITY`);
              console.log(`These patterns are well-structured, actionable, and ready for use.`);
            } else if (avgScore >= 4) {
              console.log(`\n✅ GOOD QUALITY`);
              console.log(`These patterns are useful but could benefit from more examples or context.`);
            } else if (avgScore >= 3) {
              console.log(`\n⚠️ MODERATE QUALITY`);
              console.log(`These patterns need enhancement - add code examples, insights, and pitfalls.`);
            } else {
              console.log(`\n❌ POOR QUALITY`);
              console.log(`These patterns lack essential details and need significant improvement.`);
            }
            
            console.log(`\n💡 Recommendations for improvement:`);
            if (withCode < result.patterns.length) {
              console.log(`   • Add code examples to ${result.patterns.length - withCode} patterns`);
            }
            if (withInsights < result.patterns.length) {
              console.log(`   • Add key insights to ${result.patterns.length - withInsights} patterns`);
            }
            if (withPitfalls < result.patterns.length * 0.5) {
              console.log(`   • Document common pitfalls for more patterns`);
            }
            
          } else {
            console.log('❌ No patterns found in response');
          }
        } else {
          console.log('❌ Could not parse JSON from response');
          console.log('Response preview:', stdout.substring(0, 500));
        }
      } catch (e) {
        console.log('❌ Error:', e.message);
        if (stdout) {
          console.log('Raw response:', stdout.substring(0, 500));
        }
      }
    }
    
    if (stderr) {
      console.log('Stderr:', stderr);
    }
  });
  
  child.stdin.write(prompt);
  child.stdin.end();
}

analyzePatternQuality().catch(console.error);