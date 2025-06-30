const fs = await import('fs/promises');
const path = await import('path');
const WritersideMarkdownConverter = (await import('./build/converters/writerside-markdown-converter.js')).default;

const FLARE_SOURCE_PATH = '/Volumes/Envoy Pro/Flare/Plan_EN';
const filePath = path.join(FLARE_SOURCE_PATH, 'Content/01 Aufbau/00-00 Structure.htm');
const content = await fs.readFile(filePath, 'utf8');

console.log('=== Raw HTML Lists in Structure.htm ===');
// Extract just the list parts
const listMatches = content.match(/<ol[^>]*>[\s\S]*?<\/ol>/g);
if (listMatches) {
  listMatches.forEach((match, i) => {
    console.log(`\nList ${i + 1}:`);
    console.log(match);
  });
}

console.log('\n=== Converting Structure.htm ===');
const converter = new WritersideMarkdownConverter();
const result = await converter.convert(content, {
  format: 'writerside-markdown',
  inputType: 'html',
  inputPath: filePath
});

console.log('\n=== Final Markdown Output ===');
console.log(result.content);

// Find the specific numbered list
console.log('\n=== List Analysis ===');
const listLines = result.content.split('\n').filter(line => 
  line.trim().match(/^[a-z0-9]+\.\s/) || line.trim().match(/^\d+\.\s/)
);
console.log('Found list lines:');
listLines.forEach(line => console.log(`  "${line.trim()}"`));