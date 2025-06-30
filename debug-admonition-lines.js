#!/usr/bin/env node

console.log('=== TESTING ADMONITION LINE SPLITTING ===\n');

// Simulate what should happen
const title = "Attention! Data loss!";
const content = "Deleting an activity cannot be reverted. In addition, there may be changes to budgets, groupings and other associated items.";

console.log('Title:', JSON.stringify(title));
console.log('Content:', JSON.stringify(content));

const admonitionContent = `**${title}**\n\n${content}`;
console.log('\nAdmonition content:', JSON.stringify(admonitionContent));

const lines = admonitionContent.split('\n');
console.log(`\nSplit into ${lines.length} lines:`);
lines.forEach((line, i) => console.log(`${i + 1}: ${JSON.stringify(line)}`));

const quotedLines = lines.map(line => {
  const trimmed = line.trim();
  return trimmed ? `> ${trimmed}` : '>';
}).join('\n');

console.log('\nQuoted lines:', JSON.stringify(quotedLines));

console.log('\nExpected output:');
console.log('> **Attention! Data loss!**');
console.log('>');
console.log('> Deleting an activity cannot be reverted. In addition, there may be changes to budgets, groupings and other associated items.');
console.log('{style="warning"}');

console.log('\nActual output:');
console.log(quotedLines);
console.log('{style="warning"}');