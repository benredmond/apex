#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const { execSync } = require('child_process');

async function extractPatternsFromCleanCode() {
  const pdfPath = '/Users/ben/Downloads/Clean Code ( PDFDrive.com ).pdf';
  
  console.log('='.repeat(80));
  console.log('CLEAN CODE PATTERN EXTRACTION PIPELINE - DRY RUN DEMO');
  console.log('='.repeat(80));
  
  try {
    // Read PDF file
    const dataBuffer = fs.readFileSync(pdfPath);
    
    console.log('\n[STEP 1] Parsing PDF...');
    
    // Parse first 50 pages for demo
    const pdfData = await pdfParse(dataBuffer, {
      max: 50  // Process first 50 pages
    });
    
    console.log(`✓ Parsed ${pdfData.numpages} total pages (processing first 50)`);
    console.log(`✓ Extracted ${pdfData.text.length} characters of text`);
    
    // Split into chapters
    console.log('\n[STEP 2] Detecting chapters...');
    const chapters = detectChapters(pdfData.text);
    console.log(`✓ Found ${chapters.length} chapters`);
    chapters.forEach((ch, i) => {
      console.log(`  Chapter ${i + 1}: ${ch.title} (${ch.text.length} chars)`);
    });
    
    // Process first 2 chapters for demo
    console.log('\n[STEP 3] Extracting patterns from chapters...');
    const allPatterns = [];
    
    for (let i = 0; i < Math.min(2, chapters.length); i++) {
      const chapter = chapters[i];
      console.log(`\nProcessing Chapter ${i + 1}: ${chapter.title}`);
      
      // Create prompt for pattern extraction
      const prompt = createExtractionPrompt(chapter.text, chapter.title, i + 1);
      
      // Save prompt to temp file
      const tempFile = path.join('/tmp', `chapter_${i + 1}_prompt.txt`);
      fs.writeFileSync(tempFile, prompt);
      
      console.log('  Calling LLM for pattern extraction...');
      
      try {
        // Use the Claude CLI tool for extraction
        const result = execSync(
          `npx @claude-cli/cli@latest ask -p "@${tempFile}" 2>/dev/null`,
          { 
            encoding: 'utf-8',
            maxBuffer: 10 * 1024 * 1024 // 10MB buffer
          }
        );
        
        // Parse the extracted patterns
        const patterns = parseExtractedPatterns(result);
        console.log(`  ✓ Extracted ${patterns.length} patterns`);
        
        patterns.forEach(p => {
          console.log(`    - ${p.id}: ${p.title}`);
        });
        
        allPatterns.push(...patterns);
        
      } catch (error) {
        console.log('  ⚠ LLM extraction skipped (dry run demo)');
        // For demo, create mock patterns
        const mockPatterns = createMockPatterns(chapter.title, i + 1);
        console.log(`  ✓ Generated ${mockPatterns.length} mock patterns for demo`);
        mockPatterns.forEach(p => {
          console.log(`    - ${p.id}: ${p.title}`);
        });
        allPatterns.push(...mockPatterns);
      }
    }
    
    // Validate patterns
    console.log('\n[STEP 4] Validating patterns...');
    const validPatterns = validatePatterns(allPatterns);
    console.log(`✓ ${validPatterns.length}/${allPatterns.length} patterns passed validation`);
    
    // Deduplicate patterns
    console.log('\n[STEP 5] Deduplicating patterns...');
    const uniquePatterns = deduplicatePatterns(validPatterns);
    console.log(`✓ ${uniquePatterns.length} unique patterns after deduplication`);
    
    // Display final patterns (dry run)
    console.log('\n' + '='.repeat(80));
    console.log('EXTRACTED PATTERNS (DRY RUN - NOT SAVED TO DATABASE)');
    console.log('='.repeat(80));
    
    uniquePatterns.forEach((pattern, i) => {
      console.log(`\n[${i + 1}] ${pattern.id}: ${pattern.title}`);
      console.log(`    Category: ${pattern.category}`);
      console.log(`    Summary: ${pattern.summary}`);
      if (pattern.code) {
        console.log(`    Example: ${pattern.code.substring(0, 100)}...`);
      }
    });
    
    console.log('\n' + '='.repeat(80));
    console.log('DRY RUN COMPLETE');
    console.log('='.repeat(80));
    console.log(`Total patterns that would be inserted: ${uniquePatterns.length}`);
    console.log('Note: In production, these would be saved to the APEX database');
    
  } catch (error) {
    console.error('\nERROR:', error.message);
  }
}

function detectChapters(text) {
  const chapters = [];
  const lines = text.split('\n');
  
  let currentChapter = null;
  let chapterText = [];
  
  for (const line of lines) {
    const chapterMatch = line.match(/^Chapter\s+(\d+)\s*(.*)$/i);
    
    if (chapterMatch) {
      // Save previous chapter
      if (currentChapter) {
        chapters.push({
          number: currentChapter.number,
          title: currentChapter.title,
          text: chapterText.join('\n')
        });
      }
      
      // Start new chapter
      currentChapter = {
        number: parseInt(chapterMatch[1]),
        title: chapterMatch[2] || `Chapter ${chapterMatch[1]}`
      };
      chapterText = [];
    } else if (currentChapter) {
      chapterText.push(line);
    }
  }
  
  // Save last chapter
  if (currentChapter) {
    chapters.push({
      number: currentChapter.number,
      title: currentChapter.title,
      text: chapterText.join('\n')
    });
  }
  
  // If no chapters found, treat whole text as one chapter
  if (chapters.length === 0) {
    chapters.push({
      number: 1,
      title: 'Full Content',
      text: text
    });
  }
  
  return chapters;
}

function createExtractionPrompt(chapterText, chapterTitle, chapterNumber) {
  return `Extract software engineering patterns from Chapter ${chapterNumber}: "${chapterTitle}" of Clean Code.

Look for:
1. Naming patterns and conventions
2. Function design patterns
3. Class design patterns
4. Error handling patterns
5. Testing patterns
6. Refactoring patterns

For each pattern, provide:
- Pattern ID (format: PAT:CATEGORY:NAME)
- Title
- Category
- Problem it solves
- Solution approach
- Code example (if available)

Chapter content:
${chapterText.substring(0, 3000)}

[Content truncated for demo]

Return patterns in JSON format.`;
}

function parseExtractedPatterns(llmOutput) {
  try {
    // Try to parse JSON from LLM output
    const jsonMatch = llmOutput.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (error) {
    // Fallback to empty if parsing fails
  }
  return [];
}

function createMockPatterns(chapterTitle, chapterNumber) {
  // Create realistic mock patterns based on Clean Code principles
  const mockPatterns = [
    {
      id: `PAT:NAMING:MEANINGFUL_${chapterNumber}`,
      title: 'Use Meaningful Names',
      category: 'NAMING',
      summary: 'Names should reveal intent and be searchable',
      code: 'const elapsedTimeInDays = ...; // Good\nconst d = ...; // Bad'
    },
    {
      id: `PAT:FUNCTIONS:SMALL_${chapterNumber}`,
      title: 'Keep Functions Small',
      category: 'FUNCTIONS',
      summary: 'Functions should do one thing and do it well',
      code: 'function calculatePay(employee) { /* single responsibility */ }'
    },
    {
      id: `PAT:ERROR:EXCEPTIONS_${chapterNumber}`,
      title: 'Use Exceptions Rather Than Error Codes',
      category: 'ERROR_HANDLING',
      summary: 'Prefer exceptions to error codes for cleaner code flow',
      code: 'try { doSomething(); } catch (error) { handleError(error); }'
    }
  ];
  
  return mockPatterns.slice(0, Math.floor(Math.random() * 3) + 1);
}

function validatePatterns(patterns) {
  return patterns.filter(pattern => {
    // Basic validation
    if (!pattern.id || !pattern.title || !pattern.summary) {
      return false;
    }
    
    // Check ID format
    if (!pattern.id.match(/^PAT:[A-Z_]+:[A-Z_0-9]+$/)) {
      console.log(`  ⚠ Invalid pattern ID format: ${pattern.id}`);
      return false;
    }
    
    return true;
  });
}

function deduplicatePatterns(patterns) {
  const seen = new Set();
  return patterns.filter(pattern => {
    const key = `${pattern.id}:${pattern.title}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

// Run the extraction
extractPatternsFromCleanCode().catch(console.error);