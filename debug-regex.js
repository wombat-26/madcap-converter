// Test which regex is removing the period
const input = "The *panel* is not showing.\n\n";

console.log(`Input: "${input}"`);

// Test each regex individually
let step1 = input.replace(/\n{4,}/g, '\n\n\n');
console.log(`After step1 (fix excessive blank lines): "${step1}"`);

let step2 = step1.replace(/\n{3}/g, '\n\n');
console.log(`After step2 (fix triple newlines): "${step2}"`);

// Test heading spacing regexes
let step3 = step2.replace(/([^\n])\n(#{1,6}\s)/g, '$1\n\n$2');
console.log(`After step3 (heading spacing 1): "${step3}"`);

let step4 = step3.replace(/(#{1,6}[^\n]*)\n([^\n#])/g, '$1\n\n$2');
console.log(`After step4 (heading spacing 2): "${step4}"`);

let step5 = step4.replace(/(#{1,6}[^\n]*)\n(#{1,6}\s)/g, '$1\n\n$2');
console.log(`After step5 (consecutive headings): "${step5}"`);

let step6 = step5.replace(/\n{3,}/g, '\n\n');
console.log(`After step6 (fix triple newlines again): "${step6}"`);

// Test emphasis cleaning
let step7 = step6.replace(/\*([^*]*?)\s{2,}([^*]*?)\*/g, '*$1 $2*');
console.log(`After step7 (emphasis multiple spaces): "${step7}"`);

let step8 = step7.replace(/\*\*([^*]*?)\s{2,}([^*]*?)\*\*/g, '**$1 $2**');
console.log(`After step8 (strong multiple spaces): "${step8}"`);

let step9 = step8.replace(/\*\s+([^*]+?)\s+\*/g, '*$1*');
console.log(`After step9 (emphasis leading/trailing spaces): "${step9}"`);

let step10 = step9.replace(/\*\*\s+([^*]+?)\s+\*\*/g, '**$1**');
console.log(`After step10 (strong leading/trailing spaces): "${step10}"`);

// Test file artifact removal
let step11 = step10.replace(/\.(htm|html|aspx|php|jsp)$/gm, '');
console.log(`After step11 (remove file extensions): "${step11}"`);

let step12 = step11.replace(/\.(htm|html|aspx|php|jsp)\s*$/gm, '');
console.log(`After step12 (remove file extensions with spaces): "${step12}"`);

let step13 = step12.replace(/[\\\/]+$/gm, '');
console.log(`After step13 (remove trailing path separators): "${step13}"`);

let step14 = step13.replace(/[\\\/]+\s*$/gm, '');
console.log(`After step14 (remove trailing path separators with spaces): "${step14}"`);

let step15 = step14.replace(/\.flsnp$/gm, '');
console.log(`After step15 (remove .flsnp): "${step15}"`);

let step16 = step15.replace(/\.flvar$/gm, '');
console.log(`After step16 (remove .flvar): "${step16}"`);

let step17 = step16.replace(/\.fltoc$/gm, '');
console.log(`After step17 (remove .fltoc): "${step17}"`);

let step18 = step17.replace(/\.fltar$/gm, '');
console.log(`After step18 (remove .fltar): "${step18}"`);

// Test trailing whitespace removal
let step19 = step18.replace(/[ \t]+$/gm, '');
console.log(`After step19 (remove trailing whitespace): "${step19}"`);

// Test final newline fix
let step20 = step19.replace(/\n*$/, '\n');
console.log(`After step20 (ensure single newline at end): "${step20}"`);