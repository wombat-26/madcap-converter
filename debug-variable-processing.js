const WritersideMarkdownConverter = (await import('./build/converters/writerside-markdown-converter.js')).default;
const path = await import('path');

const converter = new WritersideMarkdownConverter();

const FLARE_SOURCE_PATH = '/Volumes/Envoy Pro/Flare/Plan_EN';
const flvarPath = path.join(FLARE_SOURCE_PATH, 'Project/VariableSets/General.flvar');
const htmlContent = '<p>Company: <MadCap:variable name="General.CompanyName" /></p>';

console.log('=== Variable Processing Debug ===');
console.log('FLVAR path:', flvarPath);
console.log('HTML content:', htmlContent);

try {
  const result = await converter.convert(htmlContent, {
    format: 'writerside-markdown',
    inputType: 'madcap',
    variableOptions: {
      flvarFiles: [flvarPath],
      variableMode: 'reference'
    }
  });

  console.log('\n=== Result ===');
  console.log('Content:', JSON.stringify(result.content));
  console.log('Variables file defined:', result.variablesFile !== undefined);
  console.log('Variables file:', result.variablesFile);
  console.log('Metadata:', result.metadata);
} catch (error) {
  console.error('Error:', error.message);
  console.error('Stack:', error.stack);
}