const fs = require('fs');
const pdfParse = require('pdf-parse/lib/pdf-parse.js');

async function testChapterExtraction() {
  const pdfPath = '/Users/ben/Downloads/Clean Code ( PDFDrive.com ).pdf';
  
  console.log('Reading PDF...');
  const dataBuffer = fs.readFileSync(pdfPath);
  
  // Parse just first 50 pages
  const pdfData = await pdfParse(dataBuffer, { max: 50 });
  
  console.log(`Extracted ${pdfData.text.length} characters`);
  
  // Look for chapter 1
  const text = pdfData.text;
  const chapter1Start = text.indexOf('Chapter 1');
  const chapter2Start = text.indexOf('Chapter 2');
  
  if (chapter1Start !== -1) {
    console.log(`\nFound Chapter 1 at position ${chapter1Start}`);
    
    let chapter1Text;
    if (chapter2Start !== -1 && chapter2Start > chapter1Start) {
      chapter1Text = text.substring(chapter1Start, chapter2Start);
    } else {
      chapter1Text = text.substring(chapter1Start, chapter1Start + 5000);
    }
    
    console.log(`Chapter 1 length: ${chapter1Text.length} characters`);
    console.log('\nFirst 500 characters of Chapter 1:');
    console.log('-'.repeat(60));
    console.log(chapter1Text.substring(0, 500));
    console.log('-'.repeat(60));
    
    // Test with actual prompt
    const prompt = `Extract patterns from this Clean Code chapter.

Return JSON:
{
  "patterns": [
    {
      "title": "Pattern name",
      "description": "What it does",
      "category": "NAMING",
      "code": {
        "language": "javascript",
        "snippet": "example code"
      },
      "tags": ["clean-code"],
      "keyInsight": "Why important",
      "whenToUse": "When to apply",
      "commonPitfalls": ["What to avoid"]
    }
  ],
  "metadata": {
    "chapterTitle": "Title",
    "mainConcepts": ["concepts"],
    "extractionConfidence": 0.9
  }
}

Text (first 2000 chars):
${chapter1Text.substring(0, 2000)}`;

    console.log(`\nPrompt length: ${prompt.length} characters`);
    
    // Test calling Claude with this prompt
    const { spawn } = require('child_process');
    const claudePath = '/Users/ben/.claude/local/claude';
    
    console.log('\nCalling Claude CLI...');
    const child = spawn(claudePath, ['-p'], {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    let stdout = '';
    let stderr = '';
    
    const timeout = setTimeout(() => {
      console.log('Timeout! Killing process...');
      child.kill();
    }, 30000);
    
    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    child.on('close', (code) => {
      clearTimeout(timeout);
      console.log(`Claude exited with code: ${code}`);
      
      if (stdout) {
        console.log('\nClaude response:');
        console.log(stdout.substring(0, 1000));
        
        // Try to parse JSON
        try {
          const jsonMatch = stdout.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            console.log(`\n✅ Successfully extracted ${parsed.patterns?.length || 0} patterns`);
          }
        } catch (e) {
          console.log('Could not parse JSON from response');
        }
      }
      
      if (stderr) {
        console.log('Stderr:', stderr);
      }
    });
    
    child.stdin.write(prompt);
    child.stdin.end();
    
  } else {
    console.log('Chapter 1 not found in first 50 pages');
  }
}

testChapterExtraction().catch(console.error);