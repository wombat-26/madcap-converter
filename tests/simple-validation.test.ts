/**
 * Simple validation test to check our test infrastructure
 */

import { analyzeHTMLStructure } from './utils/test-helpers';

describe('Test Infrastructure Validation', () => {
  test('should detect malformed HTML structure', () => {
    const malformedHtml = `
      <ol>
        <li><p>Step 1</p></li>
        <li><p>Step 2</p></li>
        <ol style="list-style-type: lower-alpha;">
          <li><p>Sub-step a</p></li>
          <li><p>Sub-step b</p></li>
        </ol>
        <li><p>Step 3</p></li>
      </ol>
    `;

    const analysis = analyzeHTMLStructure(malformedHtml);
    
    expect(analysis.totalLists).toBe(2);
    expect(analysis.alphabeticLists).toBe(1);
    expect(analysis.malformedStructure).toBe(true);
  });

  test('should detect properly formed HTML structure', () => {
    const properHtml = `
      <ol>
        <li>
          <p>Step 1</p>
          <ol style="list-style-type: lower-alpha;">
            <li><p>Sub-step a</p></li>
            <li><p>Sub-step b</p></li>
          </ol>
        </li>
        <li><p>Step 2</p></li>
      </ol>
    `;

    const analysis = analyzeHTMLStructure(properHtml);
    
    expect(analysis.totalLists).toBe(2);
    expect(analysis.alphabeticLists).toBe(1);
    expect(analysis.malformedStructure).toBe(false);
  });
});