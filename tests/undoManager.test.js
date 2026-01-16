/**
 * UndoManager Test Stand
 *
 * Comprehensive tests for undo/redo functionality using lightweight snapshot pattern.
 * Tests feature creation, deletion, parameter changes, and state consistency.
 */

import { PartHistory } from '../src/PartHistory.js';
import { UndoManager } from '../src/UndoManager.js';

// Small delay utility to avoid rate limiting in tests
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Test utilities
class TestRunner {
  constructor() {
    this.tests = [];
    this.passed = 0;
    this.failed = 0;
  }

  test(name, fn) {
    this.tests.push({ name, fn });
  }

  async run() {
    console.log('='.repeat(80));
    console.log('🧪 UndoManager Test Suite');
    console.log('='.repeat(80));
    console.log();

    for (const { name, fn } of this.tests) {
      try {
        process.stdout.write(`📝 ${name}... `);
        await fn();
        console.log('✅ PASS');
        this.passed++;
      } catch (error) {
        console.log('❌ FAIL');
        console.error(`   Error: ${error.message}`);
        if (error.stack) {
          console.error(`   ${error.stack.split('\n').slice(1, 3).join('\n   ')}`);
        }
        this.failed++;
      }
      console.log();
    }

    console.log('='.repeat(80));
    console.log(`✅ Passed: ${this.passed}`);
    console.log(`❌ Failed: ${this.failed}`);
    console.log(`📊 Total: ${this.tests.length}`);
    console.log('='.repeat(80));

    return this.failed === 0;
  }
}

// Assertion helpers
function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`);
  }
}

function assertDeepEqual(actual, expected, message) {
  const actualStr = JSON.stringify(actual, null, 2);
  const expectedStr = JSON.stringify(expected, null, 2);
  if (actualStr !== expectedStr) {
    throw new Error(message || `Objects not equal:\nActual: ${actualStr}\nExpected: ${expectedStr}`);
  }
}

// Test suite
const runner = new TestRunner();

// Test 1: Basic snapshot and restore
runner.test('Basic snapshot and restore', async () => {
  const partHistory = new PartHistory();
  const undoManager = new UndoManager(partHistory, { debug: true, minSnapshotInterval: 0 });

  // Initial state
  const initialFeatureCount = partHistory.features.length;
  assertEqual(initialFeatureCount, 0, 'Should start with no features');

  // Take initial snapshot
  await undoManager.snapshot();
  assertEqual(undoManager.undoStack.length, 1, 'Should have 1 snapshot');

  // Add a feature
  const feature = await partHistory.newFeature('P.CU');
  await partHistory.runHistory();
  assertEqual(partHistory.features.length, 1, 'Should have 1 feature after adding');

  // Take snapshot after adding
  await undoManager.snapshot();
  assertEqual(undoManager.undoStack.length, 2, 'Should have 2 snapshots');

  // Undo - should restore empty state
  const undoResult = await undoManager.undo();
  assert(undoResult, 'Undo should succeed');
  assertEqual(partHistory.features.length, 0, 'Should have 0 features after undo');
  assertEqual(undoManager.redoStack.length, 1, 'Should have 1 redo available');

  // Redo - should restore feature
  const redoResult = await undoManager.redo();
  assert(redoResult, 'Redo should succeed');
  assertEqual(partHistory.features.length, 1, 'Should have 1 feature after redo');
});

// Test 2: Multiple feature operations
runner.test('Multiple feature creation and undo/redo', async () => {
  const partHistory = new PartHistory();
  const undoManager = new UndoManager(partHistory, { minSnapshotInterval: 0 });

  // Take initial snapshot
  await undoManager.snapshot();

  // Add multiple features
  const cube = await partHistory.newFeature('P.CU');
  await partHistory.runHistory();
  await undoManager.snapshot();

  const sphere = await partHistory.newFeature('P.S');
  await partHistory.runHistory();
  await undoManager.snapshot();

  const cylinder = await partHistory.newFeature('P.CY');
  await partHistory.runHistory();
  await undoManager.snapshot();

  assertEqual(partHistory.features.length, 3, 'Should have 3 features');

  // Undo once - remove cylinder
  await undoManager.undo();
  assertEqual(partHistory.features.length, 2, 'Should have 2 features after 1 undo');

  // Undo twice - remove sphere
  await undoManager.undo();
  assertEqual(partHistory.features.length, 1, 'Should have 1 feature after 2 undos');

  // Undo thrice - remove cube
  await undoManager.undo();
  assertEqual(partHistory.features.length, 0, 'Should have 0 features after 3 undos');

  // Redo all
  await undoManager.redo();
  assertEqual(partHistory.features.length, 1, 'Should have 1 feature after 1 redo');

  await undoManager.redo();
  assertEqual(partHistory.features.length, 2, 'Should have 2 features after 2 redos');

  await undoManager.redo();
  assertEqual(partHistory.features.length, 3, 'Should have 3 features after 3 redos');

  // Verify feature types
  assertEqual(partHistory.features[0].type, 'P.CU', 'First feature should be Cube');
  assertEqual(partHistory.features[1].type, 'P.S', 'Second feature should be Sphere');
  assertEqual(partHistory.features[2].type, 'P.CY', 'Third feature should be Cylinder');
});

// Test 3: Feature deletion
runner.test('Feature deletion and undo', async () => {
  const partHistory = new PartHistory();
  const undoManager = new UndoManager(partHistory, { minSnapshotInterval: 0 });

  await undoManager.snapshot();

  // Add features
  const cube = await partHistory.newFeature('P.CU');
  await partHistory.runHistory();
  await undoManager.snapshot();

  const sphere = await partHistory.newFeature('P.S');
  await partHistory.runHistory();
  await undoManager.snapshot();

  const cubeId = cube.inputParams.id;

  // Delete cube
  await partHistory.removeFeature(cubeId);
  await partHistory.runHistory();
  await undoManager.snapshot();

  assertEqual(partHistory.features.length, 1, 'Should have 1 feature after deletion');
  assertEqual(partHistory.features[0].type, 'P.S', 'Remaining feature should be Sphere');

  // Undo deletion
  await undoManager.undo();
  assertEqual(partHistory.features.length, 2, 'Should have 2 features after undo');
  assertEqual(partHistory.features[0].type, 'P.CU', 'First feature should be Cube');
  assertEqual(partHistory.features[1].type, 'P.S', 'Second feature should be Sphere');
});

// Test 4: Parameter changes
runner.test('Parameter changes and undo', async () => {
  const partHistory = new PartHistory();
  const undoManager = new UndoManager(partHistory, { minSnapshotInterval: 0 });

  await undoManager.snapshot();

  // Add a cube
  const cube = await partHistory.newFeature('P.CU');
  const cubeId = cube.inputParams.id;
  await partHistory.runHistory();
  await undoManager.snapshot();

  // Check initial size
  const initialSize = cube.inputParams.sizeX;
  console.log(`   Initial cube sizeX: ${initialSize}`);

  // Change size
  cube.inputParams.sizeX = 20;
  await partHistory.runHistory();
  await undoManager.snapshot();

  assertEqual(cube.inputParams.sizeX, 20, 'SizeX should be 20 after change');

  // Undo parameter change
  await undoManager.undo();
  const restoredFeature = partHistory.features.find(f => f.inputParams.id === cubeId);
  console.log(`   After undo, cube sizeX: ${restoredFeature.inputParams.sizeX}`);
  assertEqual(restoredFeature.inputParams.sizeX, initialSize, `SizeX should be ${initialSize} after undo`);

  // Redo parameter change
  await undoManager.redo();
  const redoneFeature = partHistory.features.find(f => f.inputParams.id === cubeId);
  assertEqual(redoneFeature.inputParams.sizeX, 20, 'SizeX should be 20 after redo');
});

// Test 5: Expression changes
runner.test('Expression changes and undo', async () => {
  const partHistory = new PartHistory();
  const undoManager = new UndoManager(partHistory, { minSnapshotInterval: 0 });

  const initialExpressions = partHistory.expressions;
  await undoManager.snapshot();

  // Change expressions
  partHistory.expressions = "x = 100; y = 200;";
  await undoManager.snapshot();

  assertEqual(partHistory.expressions, "x = 100; y = 200;", 'Expressions should be updated');

  // Undo
  await undoManager.undo();
  assertEqual(partHistory.expressions, initialExpressions, 'Expressions should be restored');

  // Redo
  await undoManager.redo();
  assertEqual(partHistory.expressions, "x = 100; y = 200;", 'Expressions should be updated again');
});

// Test 6: Stack limits
runner.test('Stack size limits', async () => {
  const partHistory = new PartHistory();
  const undoManager = new UndoManager(partHistory, { maxStackSize: 3, minSnapshotInterval: 0 });

  // Take 5 snapshots (exceeds limit of 3)
  for (let i = 0; i < 5; i++) {
    await partHistory.newFeature('P.CU');
    await partHistory.runHistory();
    await undoManager.snapshot();
  }

  // Should only keep last 3 snapshots
  assert(undoManager.undoStack.length <= 3, 'Stack should not exceed max size');
  assertEqual(undoManager.undoStack.length, 3, 'Stack should have exactly 3 snapshots');
});

// Test 7: Redo invalidation
runner.test('Redo stack cleared on new action', async () => {
  const partHistory = new PartHistory();
  const undoManager = new UndoManager(partHistory, { minSnapshotInterval: 0 });

  await undoManager.snapshot();

  // Add features
  await partHistory.newFeature('P.CU');
  await partHistory.runHistory();
  await undoManager.snapshot();

  await partHistory.newFeature('P.S');
  await partHistory.runHistory();
  await undoManager.snapshot();

  // Undo
  await undoManager.undo();
  assert(undoManager.canRedo(), 'Should have redo available');

  // Add new feature (should clear redo stack)
  await partHistory.newFeature('P.CY');
  await partHistory.runHistory();
  await undoManager.snapshot();

  assert(!undoManager.canRedo(), 'Redo stack should be cleared after new action');
});

// Test 8: State consistency verification
runner.test('State consistency after complex operations', async () => {
  const partHistory = new PartHistory();
  const undoManager = new UndoManager(partHistory, { minSnapshotInterval: 0 });

  await undoManager.snapshot();

  // Build a complex state
  const cube = await partHistory.newFeature('P.CU');
  cube.inputParams.sizeX = 15;
  await partHistory.runHistory();
  await undoManager.snapshot();

  const sphere = await partHistory.newFeature('P.S');
  sphere.inputParams.radius = 5;
  await partHistory.runHistory();
  await undoManager.snapshot();

  partHistory.expressions = "x = 50;";
  await undoManager.snapshot();

  // Capture state before undos
  const expectedState = await partHistory.toJSON();

  // Do multiple undos and redos
  await undoManager.undo(); // Undo expression change
  await undoManager.undo(); // Undo sphere
  await undoManager.redo(); // Redo sphere
  await undoManager.redo(); // Redo expression change

  // State should match (excluding timestamps which change during execution)
  const actualState = await partHistory.toJSON();
  const expected = JSON.parse(expectedState);
  const actual = JSON.parse(actualState);

  // Remove timestamps before comparison (they change during runHistory)
  const normalizeState = (state) => {
    const normalized = { ...state };
    if (normalized.features) {
      normalized.features = normalized.features.map(f => {
        const { timestamp, ...rest } = f;
        return rest;
      });
    }
    return normalized;
  };

  const normalizedExpected = normalizeState(expected);
  const normalizedActual = normalizeState(actual);

  assertDeepEqual(normalizedActual, normalizedExpected, 'State should be consistent (ignoring timestamps)');
});

// Test 9: Empty undo/redo
runner.test('Cannot undo/redo when stacks are empty', async () => {
  const partHistory = new PartHistory();
  const undoManager = new UndoManager(partHistory, { minSnapshotInterval: 0 });

  // Try undo with empty stack
  const undoResult = await undoManager.undo();
  assertEqual(undoResult, false, 'Undo should return false when stack is empty');

  // Try redo with empty stack
  const redoResult = await undoManager.redo();
  assertEqual(redoResult, false, 'Redo should return false when stack is empty');
});

// Test 10: Statistics tracking
runner.test('Statistics tracking', async () => {
  const partHistory = new PartHistory();
  const undoManager = new UndoManager(partHistory, { minSnapshotInterval: 0 });

  // Take snapshots
  await undoManager.snapshot();
  await partHistory.newFeature('P.CU');
  await partHistory.runHistory();
  await undoManager.snapshot();

  const stats = undoManager.getStats();
  assert(stats.snapshotCount >= 2, 'Should have at least 2 snapshots');
  assert(stats.totalSnapshotSize > 0, 'Total snapshot size should be positive');
  assert(stats.averageSnapshotSize > 0, 'Average snapshot size should be positive');

  console.log(`   Stats: ${JSON.stringify(stats, null, 2)}`);
});

// Test 11: Feature ID preservation
runner.test('Feature IDs preserved after undo/redo', async () => {
  const partHistory = new PartHistory();
  const undoManager = new UndoManager(partHistory, { minSnapshotInterval: 0 });

  await undoManager.snapshot();

  const cube = await partHistory.newFeature('P.CU');
  const cubeId = cube.inputParams.id;
  await partHistory.runHistory();
  await undoManager.snapshot();

  // Undo and redo
  await undoManager.undo();
  await undoManager.redo();

  // ID should be preserved
  const restoredFeature = partHistory.features[0];
  assertEqual(restoredFeature.inputParams.id, cubeId, 'Feature ID should be preserved');
});

// Test 12: idCounter preservation
runner.test('idCounter preserved after undo/redo', async () => {
  const partHistory = new PartHistory();
  const undoManager = new UndoManager(partHistory, { minSnapshotInterval: 0 });

  const initialCounter = partHistory.idCounter;
  await undoManager.snapshot();

  // Create features to increment counter
  await partHistory.newFeature('P.CU');
  await partHistory.runHistory();
  await undoManager.snapshot();

  await partHistory.newFeature('P.S');
  await partHistory.runHistory();
  await undoManager.snapshot();

  const counterAfterAdding = partHistory.idCounter;
  assert(counterAfterAdding > initialCounter, 'Counter should have incremented');

  // Undo both features
  await undoManager.undo();
  await undoManager.undo();

  // Counter should be restored
  assertEqual(partHistory.idCounter, initialCounter, 'Counter should be restored after undo');

  // Redo
  await undoManager.redo();
  await undoManager.redo();

  // Counter should match
  assertEqual(partHistory.idCounter, counterAfterAdding, 'Counter should match after redo');
});

// Run all tests
(async () => {
  try {
    const success = await runner.run();
    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error('Fatal error running tests:', error);
    process.exit(1);
  }
})();
