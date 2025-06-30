// Test the regex pattern
const content = '![External](https://example.com/image.png)';
console.log('Original:', content);

// Test the problematic regex
const pattern = /(?<![/:])(\w+)\.\s+(png|jpg|jpeg|gif|svg|webp|bmp|ico|md|html|htm)\b/gi;
const matches = content.match(pattern);
console.log('Matches:', matches);

// Apply the replacement
const result = content.replace(pattern, '$1.$2');
console.log('After replace:', result);

// Let's see if it's a different pattern
const pattern2 = /(\w+)\.\s+(com|org|net|io)/gi;
const result2 = content.replace(pattern2, '$1.$2');
console.log('After domain pattern:', result2);