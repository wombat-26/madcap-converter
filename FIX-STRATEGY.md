# Fix Strategy for Remaining Writerside Conversion Issues

## Overview
This document outlines a systematic approach to fix the remaining 10 failing tests without breaking the 24 passing tests.

## Issue Categories & Fix Locations

### 📁 File Path/Extension Issues (3 tests)
**Issues:**
1. Image paths have extra spaces: `button. png` instead of `button.png`
2. Screenshot paths have extra spaces: `screenshot. png` instead of `screenshot.png`
3. Snippet paths include relative structure: `./Resources/Snippets/Activities. md` instead of `Activities.md`

**Root Cause Analysis:**
- Spaces are being added during text processing/escaping
- Relative paths not being simplified for snippet includes

**Fix Strategy:**
- **Location**: HTML Preprocessing or Post-processing
- **Approach**: Clean file paths in attributes before conversion or after markdown generation
- **Risk**: Low - isolated to file path handling

### 🔢 List Processing Issues (1 test)
**Issue:**
4. Orphaned paragraphs merge incorrectly: `"1. Step oneAdditional information."` - missing space/separator

**Root Cause Analysis:**
- DOM processing not handling orphaned paragraphs between list items correctly
- Missing punctuation detection for list items

**Fix Strategy:**
- **Location**: During DOM conversion in `handleMixedOrderedList`
- **Approach**: Add proper separation when processing orphaned content
- **Risk**: Medium - need careful testing of list processing

### 🔧 Variable Processing Issues (2 tests)
**Issues:**
5. Variable names not simplified: `<var name="General. CompanyName"/>` instead of `<var name="CompanyName"/>`
6. Batch processing property missing: `result.processedFiles` is undefined

**Root Cause Analysis:**
- Variable namespace not being stripped
- Test using wrong property name

**Fix Strategy:**
- **Location**: Variable processing during conversion
- **Approach**: Strip namespace prefix when in reference mode
- **Risk**: Low for #6 (test fix), Medium for #5 (needs careful namespace handling)

### 📂 Batch Processing Issues (2 tests)
**Issues:**
7. Batch folder processing: `totalFiles: 0` - not finding files
8. Folder structure preservation: Same issue

**Root Cause Analysis:**
- Test directories might not exist or have wrong paths
- File pattern matching might be too restrictive

**Fix Strategy:**
- **Location**: Test setup or batch service file discovery
- **Approach**: Ensure test directories exist and contain test files
- **Risk**: Low - test infrastructure issue

### 📏 Formatting Issues (2 tests)
**Issues:**
9. Heading whitespace: `" # Getting Started"` instead of `"# Getting Started"`
10. Word count edge case: Empty content returns `wordCount: 1` instead of `0`

**Root Cause Analysis:**
- Leading spaces not being trimmed from headings
- Word count splitting on empty string

**Fix Strategy:**
- **Location**: Post-processing for headings, word count calculation
- **Approach**: Trim leading spaces from heading lines, fix word count logic
- **Risk**: Low - isolated fixes

## Implementation Order (Prioritized by Risk & Impact)

### Phase 1: Low Risk / High Impact
1. ✅ Fix test property name (Issue #6)
2. ✅ Fix word count calculation (Issue #10)
3. ✅ Fix heading whitespace in post-processing (Issue #9)

### Phase 2: Medium Risk / High Impact
4. ✅ Fix file path spaces in post-processing (Issues #1, #2)
5. ✅ Fix snippet path simplification (Issue #3)
6. ✅ Fix variable name simplification (Issue #5)

### Phase 3: Test Infrastructure
7. ✅ Fix batch processing test setup (Issues #7, #8)

### Phase 4: Complex DOM Processing
8. ✅ Fix orphaned paragraph handling (Issue #4)

## Testing Strategy

### After Each Fix:
1. Run specific failing test to verify fix
2. Run all Writerside tests to check for regressions
3. Run critical-fixes tests to ensure core functionality intact
4. Test with real MadCap Flare content samples

### Regression Prevention:
- Add unit tests for each fix
- Document the fix location and rationale
- Consider edge cases for each fix

## Fix Implementation Guidelines

### Preprocessing Fixes:
- Use HTMLPreprocessor or MadCapPreprocessor for attribute cleaning
- Maintain original content structure

### Conversion Fixes:
- Modify specific handler methods (handleImage, handleMixedOrderedList, etc.)
- Preserve existing functionality

### Post-processing Fixes:
- Add targeted patterns in postProcessMarkdown
- Order matters - apply fixes in correct sequence
- Test pattern specificity to avoid over-matching

## Success Criteria
- All 34 Writerside conversion tests pass
- No regression in critical-fixes tests
- Real MadCap Flare content converts correctly
- Performance remains acceptable