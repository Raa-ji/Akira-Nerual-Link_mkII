/**
 * Akira - Neural Link (v1.11)
 * player.js - Player class with movement, collision, and infection effects
 * 
 * Uses ES6 class structure with clear separation of concerns
 */

"use strict";

// Import configuration constants
import { TILE, COLORS, INFECTION_EFFECTS_CONFIG, HEALING_CONFIG, TILE_SIZE, VIRUS_DAMAGE_CONFIG, CAPTURE_CONFIG, CLEANING_CONFIG } from './config.js';

/**
 * Player class handling position, movement, health, and infection effects
 */
export default class Player {
  /**
   * Initialize player with default starting position and state
   * @param {number} startX - Starting X position in tiles
   * @param {number} startY - Starting Y position in tiles
   * @param {number} startAngle - Starting viewing angle in radians
   */
  constructor(startX, startY, startAngle) {
    // Position and movement
    this.x = startX * TILE_SIZE;
    this.y = startY * TILE_SIZE;
    this.angle = startAngle;
    
    // Stats
    this.health = 100;
    this.speed = 96;
    this.turnSpeed = 0.8;
    
    // Movement state
    this.speedMultiplier = 1.0;
    
    // Capture and quarantine state
    this.carryingVirusId = null;
    this.isQuarantining = false;
    this.quarantineProgress = 0;
    this.captureReadyTime = 0;
    this.huntModeActive = false;
    this.huntWarningTimer = 0;
    this.lastDamageTime = Date.now() / 1000;
    
    // Infection cleaning system
    this.isCleaningNode = false;
    this.cleaningTargetNodeId = null;
    this.cleaningProgress = 0;
    this.cleaningStartPosition = { x: 0, y: 0 };
    
    // Neural Link toggle delay system
    this.pendingToggleRules = {};
    this.toggleDelayTimers = {};
    
    // Neural Link rule states (populated by game engine at start)
    this.toggleStates = {};
    this.durationTimers = {};
    this.lastActivationTime = {};
    
    // Configuration references
    this.virusDamageConfig = VIRUS_DAMAGE_CONFIG;
    this.captureConfig = CAPTURE_CONFIG;
    this.cleaningConfig = CLEANING_CONFIG;
    this.healingConfig = HEALING_CONFIG;
    
    // Infection effects state (populated by rules manager)
    this.infectionStates = null;
    this.activeInfectionEffects = 0;
  }

  /**
   * Update player state (called each frame)
   * @param {number} dt - Delta time in seconds
   */
  update(dt) {
    // Reset speed multiplier each frame
    this.speedMultiplier = 1.0;
    
    // Apply infection effects (handled separately, but stored here)
    this.applyInfectionEffects(dt);
    
    // Check healing sources
    this.checkHealingSources(dt);
    
    // Update cleaning progress
    this.updateInfectionCleaning(dt);
  }

  /**
   * Apply infection effects from infected nodes
   * @param {number} dt - Delta time in seconds
   */
  applyInfectionEffects(dt) {
    if (!this.infectionStates) return;
    
    // Apply Motor Control effect (50% speed reduction)
    if (this.infectionStates.motorControl) {
      this.speedMultiplier *= INFECTION_EFFECTS_CONFIG.MOTOR_CONTROL_SPEED_MULTIPLIER;
    }
    
    // Apply Life Support effect (health drain over time)
    if (this.infectionStates.lifeSupport) {
      const healthDrain = INFECTION_EFFECTS_CONFIG.LIFE_SUPPORT_HEALTH_DRAIN_RATE * dt;
      this.health -= healthDrain;
      
      // Prevent negative health (death handled by win/lose check)
      if (this.health < 0) this.health = 0;
    }
  }

  /**
   * Check for healing sources and apply healing
   * @param {number} dt - Delta time in seconds
   */
  checkHealingSources(dt) {
    // TODO: This should be moved to a healing manager class in a future refactoring
    // For now, keep it here as it's tightly coupled to player state
    const playerTileX = Math.floor(this.x / TILE_SIZE);
    const playerTileY = Math.floor(this.y / TILE_SIZE);
    
    // TODO: Implement healing logic
    // This will need access to systemNodes and mapData
  }

  /**
   * Update the infection cleaning progress
   * @param {number} dt - Delta time in seconds
   */
  updateInfectionCleaning(dt) {
    if (!this.isCleaningNode) {
      // Check if player should start cleaning
      // TODO: Implement checkStartCleaning logic
      return;
    }
    
    // TODO: Implement updateInfectionCleaning logic
  }

  /**
   * Move player based on direction and speed
   * @param {number} dx - Movement delta X
   * @param {number} dy - Movement delta Y
   */
  move(dx, dy) {
    const newX = this.x + dx;
    const newY = this.y + dy;
    
    if (!this.checkCollision(newX, this.y)) {
      this.x = newX;
    }
    
    if (!this.checkCollision(this.x, newY)) {
      this.y = newY;
    }
  }

  /**
   * Check for collisions with walls and boundaries
   * @param {number} x - X position to check
   * @param {number} y - Y position to check
   * @returns {boolean} True if collision detected
   */
  checkCollision(x, y) {
    const tileX = Math.floor(x / TILE_SIZE);
    const tileY = Math.floor(y / TILE_SIZE);
    
    // Check map boundaries
    if (tileX < 0 || tileX >= levelMap[0].length || tileY < 0 || tileY >= levelMap.length) {
      return true;
    }
    
    const tileType = levelMap[tileY][tileX];
    
    // TODO: Implement collision logic based on tile types and rules
    // This will need access to toggleStates from rules manager
    
    return false;
  }

  /**
   * Try to capture a virus
   * @returns {boolean} True if capture successful
   */
  attemptCapture() {
    // TODO: Implement capture logic
    return false;
  }

  /**
   * Try to start quarantine sequence
   * @returns {boolean} True if quarantine started
   */
  attemptQuarantine() {
    // TODO: Implement quarantine logic
    return false;
  }

  /**
   * Get current capture status for HUD
   * @returns {string} Capture status text
   */
  getCaptureStatus() {
    const currentTime = Date.now() / 1000;
    
    if (this.carryingVirusId !== null) {
      return `CARRYING VIRUS #${this.carryingVirusId + 1}`;
    } else if (currentTime >= this.captureReadyTime) {
      return 'READY TO CAPTURE [C]';
    } else {
      return `${Math.ceil(this.captureReadyTime - currentTime)}s COOLDOWN`;
    }
  }

  /**
   * Get health percentage
   * @returns {number} Health percentage
   */
  getHealthPercent() {
    return Math.floor(this.health);
  }

  /**
   * Take damage
   * @param {number} damage - Amount of damage to take
   */
  takeDamage(damage) {
    this.health -= damage;
    if (this.health < 0) this.health = 0;
    this.lastDamageTime = Date.now() / 1000;
  }

  /**
   * Get player position as tile coordinates
   * @returns {{x: number, y: number}} Tile coordinates
   */
  getTilePosition() {
    return {
      x: Math.floor(this.x / TILE_SIZE),
      y: Math.floor(this.y / TILE_SIZE)
    };
  }

  /**
   * Reset player state for a new game
   */
  reset() {
    this.health = 100;
    this.x = 7.5 * TILE_SIZE;
    this.y = 1.5 * TILE_SIZE;
    this.angle = Math.PI / 2;
    
    this.carryingVirusId = null;
    this.isQuarantining = false;
    this.quarantineProgress = 0;
    this.captureReadyTime = 0;
    this.huntModeActive = false;
    this.huntWarningTimer = 0;
    this.lastDamageTime = Date.now() / 1000;
    
    this.isCleaningNode = false;
    this.cleaningTargetNodeId = null;
    this.cleaningProgress = 0;
    this.cleaningStartPosition = { x: 0, y: 0 };
  }
}
