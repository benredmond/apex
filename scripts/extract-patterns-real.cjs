#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const { execSync } = require('child_process');

async function extractPatternsFromCleanCode() {
  const pdfPath = '/Users/ben/Downloads/Clean Code ( PDFDrive.com ).pdf';
  
  console.log('='.repeat(80));
  console.log('CLEAN CODE PATTERN EXTRACTION - REAL LLM EXTRACTION');
  console.log('='.repeat(80));
  
  try {
    // Read PDF file
    const dataBuffer = fs.readFileSync(pdfPath);
    
    console.log('\n[STEP 1] Parsing PDF...');
    
    // Parse first 30 pages to get meaningful content
    const pdfData = await pdfParse(dataBuffer, {
      max: 30  // Process first 30 pages to get Chapter 1 and 2
    });
    
    console.log(`✓ Parsed PDF (${pdfData.numpages} total pages, processing first 30)`);
    console.log(`✓ Extracted ${pdfData.text.length} characters of text`);
    
    // Split into chapters
    console.log('\n[STEP 2] Detecting chapters...');
    const chapters = detectChapters(pdfData.text);
    console.log(`✓ Found ${chapters.length} chapters in first 30 pages`);
    chapters.forEach((ch, i) => {
      console.log(`  Chapter ${ch.number}: ${ch.title} (${ch.text.length} chars)`);
    });
    
    // Process first meaningful chapter (skip TOC if present)
    console.log('\n[STEP 3] Extracting patterns using Claude CLI...');
    const allPatterns = [];
    
    // Find the first real chapter with substantial content
    const meaningfulChapter = chapters.find(ch => ch.text.length > 500) || chapters[0];
    
    if (!meaningfulChapter) {
      console.log('No meaningful chapters found in first 30 pages');
      return;
    }
    
    console.log(`\nProcessing Chapter ${meaningfulChapter.number}: ${meaningfulChapter.title}`);
    console.log(`Chapter has ${meaningfulChapter.text.length} characters`);
    
    // Create a focused prompt for pattern extraction
    const prompt = `You are analyzing Chapter ${meaningfulChapter.number} "${meaningfulChapter.title}" from the book "Clean Code" by Robert C. Martin.

Extract 5-10 concrete software engineering patterns from this chapter content.

For each pattern, provide in this exact JSON format:
{
  "patterns": [
    {
      "id": "PAT:CATEGORY:SPECIFIC_NAME",
      "title": "Pattern Title",
      "category": "NAMING|FUNCTIONS|CLASSES|ERROR_HANDLING|TESTING|REFACTORING",
      "problem": "What problem does this solve",
      "solution": "How to apply this pattern",
      "example": "Code example if available from the text",
      "quote": "Relevant quote from the chapter"
    }
  ]
}

Categories should be one of: NAMING, FUNCTIONS, CLASSES, ERROR_HANDLING, TESTING, REFACTORING

Chapter content (first 4000 chars):
"""
${meaningfulChapter.text.substring(0, 4000)}
"""

Extract concrete, actionable patterns. Return ONLY valid JSON, no other text.`;

    // Save prompt to temp file
    const tempPromptFile = path.join('/tmp', 'clean_code_prompt.txt');
    fs.writeFileSync(tempPromptFile, prompt);
    
    console.log('\n📤 Calling Claude CLI for pattern extraction...');
    console.log('   (This may take 10-20 seconds...)\n');
    
    try {
      // Call Claude CLI directly
      const startTime = Date.now();
      const result = execSync(
        `npx @claude-cli/cli@latest ask "@${tempPromptFile}" 2>/dev/null`,
        { 
          encoding: 'utf-8',
          maxBuffer: 10 * 1024 * 1024, // 10MB buffer
          timeout: 60000 // 60 second timeout
        }
      );
      
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`✓ Claude responded in ${duration} seconds`);
      
      // Parse the extracted patterns
      console.log('\n[STEP 4] Parsing LLM response...');
      
      // Try to extract JSON from the response
      let patterns = [];
      try {
        // Look for JSON in the response
        const jsonMatch = result.match(/\{[\s\S]*"patterns"[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          patterns = parsed.patterns || [];
          console.log(`✓ Successfully parsed ${patterns.length} patterns from Claude's response`);
        } else {
          console.log('⚠ Could not find JSON in response, trying direct parse...');
          const parsed = JSON.parse(result);
          patterns = parsed.patterns || [];
        }
      } catch (parseError) {
        console.log('⚠ Failed to parse JSON response:', parseError.message);
        console.log('\nRaw response (first 500 chars):');
        console.log(result.substring(0, 500));
      }
      
      if (patterns.length > 0) {
        console.log('\n' + '='.repeat(80));
        console.log('EXTRACTED PATTERNS FROM CLEAN CODE');
        console.log('='.repeat(80));
        
        patterns.forEach((pattern, i) => {
          console.log(`\n[${i + 1}] ${pattern.id || 'NO_ID'}`);
          console.log(`    Title: ${pattern.title}`);
          console.log(`    Category: ${pattern.category}`);
          console.log(`    Problem: ${pattern.problem}`);
          console.log(`    Solution: ${pattern.solution}`);
          if (pattern.example) {
            console.log(`    Example: ${pattern.example.substring(0, 100)}${pattern.example.length > 100 ? '...' : ''}`);
          }
          if (pattern.quote) {
            console.log(`    Quote: "${pattern.quote.substring(0, 100)}${pattern.quote.length > 100 ? '..."' : '"'}`);
          }
        });
        
        allPatterns.push(...patterns);
      }
      
      // Save full response for debugging
      const responseFile = path.join('/tmp', 'claude_response.json');
      fs.writeFileSync(responseFile, result);
      console.log(`\n💾 Full response saved to: ${responseFile}`);
      
    } catch (error) {
      console.error('❌ Error calling Claude CLI:', error.message);
      
      if (error.code === 'ETIMEDOUT') {
        console.log('   The request timed out. The chapter might be too long.');
      } else if (error.status) {
        console.log(`   Process exited with code ${error.status}`);
        console.log('   Error output:', error.stderr?.toString() || 'No error output');
      }
      
      // Try with a smaller chunk
      console.log('\n🔄 Retrying with smaller text chunk...');
      
      const smallerPrompt = `Extract 3 software patterns from this Clean Code chapter excerpt.

Return JSON format:
{
  "patterns": [
    {
      "id": "PAT:CATEGORY:NAME",
      "title": "Title",
      "category": "NAMING|FUNCTIONS|CLASSES",
      "problem": "Problem",
      "solution": "Solution"
    }
  ]
}

Text (first 1000 chars):
"""
${meaningfulChapter.text.substring(0, 1000)}
"""

Return ONLY JSON.`;

      const smallerTempFile = path.join('/tmp', 'smaller_prompt.txt');
      fs.writeFileSync(smallerTempFile, smallerPrompt);
      
      try {
        const retryResult = execSync(
          `npx @claude-cli/cli@latest ask "@${smallerTempFile}" 2>/dev/null`,
          { 
            encoding: 'utf-8',
            timeout: 30000
          }
        );
        
        console.log('✓ Retry successful with smaller chunk');
        console.log('\nResponse preview:');
        console.log(retryResult.substring(0, 500));
        
      } catch (retryError) {
        console.log('❌ Retry also failed:', retryError.message);
      }
    }
    
    // Final summary
    console.log('\n' + '='.repeat(80));
    console.log('EXTRACTION COMPLETE');
    console.log('='.repeat(80));
    console.log(`Total patterns extracted: ${allPatterns.length}`);
    
    if (allPatterns.length > 0) {
      console.log('\nPattern Summary:');
      const categories = {};
      allPatterns.forEach(p => {
        const cat = p.category || 'UNKNOWN';
        categories[cat] = (categories[cat] || 0) + 1;
      });
      
      Object.entries(categories).forEach(([cat, count]) => {
        console.log(`  ${cat}: ${count} patterns`);
      });
      
      console.log('\nNote: In production, these would be validated and saved to the APEX database.');
    }
    
  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    console.error(error.stack);
  }
}

function detectChapters(text) {
  const chapters = [];
  const lines = text.split('\n');
  
  let currentChapter = null;
  let chapterText = [];
  let chapterCount = 0;
  
  for (const line of lines) {
    // Look for chapter markers
    const chapterMatch = line.match(/^Chapter\s+(\d+)\s*:?\s*(.*)$/i);
    
    if (chapterMatch) {
      // Save previous chapter if it exists
      if (currentChapter && chapterText.length > 0) {
        chapters.push({
          number: currentChapter.number,
          title: currentChapter.title || `Chapter ${currentChapter.number}`,
          text: chapterText.join('\n').trim()
        });
      }
      
      // Start new chapter
      chapterCount++;
      currentChapter = {
        number: parseInt(chapterMatch[1]),
        title: chapterMatch[2].trim()
      };
      chapterText = [];
    } else if (currentChapter) {
      // Add line to current chapter
      chapterText.push(line);
    } else if (chapterCount === 0 && lines.indexOf(line) > 20) {
      // If we haven't found any chapters after 20 lines, treat as single chapter
      chapters.push({
        number: 1,
        title: 'Content',
        text: text
      });
      break;
    }
  }
  
  // Save last chapter
  if (currentChapter && chapterText.length > 0) {
    chapters.push({
      number: currentChapter.number,
      title: currentChapter.title || `Chapter ${currentChapter.number}`,
      text: chapterText.join('\n').trim()
    });
  }
  
  return chapters;
}

// Run the extraction
console.log('Starting Clean Code pattern extraction with real LLM calls...\n');
extractPatternsFromCleanCode().catch(console.error);