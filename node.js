"use strict";

/**
 * SystemNode class for the Akira - Neural Link raycasting game.
 * Manages individual system nodes, their infection status, and healing properties.
 * Implements autonomous infection logic that reads virus positions dynamically.
 */
export default class SystemNode {
  /**
   * @param {number} id - Unique identifier for this node
   * @param {string} name - Display name of the node
   * @param {number} x - X position in pixels
   * @param {number} y - Y position in pixels
   * @param {string} color - Color to render this node
   * @param {string} effectName - Name of the infection effect this node causes
   */
  constructor(id, name, x, y, color, effectName) {
    this.id = id;
    this.name = name;
    this.x = x;
    this.y = y;
    this.infected = false;
    this.color = color;
    this.effectName = effectName;
    this.infectionProgress = 0; // For infection spread tracking
  }

  /**
   * Update node state for the current frame.
   * 
   * @param {number} dt - Delta time in seconds
   * @param {Array} viruses - Array of virus instances (to check for infection collisions)
   * @param {boolean} isNodeLocked - Whether Rule 2 (NODES ARE LOCKED) is active
   */
  update(dt, viruses, isNodeLocked) {
    // If nodes are locked, no infection can occur
    if (isNodeLocked) return;
    
    // Check if any virus is colliding with this node to cause infection
    for (const virus of viruses) {
      // Check distance between virus and node center
      const dist = Math.hypot(virus.x - this.x, virus.y - this.y);
      
      // If virus is close enough, infect the node
      if (dist < 10) { // HITBOX_RADIUS equivalent
        this.infected = true;
        break;
      }
    }
  }

  /**
   * Check if this node is a healing source (Life Support node).
   * @returns {boolean} True if this node can heal the player.
   */
  isHealingSource() {
    return this.id === 4; // Life Support node
  }

  /**
   * Check if this node is the Life Support node.
   * @returns {boolean} True if this is the Life Support node.
   */
  isLifeSupport() {
    return this.id === 4;
  }

  /**
   * Check if this node can apply infection effects.
   * @returns {boolean} True if this node's infection would affect the player.
   */
  canApplyInfectionEffect() {
    return this.id >= 0 && this.id <= 4; // All 5 nodes have effects
  }

  /**
   * Check if this node is secure (not infected).
   * @returns {boolean} True if the node is secure.
   */
  isSecure() {
    return !this.infected;
  }

  /**
   * Get the infection effect type for this node.
   * @returns {string|null} The effect type name or null if not applicable.
   */
  getInfectionEffectType() {
    if (!this.infected || !this.canApplyInfectionEffect()) {
      return null;
    }
    
    switch (this.id) {
      case 0: return 'motorControl';
      case 1: return 'visualProcessor';
      case 2: return 'auditoryProcessing';
      case 3: return 'neuralLink';
      case 4: return 'lifeSupport';
      default: return null;
    }
  }

  /**
   * Apply Life Support infection blocking to healing.
   * @returns {boolean} True if healing is blocked due to Life Support infection.
   */
  blocksHealing() {
    // Life Support infection blocks ALL healing
    return this.id === 4 && this.infected;
  }

  /**
   * Get the health drain rate for Life Support node infection.
   * @returns {number} Health drain rate per second, or 0 if not applicable.
   */
  getHealthDrainRate() {
    // Life Support infection causes -0.5 HP/sec drain
    if (this.id === 4 && this.infected) {
      return 0.0625; // 0.5 HP/sec in 16x speed (0.5 / 8)
    }
    return 0;
  }
}
