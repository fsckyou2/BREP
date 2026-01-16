/**
 * SketchUndoManager Test Suite
 *
 * Tests for sketch mode undo/redo functionality using ConstraintSolver.
 */

import { ConstraintSolver } from '../src/features/sketch/sketchSolver2D/ConstraintEngine.js';
import { SketchUndoManager } from '../src/UI/sketcher/SketchUndoManager.js';

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
    console.log('🧪 SketchUndoManager Test Suite');
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

// Test suite
const runner = new TestRunner();

// Test 1: Basic snapshot and restore
runner.test('Basic snapshot and restore', async () => {
  const solver = new ConstraintSolver({
    sketch: {
      points: [{ id: 0, x: 0, y: 0, fixed: true }],
      geometries: [],
      constraints: [{ id: 0, type: "⏚", points: [0] }]
    }
  });
  const undoManager = new SketchUndoManager(solver, { debug: true, minSnapshotInterval: 0 });

  // Initial state
  const initialPointCount = solver.sketchObject.points.length;
  assertEqual(initialPointCount, 1, 'Should start with 1 point (origin)');

  // Take initial snapshot
  await undoManager.snapshot();
  assertEqual(undoManager.states.length, 1, 'Should have 1 snapshot');

  // Add a point
  solver.sketchObject.points.push({ id: 1, x: 10, y: 10, fixed: false });
  await undoManager.snapshot();

  assertEqual(solver.sketchObject.points.length, 2, 'Should have 2 points after adding');
  assertEqual(undoManager.states.length, 2, 'Should have 2 snapshots');

  // Undo - should restore original state
  const undoResult = await undoManager.undo();
  assert(undoResult, 'Undo should succeed');
  assertEqual(solver.sketchObject.points.length, 1, 'Should have 1 point after undo');

  // Redo - should restore added point
  const redoResult = await undoManager.redo();
  assert(redoResult, 'Redo should succeed');
  assertEqual(solver.sketchObject.points.length, 2, 'Should have 2 points after redo');
});

// Test 2: Add and remove geometry
runner.test('Add and remove geometry', async () => {
  const solver = new ConstraintSolver();
  const undoManager = new SketchUndoManager(solver, { minSnapshotInterval: 0 });

  await undoManager.snapshot();

  // Add points for a line
  solver.sketchObject.points.push({ id: 1, x: 0, y: 0, fixed: false });
  solver.sketchObject.points.push({ id: 2, x: 10, y: 10, fixed: false });
  await undoManager.snapshot();

  // Add a line
  solver.sketchObject.geometries.push({ id: 1, type: 'line', points: [1, 2] });
  await undoManager.snapshot();

  assertEqual(solver.sketchObject.geometries.length, 1, 'Should have 1 geometry');

  // Undo - remove line
  await undoManager.undo();
  assertEqual(solver.sketchObject.geometries.length, 0, 'Should have 0 geometries after undo');

  // Undo - remove points
  await undoManager.undo();
  assertEqual(solver.sketchObject.points.length, 1, 'Should have 1 point after second undo');

  // Redo - add points
  await undoManager.redo();
  assertEqual(solver.sketchObject.points.length, 3, 'Should have 3 points after redo');

  // Redo - add line
  await undoManager.redo();
  assertEqual(solver.sketchObject.geometries.length, 1, 'Should have 1 geometry after second redo');
});

// Test 3: Add and remove constraints
runner.test('Add and remove constraints', async () => {
  const solver = new ConstraintSolver();
  const undoManager = new SketchUndoManager(solver, { minSnapshotInterval: 0 });

  await undoManager.snapshot();

  // Add a constraint
  solver.sketchObject.constraints.push({ id: 1, type: '━', points: [0] }); // horizontal
  await undoManager.snapshot();

  assertEqual(solver.sketchObject.constraints.length, 2, 'Should have 2 constraints (including ground)');

  // Undo
  await undoManager.undo();
  assertEqual(solver.sketchObject.constraints.length, 1, 'Should have 1 constraint after undo');

  // Redo
  await undoManager.redo();
  assertEqual(solver.sketchObject.constraints.length, 2, 'Should have 2 constraints after redo');
});

// Test 4: Multiple operations
runner.test('Multiple operations sequence', async () => {
  const solver = new ConstraintSolver();
  const undoManager = new SketchUndoManager(solver, { minSnapshotInterval: 0 });

  await undoManager.snapshot();

  // Operation 1: Add point
  solver.sketchObject.points.push({ id: 1, x: 5, y: 5, fixed: false });
  await undoManager.snapshot();

  // Operation 2: Add another point
  solver.sketchObject.points.push({ id: 2, x: 10, y: 10, fixed: false });
  await undoManager.snapshot();

  // Operation 3: Add line
  solver.sketchObject.geometries.push({ id: 1, type: 'line', points: [1, 2] });
  await undoManager.snapshot();

  // Operation 4: Add constraint
  solver.sketchObject.constraints.push({ id: 1, type: '━', points: [1] });
  await undoManager.snapshot();

  assertEqual(undoManager.states.length, 5, 'Should have 5 snapshots');

  // Undo 4 times
  await undoManager.undo();
  assertEqual(solver.sketchObject.constraints.length, 1, 'Constraint removed');

  await undoManager.undo();
  assertEqual(solver.sketchObject.geometries.length, 0, 'Geometry removed');

  await undoManager.undo();
  assertEqual(solver.sketchObject.points.length, 2, 'Second point removed');

  await undoManager.undo();
  assertEqual(solver.sketchObject.points.length, 1, 'First point removed');

  // Redo all
  await undoManager.redo();
  await undoManager.redo();
  await undoManager.redo();
  await undoManager.redo();

  assertEqual(solver.sketchObject.points.length, 3, 'All points restored');
  assertEqual(solver.sketchObject.geometries.length, 1, 'Geometry restored');
  assertEqual(solver.sketchObject.constraints.length, 2, 'Constraint restored');
});

// Test 5: Stack clearing
runner.test('Stack clearing', async () => {
  const solver = new ConstraintSolver();
  const undoManager = new SketchUndoManager(solver, { minSnapshotInterval: 0 });

  await undoManager.snapshot();
  solver.sketchObject.points.push({ id: 1, x: 5, y: 5, fixed: false });
  await undoManager.snapshot();

  assert(undoManager.states.length > 0, 'Stack should have snapshots');

  undoManager.clear();
  assertEqual(undoManager.states.length, 0, 'Stack should be empty after clear');
  assertEqual(undoManager.currentIndex, -1, 'Current index should be -1');
  assert(!undoManager.canUndo(), 'Should not be able to undo after clear');
  assert(!undoManager.canRedo(), 'Should not be able to redo after clear');
});

// Test 6: Can undo/redo checks
runner.test('Can undo/redo checks', async () => {
  const solver = new ConstraintSolver();
  const undoManager = new SketchUndoManager(solver, { minSnapshotInterval: 0 });

  // Initially no undo/redo
  assert(!undoManager.canUndo(), 'Should not be able to undo initially');
  assert(!undoManager.canRedo(), 'Should not be able to redo initially');

  // After first snapshot
  await undoManager.snapshot();
  assert(!undoManager.canUndo(), 'Should not be able to undo with only 1 snapshot');

  // After second snapshot
  solver.sketchObject.points.push({ id: 1, x: 5, y: 5, fixed: false });
  await undoManager.snapshot();
  assert(undoManager.canUndo(), 'Should be able to undo with 2 snapshots');
  assert(!undoManager.canRedo(), 'Should not be able to redo before any undo');

  // After undo
  await undoManager.undo();
  assert(!undoManager.canUndo(), 'Should not be able to undo further at first snapshot');
  assert(undoManager.canRedo(), 'Should be able to redo after undo');

  // After redo
  await undoManager.redo();
  assert(undoManager.canUndo(), 'Should be able to undo after redo');
  assert(!undoManager.canRedo(), 'Should not be able to redo after redo to end');
});

// Test 7: New action clears redo stack
runner.test('New action clears redo stack', async () => {
  const solver = new ConstraintSolver();
  const undoManager = new SketchUndoManager(solver, { minSnapshotInterval: 0 });

  await undoManager.snapshot();
  solver.sketchObject.points.push({ id: 1, x: 5, y: 5, fixed: false });
  await undoManager.snapshot();
  solver.sketchObject.points.push({ id: 2, x: 10, y: 10, fixed: false });
  await undoManager.snapshot();

  // Undo once
  await undoManager.undo();
  assert(undoManager.canRedo(), 'Should be able to redo');

  // New action
  solver.sketchObject.geometries.push({ id: 1, type: 'line', points: [0, 1] });
  await undoManager.snapshot();

  assert(!undoManager.canRedo(), 'Redo stack should be cleared after new action');
});

// Test 8: Stack size limit
runner.test('Stack size limit', async () => {
  const solver = new ConstraintSolver();
  const undoManager = new SketchUndoManager(solver, { maxStackSize: 3, minSnapshotInterval: 0 });

  // Add 5 snapshots
  for (let i = 0; i < 5; i++) {
    solver.sketchObject.points.push({ id: i + 1, x: i * 5, y: i * 5, fixed: false });
    await undoManager.snapshot();
  }

  assert(undoManager.states.length <= 3, 'Stack should not exceed max size');
  assertEqual(undoManager.states.length, 3, 'Stack should have exactly 3 snapshots');
});

// Test 9: Statistics tracking
runner.test('Statistics tracking', async () => {
  const solver = new ConstraintSolver();
  const undoManager = new SketchUndoManager(solver, { minSnapshotInterval: 0 });

  await undoManager.snapshot();
  solver.sketchObject.points.push({ id: 1, x: 5, y: 5, fixed: false });
  await undoManager.snapshot();

  const stats = undoManager.getStats();
  assert(stats.snapshotCount >= 2, 'Should have at least 2 snapshots');
  assert(stats.totalSnapshotSize > 0, 'Total snapshot size should be positive');

  await undoManager.undo();
  const statsAfterUndo = undoManager.getStats();
  assertEqual(statsAfterUndo.undoCount, 1, 'Should have 1 undo');

  await undoManager.redo();
  const statsAfterRedo = undoManager.getStats();
  assertEqual(statsAfterRedo.redoCount, 1, 'Should have 1 redo');

  console.log(`   Stats: ${JSON.stringify(statsAfterRedo, null, 2)}`);
});

// Test 10: Complex sketch state
runner.test('Complex sketch state preservation', async () => {
  const solver = new ConstraintSolver({
    sketch: {
      points: [
        { id: 0, x: 0, y: 0, fixed: true },
        { id: 1, x: 10, y: 0, fixed: false },
        { id: 2, x: 10, y: 10, fixed: false },
        { id: 3, x: 0, y: 10, fixed: false }
      ],
      geometries: [
        { id: 1, type: 'line', points: [0, 1] },
        { id: 2, type: 'line', points: [1, 2] },
        { id: 3, type: 'line', points: [2, 3] },
        { id: 4, type: 'line', points: [3, 0] }
      ],
      constraints: [
        { id: 0, type: '⏚', points: [0] },
        { id: 1, type: '⟂', points: [0, 1, 1, 2] },
        { id: 2, type: '⟂', points: [1, 2, 2, 3] }
      ]
    }
  });
  const undoManager = new SketchUndoManager(solver, { minSnapshotInterval: 0 });

  const originalState = JSON.stringify(solver.sketchObject);
  await undoManager.snapshot();

  // Make changes
  solver.sketchObject.points.push({ id: 4, x: 5, y: 5, fixed: false });
  solver.sketchObject.geometries.push({ id: 5, type: 'line', points: [0, 4] });
  await undoManager.snapshot();

  // Undo to restore
  await undoManager.undo();

  const restoredState = JSON.stringify(solver.sketchObject);
  assertEqual(restoredState, originalState, 'Complex state should be perfectly restored');
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
