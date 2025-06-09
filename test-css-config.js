#!/usr/bin/env node

// Simple test script for the configurable CSS functionality
import { ZendeskConverter } from './build/converters/zendesk-converter.js';

async function testCSSConfiguration() {
  const converter = new ZendeskConverter();
  
  const testHTML = `
    <h1>Keyboard Shortcuts Test</h1>
    <p>Press <span class="key">Ctrl</span> + <span class="key">S</span> to save</p>
    <p>Use Ctrl+C to copy and F1 for help</p>
    <blockquote class="note">This is a note</blockquote>
    <table>
      <tr><th>Column 1</th><th>Column 2</th></tr>
      <tr><td>Data 1</td><td>Data 2</td></tr>
    </table>
  `;

  console.log('Testing with inline styles (default)...');
  const result1 = await converter.convert(testHTML, {
    format: 'zendesk',
    inputType: 'html',
    zendeskOptions: {
      inlineStyles: true
    }
  });

  console.log('Result has stylesheet:', !!result1.stylesheet);
  console.log('Content includes inline styles:', result1.content.includes('style='));

  console.log('\nTesting with external CSS...');
  const result2 = await converter.convert(testHTML, {
    format: 'zendesk',
    inputType: 'html',
    zendeskOptions: {
      inlineStyles: false,
      generateStylesheet: true
    }
  });

  console.log('Result has stylesheet:', !!result2.stylesheet);
  console.log('Content includes inline styles:', result2.content.includes('style='));
  console.log('Stylesheet length:', result2.stylesheet?.length || 0);

  // Check for kbd elements
  console.log('\nKeyboard shortcut conversion:');
  console.log('Contains <kbd> elements:', result1.content.includes('<kbd'));
  
  console.log('\nTest completed successfully!');
}

testCSSConfiguration().catch(console.error);