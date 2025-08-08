#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const { execSync } = require('child_process');

async function extractPatternsWithClaude() {
  const pdfPath = '/Users/ben/Downloads/Clean Code ( PDFDrive.com ).pdf';
  
  console.log('='.repeat(80));
  console.log('CLEAN CODE PATTERN EXTRACTION - USING CLAUDE CLI');
  console.log('='.repeat(80));
  
  try {
    // Read PDF file
    const dataBuffer = fs.readFileSync(pdfPath);
    
    console.log('\n[STEP 1] Parsing Clean Code PDF...');
    
    // Parse pages 20-30 to get actual chapter content (skip TOC)
    const pdfData = await pdfParse(dataBuffer, {
      pagerender: (pageData) => {
        const pageNum = pageData.pageIndex + 1;
        // Only process pages 20-30 to get real content
        if (pageNum >= 20 && pageNum <= 30) {
          return pageData.getTextContent().then(text => {
            const strings = text.items.map(item => item.str);
            return strings.join(' ');
          });
        }
        return '';
      }
    });
    
    console.log(`✓ Extracted text from pages 20-30`);
    console.log(`✓ Total text length: ${pdfData.text.length} characters`);
    
    // Get a meaningful excerpt
    const textExcerpt = pdfData.text.substring(0, 3000);
    
    console.log('\n[STEP 2] Preview of extracted text:');
    console.log('-'.repeat(40));
    console.log(textExcerpt.substring(0, 500) + '...');
    console.log('-'.repeat(40));
    
    // Create extraction prompt
    const prompt = `Analyze this excerpt from "Clean Code" by Robert C. Martin and extract software engineering patterns.

Extract exactly 5 concrete patterns in this JSON format:
{
  "patterns": [
    {
      "id": "PAT:NAMING:INTENTION_REVEALING",
      "title": "Use Intention-Revealing Names",
      "category": "NAMING",
      "problem": "Code is hard to understand when names don't reveal purpose",
      "solution": "Choose names that explicitly state what the code does",
      "example": "int elapsedTimeInDays; // Good vs int d; // Bad"
    }
  ]
}

Text excerpt from Clean Code:
"""
${textExcerpt}
"""

Important: Return ONLY the JSON object, no explanations or markdown.`;

    // Write prompt to file
    const promptFile = '/tmp/clean_code_extraction.txt';
    fs.writeFileSync(promptFile, prompt);
    console.log(`\n[STEP 3] Saved prompt to ${promptFile}`);
    
    console.log('\n[STEP 4] Calling Claude CLI...');
    console.log('Command: claude -p @' + promptFile);
    
    try {
      const result = execSync(
        `claude -p '@${promptFile}'`,
        { 
          encoding: 'utf-8',
          maxBuffer: 10 * 1024 * 1024,
          timeout: 30000
        }
      );
      
      console.log('\n✓ Claude responded successfully!');
      
      // Save raw response
      const responseFile = '/tmp/claude_raw_response.txt';
      fs.writeFileSync(responseFile, result);
      console.log(`💾 Raw response saved to ${responseFile}`);
      
      // Try to parse JSON from response
      console.log('\n[STEP 5] Parsing patterns from response...');
      
      let patterns = [];
      
      // Try to find JSON in the response
      const jsonMatch = result.match(/\{[\s\S]*?\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          patterns = parsed.patterns || [];
          console.log(`✓ Parsed ${patterns.length} patterns`);
        } catch (e) {
          // Try to find the full JSON including array
          const fullJsonMatch = result.match(/\{[\s\S]*"patterns"[\s\S]*\]/);
          if (fullJsonMatch) {
            try {
              const parsed = JSON.parse(fullJsonMatch[0] + '}');
              patterns = parsed.patterns || [];
              console.log(`✓ Parsed ${patterns.length} patterns (second attempt)`);
            } catch (e2) {
              console.log('⚠ Could not parse JSON:', e2.message);
            }
          }
        }
      }
      
      if (patterns.length === 0) {
        // Show what we got for debugging
        console.log('\n⚠ No patterns parsed. Response preview:');
        console.log(result.substring(0, 1000));
      } else {
        // Display extracted patterns
        console.log('\n' + '='.repeat(80));
        console.log('SUCCESSFULLY EXTRACTED PATTERNS FROM CLEAN CODE');
        console.log('='.repeat(80));
        
        patterns.forEach((pattern, i) => {
          console.log(`\n[Pattern ${i + 1}]`);
          console.log(`  ID: ${pattern.id}`);
          console.log(`  Title: ${pattern.title}`);
          console.log(`  Category: ${pattern.category}`);
          console.log(`  Problem: ${pattern.problem}`);
          console.log(`  Solution: ${pattern.solution}`);
          if (pattern.example) {
            console.log(`  Example: ${pattern.example}`);
          }
        });
        
        console.log('\n' + '='.repeat(80));
        console.log('SUMMARY');
        console.log('='.repeat(80));
        console.log(`✅ Successfully extracted ${patterns.length} patterns from Clean Code`);
        console.log('These patterns demonstrate the pipeline working end-to-end:');
        console.log('  1. PDF parsing ✓');
        console.log('  2. Text extraction ✓');
        console.log('  3. LLM pattern extraction ✓');
        console.log('  4. JSON parsing ✓');
        console.log('\nIn production, these would be validated and stored in the APEX database.');
      }
      
    } catch (error) {
      console.error('\n❌ Error calling Claude:', error.message);
      
      // If the command failed, try to see what happened
      if (error.stdout) {
        console.log('\nStdout:', error.stdout.toString().substring(0, 500));
      }
      if (error.stderr) {
        console.log('\nStderr:', error.stderr.toString().substring(0, 500));
      }
      
      // Try a simpler test
      console.log('\n[DEBUG] Testing Claude CLI with simple prompt...');
      try {
        const testResult = execSync('claude -p "Say hello"', { encoding: 'utf-8' });
        console.log('Claude test response:', testResult.substring(0, 100));
      } catch (testError) {
        console.log('❌ Claude CLI test also failed:', testError.message);
      }
    }
    
  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    console.error(error.stack);
  }
}

// Run the extraction
console.log('Starting pattern extraction with Claude CLI...\n');
extractPatternsWithClaude().catch(console.error);