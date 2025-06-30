/**
 * Validation Rules for AsciiDoc Syntax
 * 
 * Defines common validation patterns and error detection for AsciiDoc content
 */

export interface ValidationRule {
  id: string;
  name: string;
  description: string;
  severity: 'error' | 'warning' | 'info';
  pattern?: RegExp;
  validate: (content: string) => ValidationIssue[];
}

export interface ValidationIssue {
  ruleId: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  line: number;
  column?: number;
  suggestion?: string;
}

/**
 * Core validation rules for AsciiDoc syntax
 */
export const VALIDATION_RULES: ValidationRule[] = [
  
  // Orphaned Continuation Markers
  {
    id: 'orphaned-continuation',
    name: 'Orphaned Continuation Marker',
    description: 'Detects + continuation markers that are not properly attached to blocks',
    severity: 'warning',
    pattern: /^\+\s*$/,
    validate: (content: string): ValidationIssue[] => {
      const lines = content.split('\n');
      const issues: ValidationIssue[] = [];
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const prevLine = i > 0 ? lines[i - 1] : '';
        const nextLine = i < lines.length - 1 ? lines[i + 1] : '';
        
        // Check if this is a standalone continuation marker
        if (line.trim() === '+') {
          let isOrphaned = false;
          
          // Check for common orphaned patterns
          
          // 1. + followed by [NOTE] or other block elements (should be connected)
          if (nextLine.match(/^\s*\[(?:NOTE|TIP|WARNING|CAUTION|IMPORTANT)\]/)) {
            isOrphaned = true;
          }
          
          // 2. + followed by [loweralpha] or other list attributes
          else if (nextLine.match(/^\s*\[(?:loweralpha|upperalpha|lowerroman|upperroman)\]/)) {
            isOrphaned = true;
          }
          
          // 3. + that appears after a list marker and before another list marker
          else if (prevLine.match(/^\s*[.*]+\s/) && nextLine.match(/^\s*[.*]+\s/)) {
            isOrphaned = true;
          }
          
          // 4. + with no following content within reasonable distance
          else {
            let hasValidContent = false;
            for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
              const futureLine = lines[j];
              if (futureLine.trim()) {
                // Check if this is valid continuation content
                if (!futureLine.match(/^[.=*-]+\s|^={2,}\s|^\[(?:source|cols|NOTE|TIP|WARNING|CAUTION|IMPORTANT)\]|^====|^----|\|===/)) {
                  hasValidContent = true;
                  break;
                }
              }
            }
            if (!hasValidContent) {
              isOrphaned = true;
            }
          }
          
          if (isOrphaned) {
            issues.push({
              ruleId: 'orphaned-continuation',
              severity: 'warning',
              message: 'Orphaned continuation marker (+) detected. This marker is not properly attached to a block.',
              line: i + 1,
              column: line.indexOf('+') + 1,
              suggestion: 'Remove the orphaned + marker or ensure it properly continues a list item with adjacent content.'
            });
          }
        }
      }
      
      return issues;
    }
  },

  // Broken List Structure
  {
    id: 'broken-list-structure',
    name: 'Broken List Structure',
    description: 'Detects improperly nested or malformed list structures',
    severity: 'error',
    validate: (content: string): ValidationIssue[] => {
      const lines = content.split('\n');
      const issues: ValidationIssue[] = [];
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // Check for invalid list nesting patterns
        
        // 1. Multiple dots without proper progression
        const multiDotMatch = line.match(/^(\s*)(\.{4,})\s+(.+)$/);
        if (multiDotMatch) {
          issues.push({
            ruleId: 'broken-list-structure',
            severity: 'error',
            message: `Too many dots (${multiDotMatch[2].length}) for list nesting. AsciiDoc supports up to 5 levels (.....)}`,
            line: i + 1,
            column: 1,
            suggestion: 'Use proper nesting levels: . .. ... .... .....'
          });
        }
        
        // 2. List marker followed by [loweralpha] on same line (should be separate)
        const inlineAttributeMatch = line.match(/^(\s*[.*]+)\s+\[loweralpha\]/);
        if (inlineAttributeMatch) {
          issues.push({
            ruleId: 'broken-list-structure',
            severity: 'warning',
            message: 'List attribute [loweralpha] should be on separate line before list items',
            line: i + 1,
            column: line.indexOf('[loweralpha]') + 1,
            suggestion: 'Move [loweralpha] to its own line before the list'
          });
        }
        
        // 3. Mixed list markers at same indentation level
        if (line.match(/^\s*[.*]+\s+/) && i > 0) {
          const currentIndent = line.match(/^(\s*)/)?.[1].length || 0;
          const currentMarkerType = line.match(/^(\s*)([.*]+)/)?.[2][0];
          
          // Look for previous list item at same level
          for (let j = i - 1; j >= 0; j--) {
            const prevLine = lines[j];
            const prevIndent = prevLine.match(/^(\s*)/)?.[1].length || 0;
            const prevMarkerType = prevLine.match(/^(\s*)([.*]+)/)?.[2]?.[0];
            
            if (prevIndent === currentIndent && prevMarkerType && currentMarkerType) {
              if (prevMarkerType !== currentMarkerType) {
                issues.push({
                  ruleId: 'broken-list-structure',
                  severity: 'warning',
                  message: `Mixed list markers at same level: '${prevMarkerType}' and '${currentMarkerType}'`,
                  line: i + 1,
                  column: currentIndent + 1,
                  suggestion: 'Use consistent list markers (all * or all .) at the same nesting level'
                });
              }
              break;
            }
            
            // Stop if we hit a non-list line
            if (prevLine.trim() && !prevLine.match(/^\s*[.*+]+(\s|$)/)) {
              break;
            }
          }
        }
      }
      
      return issues;
    }
  },

  // Invalid Table Syntax
  {
    id: 'invalid-table-syntax',
    name: 'Invalid Table Syntax',
    description: 'Detects malformed table structures',
    severity: 'error',
    validate: (content: string): ValidationIssue[] => {
      const lines = content.split('\n');
      const issues: ValidationIssue[] = [];
      
      let inTable = false;
      let tableStartLine = -1;
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // Detect table start
        if (line.trim() === '|===') {
          if (inTable) {
            // Table end
            inTable = false;
          } else {
            // Table start
            inTable = true;
            tableStartLine = i;
          }
          continue;
        }
        
        if (inTable) {
          // Check for lines that don't start with |
          if (line.trim() && !line.startsWith('|') && !line.match(/^\s*\[.*\]\s*$/)) {
            issues.push({
              ruleId: 'invalid-table-syntax',
              severity: 'error',
              message: 'Table row must start with | character',
              line: i + 1,
              column: 1,
              suggestion: 'Ensure all table content lines start with |'
            });
          }
          
          // Check for unescaped pipes in cell content
          const cellMatches = line.match(/\|([^|]+)/g);
          if (cellMatches) {
            cellMatches.forEach(cell => {
              const cellContent = cell.substring(1); // Remove leading |
              const unescapedPipes = cellContent.match(/(?<!\\)\|/g);
              if (unescapedPipes) {
                issues.push({
                  ruleId: 'invalid-table-syntax',
                  severity: 'warning',
                  message: 'Unescaped pipe character in table cell',
                  line: i + 1,
                  column: line.indexOf(cell) + 1,
                  suggestion: 'Escape pipe characters with \\| in table cells'
                });
              }
            });
          }
        }
      }
      
      // Check for unclosed tables
      if (inTable) {
        issues.push({
          ruleId: 'invalid-table-syntax',
          severity: 'error',
          message: 'Table not properly closed with |===',
          line: tableStartLine + 1,
          column: 1,
          suggestion: 'Add |=== to close the table'
        });
      }
      
      return issues;
    }
  },

  // Invalid Image Macros
  {
    id: 'invalid-image-macro',
    name: 'Invalid Image Macro',
    description: 'Detects malformed image macro syntax',
    severity: 'error',
    pattern: /image::?([^[\]]+)(\[([^\]]*)\])?/g,
    validate: (content: string): ValidationIssue[] => {
      const lines = content.split('\n');
      const issues: ValidationIssue[] = [];
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // Check for image macros
        const imageMatches = line.matchAll(/image(::?)([^[\]]+)(\[([^\]]*)\])?/g);
        
        for (const match of imageMatches) {
          const [fullMatch, macroType, imagePath, , altText] = match;
          const column = match.index! + 1;
          
          // Check for missing image path
          if (!imagePath || imagePath.trim() === '') {
            issues.push({
              ruleId: 'invalid-image-macro',
              severity: 'error',
              message: 'Image macro missing file path',
              line: i + 1,
              column,
              suggestion: 'Provide a valid image file path: image::path/to/image.png[]'
            });
          }
          
          // Check for missing alt text (warning)
          if (!altText || altText.trim() === '') {
            issues.push({
              ruleId: 'invalid-image-macro',
              severity: 'warning',
              message: 'Image macro missing alt text',
              line: i + 1,
              column,
              suggestion: 'Add descriptive alt text: image::path[Alt text description]'
            });
          }
          
          // Check for spaces in file paths (common error)
          if (imagePath.includes(' ') && !imagePath.includes('%20')) {
            issues.push({
              ruleId: 'invalid-image-macro',
              severity: 'warning',
              message: 'Image path contains spaces',
              line: i + 1,
              column,
              suggestion: 'Replace spaces with %20 or use underscores/hyphens in file names'
            });
          }
        }
      }
      
      return issues;
    }
  },

  // Missing Include Files
  {
    id: 'missing-include',
    name: 'Missing Include Reference',
    description: 'Detects potentially missing include file references',
    severity: 'warning',
    pattern: /include::([^[\]]+)(\[([^\]]*)\])?/g,
    validate: (content: string): ValidationIssue[] => {
      const lines = content.split('\n');
      const issues: ValidationIssue[] = [];
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // Check for include directives
        const includeMatches = line.matchAll(/include::([^[\]]+)(\[([^\]]*)\])?/g);
        
        for (const match of includeMatches) {
          const [fullMatch, includePath] = match;
          const column = match.index! + 1;
          
          // Check for missing include path
          if (!includePath || includePath.trim() === '') {
            issues.push({
              ruleId: 'missing-include',
              severity: 'error',
              message: 'Include directive missing file path',
              line: i + 1,
              column,
              suggestion: 'Provide a valid include file path: include::path/to/file.adoc[]'
            });
          }
          
          // Check for common include file patterns that might need attention
          if (includePath.includes('variables') && !includePath.includes('.adoc')) {
            issues.push({
              ruleId: 'missing-include',
              severity: 'info',
              message: 'Variable include file may need .adoc extension',
              line: i + 1,
              column,
              suggestion: 'Consider using: include::includes/variables.adoc[]'
            });
          }
        }
      }
      
      return issues;
    }
  }
];

/**
 * Get all validation rules or filter by severity
 */
export function getValidationRules(severity?: 'error' | 'warning' | 'info'): ValidationRule[] {
  if (severity) {
    return VALIDATION_RULES.filter(rule => rule.severity === severity);
  }
  return VALIDATION_RULES;
}

/**
 * Get a specific validation rule by ID
 */
export function getValidationRule(id: string): ValidationRule | undefined {
  return VALIDATION_RULES.find(rule => rule.id === id);
}