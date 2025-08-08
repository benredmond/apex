#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const { execSync } = require('child_process');

async function extractPatternsWithClaude() {
  const pdfPath = '/Users/ben/Downloads/Clean Code ( PDFDrive.com ).pdf';
  const claudePath = '/Users/ben/.claude/local/claude';
  
  console.log('='.repeat(80));
  console.log('CLEAN CODE PATTERN EXTRACTION - CLAUDE CLI (FIXED)');
  console.log('='.repeat(80));
  
  try {
    // Read PDF file
    const dataBuffer = fs.readFileSync(pdfPath);
    
    console.log('\n[STEP 1] Parsing Clean Code PDF...');
    
    // Parse pages 25-35 to get Chapter 2: Meaningful Names
    const pdfData = await pdfParse(dataBuffer, {
      pagerender: (pageData) => {
        const pageNum = pageData.pageIndex + 1;
        // Get pages around Chapter 2
        if (pageNum >= 25 && pageNum <= 35) {
          return pageData.getTextContent().then(text => {
            const strings = text.items.map(item => item.str);
            return strings.join(' ');
          });
        }
        return '';
      }
    });
    
    console.log(`✓ Extracted ${pdfData.text.length} characters from pages 25-35`);
    
    // Clean up the text a bit
    const cleanText = pdfData.text
      .replace(/\s+/g, ' ')  // Normalize whitespace
      .replace(/([a-z])([A-Z])/g, '$1 $2')  // Add space between camelCase
      .trim();
    
    // Get a meaningful excerpt (first 2500 chars should have good content)
    const textExcerpt = cleanText.substring(0, 2500);
    
    console.log('\n[STEP 2] Text preview (first 400 chars):');
    console.log('-'.repeat(60));
    console.log(textExcerpt.substring(0, 400) + '...');
    console.log('-'.repeat(60));
    
    // Create a focused extraction prompt
    const prompt = `You are analyzing an excerpt from "Clean Code" by Robert C. Martin.

Extract exactly 5 concrete software engineering patterns from this text.

Return ONLY a JSON object (no markdown, no explanation) in this exact format:
{
  "patterns": [
    {
      "id": "PAT:NAMING:INTENTION_REVEALING",
      "title": "Use Intention-Revealing Names",
      "category": "NAMING",
      "problem": "Code is hard to understand when variable names don't reveal their purpose",
      "solution": "Choose names that explicitly state what the variable or function does",
      "example": "int elapsedTimeInDays; // Good\\nint d; // Bad"
    }
  ]
}

Categories can be: NAMING, FUNCTIONS, CLASSES, ERROR_HANDLING, TESTING, REFACTORING

Text excerpt from Clean Code:
"""
${textExcerpt}
"""

Remember: Return ONLY the JSON object, nothing else.`;

    // Save prompt to file for Claude to read
    const promptFile = '/tmp/clean_code_prompt.txt';
    fs.writeFileSync(promptFile, prompt);
    console.log(`\n[STEP 3] Prompt saved to ${promptFile}`);
    console.log(`Prompt length: ${prompt.length} characters`);
    
    console.log('\n[STEP 4] Calling Claude CLI with -p flag...');
    
    const startTime = Date.now();
    
    try {
      // Use the -p flag for non-interactive mode
      const command = `cat '${promptFile}' | ${claudePath} -p`;
      console.log(`Command: ${command}`);
      
      const result = execSync(command, { 
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024,
        timeout: 30000  // 30 second timeout
      });
      
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`\n✅ Claude responded in ${duration} seconds`);
      
      // Save raw response
      const responseFile = '/tmp/claude_response.txt';
      fs.writeFileSync(responseFile, result);
      console.log(`💾 Raw response saved to ${responseFile}`);
      
      // Parse the JSON response
      console.log('\n[STEP 5] Parsing Claude\'s response...');
      
      let patterns = [];
      
      // Try to find JSON in the response
      // Claude might include some text before/after, so we need to extract the JSON
      const jsonMatch = result.match(/\{[\s\S]*"patterns"[\s\S]*?\][\s\S]*?\}/);
      
      if (jsonMatch) {
        try {
          const jsonStr = jsonMatch[0];
          const parsed = JSON.parse(jsonStr);
          patterns = parsed.patterns || [];
          console.log(`✅ Successfully parsed ${patterns.length} patterns`);
        } catch (parseError) {
          console.log('⚠️ JSON parse error:', parseError.message);
          console.log('Attempted to parse:', jsonMatch[0].substring(0, 200));
        }
      } else {
        // If no JSON found, try direct parse in case response is pure JSON
        try {
          const parsed = JSON.parse(result.trim());
          patterns = parsed.patterns || [];
          console.log(`✅ Direct parse successful: ${patterns.length} patterns`);
        } catch (e) {
          console.log('⚠️ No valid JSON found in response');
          console.log('Response preview (first 500 chars):');
          console.log(result.substring(0, 500));
        }
      }
      
      // Display the extracted patterns
      if (patterns.length > 0) {
        console.log('\n' + '='.repeat(80));
        console.log('🎉 SUCCESSFULLY EXTRACTED PATTERNS FROM CLEAN CODE');
        console.log('='.repeat(80));
        
        patterns.forEach((pattern, i) => {
          console.log(`\n[Pattern ${i + 1}] ${pattern.id}`);
          console.log(`  📝 Title: ${pattern.title}`);
          console.log(`  🏷️  Category: ${pattern.category}`);
          console.log(`  ❓ Problem: ${pattern.problem}`);
          console.log(`  ✅ Solution: ${pattern.solution}`);
          if (pattern.example) {
            const examplePreview = pattern.example.substring(0, 100);
            console.log(`  💻 Example: ${examplePreview}${pattern.example.length > 100 ? '...' : ''}`);
          }
        });
        
        // Summary statistics
        console.log('\n' + '='.repeat(80));
        console.log('📊 EXTRACTION SUMMARY');
        console.log('='.repeat(80));
        console.log(`✅ Total patterns extracted: ${patterns.length}`);
        
        // Count by category
        const categories = {};
        patterns.forEach(p => {
          categories[p.category] = (categories[p.category] || 0) + 1;
        });
        
        console.log('\nPatterns by category:');
        Object.entries(categories).forEach(([cat, count]) => {
          console.log(`  • ${cat}: ${count} pattern${count !== 1 ? 's' : ''}`);
        });
        
        console.log('\n🚀 Pipeline Status:');
        console.log('  ✅ PDF parsing successful');
        console.log('  ✅ Text extraction successful');
        console.log('  ✅ Claude CLI integration working');
        console.log('  ✅ Pattern extraction successful');
        console.log('  ✅ JSON parsing successful');
        
        console.log('\nNote: This demonstrates the complete pipeline. In production:');
        console.log('  - These patterns would be validated');
        console.log('  - Duplicates would be removed');
        console.log('  - Patterns would be stored in the APEX database');
      } else {
        console.log('\n⚠️ No patterns were extracted. Check the response file for debugging.');
      }
      
    } catch (error) {
      console.error('\n❌ Error calling Claude:', error.message);
      
      if (error.code === 'ETIMEDOUT') {
        console.log('The request timed out after 30 seconds.');
      }
      
      // Show partial output if available
      if (error.stdout) {
        console.log('\nPartial stdout:', error.stdout.toString().substring(0, 500));
      }
      if (error.stderr) {
        console.log('\nStderr:', error.stderr.toString());
      }
    }
    
  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    console.error(error.stack);
  }
}

// Run the extraction
console.log('Starting Clean Code pattern extraction with Claude CLI...\n');
extractPatternsWithClaude().catch(console.error);