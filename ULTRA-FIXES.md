# ULTRA FIXES - Critical Converter Issues

## Issues Identified

### 1. **Dropdown Conversion Failure** 
- **Problem**: Only 3/24 dropdowns (13%) are being converted to collapsible blocks
- **Root Cause**: AsciiDoc converter has collapsible block code but it's not being triggered
- **Evidence**: Preprocessed HTML shows `<div class="madcap-dropdown collapsible-block" data-title="...">` but converter isn't processing them

### 2. **Missing Paragraph Content**
- **Problem**: "The Select Investment Item dialog closes" paragraph is lost during conversion
- **Root Cause**: Paragraph processing within complex list structures
- **Evidence**: Content survives preprocessing but disappears during AsciiDoc conversion

## Targeted Fixes Needed

### Fix 1: Collapsible Block Processing
**File**: `src/converters/asciidoc-converter.ts`
**Lines**: 726-737 (collapsible block detection)

**Current Issue**: The condition `className.includes('collapsible-block')` exists but isn't being reached or triggered properly.

**Required Fix**: 
1. Move collapsible block detection HIGHER in the div processing logic
2. Ensure it's checked BEFORE other div processing
3. Debug why existing code isn't triggering

### Fix 2: Paragraph Processing in Lists
**File**: `src/converters/asciidoc-converter.ts` 
**Lines**: Around paragraph processing in div context

**Current Issue**: Paragraphs within complex list structures are being lost.

**Required Fix**:
1. Improve paragraph preservation within list items
2. Ensure all `<p>` elements are converted, even in complex nesting
3. Debug why specific paragraphs are being dropped

## Implementation Strategy

1. **Debug Current Code Path**: Trace why collapsible block detection isn't working
2. **Fix Priority Order**: Ensure collapsible block detection happens first
3. **Test Specific Cases**: Focus on the exact problematic content
4. **Validate Results**: Ensure 24/24 dropdowns convert and all paragraphs preserved

## Expected Results After Fixes

- **Dropdown Conversion**: 24/24 dropdowns → 24 collapsible blocks (100%)
- **Content Preservation**: All paragraphs including "Select Investment Item dialog closes" preserved
- **Structure Integrity**: Proper numbering and nesting maintained
- **User Satisfaction**: Output matches MadCap HTML5 quality exactly