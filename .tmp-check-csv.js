const fs = require('fs');
const path = require('path');

// Simple test to verify memory.csv format and content
const csvPath = './packages/backend/tm/memory.csv';
console.log('Checking memory.csv...');
console.log('File exists:', fs.existsSync(csvPath));

if (fs.existsSync(csvPath)) {
  const content = fs.readFileSync(csvPath, 'utf8');
  console.log('File content:');
  console.log(content);
  console.log('---');
  
  const lines = content.split(/\r?\n/).filter(Boolean);
  console.log(`Total lines: ${lines.length}`);
  
  lines.forEach((line, i) => {
    const parts = line.split('\t');
    console.log(`Line ${i+1}: ${parts.length} parts - "${parts[0]}" -> "${parts[1]}"`);
  });
}
