#!/usr/bin/env node

/**
 * Test Script for Navigator
 *
 * Tests the IVR navigator without needing LLM API.
 * Useful for verifying the tree structure and navigation logic.
 */

import { IVRNavigator } from './navigator.js';

console.log('🧪 Testing IVR Navigator\n');

const navigator = new IVRNavigator();

console.log('1️⃣  Starting at:', navigator.getCurrentMenu().id);
console.log('   Prompt:', navigator.getCurrentMenu().prompt);
console.log('   Options:', Object.keys(navigator.getCurrentMenu().options));

console.log('\n2️⃣  Selecting option 1...');
let result = navigator.selectOption('1');
console.log('   Result:', result.message);

console.log('\n3️⃣  Now at:', navigator.getCurrentMenu().id);
console.log('   Prompt:', navigator.getCurrentMenu().prompt);

console.log('\n4️⃣  Selecting option 1...');
result = navigator.selectOption('1');
console.log('   Result:', result.message);

console.log('\n5️⃣  Now at:', navigator.getCurrentMenu().id);

console.log('\n6️⃣  Selecting option 1...');
result = navigator.selectOption('1');
console.log('   Result:', result.message);

console.log('\n7️⃣  Now at:', navigator.getCurrentMenu().id);

console.log('\n8️⃣  Selecting option 1...');
result = navigator.selectOption('1');
console.log('   Result:', result.message);

console.log('\n9️⃣  Now at:', navigator.getCurrentMenu().id);

console.log('\n🔟 Selecting option 1 (should connect to human)...');
result = navigator.selectOption('1');
console.log('   Result:', result.message);

if (navigator.isConnected()) {
  console.log('\n✅ SUCCESS! Connected to human in', result.totalSteps, 'steps');
} else {
  console.log('\n❌ Failed to connect');
}

console.log('\n📊 Navigation Stats:');
console.log('   Total selections:', navigator.getStats().totalSelections);
console.log('   Connected:', navigator.isConnected());

console.log('\n🗺️  Full Navigation Path:');
navigator.getHistory().forEach((step, i) => {
  console.log(`   ${i + 1}. ${step.menuId} → Option ${step.selectedOption}`);
});

console.log('\n✅ Navigator test complete!\n');

