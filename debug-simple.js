import { readFile } from 'fs/promises';

async function debugSimple() {
  try {
    const content = await readFile('/Volumes/Envoy Pro/Flare/Plan_EN/Content/Neutral/Generell/Impressum.htm', 'utf8');
    
    console.log('=== Looking for the missing paragraph ===');
    
    // Find the specific paragraph that's missing
    const lines = content.split('\n');
    let foundTarget = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes('General.CompanyName') && line.includes('class="CompanyInformation1"')) {
        console.log(`Found paragraph at line ${i + 1}:`);
        console.log(line);
        
        // Show surrounding lines
        console.log('\nSurrounding context:');
        for (let j = Math.max(0, i - 2); j <= Math.min(lines.length - 1, i + 5); j++) {
          const marker = j === i ? '>>> ' : '    ';
          console.log(`${marker}${j + 1}: ${lines[j]}`);
        }
        foundTarget = true;
        break;
      }
    }
    
    if (!foundTarget) {
      console.log('Could not find the target paragraph');
    }
    
    // Also check if there are any issues with the XML structure
    console.log('\n=== Checking for XML parsing issues ===');
    const hasXmlDeclaration = content.includes('<?xml');
    const hasNamespace = content.includes('xmlns:MadCap');
    const hasBodyTag = content.includes('<body>');
    
    console.log(`XML declaration: ${hasXmlDeclaration}`);
    console.log(`MadCap namespace: ${hasNamespace}`);
    console.log(`Body tag: ${hasBodyTag}`);
    
  } catch (error) {
    console.error('Debug failed:', error);
  }
}

debugSimple();