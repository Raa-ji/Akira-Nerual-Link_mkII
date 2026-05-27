"use strict";

/**
 * RulesManager class for the Akira - Neural Link raycasting game.
 * Manages rule states, cooldowns, timers, and the Neural Link toggle delay system.
 * Implements autonomous state management with read-only query methods for other entities.
 */
export default class RulesManager {
  /**
   * @param {Array} rules - Array of rule configuration objects
   */
  constructor(rules) {
    this.rules = rules;
    this.toggleStates = {}; // Track toggle rules: id -> boolean
    this.durationTimers = {}; // Track duration timers: id -> number (positive: active, negative: cooldown, 0: ready)
    this.pendingToggleRules = {}; // Track pending toggle states during Neural Link delay
    this.toggleDelayTimers = {}; // Track delay timers for Neural Link
    this.lastActivationTime = {}; // Track when rules were last activated (for HUD)
    
    // Initialize all rules
    rules.forEach(rule => {
      this.toggleStates[rule.id] = false;
      this.durationTimers[rule.id] = 0;
      this.lastActivationTime[rule.id] = 0;
    });
  }

  /**
   * Update all rule timers and cooldowns for the current frame.
   * @param {number} dt - Delta time in seconds
   */
  update(dt) {
    // Update duration timers
    this.rules.forEach(rule => {
      const timer = this.durationTimers[rule.id];
      
      if (rule.type === "DURATION") {
        if (timer > 0) {
          this.durationTimers[rule.id] -= dt;
          if (this.durationTimers[rule.id] <= 0) {
            this.durationTimers[rule.id] = -rule.cooldown;
          }
        } else if (timer < 0 && timer > -1) {
          // Cooldown phase - counting up from -cooldown to 0
          this.durationTimers[rule.id] += dt;
          if (this.durationTimers[rule.id] >= 0) {
            this.durationTimers[rule.id] = 0;
          }
        }
      } else if (rule.type === "TOGGLE") {
        // Update toggle cooldowns
        const cdTimer = this.toggleStates[`cooldown_${rule.id}`];
        if (cdTimer > 0) {
          this.toggleStates[`cooldown_${rule.id}`] -= dt;
          if (this.toggleStates[`cooldown_${rule.id}`] <= 0) {
            delete this.toggleStates[`cooldown_${rule.id}`];
          }
        }
      }
      
      // Process Neural Link toggle delay timers
      if (this.pendingToggleRules[rule.id] !== undefined && rule.id in this.toggleDelayTimers) {
        this.toggleDelayTimers[rule.id] -= dt;
        
        // Delay complete - actually activate the rule now!
        if (this.toggleDelayTimers[rule.id] <= 0) {
          const desiredState = this.pendingToggleRules[rule.id];
          this.toggleStates[rule.id] = desiredState;
          delete this.pendingToggleRules[rule.id];
          delete this.toggleDelayTimers[rule.id];
          console.log(`⏱️ Rule [${rule.id}] "${rule.name}" activated after delay!`);
        }
      }
    });
  }

  /**
   * Activate a rule.
   * @param {number} ruleId - The ID of the rule to activate
   * @param {string} activator - 'player' or 'virus' (for virus-specific logic)
   * @returns {boolean} True if rule was activated, false otherwise
   */
  activateRule(ruleId, activator = 'player') {
    const rule = this.rules.find(r => r.id === ruleId);
    if (!rule) return false;
    
    let canUse = true;
    
    if (activator === 'virus') {
      // Viruses should not directly activate duration rules for their benefit
      if (rule.type === "DURATION") {
        return false;
      }
      // For toggle rules, check virus-specific cooldowns (would need to be implemented)
      if ((this.virusCooldowns?.[ruleId] || 0) > 0) canUse = false;
    } else { // Activator is player
      // Check if rule is in pending state (Neural Link delay active)
      if (this.pendingToggleRules[ruleId] !== undefined && rule.type === "TOGGLE") {
        console.log(`⏱️ Rule [${ruleId}] already pending activation due to Neural Link infection!`);
        return false;
      }
      
      // Check player-specific cooldowns
      if (rule.type === "TOGGLE" && this.toggleStates[`cooldown_${rule.id}`] && this.toggleStates[`cooldown_${rule.id}`] > 0) {
        canUse = false;
      } else if (rule.type === "DURATION" && this.durationTimers[rule.id] !== 0) {
        canUse = false;
      }
    }
    
    if (!canUse) return false;
    
    // Apply Neural Link toggle delay for player-activated toggle rules
    const ruleBlock = this.getRuleBlockForNeuralLink();
    if (rule.type === "TOGGLE" && activator === 'player' && ruleBlock && ruleBlock.infectedNode3) {
      // Set pending state instead of immediate activation!
      const desiredState = !this.toggleStates[rule.id];
      this.pendingToggleRules[rule.id] = desiredState;
      this.toggleDelayTimers[rule.id] = 2.5 / 8; // Adjusted: 1/8th of 2.5
      console.log(`⏱️ Rule [${ruleId}] "${rule.name}" queued for activation (Neural Link delay: ${this.toggleDelayTimers[rule.id].toFixed(2)}s)`);
    } else if (rule.type === "TOGGLE") {
      this.toggleStates[rule.id] = !this.toggleStates[rule.id];
      this.toggleStates[`cooldown_${rule.id}`] = rule.cooldown;
      this.lastActivationTime[ruleId] = Date.now();
      console.log(`✅ Rule [${ruleId}] "${rule.name}" toggled ${this.toggleStates[rule.id] ? 'ON' : 'OFF'}`);
      this.triggerGlitchEffect();
    } else if (rule.type === "DURATION") {
      this.durationTimers[rule.id] = rule.duration;
      this.lastActivationTime[ruleId] = Date.now();
      console.log(`⏱️ Rule [${ruleId}] "${rule.name}" activated for ${rule.duration}s`);
      this.triggerGlitchEffect();
    }
    
    return true;
  }

  /**
   * Get the current state of a toggle rule.
   * @param {number} ruleId - The ID of the rule
   * @returns {boolean} True if the rule is active, false otherwise
   */
  getToggleState(ruleId) {
    return this.toggleStates[ruleId] || false;
  }

  /**
   * Get the current timer value for a rule.
   * @param {number} ruleId - The ID of the rule
   * @returns {number} Positive when active, negative during cooldown, 0 when ready
   */
  getDurationTimer(ruleId) {
    return this.durationTimers[ruleId] || 0;
  }

  /**
   * Check if a rule is currently active.
   * @param {number} ruleId - The ID of the rule
   * @returns {boolean} True if the rule is active
   */
  isRuleActive(ruleId) {
    const rule = this.rules.find(r => r.id === ruleId);
    if (!rule) return false;
    
    if (rule.type === "TOGGLE") {
      return this.toggleStates[ruleId] || false;
    } else if (rule.type === "DURATION") {
      return this.durationTimers[ruleId] > 0;
    }
    return false;
  }

  /**
   * Get the remaining time for a rule.
   * @param {number} ruleId - The ID of the rule
   * @returns {number} Seconds remaining (positive when active, negative during cooldown)
   */
  getRuleTimeRemaining(ruleId) {
    if (this.isRuleActive(ruleId)) {
      return this.durationTimers[ruleId];
    }
    // If inactive, return cooldown value (negative number)
    return this.durationTimers[ruleId] || 0;
  }

  /**
   * Get the cooldown duration for a rule.
   * @param {number} ruleId - The ID of the rule
   * @returns {number} Cooldown duration in seconds
   */
  getRuleCooldown(ruleId) {
    const rule = this.rules.find(r => r.id === ruleId);
    return rule ? rule.cooldown : 0;
  }

  /**
   * Get rule details by ID.
   * @param {number} ruleId - The ID of the rule
   * @returns {object|null} Rule configuration object or null if not found
   */
  getRuleById(ruleId) {
    return this.rules.find(r => r.id === ruleId) || null;
  }

  /**
   * Check if a rule is on cooldown.
   * @param {number} ruleId - The ID of the rule
   * @returns {boolean} True if the rule is on cooldown
   */
  isRuleOnCooldown(ruleId) {
    const rule = this.rules.find(r => r.id === ruleId);
    if (!rule) return false;
    
    if (rule.type === "TOGGLE") {
      return (this.toggleStates[`cooldown_${rule.id}`] || 0) > 0;
    } else if (rule.type === "DURATION") {
      return this.durationTimers[ruleId] < 0;
    }
    return false;
  }

  /**
   * Get all rules with their current state for HUD display.
   * @returns {Array} Array of rule objects with state information
   */
  getAllRulesState() {
    return this.rules.map(rule => {
      const isToggle = rule.type === "TOGGLE";
      const isActive = this.isRuleActive(rule.id);
      const isOnCooldown = this.isRuleOnCooldown(rule.id);
      
      return {
        id: rule.id,
        name: rule.name,
        type: rule.type,
        duration: rule.duration || 0,
        cooldown: rule.cooldown || 0,
        isActive: isActive,
        isOnCooldown: isOnCooldown,
        timer: this.getRuleTimeRemaining(rule.id),
        canUse: !isOnCooldown
      };
    });
  }

  /**
   * Deactivate a duration rule immediately.
   * @param {number} ruleId - The ID of the rule to deactivate
   */
  deactivateDurationRule(ruleId) {
    this.durationTimers[ruleId] = -this.getRuleCooldown(ruleId);
  }

  /**
   * Check if Neural Link node (Node 3) is infected.
   * @param {Array} systemNodes - Array of system node instances
   * @returns {boolean} True if Node 3 is infected and not locked
   */
  isNeuralLinkInfected(systemNodes) {
    const node = systemNodes.find(n => n.id === 3);
    return node?.infected || false;
  }

  /**
   * Simulate the Neural Link effect by checking if there's an infected Neural Link node.
   * @param {Array} systemNodes - Array of system node instances
   * @param {boolean} isNodeLocked - Whether Rule 2 (NODES ARE LOCKED) is active
   * @returns {boolean} True if toggle rules would have a delay
   */
  wouldToggleBeDelayed(systemNodes, isNodeLocked) {
    // Neural Link infection causes toggle delay unless nodes are locked
    const node3 = systemNodes.find(n => n.id === 3);
    return !isNodeLocked && node3?.infected || false;
  }

  /**
   * Trigger a visual glitch effect when a rule changes.
   */
  triggerGlitchEffect() {
    // Implementation would be in the renderer class
    // This is a placeholder for the actual effect trigger
  }
}
