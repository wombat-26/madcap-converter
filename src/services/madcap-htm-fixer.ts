/**
 * MadCap HTM Fixing Service
 * 
 * Automatically fixes common validation errors in MadCap Flare HTM files,
 * with special focus on list nesting issues and XHTML compliance.
 */

import * as cheerio from 'cheerio';
import { tidy } from 'htmltidy2';
import { promisify } from 'util';

type CheerioElement = any;

const tidyAsync = promisify(tidy);

export interface MadCapFixResult {
  wasFixed: boolean;
  originalContent: string;
  fixedContent: string;
  appliedFixes: string[];
  remainingIssues: string[];
  summary: {
    listNestingFixes: number;
    xhtmlFixes: number;
    madcapElementFixes: number;
    structuralFixes: number;
  };
}

export interface MadCapFixOptions {
  fixListNesting: boolean;
  fixXHTMLCompliance: boolean;
  fixMadCapElements: boolean;
  preserveFormatting: boolean;
  validateAfterFix: boolean;
}

export class MadCapHTMFixingService {
  private readonly defaultOptions: MadCapFixOptions = {
    fixListNesting: true,
    fixXHTMLCompliance: true,
    fixMadCapElements: true,
    preserveFormatting: true,
    validateAfterFix: true
  };

  /**
   * Fix all common validation errors in MadCap HTM content
   */
  async fixMadCapHTM(html: string, options?: Partial<MadCapFixOptions>): Promise<MadCapFixResult> {
    const opts = { ...this.defaultOptions, ...options };
    const appliedFixes: string[] = [];
    const remainingIssues: string[] = [];
    let fixedContent = html;
    let listNestingFixes = 0;
    let xhtmlFixes = 0;
    let madcapElementFixes = 0;
    let structuralFixes = 0;

    // 1. Fix MadCap-specific elements first
    if (opts.fixMadCapElements) {
      const madcapResult = this.fixMadCapElements(fixedContent);
      fixedContent = madcapResult.content;
      appliedFixes.push(...madcapResult.fixes);
      madcapElementFixes = madcapResult.fixes.length;
    }

    // 2. Fix list nesting issues
    if (opts.fixListNesting) {
      const listResult = this.fixListNesting(fixedContent);
      fixedContent = listResult.content;
      appliedFixes.push(...listResult.fixes);
      remainingIssues.push(...listResult.remainingIssues);
      listNestingFixes = listResult.fixes.length;
    }

    // 3. Fix structural issues
    const structureResult = this.fixStructuralIssues(fixedContent);
    fixedContent = structureResult.content;
    appliedFixes.push(...structureResult.fixes);
    structuralFixes = structureResult.fixes.length;

    // 4. Apply XHTML compliance fixes
    if (opts.fixXHTMLCompliance) {
      try {
        const xhtmlResult = await this.fixXHTMLCompliance(fixedContent, opts.preserveFormatting);
        fixedContent = xhtmlResult.content;
        appliedFixes.push(...xhtmlResult.fixes);
        xhtmlFixes = xhtmlResult.fixes.length;
      } catch (error) {
        remainingIssues.push(`XHTML fixing failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return {
      wasFixed: appliedFixes.length > 0,
      originalContent: html,
      fixedContent,
      appliedFixes,
      remainingIssues,
      summary: {
        listNestingFixes,
        xhtmlFixes,
        madcapElementFixes,
        structuralFixes
      }
    };
  }

  /**
   * Fix list nesting issues specific to MadCap patterns
   */
  private fixListNesting(html: string): { content: string; fixes: string[]; remainingIssues: string[] } {
    const $ = cheerio.load(html, { xmlMode: false });
    const fixes: string[] = [];
    const remainingIssues: string[] = [];

    // Fix 1: Move orphaned paragraphs and other elements inside list items
    $('ul, ol').each((index, listElement) => {
      const $list = $(listElement);
      const children = $list.children();
      const fixedChildren: cheerio.Cheerio<CheerioElement>[] = [];
      let currentLi: cheerio.Cheerio<CheerioElement> | null = null;

      children.each((childIndex, child) => {
        const $child = $(child);
        const tagName = child.tagName.toLowerCase();

        if (tagName === 'li') {
          // This is a valid list item
          currentLi = $child;
          fixedChildren.push($child);
        } else if (['script', 'template'].includes(tagName)) {
          // These are allowed direct children
          fixedChildren.push($child);
        } else {
          // Invalid direct child - needs to be moved into a list item
          if (currentLi) {
            // Append to the previous list item
            currentLi.append($child.clone());
            fixes.push(`Moved orphaned <${tagName}> into previous <li> element`);
          } else {
            // Create a new list item for this content
            const newLi = $('<li>').append($child.clone());
            fixedChildren.push(newLi);
            currentLi = newLi;
            fixes.push(`Wrapped orphaned <${tagName}> in new <li> element`);
          }
          $child.remove();
        }
      });

      // Rebuild the list with fixed children
      if (fixes.length > 0) {
        $list.empty();
        fixedChildren.forEach(child => $list.append(child));
      }
    });

    // Fix 2: Wrap orphaned list items
    $('li').each((index, element) => {
      const $li = $(element);
      const $parent = $li.parent();
      
      if ($parent.length === 0 || !['ul', 'ol'].includes($parent[0].tagName.toLowerCase())) {
        // Create a wrapper list
        const wrapper = $('<ul>').append($li.clone());
        $li.replaceWith(wrapper);
        fixes.push('Wrapped orphaned <li> element in <ul>');
      }
    });

    // Fix 3: Move misplaced nested lists into list items
    $('ul ul, ol ol, ul ol, ol ul').each((index, element) => {
      const $nestedList = $(element);
      const $parent = $nestedList.parent();
      
      if ($parent[0] && $parent[0].tagName.toLowerCase() !== 'li') {
        // Find the previous sibling that's a list item
        const $prevLi = $nestedList.prevAll('li').first();
        
        if ($prevLi.length > 0) {
          // Move the nested list into the previous list item
          $prevLi.append($nestedList.clone());
          $nestedList.remove();
          fixes.push(`Moved nested <${element.tagName.toLowerCase()}> into previous <li> element`);
        } else {
          // Create a new list item to contain the nested list
          const newLi = $('<li>').append($nestedList.clone());
          $nestedList.replaceWith(newLi);
          fixes.push(`Wrapped nested <${element.tagName.toLowerCase()}> in new <li> element`);
        }
      }
    });

    // Fix 4: Handle orphaned text content in lists
    $('ul, ol').each((index, element) => {
      const $list = $(element);
      
      $list.contents().filter(function() {
        return this.nodeType === 3 && $(this).text().trim().length > 0;
      }).each((textIndex, textNode) => {
        const text = $(textNode).text().trim();
        
        // Find the previous list item or create a new one
        const $prevLi = $(textNode).prevAll('li').first();
        
        if ($prevLi.length > 0) {
          $prevLi.append(' ' + text);
          fixes.push(`Moved orphaned text "${text}" into previous <li> element`);
        } else {
          const newLi = $('<li>').text(text);
          $(textNode).replaceWith(newLi);
          fixes.push(`Wrapped orphaned text "${text}" in new <li> element`);
        }
        
        $(textNode).remove();
      });
    });

    // Fix 5: Ensure proper alphabetical list attributes
    $('ol[type="a"], ol[style*="lower-alpha"]').each((index, element) => {
      const $ol = $(element);
      
      // Ensure the list has proper nesting structure for alphabetical lists
      if ($ol.parent()[0] && $ol.parent()[0].tagName.toLowerCase() === 'li') {
        // This is properly nested
        fixes.push('Verified alphabetical list nesting structure');
      } else {
        // This might need to be wrapped
        remainingIssues.push('Alphabetical list may need proper parent structure');
      }
    });

    return {
      content: $.html(),
      fixes,
      remainingIssues
    };
  }

  /**
   * Fix MadCap-specific element issues
   */
  private fixMadCapElements(html: string): { content: string; fixes: string[] } {
    let content = html;
    const fixes: string[] = [];

    // Fix self-closing MadCap:variable tags
    const variableRegex = /<MadCap:variable([^>]*?)\s*\/>/gi;
    content = content.replace(variableRegex, (match, attributes) => {
      fixes.push('Normalized self-closing MadCap:variable to regular tags');
      return `<MadCap:variable${attributes}></MadCap:variable>`;
    });

    // Fix self-closing snippet tags
    const snippetBlockRegex = /<MadCap:snippetBlock([^>]*?)\s*\/>/gi;
    content = content.replace(snippetBlockRegex, (match, attributes) => {
      fixes.push('Normalized self-closing MadCap:snippetBlock to regular tags');
      return `<MadCap:snippetBlock${attributes}></MadCap:snippetBlock>`;
    });

    const snippetTextRegex = /<MadCap:snippetText([^>]*?)\s*\/>/gi;
    content = content.replace(snippetTextRegex, (match, attributes) => {
      fixes.push('Normalized self-closing MadCap:snippetText to regular tags');
      return `<MadCap:snippetText${attributes}></MadCap:snippetText>`;
    });

    // Fix MadCap dropdown structure
    const $ = cheerio.load(content, { xmlMode: false });
    
    $('MadCap\\:dropDown').each((index, element) => {
      const $dropdown = $(element);
      const hasHead = $dropdown.children('MadCap\\:dropDownHead').length > 0;
      const hasBody = $dropdown.children('MadCap\\:dropDownBody').length > 0;
      
      if (!hasHead) {
        const $head = $('<MadCap:dropDownHead><MadCap:dropDownHotspot>More Information</MadCap:dropDownHotspot></MadCap:dropDownHead>');
        $dropdown.prepend($head);
        fixes.push('Added missing MadCap:dropDownHead to dropdown');
      }
      
      if (!hasBody) {
        const $body = $('<MadCap:dropDownBody></MadCap:dropDownBody>');
        // Move existing content to body
        $dropdown.children().not('MadCap\\:dropDownHead').appendTo($body);
        $dropdown.append($body);
        fixes.push('Added missing MadCap:dropDownBody to dropdown');
      }
    });

    return {
      content: $.html(),
      fixes
    };
  }

  /**
   * Fix structural issues
   */
  private fixStructuralIssues(html: string): { content: string; fixes: string[] } {
    const $ = cheerio.load(html, { xmlMode: false });
    const fixes: string[] = [];

    // Fix missing required attributes
    $('img').each((index, element) => {
      const $img = $(element);
      if (!$img.attr('alt')) {
        $img.attr('alt', '');
        fixes.push('Added missing alt attribute to image');
      }
    });

    // Fix table structure issues
    $('table').each((index, element) => {
      const $table = $(element);
      
      // Ensure table has tbody if it has rows but no tbody
      const hasRows = $table.find('tr').length > 0;
      const hasTbody = $table.find('tbody').length > 0;
      const hasThead = $table.find('thead').length > 0;
      
      if (hasRows && !hasTbody && !hasThead) {
        const $tbody = $('<tbody>');
        $table.find('tr').appendTo($tbody);
        $table.append($tbody);
        fixes.push('Wrapped table rows in tbody element');
      }
    });

    // Fix anchor links without href
    $('a').each((index, element) => {
      const $a = $(element);
      if (!$a.attr('href') && !$a.attr('name') && !$a.attr('id')) {
        $a.attr('href', '#');
        fixes.push('Added missing href attribute to anchor');
      }
    });

    return {
      content: $.html(),
      fixes
    };
  }

  /**
   * Apply XHTML compliance fixes using HTML Tidy
   */
  private async fixXHTMLCompliance(html: string, preserveFormatting: boolean = true): Promise<{ content: string; fixes: string[] }> {
    const fixes: string[] = [];
    
    try {
      const tidyOptions = {
        'input-xml': true,
        'output-xhtml': true,
        'add-xml-decl': false,
        'doctype': 'omit',
        'numeric-entities': true,
        'quote-marks': true,
        'quote-ampersand': true,
        'quote-nbsp': true,
        'break-before-br': false,
        'indent': preserveFormatting,
        'indent-spaces': 2,
        'wrap': 0,
        'fix-bad-uri': true,
        'lower-literals': true,
        'hide-comments': false,
        'join-classes': false,
        'join-styles': false,
        'escape-cdata': true,
        'uppercase-tags': false,
        'uppercase-attributes': false
      };

      const result = await tidyAsync(html, tidyOptions);
      
      if (result) {
        fixes.push('Applied HTML Tidy XHTML compliance fixes');
        fixes.push('Ensured proper tag closing and attribute quoting');
        fixes.push('Fixed character entity encoding');
        
        return {
          content: result,
          fixes
        };
      }
    } catch (error) {
      throw new Error(`HTML Tidy failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    return {
      content: html,
      fixes
    };
  }

  /**
   * Fix a specific MadCap HTM file
   */
  async fixMadCapFile(filePath: string, options?: Partial<MadCapFixOptions>): Promise<MadCapFixResult> {
    const fs = await import('fs/promises');
    
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return await this.fixMadCapHTM(content, options);
    } catch (error) {
      throw new Error(`Failed to read file ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Fix and save a MadCap HTM file
   */
  async fixAndSaveMadCapFile(filePath: string, outputPath?: string, options?: Partial<MadCapFixOptions>): Promise<MadCapFixResult> {
    const fs = await import('fs/promises');
    const result = await this.fixMadCapFile(filePath, options);
    
    if (result.wasFixed) {
      const saveLocation = outputPath || filePath;
      await fs.writeFile(saveLocation, result.fixedContent, 'utf-8');
    }
    
    return result;
  }

  /**
   * Generate a fixing report
   */
  generateFixReport(result: MadCapFixResult): string {
    const lines: string[] = [];
    lines.push(`MadCap HTM Fixing Report`);
    lines.push(`${'='.repeat(40)}`);
    
    lines.push(`Status: ${result.wasFixed ? 'FIXES APPLIED' : 'NO FIXES NEEDED'}`);
    lines.push('');
    
    lines.push(`Summary:`);
    lines.push(`  List Nesting Fixes: ${result.summary.listNestingFixes}`);
    lines.push(`  XHTML Fixes: ${result.summary.xhtmlFixes}`);
    lines.push(`  MadCap Element Fixes: ${result.summary.madcapElementFixes}`);
    lines.push(`  Structural Fixes: ${result.summary.structuralFixes}`);
    lines.push(`  Total Fixes Applied: ${result.appliedFixes.length}`);
    lines.push('');

    if (result.appliedFixes.length > 0) {
      lines.push(`Applied Fixes:`);
      result.appliedFixes.forEach(fix => {
        lines.push(`  ✓ ${fix}`);
      });
      lines.push('');
    }

    if (result.remainingIssues.length > 0) {
      lines.push(`Remaining Issues:`);
      result.remainingIssues.forEach(issue => {
        lines.push(`  ⚠ ${issue}`);
      });
      lines.push('');
    }

    return lines.join('\n');
  }
}