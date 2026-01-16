/**
 * SketchUndoManager - Undo/redo for sketch mode operations
 *
 * Manages undo/redo for ConstraintSolver state (points, geometries, constraints).
 * Uses lightweight snapshot pattern with JSON serialization.
 * Stack is cleared when sketch mode exits.
 */

export class SketchUndoManager {
  /**
   * @param {ConstraintSolver} solver - The constraint solver instance
   * @param {Object} options - Configuration options
   */
  constructor(solver, options = {}) {
    if (!solver) {
      throw new Error('SketchUndoManager requires a ConstraintSolver instance');
    }

    this.solver = solver;
    this.states = [];  // Array of serialized sketch states
    this.currentIndex = -1;  // Index of current state (-1 = no states)
    this.maxStackSize = options.maxStackSize || 50;
    this.enabled = options.enabled !== false;
    this.debug = options.debug || false;

    // State for debouncing (for operations like dragging points)
    this._pendingSnapshot = null;
    this._lastSnapshotTime = 0;
    this._minSnapshotInterval = options.minSnapshotInterval !== undefined ? options.minSnapshotInterval : 100; // ms

    // Statistics
    this.stats = {
      snapshotCount: 0,
      undoCount: 0,
      redoCount: 0,
      totalSnapshotSize: 0,
    };
  }

  /**
   * Serialize current solver state to JSON
   */
  _serializeState() {
    if (!this.solver || !this.solver.sketchObject) {
      throw new Error('Solver or sketchObject is not available');
    }

    // Deep clone to avoid mutations affecting saved state
    const state = JSON.stringify(this.solver.sketchObject);
    return state;
  }

  /**
   * Restore solver state from JSON
   */
  _restoreState(jsonString) {
    if (!this.solver) {
      throw new Error('Solver is not available');
    }

    const state = JSON.parse(jsonString);
    this.solver.sketchObject = state;

    // Trigger canvas update after restore
    if (typeof this.solver.hooks?.updateCanvas === 'function') {
      this.solver.hooks.updateCanvas(true); // force redraw
    }
  }

  /**
   * Take a snapshot of current sketch state
   * @param {Object} options - Snapshot options
   * @param {boolean} options.debounce - Whether to debounce this snapshot
   * @param {number} options.delay - Debounce delay in ms (default 500)
   */
  async snapshot(options = {}) {
    if (!this.enabled) return;

    const { debounce = false, delay = 500 } = options;

    if (debounce) {
      // Clear any pending snapshot
      if (this._pendingSnapshot) {
        clearTimeout(this._pendingSnapshot);
      }

      // Schedule new snapshot
      return new Promise((resolve) => {
        this._pendingSnapshot = setTimeout(async () => {
          this._pendingSnapshot = null;
          await this._takeSnapshot();
          resolve();
        }, delay);
      });
    }

    // Immediate snapshot
    return this._takeSnapshot();
  }

  async _takeSnapshot() {
    try {
      // Rate limiting to avoid excessive snapshots
      const now = Date.now();
      if (now - this._lastSnapshotTime < this._minSnapshotInterval) {
        if (this.debug) {
          console.log('[SketchUndoManager] Snapshot rate-limited');
        }
        return;
      }
      this._lastSnapshotTime = now;

      // Serialize current state
      const state = this._serializeState();
      const size = state.length;

      // Discard any states after current index (when taking a new snapshot after undo)
      if (this.currentIndex < this.states.length - 1) {
        this.states = this.states.slice(0, this.currentIndex + 1);
      }

      // Add new state
      this.states.push(state);
      this.currentIndex = this.states.length - 1;

      // Enforce stack size limit
      if (this.states.length > this.maxStackSize) {
        this.states.shift();
        this.currentIndex--;
      }

      // Update stats
      this.stats.snapshotCount++;
      this.stats.totalSnapshotSize += size;

      if (this.debug) {
        console.log(`[SketchUndoManager] Snapshot taken (${(size / 1024).toFixed(2)} KB)`, {
          statesCount: this.states.length,
          currentIndex: this.currentIndex,
          canUndo: this.canUndo(),
          canRedo: this.canRedo(),
        });
      }
    } catch (error) {
      console.error('[SketchUndoManager] Failed to take snapshot:', error);
      throw error;
    }
  }

  /**
   * Undo the last operation
   * @returns {boolean} True if undo was successful, false if nothing to undo
   */
  async undo() {
    if (!this.canUndo()) {
      if (this.debug) {
        console.log('[SketchUndoManager] Nothing to undo');
      }
      return false;
    }

    try {
      // Move to previous state
      this.currentIndex--;
      const previousState = this.states[this.currentIndex];

      this._restoreState(previousState);

      // Update stats
      this.stats.undoCount++;

      if (this.debug) {
        console.log('[SketchUndoManager] Undo successful', {
          currentIndex: this.currentIndex,
          canUndo: this.canUndo(),
          canRedo: this.canRedo(),
        });
      }

      return true;
    } catch (error) {
      console.error('[SketchUndoManager] Undo failed:', error);
      // Try to recover by moving index back
      this.currentIndex++;
      throw error;
    }
  }

  /**
   * Redo the last undone operation
   * @returns {boolean} True if redo was successful, false if nothing to redo
   */
  async redo() {
    if (!this.canRedo()) {
      if (this.debug) {
        console.log('[SketchUndoManager] Nothing to redo');
      }
      return false;
    }

    try {
      // Move to next state
      this.currentIndex++;
      const nextState = this.states[this.currentIndex];

      this._restoreState(nextState);

      // Update stats
      this.stats.redoCount++;

      if (this.debug) {
        console.log('[SketchUndoManager] Redo successful', {
          currentIndex: this.currentIndex,
          canUndo: this.canUndo(),
          canRedo: this.canRedo(),
        });
      }

      return true;
    } catch (error) {
      console.error('[SketchUndoManager] Redo failed:', error);
      // Try to recover by moving index back
      this.currentIndex--;
      throw error;
    }
  }

  /**
   * Check if undo is available
   * @returns {boolean}
   */
  canUndo() {
    return this.currentIndex > 0;
  }

  /**
   * Check if redo is available
   * @returns {boolean}
   */
  canRedo() {
    return this.currentIndex < this.states.length - 1;
  }

  /**
   * Clear all undo/redo history
   */
  clear() {
    this.states = [];
    this.currentIndex = -1;

    if (this.debug) {
      console.log('[SketchUndoManager] History cleared');
    }
  }

  /**
   * Get current stack sizes
   */
  getStackInfo() {
    return {
      statesCount: this.states.length,
      currentIndex: this.currentIndex,
      undoDepth: this.currentIndex,
      redoDepth: this.states.length - 1 - this.currentIndex,
      maxSize: this.maxStackSize,
      enabled: this.enabled,
    };
  }

  /**
   * Get statistics
   */
  getStats() {
    const avgSize = this.stats.snapshotCount > 0
      ? this.stats.totalSnapshotSize / this.stats.snapshotCount
      : 0;

    return {
      ...this.stats,
      averageSnapshotSize: avgSize,
      averageSnapshotSizeKB: (avgSize / 1024).toFixed(2),
    };
  }

  /**
   * Enable or disable undo/redo
   */
  setEnabled(enabled) {
    this.enabled = !!enabled;
    if (this.debug) {
      console.log(`[SketchUndoManager] ${enabled ? 'Enabled' : 'Disabled'}`);
    }
  }

  // Legacy properties for backwards compatibility
  get undoStack() {
    return this.states.slice(0, this.currentIndex + 1);
  }

  get redoStack() {
    return this.states.slice(this.currentIndex + 1);
  }
}
