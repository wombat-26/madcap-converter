const fs = require('fs');

function analyzeAsciiDoc(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  
  const stats = {
    headings: (content.match(/^=+\s+/gm) || []).length,
    paragraphs: (content.match(/^[^=\s\*\.\[\|:][^\n]*$/gm) || []).length,
    lists: (content.match(/^[\*\-\+]\s+/gm) || []).length + (content.match(/^\d+\.\s+/gm) || []).length,
    images: (content.match(/image::/g) || []).length,
    links: (content.match(/link:/g) || []).length + (content.match(/https?:\/\/[^\s\]]+/g) || []).length,
    admonitions: (content.match(/^(NOTE|TIP|WARNING|CAUTION|IMPORTANT):/gm) || []).length,
    codeBlocks: (content.match(/```/g) || []).length / 2 + (content.match(/^\[source/gm) || []).length,
    lines: lines.length,
    chars: content.length
  };
  
  const issues = [];
  
  // Check for issues
  lines.forEach((line, index) => {
    if (line.includes('&amp;') || line.includes('&lt;') || line.includes('&gt;')) {
      issues.push(`Line ${index + 1}: HTML entity`);
    }
    if (line.length > 120) {
      issues.push(`Line ${index + 1}: Long line (${line.length} chars)`);
    }
  });
  
  // Calculate score
  let score = 100;
  score -= issues.length * 2; // 2 points per issue
  if (stats.headings > 0) score += 5;
  if (stats.admonitions > 0) score += 3;
  
  return { stats, issues, score: Math.max(0, Math.min(100, score)) };
}

const testFiles = [
  '/Volumes/Envoy Pro/target/test-final-fixed.adoc',
  '/Volumes/Envoy Pro/target/02 Planung/01-05 Synchronize Data.adoc',
  '/Volumes/Envoy Pro/target/04 Analyze/03 Analyze.adoc'
];

console.log('\n📊 AsciiDoc Conversion Quality Report');
console.log('='.repeat(50));

const results = testFiles.map(filePath => {
  const fileName = filePath.split('/').pop();
  const result = analyzeAsciiDoc(filePath);
  
  console.log(`\n📄 ${fileName}`);
  console.log(`   Score: ${result.score}/100 ${result.score >= 85 ? '🟢' : result.score >= 70 ? '🟡' : '🔴'}`);
  console.log(`   Issues: ${result.issues.length}`);
  console.log(`   Content Structure:`);
  console.log(`     • Headings: ${result.stats.headings}`);
  console.log(`     • Paragraphs: ${result.stats.paragraphs}`);
  console.log(`     • Lists: ${result.stats.lists}`);
  console.log(`     • Images: ${result.stats.images}`);
  console.log(`     • Admonitions: ${result.stats.admonitions}`);
  console.log(`     • Lines: ${result.stats.lines}`);
  
  if (result.issues.length > 0 && result.issues.length <= 5) {
    console.log(`   Issues:`);
    result.issues.forEach(issue => console.log(`     ⚠️  ${issue}`));
  }
  
  return { fileName, ...result };
});

// Summary
const avgScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;
const totalIssues = results.reduce((sum, r) => sum + r.issues.length, 0);

console.log('\n📈 Summary');
console.log('─'.repeat(30));
console.log(`Average Score: ${avgScore.toFixed(1)}/100 ${avgScore >= 85 ? '🟢' : avgScore >= 70 ? '🟡' : '🔴'}`);
console.log(`Total Issues: ${totalIssues}`);
console.log(`Files Tested: ${results.length}`);

if (avgScore >= 85) {
  console.log('\n🎉 EXCELLENT: High-quality AsciiDoc conversion!');
} else if (avgScore >= 70) {
  console.log('\n👍 GOOD: Solid AsciiDoc conversion with minor issues.');
} else {
  console.log('\n⚠️ NEEDS IMPROVEMENT: Conversion has quality issues.');
}

console.log('\n');