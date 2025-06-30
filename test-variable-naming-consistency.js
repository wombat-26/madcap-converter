#!/usr/bin/env node

import { WritersideVariableConverter } from './build/services/writerside-variable-converter.js';

// Test variable name conversion to ensure consistency
function testVariableNaming() {
    console.log('Testing Variable Naming Consistency...\n');
    
    const converter = new WritersideVariableConverter();
    
    // Test the toAsciiDocAttributeName method via the convertVariable method
    const testVariables = [
        { name: 'CompanyName', value: 'Uptempo GmbH' },
        { name: 'PhoneNumber', value: '+49 721 97791-000' },
        { name: 'StreetAddress', value: 'An der Raumfabrik, Amalienbadstraße 41a' },
        { name: 'GeneralEmail', value: 'info@uptempo.io' },
        { name: 'CityStateZip', value: '76227 Karlsruhe, Germany' }
    ];
    
    const options = {
        mode: 'reference',
        format: 'asciidoc',
        nameConvention: 'original'
    };
    
    console.log('Variable name conversions:');
    testVariables.forEach(variable => {
        const converted = converter.convertVariables([variable], options)[0];
        console.log(`${variable.name} → ${converted.name}`);
    });
    
    console.log('\nExpected AsciiDoc variable file format:');
    testVariables.forEach(variable => {
        const converted = converter.convertVariables([variable], options)[0];
        console.log(`:${converted.name}: ${converted.value}`);
    });
    
    console.log('\nExpected variable references in content:');
    testVariables.forEach(variable => {
        const converted = converter.convertVariables([variable], options)[0];
        console.log(`{${converted.name}}`);
    });
}

testVariableNaming();