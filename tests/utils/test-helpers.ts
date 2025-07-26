/**
 * Test Utilities for List Processing Testing
 * 
 * Provides utilities for testing HTML preprocessing, list conversion,
 * and AsciiDoc output validation.
 */

import { JSDOM } from 'jsdom';

export interface ListTestResult {
  success: boolean;
  errors: string[];
  warnings: string[];
  actualOutput: string;
  expectedOutput?: string;
}

export interface HTMLStructureAnalysis {
  totalLists: number;
  nestedLists: number;
  orphanedElements: number;
  listItems: number;
  alphabeticLists: number;
  malformedStructure: boolean;
}

/**
 * Analyzes HTML structure for list-related issues
 */
export function analyzeHTMLStructure(html: string): HTMLStructureAnalysis {
  const dom = new JSDOM(html);
  const document = dom.window.document;
  
  const analysis: HTMLStructureAnalysis = {
    totalLists: 0,
    nestedLists: 0,
    orphanedElements: 0,
    listItems: 0,
    alphabeticLists: 0,
    malformedStructure: false
  };
  
  // Count lists
  const lists = document.querySelectorAll('ol, ul');
  analysis.totalLists = lists.length;
  
  // Count list items
  analysis.listItems = document.querySelectorAll('li').length;
  
  // Count alphabetic lists
  lists.forEach(list => {
    const style = list.getAttribute('style') || '';
    const type = list.getAttribute('type') || '';
    if (style.includes('lower-alpha') || style.includes('lower-latin') || type === 'a') {
      analysis.alphabeticLists++;
    }
    
    // Check for nested lists
    const nestedListsInThisList = list.querySelectorAll('ol, ul');
    analysis.nestedLists += nestedListsInThisList.length;
  });
  
  // Check for malformed structure (lists as siblings of li elements)
  lists.forEach(list => {
    const children = Array.from(list.children);
    let foundLi = false;
    let foundNestedListAsSibling = false;
    
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const tagName = child.tagName.toLowerCase();
      
      if (tagName === 'li') {
        foundLi = true;
      } else if ((tagName === 'ol' || tagName === 'ul') && foundLi) {
        foundNestedListAsSibling = true;
        analysis.malformedStructure = true;
      } else if (tagName === 'p' || tagName === 'div') {
        // Orphaned elements
        analysis.orphanedElements++;
      }
    }
  });
  
  return analysis;
}

/**
 * Validates AsciiDoc list syntax
 */
export function validateAsciiDocListSyntax(content: string): ListTestResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const lines = content.split('\n');
  
  let currentDepth = 0;
  let inListBlock = false;
  let lastWasListItem = false;
  let numberedSequence: number[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Skip empty lines
    if (!line) {
      lastWasListItem = false;
      continue;
    }
    
    // Check for list items
    const listItemMatch = line.match(/^(\.+)\s+(.+)$/);
    if (listItemMatch) {
      const dots = listItemMatch[1];
      const depth = dots.length;
      const content = listItemMatch[2];
      
      inListBlock = true;
      lastWasListItem = true;
      
      // Validate depth progression
      if (depth > currentDepth + 1) {
        errors.push(`Line ${i + 1}: Invalid depth jump from ${currentDepth} to ${depth}. Maximum increase is 1 level.`);
      }
      
      currentDepth = depth;
      
      // Track numbered sequence for main level
      if (depth === 1) {
        numberedSequence.push(i + 1);
      }
      
      // Validate content
      if (!content.trim()) {
        errors.push(`Line ${i + 1}: Empty list item content`);
      }
      
    } else if (line === '+') {
      // Continuation marker
      if (!lastWasListItem && !inListBlock) {
        errors.push(`Line ${i + 1}: Continuation marker '+' without preceding list item`);
      }
      lastWasListItem = false;
      
    } else if (line.startsWith('[') && line.endsWith(']')) {
      // List attributes like [loweralpha], [start=2]
      const attribute = line.slice(1, -1);
      
      if (attribute === 'loweralpha' || attribute === 'upperalpha' || 
          attribute === 'lowerroman' || attribute === 'upperroman') {
        // These should only appear at the start of lists, not mixed within
        if (inListBlock && numberedSequence.length > 0) {
          warnings.push(`Line ${i + 1}: List attribute '${attribute}' appears within numbered sequence. This may break numbering.`);
        }
      }
      
      lastWasListItem = false;
      
    } else if (line.match(/^\d+\.\s+/)) {
      // Numbered list item (1. 2. 3.) - this is wrong for AsciiDoc
      errors.push(`Line ${i + 1}: Using numbered syntax '${line.match(/^\d+\./)?.[0]}' instead of dot syntax. Use '.' for AsciiDoc.`);
      lastWasListItem = true;
      
    } else {
      // Regular content
      if (inListBlock && !lastWasListItem && !line.startsWith('image::') && 
          !line.startsWith('[') && line !== '+') {
        warnings.push(`Line ${i + 1}: Content '${line}' appears in list block without continuation marker`);
      }
      lastWasListItem = false;
    }
  }
  
  // Validate numbered sequence continuity
  if (numberedSequence.length > 1) {
    let expectedSequence = true;
    for (let i = 1; i < numberedSequence.length; i++) {
      // Check if there are significant gaps in the sequence
      const gap = numberedSequence[i] - numberedSequence[i - 1];
      if (gap > 10) { // Allow some flexibility for content between
        warnings.push(`Large gap in numbered sequence between items ${i} and ${i + 1}. This may indicate broken list structure.`);
      }
    }
  }
  
  return {
    success: errors.length === 0,
    errors,
    warnings,
    actualOutput: content
  };
}

/**
 * Compares expected vs actual AsciiDoc output
 */
export function compareAsciiDocOutput(expected: string, actual: string): ListTestResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Normalize whitespace for comparison
  const normalizeContent = (content: string) => {
    return content
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .join('\n');
  };
  
  const normalizedExpected = normalizeContent(expected);
  const normalizedActual = normalizeContent(actual);
  
  if (normalizedExpected === normalizedActual) {
    return {
      success: true,
      errors: [],
      warnings: [],
      actualOutput: actual,
      expectedOutput: expected
    };
  }
  
  // Detailed comparison
  const expectedLines = normalizedExpected.split('\n');
  const actualLines = normalizedActual.split('\n');
  
  const maxLines = Math.max(expectedLines.length, actualLines.length);
  
  for (let i = 0; i < maxLines; i++) {
    const expectedLine = expectedLines[i] || '';
    const actualLine = actualLines[i] || '';
    
    if (expectedLine !== actualLine) {
      errors.push(`Line ${i + 1} mismatch:\n  Expected: "${expectedLine}"\n  Actual:   "${actualLine}"`);
    }
  }
  
  if (expectedLines.length !== actualLines.length) {
    errors.push(`Line count mismatch: expected ${expectedLines.length}, got ${actualLines.length}`);
  }
  
  return {
    success: false,
    errors,
    warnings,
    actualOutput: actual,
    expectedOutput: expected
  };
}

/**
 * Creates a minimal HTML document wrapper for testing
 */
export function wrapInHTMLDocument(bodyContent: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <title>Test Document</title>
</head>
<body>
${bodyContent}
</body>
</html>`;
}

/**
 * Extracts just the body content from a full HTML document
 */
export function extractBodyContent(html: string): string {
  const dom = new JSDOM(html);
  return dom.window.document.body.innerHTML;
}

/**
 * Creates test data for specific list scenarios
 */
export class ListTestDataBuilder {
  private html: string = '';
  
  addOrderedList(items: string[], style?: string): this {
    const styleAttr = style ? ` style="${style}"` : '';
    this.html += `<ol${styleAttr}>\n`;
    items.forEach(item => {
      this.html += `  <li><p>${item}</p></li>\n`;
    });
    this.html += `</ol>\n`;
    return this;
  }
  
  addUnorderedList(items: string[]): this {
    this.html += `<ul>\n`;
    items.forEach(item => {
      this.html += `  <li><p>${item}</p></li>\n`;
    });
    this.html += `</ul>\n`;
    return this;
  }
  
  addOrphanedParagraph(content: string): this {
    this.html += `<p>${content}</p>\n`;
    return this;
  }
  
  addMalformedNestedList(mainItems: string[], nestedItems: string[]): this {
    this.html += `<ol>\n`;
    mainItems.forEach((item, index) => {
      this.html += `  <li><p>${item}</p></li>\n`;
      // Add nested list as sibling (malformed structure)
      if (index === 0) {
        this.html += `  <ol style="list-style-type: lower-alpha;">\n`;
        nestedItems.forEach(nestedItem => {
          this.html += `    <li><p>${nestedItem}</p></li>\n`;
        });
        this.html += `  </ol>\n`;
      }
    });
    this.html += `</ol>\n`;
    return this;
  }
  
  build(): string {
    return this.html;
  }
  
  buildDocument(): string {
    return wrapInHTMLDocument(this.html);
  }
}