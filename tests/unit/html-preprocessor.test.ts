/**
 * Unit Tests for HTML Preprocessor
 * 
 * Tests the HTMLPreprocessor methods that handle list structure normalization
 */

import { JSDOM } from 'jsdom';
import { htmlListFixtures } from '../fixtures/html-list-structures';
import { analyzeHTMLStructure, wrapInHTMLDocument, extractBodyContent } from '../utils/test-helpers';

// We'll need to import the actual HTMLPreprocessor, but for now let's create a mock
// This will be replaced with the actual import once we have the class properly exported

class MockHTMLPreprocessor {
  /**
   * Fix orphaned paragraphs inside lists - paragraphs that are direct children
   * of ol/ul elements instead of being inside li elements
   */
  public fixOrphanedParagraphsInLists(document: Document): void {
    const lists = document.querySelectorAll('ol, ul');
    
    lists.forEach(list => {
      const children = Array.from(list.childNodes);
      const elementsToMove: { element: Element; targetListItem: Element }[] = [];
      let currentListItem: Element | null = null;
      
      // Process children in order to maintain proper sequence
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        
        if (child.nodeType === 1) { // Element node
          const element = child as Element;
          const tagName = element.tagName.toLowerCase();
          
          if (tagName === 'li') {
            // This is a proper list item - update current context
            currentListItem = element;
          } else if (tagName === 'p' || tagName === 'div' || tagName === 'img') {
            // This is orphaned content that should be moved
            const text = element.textContent?.trim() || '';
            
            // Determine where to attach this content
            if (currentListItem) {
              // Attach to the previous list item as continuation content
              elementsToMove.push({ element, targetListItem: currentListItem });
            } else {
              // No previous list item - create a new one
              const newListItem = document.createElement('li');
              list.insertBefore(newListItem, element);
              elementsToMove.push({ element, targetListItem: newListItem });
              currentListItem = newListItem;
            }
          } else if (tagName === 'ol' || tagName === 'ul') {
            // Nested list - should be attached to current list item if it exists
            if (currentListItem) {
              elementsToMove.push({ element, targetListItem: currentListItem });
            }
          }
        }
      }
      
      // Move all orphaned elements to their target list items
      elementsToMove.forEach(({ element, targetListItem }) => {
        // Remove from current position and append to target
        element.remove();
        targetListItem.appendChild(element);
      });
    });
  }

  /**
   * Fix nested lists that appear as siblings after list items
   * This handles cases where <ol> appears immediately after <li> instead of being nested inside
   */
  public fixNestedListsAfterListItems(document: Document): void {
    const lists = document.querySelectorAll('ol, ul');
    
    lists.forEach(list => {
      const children = Array.from(list.children);
      let i = 0;
      
      while (i < children.length) {
        const child = children[i];
        
        if (child.tagName.toLowerCase() === 'li') {
          // Look for nested lists that appear as siblings after this list item
          let j = i + 1;
          const nestedListsToMove: Element[] = [];
          
          // Collect all consecutive nested lists that should belong to this list item
          while (j < children.length && 
                 (children[j].tagName.toLowerCase() === 'ol' || children[j].tagName.toLowerCase() === 'ul')) {
            nestedListsToMove.push(children[j]);
            j++;
          }
          
          // Move all collected nested lists into the current list item
          nestedListsToMove.forEach(nestedList => {
            nestedList.remove();
            child.appendChild(nestedList);
          });
          
          // Update children array since we modified the DOM
          children.splice(i + 1, nestedListsToMove.length);
        }
        
        i++;
      }
    });
  }
}

describe('HTMLPreprocessor Unit Tests', () => {
  let preprocessor: MockHTMLPreprocessor;

  beforeEach(() => {
    preprocessor = new MockHTMLPreprocessor();
  });

  describe('fixOrphanedParagraphsInLists', () => {
    test('should move orphaned paragraphs to the previous list item', () => {
      const html = htmlListFixtures.orphanedParagraphs;
      const dom = new JSDOM(wrapInHTMLDocument(html));
      const document = dom.window.document;

      // Analyze before
      const beforeAnalysis = analyzeHTMLStructure(document.body.innerHTML);
      expect(beforeAnalysis.orphanedElements).toBeGreaterThan(0);

      // Apply fix
      preprocessor.fixOrphanedParagraphsInLists(document);

      // Analyze after
      const afterAnalysis = analyzeHTMLStructure(document.body.innerHTML);
      expect(afterAnalysis.orphanedElements).toBe(0);

      // Verify structure
      const lists = document.querySelectorAll('ol');
      expect(lists.length).toBe(1);
      
      const listItems = document.querySelectorAll('li');
      expect(listItems.length).toBeGreaterThan(0);

      // Verify orphaned content was moved into list items
      let foundOrphanedContent = false;
      listItems.forEach(li => {
        const paragraphs = li.querySelectorAll('p');
        if (paragraphs.length > 1) {
          foundOrphanedContent = true;
        }
      });
      expect(foundOrphanedContent).toBe(true);
    });

    test('should create new list items for orphaned content when no previous item exists', () => {
      const html = `
        <ol>
          <p>Orphaned paragraph at start</p>
          <li><p>First proper item</p></li>
          <p>Orphaned paragraph after</p>
        </ol>
      `;
      
      const dom = new JSDOM(wrapInHTMLDocument(html));
      const document = dom.window.document;

      preprocessor.fixOrphanedParagraphsInLists(document);

      const listItems = document.querySelectorAll('li');
      expect(listItems.length).toBe(2); // Original + 1 created for orphaned content

      // First item should contain the orphaned paragraph
      const firstItem = listItems[0];
      expect(firstItem.textContent?.trim()).toContain('Orphaned paragraph at start');
    });

    test('should handle nested lists as orphaned content', () => {
      const html = `
        <ol>
          <li><p>Main item</p></li>
          <ol style="list-style-type: lower-alpha;">
            <li><p>Nested item</p></li>
          </ol>
        </ol>
      `;
      
      const dom = new JSDOM(wrapInHTMLDocument(html));
      const document = dom.window.document;

      preprocessor.fixOrphanedParagraphsInLists(document);

      const mainList = document.querySelector('ol');
      const mainListItems = mainList?.querySelectorAll(':scope > li');
      expect(mainListItems?.length).toBe(1);

      // Nested list should now be inside the main list item
      const nestedList = mainListItems?.[0]?.querySelector('ol');
      expect(nestedList).toBeTruthy();
      expect(nestedList?.style.listStyleType).toBe('lower-alpha');
    });
  });

  describe('fixNestedListsAfterListItems', () => {
    test('should move sibling nested lists into their preceding list items', () => {
      const html = htmlListFixtures.nestedListAsSibling;
      const dom = new JSDOM(wrapInHTMLDocument(html));
      const document = dom.window.document;

      // Analyze before - should show malformed structure
      const beforeAnalysis = analyzeHTMLStructure(document.body.innerHTML);
      expect(beforeAnalysis.malformedStructure).toBe(true);

      // Apply fix
      preprocessor.fixNestedListsAfterListItems(document);

      // Analyze after - should be properly nested
      const afterAnalysis = analyzeHTMLStructure(document.body.innerHTML);
      expect(afterAnalysis.malformedStructure).toBe(false);

      // Verify structure
      const mainList = document.querySelector('ol');
      const directChildren = Array.from(mainList?.children || []);
      
      // All direct children should be <li> elements
      directChildren.forEach(child => {
        expect(child.tagName.toLowerCase()).toBe('li');
      });

      // Verify nested lists are now inside list items
      const listItems = document.querySelectorAll('li');
      let foundNestedLists = 0;
      listItems.forEach(li => {
        const nestedLists = li.querySelectorAll('ol, ul');
        foundNestedLists += nestedLists.length;
      });
      expect(foundNestedLists).toBeGreaterThan(0);
    });

    test('should handle multiple consecutive nested lists', () => {
      const html = `
        <ol>
          <li><p>Item 1</p></li>
          <ol style="list-style-type: lower-alpha;">
            <li><p>Nested A</p></li>
          </ol>
          <ol style="list-style-type: lower-roman;">
            <li><p>Nested B</p></li>
          </ol>
          <li><p>Item 2</p></li>
        </ol>
      `;
      
      const dom = new JSDOM(wrapInHTMLDocument(html));
      const document = dom.window.document;

      preprocessor.fixNestedListsAfterListItems(document);

      const firstItem = document.querySelector('li');
      const nestedListsInFirstItem = firstItem?.querySelectorAll('ol');
      expect(nestedListsInFirstItem?.length).toBe(2);

      // Verify the styles are preserved
      const alphabeticList = Array.from(nestedListsInFirstItem || [])
        .find(ol => ol.style.listStyleType === 'lower-alpha');
      const romanList = Array.from(nestedListsInFirstItem || [])
        .find(ol => ol.style.listStyleType === 'lower-roman');
      
      expect(alphabeticList).toBeTruthy();
      expect(romanList).toBeTruthy();
    });

    test('should preserve list item order and content', () => {
      const html = htmlListFixtures.realMadCapStructure;
      const dom = new JSDOM(wrapInHTMLDocument(html));
      const document = dom.window.document;

      // Get original content for comparison
      const originalListItems = Array.from(document.querySelectorAll('li')).map(li => li.textContent?.trim());

      preprocessor.fixNestedListsAfterListItems(document);

      // Verify main list items are still in order
      const mainList = document.querySelector('ol');
      const mainListItems = Array.from(mainList?.querySelectorAll(':scope > li') || []);
      
      expect(mainListItems.length).toBeGreaterThan(0);
      
      // First item should still contain "Activities"
      expect(mainListItems[0].textContent).toContain('Activities');
      
      // Should have nested lists inside some items
      let foundNestedLists = false;
      mainListItems.forEach(li => {
        const nestedLists = li.querySelectorAll('ol, ul');
        if (nestedLists.length > 0) {
          foundNestedLists = true;
        }
      });
      expect(foundNestedLists).toBe(true);
    });
  });

  describe('Combined preprocessing', () => {
    test('should handle both orphaned paragraphs and malformed nested lists', () => {
      const html = `
        <ol>
          <li><p>Step 1</p></li>
          <p>Orphaned paragraph</p>
          <li><p>Step 2</p></li>
          <ol style="list-style-type: lower-alpha;">
            <li><p>Sub-step a</p></li>
            <li><p>Sub-step b</p></li>
          </ol>
          <p>Another orphaned paragraph</p>
          <li><p>Step 3</p></li>
        </ol>
      `;
      
      const dom = new JSDOM(wrapInHTMLDocument(html));
      const document = dom.window.document;

      // Apply both fixes in order
      preprocessor.fixOrphanedParagraphsInLists(document);
      preprocessor.fixNestedListsAfterListItems(document);

      // Verify final structure
      const analysis = analyzeHTMLStructure(document.body.innerHTML);
      expect(analysis.orphanedElements).toBe(0);
      expect(analysis.malformedStructure).toBe(false);

      // Verify all content is preserved
      const mainList = document.querySelector('ol');
      expect(mainList?.textContent).toContain('Step 1');
      expect(mainList?.textContent).toContain('Step 2');
      expect(mainList?.textContent).toContain('Step 3');
      expect(mainList?.textContent).toContain('Sub-step a');
      expect(mainList?.textContent).toContain('Sub-step b');
      expect(mainList?.textContent).toContain('Orphaned paragraph');
      expect(mainList?.textContent).toContain('Another orphaned paragraph');
    });
  });
});