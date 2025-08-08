const fs = require('fs');
const pdfParse = require('pdf-parse/lib/pdf-parse.js');
const { spawn } = require('child_process');

async function extractRealChapter() {
  const pdfPath = '/Users/ben/Downloads/Clean Code ( PDFDrive.com ).pdf';
  
  console.log('Parsing Clean Code PDF pages 15-40 (where real content should be)...');
  const dataBuffer = fs.readFileSync(pdfPath);
  
  // Parse pages 15-40 to get past TOC
  const pdfData = await pdfParse(dataBuffer, {
    pagerender: (pageData) => {
      const pageNum = pageData.pageIndex + 1;
      // Get pages 15-40 to find real content
      if (pageNum >= 15 && pageNum <= 40) {
        return pageData.getTextContent().then(text => {
          const strings = text.items.map(item => item.str);
          return strings.join(' ') + '\n[PAGE ' + pageNum + ']\n';
        });
      }
      return '';
    }
  });
  
  console.log(`Extracted ${pdfData.text.length} characters from pages 15-40`);
  
  // Find real content (not TOC)
  const text = pdfData.text;
  
  // Look for actual chapter content patterns
  const contentMarkers = [
    'You are reading this book',
    'The Boy Scout Rule',
    'clean code',
    'Bad Code',
    'code-sense'
  ];
  
  let realContentStart = -1;
  for (const marker of contentMarkers) {
    const idx = text.toLowerCase().indexOf(marker.toLowerCase());
    if (idx !== -1) {
      console.log(`Found content marker "${marker}" at position ${idx}`);
      realContentStart = Math.max(0, idx - 200); // Back up a bit
      break;
    }
  }
  
  if (realContentStart === -1) {
    console.log('\nShowing first 1000 chars to debug:');
    console.log(text.substring(0, 1000));
    realContentStart = 0;
  }
  
  const chapterText = text.substring(realContentStart, realContentStart + 3000);
  
  console.log('\nExtracted chapter content (first 800 chars):');
  console.log('='.repeat(60));
  console.log(chapterText.substring(0, 800));
  console.log('='.repeat(60));
  
  // Create extraction prompt
  const prompt = `Extract 3-5 software engineering patterns from this Clean Code chapter excerpt.

Return ONLY valid JSON in this exact format:
{
  "patterns": [
    {
      "title": "Use Meaningful Names",
      "description": "Names should reveal intent",
      "category": "NAMING",
      "code": {
        "language": "javascript",
        "snippet": "const elapsedTimeInDays = ...; // Good",
        "context": "Variable naming"
      },
      "tags": ["naming", "clean-code"],
      "keyInsight": "Code is read more than written",
      "whenToUse": "Always",
      "commonPitfalls": ["Using abbreviations"]
    }
  ],
  "metadata": {
    "chapterTitle": "Clean Code",
    "mainConcepts": ["naming", "clarity"],
    "extractionConfidence": 0.9
  }
}

Chapter excerpt:
"""
${chapterText}
"""`;

  console.log(`\nPrompt length: ${prompt.length} characters`);
  
  // Call Claude
  const claudePath = '/Users/ben/.claude/local/claude';
  console.log('\nCalling Claude CLI for pattern extraction...');
  
  const child = spawn(claudePath, ['-p'], {
    stdio: ['pipe', 'pipe', 'pipe']
  });
  
  let stdout = '';
  let stderr = '';
  let responded = false;
  
  const timeout = setTimeout(() => {
    if (!responded) {
      console.log('⏰ Timeout after 30 seconds. Killing process...');
      child.kill('SIGTERM');
    }
  }, 30000);
  
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
  
  child.on('error', (error) => {
    clearTimeout(timeout);
    console.error('Process error:', error);
  });
  
  child.on('close', (code) => {
    clearTimeout(timeout);
    console.log(`\n✅ Claude process closed with code: ${code}`);
    
    if (stdout) {
      // Try to extract and parse JSON
      try {
        const jsonMatch = stdout.match(/\{[\s\S]*"patterns"[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          
          console.log('\n🎉 SUCCESSFULLY EXTRACTED PATTERNS:');
          console.log('='.repeat(60));
          
          if (parsed.patterns && parsed.patterns.length > 0) {
            parsed.patterns.forEach((p, i) => {
              console.log(`\n[Pattern ${i+1}] ${p.title}`);
              console.log(`  Category: ${p.category}`);
              console.log(`  Description: ${p.description}`);
              if (p.code?.snippet) {
                console.log(`  Example: ${p.code.snippet.substring(0, 60)}...`);
              }
            });
            
            console.log('\n='.repeat(60));
            console.log(`✅ Total patterns extracted: ${parsed.patterns.length}`);
            console.log('✅ Pipeline demonstration successful!');
          }
        } else {
          console.log('⚠️ No valid JSON found in response');
          console.log('Response preview:', stdout.substring(0, 500));
        }
      } catch (e) {
        console.log('❌ Error parsing JSON:', e.message);
        console.log('Response:', stdout.substring(0, 500));
      }
    } else {
      console.log('❌ No response received');
    }
    
    if (stderr) {
      console.log('Stderr:', stderr);
    }
  });
  
  // Send prompt
  child.stdin.write(prompt);
  child.stdin.end();
}

extractRealChapter().catch(console.error);