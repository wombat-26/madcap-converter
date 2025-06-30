const WritersideMarkdownConverter = (await import('./build/converters/writerside-markdown-converter.js')).default;
const path = await import('path');

// Patch the processVariables method to add debugging
const originalProcessVariables = WritersideMarkdownConverter.prototype.processVariables;
WritersideMarkdownConverter.prototype.processVariables = async function(input, options, warnings) {
  console.log('\n=== processVariables Debug ===');
  console.log('Input:', JSON.stringify(input));
  console.log('Variable options:', options.variableOptions);
  
  const result = await originalProcessVariables.call(this, input, options, warnings);
  
  console.log('Output content:', JSON.stringify(result.content));
  console.log('Variables file generated:', result.variablesFile !== undefined);
  
  return result;
};

const converter = new WritersideMarkdownConverter();

const FLARE_SOURCE_PATH = '/Volumes/Envoy Pro/Flare/Plan_EN';
const flvarPath = path.join(FLARE_SOURCE_PATH, 'Project/VariableSets/General.flvar');
const htmlContent = '<p>Company: <MadCap:variable name="General.CompanyName" /></p>';

const result = await converter.convert(htmlContent, {
  format: 'writerside-markdown',
  inputType: 'madcap',
  variableOptions: {
    flvarFiles: [flvarPath],
    variableMode: 'reference'
  }
});

console.log('\n=== Final Result ===');
console.log('Content:', JSON.stringify(result.content));