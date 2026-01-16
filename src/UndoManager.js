/**
 * UndoManager - Lightweight snapshot-based undo/redo system
 *
 * Uses existing PartHistory serialization to store state snapshots.
 * Automatically regenerates scene via runHistory() on restore.
 *
 * Model: Maintains an array of state snapshots with a currentIndex pointer.
 * - states = [S0, S1, S2, S3]
 * - currentIndex = 3 (pointing to current state)
 * - undo(): Move to index 2, restore S2
 * - redo(): Move to index 3, restore S3
 */

export class UndoManager {
  constructor(partHistory, options = {}) {
    if (!partHistory) {
      throw new Error('UndoManager requires a PartHistory instance');
    }

    this.partHistory = partHistory;
    this.states = [];  // Array of state snapshots
    this.currentIndex = -1;  // Index of current state (-1 = no states)
    this.maxStackSize = options.maxStackSize || 50;
    this.enabled = options.enabled !== false;
    this.debug = options.debug || false;

    // State for debouncing
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
   * Take a snapshot of current state
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
          console.log('[UndoManager] Snapshot rate-limited');
        }
        return;
      }
      this._lastSnapshotTime = now;

      // Serialize current state
      const state = await this.partHistory.toJSON();
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
        console.log(`[UndoManager] Snapshot taken (${(size / 1024).toFixed(2)} KB)`, {
          statesCount: this.states.length,
          currentIndex: this.currentIndex,
          canUndo: this.canUndo(),
          canRedo: this.canRedo(),
        });
      }
    } catch (error) {
      console.error('[UndoManager] Failed to take snapshot:', error);
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
        console.log('[UndoManager] Nothing to undo');
      }
      return false;
    }

    try {
      // Move to previous state
      this.currentIndex--;
      const previousState = this.states[this.currentIndex];

      await this._restoreState(previousState);

      // Update stats
      this.stats.undoCount++;

      if (this.debug) {
        console.log('[UndoManager] Undo successful', {
          currentIndex: this.currentIndex,
          canUndo: this.canUndo(),
          canRedo: this.canRedo(),
        });
      }

      return true;
    } catch (error) {
      console.error('[UndoManager] Undo failed:', error);
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
        console.log('[UndoManager] Nothing to redo');
      }
      return false;
    }

    try {
      // Move to next state
      this.currentIndex++;
      const nextState = this.states[this.currentIndex];

      await this._restoreState(nextState);

      // Update stats
      this.stats.redoCount++;

      if (this.debug) {
        console.log('[UndoManager] Redo successful', {
          currentIndex: this.currentIndex,
          canUndo: this.canUndo(),
          canRedo: this.canRedo(),
        });
      }

      return true;
    } catch (error) {
      console.error('[UndoManager] Redo failed:', error);
      // Try to recover by moving index back
      this.currentIndex--;
      throw error;
    }
  }

  async _restoreState(jsonString) {
    // Temporarily disable to avoid creating snapshots during restore
    const wasEnabled = this.enabled;
    this.enabled = false;

    try {
      await this.partHistory.fromJSON(jsonString);
      await this.partHistory.runHistory();
    } finally {
      this.enabled = wasEnabled;
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
      console.log('[UndoManager] History cleared');
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
      console.log(`[UndoManager] ${enabled ? 'Enabled' : 'Disabled'}`);
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
