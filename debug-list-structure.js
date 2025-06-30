import fs from 'fs';
import { JSDOM } from 'jsdom';

function analyzeListStructure() {
  console.log('Analyzing the list structure that contains the problematic BudgetTabConnectedSpend image...\n');
  
  // Read the HTML file
  const htmlContent = fs.readFileSync('/Volumes/Envoy Pro/Flare/Plan_EN/Content/02 Planung/01-01 CreatActivity.htm', 'utf-8');
  
  // Parse with JSDOM
  const dom = new JSDOM(htmlContent);
  const document = dom.window.document;
  
  // Find all ol elements
  const orderedLists = document.querySelectorAll('ol');
  
  orderedLists.forEach((ol, index) => {
    console.log(`=== ORDERED LIST ${index + 1} ===`);
    
    // Check for the BudgetTabConnectedSpend image
    const budgetImage = ol.querySelector('img[src*="BudgetTabConnectedSpend"]');
    if (!budgetImage) {
      console.log('(Does not contain BudgetTabConnectedSpend image, skipping...)\n');
      return;
    }
    
    console.log('✓ This list contains the BudgetTabConnectedSpend image!\n');
    
    // Analyze the children of this ol
    const allChildren = Array.from(ol.children);
    const listItems = allChildren.filter(child => child.tagName.toLowerCase() === 'li');
    const nonListItems = allChildren.filter(child => child.tagName.toLowerCase() !== 'li');
    
    console.log(`Total children: ${allChildren.length}`);
    console.log(`<li> elements: ${listItems.length}`);
    console.log(`Non-<li> elements: ${nonListItems.length}`);
    
    if (nonListItems.length > 0) {
      console.log('\nNon-<li> elements found:');
      nonListItems.forEach((element, i) => {
        console.log(`  ${i + 1}. <${element.tagName.toLowerCase()}> - "${element.textContent?.trim().substring(0, 50)}..."`);
      });
    }
    
    // Find the specific li that contains the BudgetTabConnectedSpend image
    const targetLi = budgetImage.closest('li');
    if (targetLi) {
      console.log('\n=== ANALYZING TARGET <li> ELEMENT ===');
      const children = Array.from(targetLi.children);
      console.log(`Children in this <li>: ${children.length}`);
      
      children.forEach((child, i) => {
        const tagName = child.tagName.toLowerCase();
        const text = child.textContent?.trim().substring(0, 100) || '';
        const hasBudgetImage = child.querySelector('img[src*="BudgetTabConnectedSpend"]') !== null;
        
        console.log(`  ${i + 1}. <${tagName}> ${hasBudgetImage ? '(contains BudgetTabConnectedSpend image)' : ''}`);
        console.log(`     Text: "${text}..."`);
        
        if (tagName === 'p' && child.children.length > 0) {
          console.log(`     Child elements: ${Array.from(child.children).map(c => c.tagName.toLowerCase()).join(', ')}`);
        }
      });
    }
    
    console.log('\n=== RAW HTML STRUCTURE ===');
    console.log(ol.outerHTML.substring(0, 2000) + '...\n');
  });
}

analyzeListStructure();