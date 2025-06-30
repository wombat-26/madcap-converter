const fs = await import('fs/promises');
const path = await import('path');

const FLARE_SOURCE_PATH = '/Volumes/Envoy Pro/Flare/Plan_EN';
const filePath = path.join(FLARE_SOURCE_PATH, 'Content/01 Aufbau/00-00 Structure.htm');
const content = await fs.readFile(filePath, 'utf8');

console.log('=== Finding UL and OL in Structure.htm ===');

// Extract the section with the lists
const ulStart = content.indexOf('<ul');
const olStart = content.indexOf('<ol');
const olEnd = content.indexOf('</ol>') + 5;

if (ulStart >= 0 && olStart >= 0) {
  const listSection = content.substring(ulStart - 200, olEnd + 200);
  console.log('List section (UL to OL):');
  console.log(listSection);
  
  console.log('\n=== Distance between UL and OL ===');
  const betweenLists = content.substring(content.indexOf('</ul>'), olStart);
  console.log('Between UL and OL:');
  console.log(JSON.stringify(betweenLists));
}