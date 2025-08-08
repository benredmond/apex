#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');

async function testPdfExtraction() {
  const pdfPath = '/Users/ben/Downloads/Clean Code ( PDFDrive.com ).pdf';
  
  console.log('='.repeat(80));
  console.log('PDF EXTRACTION TEST - Clean Code');
  console.log('='.repeat(80));
  
  try {
    // Read PDF file
    const dataBuffer = fs.readFileSync(pdfPath);
    
    console.log('\nParsing PDF...');
    const pdfData = await pdfParse(dataBuffer, {
      max: 10 // Only parse first 10 pages for testing
    });
    
    console.log('\nPDF Information:');
    console.log(`- Number of pages: ${pdfData.numpages}`);
    console.log(`- PDF version: ${pdfData.version}`);
    console.log(`- Text length: ${pdfData.text.length} characters`);
    console.log(`- Title: ${pdfData.info?.Title || 'Not specified'}`);
    console.log(`- Author: ${pdfData.info?.Author || 'Not specified'}`);
    
    // Extract first 2000 characters to see the content structure
    console.log('\n' + '='.repeat(80));
    console.log('FIRST 2000 CHARACTERS OF EXTRACTED TEXT:');
    console.log('='.repeat(80));
    console.log(pdfData.text.substring(0, 2000));
    
    // Look for chapter markers
    console.log('\n' + '='.repeat(80));
    console.log('CHAPTER DETECTION:');
    console.log('='.repeat(80));
    
    const chapterMatches = pdfData.text.match(/Chapter\s+\d+/gi);
    if (chapterMatches) {
      console.log(`Found ${chapterMatches.length} chapter markers:`);
      chapterMatches.slice(0, 10).forEach(ch => console.log(`  - ${ch}`));
    } else {
      console.log('No "Chapter X" markers found.');
    }
    
    // Look for other patterns
    const patterns = [
      { name: 'Functions', regex: /function\s+\w+/gi },
      { name: 'Classes', regex: /class\s+\w+/gi },
      { name: 'Code blocks', regex: /```[\s\S]*?```/g },
      { name: 'Listings', regex: /Listing\s+\d+-\d+/gi }
    ];
    
    console.log('\n' + '='.repeat(80));
    console.log('PATTERN DETECTION:');
    console.log('='.repeat(80));
    
    patterns.forEach(pattern => {
      const matches = pdfData.text.match(pattern.regex);
      console.log(`${pattern.name}: ${matches ? matches.length : 0} occurrences`);
      if (matches && matches.length > 0) {
        console.log(`  First few: ${matches.slice(0, 3).join(', ')}`);
      }
    });
    
  } catch (error) {
    console.error('\nERROR:', error.message);
    console.error('\nStack:', error.stack);
  }
}

testPdfExtraction().catch(console.error);