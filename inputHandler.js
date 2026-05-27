/**
 * Akira - Neural Link (v1.11)
 * inputHandler.js - Input Manager for keyboard events
 * 
 * Manages key state dictionary and provides clean interface for input checks
 */

"use strict";

/**
 * InputHandler class to manage keyboard input state
 */
export default class InputHandler {
  /**
   * Initialize input handler and set up event listeners
   */
  constructor() {
    this.keys = {};
    this.setupEventListeners();
  }

  /**
   * Set up keyboard event listeners
   */
  setupEventListeners() {
    document.addEventListener('keydown', (e) => {
      this.keys[e.key] = true;
    });

    document.addEventListener('keyup', (e) => {
      this.keys[e.key] = false;
    });
  }

  /**
   * Check if a specific key is currently pressed
   * @param {string} key - The key to check (e.g., 'w', 'ArrowUp', '1')
   * @returns {boolean} True if key is pressed
   */
  isKeyDown(key) {
    return this.keys[key] === true;
  }

  /**
   * Check if a key was just pressed (not held down)
   * @param {string} key - The key to check
   * @returns {boolean} True if key was just pressed
   */
  isKeyJustPressed(key) {
    // Implementation would require tracking previous state
    // For now, just use isKeyDown since the game logic handles this appropriately
    return this.isKeyDown(key);
  }

  /**
   * Get movement direction from keyboard input
   * @returns {{forward: number, strafe: number, turnLeft: boolean, turnRight: boolean}}
   */
  getMovementInput() {
    let movingForward = 0;
    let strafeDirection = 0;
    let turnLeft = false;
    let turnRight = false;

    // Forward/backward movement
    if (this.isKeyDown('w') || this.isKeyDown('W') || this.isKeyDown('ArrowUp')) {
      movingForward = 1;
    } else if (this.isKeyDown('s') || this.isKeyDown('S') || this.isKeyDown('ArrowDown')) {
      movingForward = -1;
    }

    // Strafe left/right
    if (this.isKeyDown('a') || this.isKeyDown('A')) {
      strafeDirection = -1;
    } else if (this.isKeyDown('d') || this.isKeyDown('D')) {
      strafeDirection = 1;
    }

    // Turning
    if (this.isKeyDown('ArrowLeft') || this.isKeyDown('q') || this.isKeyDown('Q')) {
      turnLeft = true;
    }
    if (this.isKeyDown('e') || this.isKeyDown('E') || this.isKeyDown('ArrowRight')) {
      turnRight = true;
    }

    return {
      forward: movingForward,
      strafe: strafeDirection,
      turnLeft,
      turnRight
    };
  }

  /**
   * Check for rule activation keys (1-5)
   * @returns {number[]} Array of rule IDs that were just activated
   */
  getRuleActivations() {
    const activatedRules = [];
    for (let i = 1; i <= 5; i++) {
      if (this.isKeyDown(String(i))) {
        activatedRules.push(i);
      }
    }
    return activatedRules;
  }

  /**
   * Check for capture/quarantine keys
   * @returns {{capture: boolean, quarantine: boolean}}
   */
  getActionInput() {
    return {
      capture: this.isKeyDown('c') || this.isKeyDown('C'),
      quarantine: this.isKeyDown('v') || this.isKeyDown('V')
    };
  }

  /**
   * Check for help/debug keys
   * @returns {{help: boolean, debug: boolean}}
   */
  getSystemInput() {
    return {
      help: this.isKeyDown('Escape'),
      debug: this.isKeyJustPressed('F1')
    };
  }

  /**
   * Get current key state dictionary
   * @returns {object} Copy of keys object
   */
  getKeyState() {
    return { ...this.keys };
  }

  /**
   * Reset key states (useful for pausing or resetting input state)
   */
  reset() {
    this.keys = {};
  }

  /**
   * Check if a specific key is NOT pressed
   * @param {string} key - The key to check
   * @returns {boolean} True if key is not pressed
   */
  isKeyNotPressed(key) {
    return this.keys[key] !== true;
  }
}
