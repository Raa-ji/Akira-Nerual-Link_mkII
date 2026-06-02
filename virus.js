"use strict";

/**
 * Virus class for the Akira - Neural Link raycasting game.
 * Implements autonomous AI behavior that reads world state dynamically.
 */
export default class Virus {
  /**
   * @param {number} id - Unique identifier for this virus
   * @param {number} x - Starting X position in pixels
   * @param {number} y - Starting Y position in pixels
   * @param {number} speed - Base movement speed
   */
  constructor(id, x, y, speed) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.speed = speed;
    this.stopped = false;
    this.slowed = false;
    this.activationCooldowns = {};
    this.targetRuleId = null;
    this.targetNodeId = null;
    this.fallbackHuntTimer = 0;
    this.inFallbackHuntMode = false;
  }

  /**
   * Update virus AI state.
   * 
   * @param {number} dt - Delta time in seconds
   * @param {object} player - Player instance (for targeting)
   * @param {object} rulesManager - RulesManager instance (for rule state reading)
   * @param {Array} systemNodes - Array of system node instances
   * @param {Array} ruleBlocks - Array of rule block instances
   * @param {Function} checkCollision - Collision checking function
   * @param {Function} tryDealPlayerDamage - Function to apply damage to player
   * @param {boolean} huntModeActive - Whether hunt mode is active
   * @param {object} captureConfig - Configuration for capture mechanics
   * @param {object} virusDamageConfig - Configuration for virus damage
   * @param {number} tileSize - Size of one tile in pixels
   */
  update(dt, player, rulesManager, systemNodes, ruleBlocks, checkCollision, tryDealPlayerDamage, huntModeActive, captureConfig, virusDamageConfig, tileSize) {
    // Reset state flags each frame
    this.stopped = false;
    this.slowed = false;
    
    // Determine effective speed based on rule states
    const effectiveSpeed = this.calculateEffectiveSpeed(rulesManager) * dt;

    // HUNT MODE: Chase player aggressively
    if (huntModeActive && !player.isQuarantining) {
      this.huntPlayer(dt, player, checkCollision, effectiveSpeed, tryDealPlayerDamage, virusDamageConfig, tileSize);
      return;
    }

    // Update fallback hunt timer
    this.updateFallbackHunt(dt, systemNodes, checkCollision, tileSize, rulesManager);

    // If in fallback hunt mode, hunt player instead of targeting nodes
    if (this.inFallbackHuntMode) {
      this.huntPlayerFallback(dt, player, checkCollision, effectiveSpeed, tryDealPlayerDamage, virusDamageConfig, tileSize);
      return;
    }

    // Rule Interaction Logic
    this.interactWithRules(rulesManager, ruleBlocks, tileSize, dt, player, systemNodes, checkCollision);

    // Target nodes for infection
    this.targetNodes(systemNodes, checkCollision, tileSize, effectiveSpeed, player, rulesManager);

    // Deal damage to player if touching
    this.attemptDamagePlayer(player, tryDealPlayerDamage, virusDamageConfig, tileSize);
  }

  /**
   * Calculate effective movement speed based on current rule states.
   * @param {object} rulesManager - RulesManager instance
   * @returns {number} - Effective movement speed
   */
  calculateEffectiveSpeed(rulesManager) {
    // Rule 3: VIRUS IS STOP
    if (rulesManager.isRuleActive(3)) {
      this.stopped = true;
      return 0;
    }

    // Rule 4: VIRUS IS SLOW
    if (rulesManager.isRuleActive(4)) {
      this.slowed = true;
      return this.speed * 0.6; // 60% speed
    }

    return this.speed;
  }

  /**
   * Hunt the player when in hunt mode.
   * @param {number} dt - Delta time
   * @param {object} player - Player instance
   * @param {Function} checkCollision - Collision checking function
   * @param {number} effectiveSpeed - Calculated movement speed
   * @param {Function} tryDealPlayerDamage - Damage function
   * @param {object} virusDamageConfig - Damage configuration
   * @param {number} tileSize - Size of one tile in pixels
   */
  huntPlayer(dt, player, checkCollision, effectiveSpeed, tryDealPlayerDamage, virusDamageConfig, tileSize) {
    const distToPlayer = Math.hypot(player.x - this.x, player.y - this.y);
    
    const huntEffectiveSpeed = effectiveSpeed * 1.75;
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const distance = Math.hypot(dx, dy);
    
    if (distance > 10) { // Only move if not extremely close
      const moveX = (dx / distance) * huntEffectiveSpeed;
      const moveY = (dy / distance) * huntEffectiveSpeed;
      
      // Try diagonal movement first
      if (!checkCollision(this.x + moveX, this.y + moveY)) {
        this.x += moveX;
        this.y += moveY;
      } else {
        // Wall sliding: try moving along each axis separately
        if (!checkCollision(this.x + moveX, this.y)) {
          this.x += moveX;
        } else if (!checkCollision(this.x, this.y + moveY)) {
          this.y += moveY;
        }
      }
    }
    
    // Deal damage to player if touching
    const distToPlayerFinal = Math.hypot(this.x - player.x, this.y - player.y);
    if (distToPlayerFinal < virusDamageConfig.HITBOX_RADIUS) {
      tryDealPlayerDamage(this);
    }
  }

  /**
   * Update fallback hunt timer and handle state transitions.
   * @param {number} dt - Delta time in seconds
   * @param {Array} systemNodes - Array of system node instances
   * @param {Function} checkCollision - Collision checking function
   * @param {number} tileSize - Size of one tile in pixels
   * @param {object} rulesManager - RulesManager instance
   */
  updateFallbackHunt(dt, systemNodes, checkCollision, tileSize, rulesManager) {
    if (this.inFallbackHuntMode) {
      this.fallbackHuntTimer -= dt;
      
      // Only switch back to node targeting when timer expires AND there are reachable nodes
      if (this.fallbackHuntTimer <= 0) {
        // Check if there are any reachable uninfected nodes
        let hasReachableNode = false;
        for (const node of systemNodes) {
          if (!node.infected && !rulesManager.isRuleActive(2)) {
            if (this.hasLineOfSight(this.x, this.y, node.x, node.y, tileSize, checkCollision)) {
              hasReachableNode = true;
              break;
            }
          }
        }
        
        if (hasReachableNode) {
          this.inFallbackHuntMode = false;
          this.fallbackHuntTimer = 0;
        } else {
          // Still no reachable nodes, keep timer at 0 to stay in fallback hunt mode
          this.fallbackHuntTimer = 0;
        }
      }
    }
  }

  /**
   * Hunt the player in fallback mode (when no nodes are reachable).
   * Same logic as huntPlayer but used when nodes are unavailable.
   * @param {number} dt - Delta time
   * @param {object} player - Player instance
   * @param {Function} checkCollision - Collision checking function
   * @param {number} effectiveSpeed - Calculated movement speed
   * @param {Function} tryDealPlayerDamage - Damage function
   * @param {object} virusDamageConfig - Damage configuration
   * @param {number} tileSize - Size of one tile in pixels
   */
  huntPlayerFallback(dt, player, checkCollision, effectiveSpeed, tryDealPlayerDamage, virusDamageConfig, tileSize) {
    const distToPlayer = Math.hypot(player.x - this.x, player.y - this.y);
    
    // Always hunt player in fallback mode (no range limit)
    const huntEffectiveSpeed = effectiveSpeed * 1.75;
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const distance = Math.hypot(dx, dy);
    
    if (distance > 10) { // Only move if not extremely close
      const moveX = (dx / distance) * huntEffectiveSpeed;
      const moveY = (dy / distance) * huntEffectiveSpeed;
      
      // Try diagonal movement first
      if (!checkCollision(this.x + moveX, this.y + moveY)) {
        this.x += moveX;
        this.y += moveY;
      } else {
        // Wall sliding: try moving along each axis separately
        if (!checkCollision(this.x + moveX, this.y)) {
          this.x += moveX;
        } else if (!checkCollision(this.x, this.y + moveY)) {
          this.y += moveY;
        }
      }
    }
    
    // Deal damage to player if touching
    const distToPlayerFinal = Math.hypot(this.x - player.x, this.y - player.y);
    if (distToPlayerFinal < virusDamageConfig.HITBOX_RADIUS) {
      tryDealPlayerDamage(this);
    }
  }

  /**
   * Interact with rule blocks to manipulate rules.
   * @param {object} rulesManager - RulesManager instance
   * @param {Array} ruleBlocks - Array of rule block instances
   * @param {number} tileSize - Size of one tile in pixels
   * @param {number} dt - Delta time
   * @param {object} player - Player instance
   * @param {Array} systemNodes - Array of system node instances
   * @param {Function} checkCollision - Collision checking function
   */
  interactWithRules(rulesManager, ruleBlocks, tileSize, dt, player, systemNodes, checkCollision) {
    // Update virus-specific cooldowns for rules
    for (let ruleId in this.activationCooldowns) {
      if (this.activationCooldowns[ruleId] > 0) {
        this.activationCooldowns[ruleId] -= dt;
      }
    }

    for (const ruleBlock of ruleBlocks) {
      const distToRuleBlock = Math.hypot(this.x - ruleBlock.x, this.y - ruleBlock.y);
      if (distToRuleBlock < tileSize * 2) { // Virus is near a rule block
        // Rule 1: FIREWALL IS WALL
        if (rulesManager.getToggleState(1) === true && (this.activationCooldowns[1] || 0) <= 0) {
          const virusTarget = player;
          if (virusTarget) {
            const lineOfSightBlockedByFirewall = this.checkLineOfSightForSpecificTile(
              this.x, this.y, virusTarget.x, virusTarget.y, 
              2, true, tileSize, checkCollision // TILE.FIREWALL = 2
            );
            if (lineOfSightBlockedByFirewall) {
              rulesManager.activateRule(1, 'virus');
              this.activationCooldowns[1] = rulesManager.getRuleCooldown(1);
              break;
            }
          }
        }

        // Rule 2: NODES ARE LOCKED
        if (rulesManager.getToggleState(2) === true && (this.activationCooldowns[2] || 0) <= 0) {
          const targetNode = systemNodes.find(node => 
            !node.infected && !rulesManager.isRuleActive(2)
          );
          if (targetNode) {
            rulesManager.activateRule(2, 'virus');
            this.activationCooldowns[2] = rulesManager.getRuleCooldown(2);
            break;
          }
        }

        // Rule 5: COOLANT IS SAFE
        if (rulesManager.getDurationTimer(5) > 0 && (this.activationCooldowns[5] || 0) <= 0) {
          const coolantRule = rulesManager.getRuleById(5);
          if (coolantRule) {
            rulesManager.deactivateDurationRule(5);
            this.activationCooldowns[5] = coolantRule.cooldown;
            break;
          }
        }
      }
    }
  }

  /**
   * Target system nodes for infection.
   * @param {Array} systemNodes - Array of system node instances
   * @param {Function} checkCollision - Collision checking function
   * @param {number} tileSize - Size of one tile in pixels
   * @param {number} effectiveSpeed - Calculated movement speed
   * @param {object} player - Player instance
   * @param {object} rulesManager - RulesManager instance
   */
  targetNodes(systemNodes, checkCollision, tileSize, effectiveSpeed, player, rulesManager) {
    // Skip target selection if already stopped by rule or if nodes are locked
    if (this.stopped || rulesManager.isRuleActive(2)) return;

    // Target selection: uninfected nodes, then any node
    let target = null;
    let minDist = Infinity;
    
    for (const node of systemNodes) {
      // If NODES ARE LOCKED (Rule 2) is active, viruses cannot target nodes
      if (!node.infected && !rulesManager.isRuleActive(2)) {
        const dist = Math.hypot(this.x - node.x, this.y - node.y);
        if (dist < minDist && this.hasLineOfSight(this.x, this.y, node.x, node.y, tileSize, checkCollision)) {
          minDist = dist;
          target = node;
        }
      }
    }

    // If no reachable uninfected nodes found, switch to fallback hunt mode
    if (!target) {
      this.inFallbackHuntMode = true;
      this.fallbackHuntTimer = 2.0; // 2 second cooldown before returning to nodes
      return;
    }

    this.targetNodeId = target.id;
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const distance = Math.hypot(dx, dy);
    
    if (distance > 10) {
      const moveX = (dx / distance) * effectiveSpeed;
      const moveY = (dy / distance) * effectiveSpeed;
      
      // Try diagonal movement first
      if (!checkCollision(this.x + moveX, this.y + moveY)) {
        this.x += moveX;
        this.y += moveY;
      } else {
        // Wall sliding: try moving along each axis separately
        if (!checkCollision(this.x + moveX, this.y)) {
          this.x += moveX;
        } else if (!checkCollision(this.x, this.y + moveY)) {
          this.y += moveY;
        }
      }
    } else {
      // Begin or continue infection by staying at the target node
      if (!rulesManager.isRuleActive(2)) {
        this.targetNodeId = null;
      }
    }
  }

  /**
   * Attempt to damage the player if in contact.
   * @param {object} player - Player instance
   * @param {Function} tryDealPlayerDamage - Damage function
   * @param {object} virusDamageConfig - Damage configuration
   * @param {number} tileSize - Size of one tile in pixels
   */
  attemptDamagePlayer(player, tryDealPlayerDamage, virusDamageConfig, tileSize) {
    const distToPlayer = Math.hypot(this.x - player.x, this.y - player.y);
    if (distToPlayer < virusDamageConfig.HITBOX_RADIUS) {
      tryDealPlayerDamage(this);
    }
  }

  /**
   * Check if there's a clear line of sight between two points, avoiding generic walls.
   * @param {number} x1 - Starting X position
   * @param {number} y1 - Starting Y position
   * @param {number} x2 - Ending X position
   * @param {number} y2 - Ending Y position
   * @param {number} tileSize - Size of one tile in pixels
   * @param {Function} checkCollision - Collision checking function
   * @returns {boolean} - True if line of sight is clear
   */
  hasLineOfSight(x1, y1, x2, y2, tileSize, checkCollision) {
    const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1)) / 10;
    
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const checkX = x1 + (x2 - x1) * t;
      const checkY = y1 + (y2 - y1) * t;
      
      // Use the passed checkCollision function to determine if there's a wall
      if (checkCollision(checkX, checkY)) {
        return false; // Blocked by a wall
      }
    }
    
    return true; // Line of sight is clear
  }

  /**
   * Check if there's a specific tile type blocking the line of sight between two points.
   * @param {number} x1 - Starting X position
   * @param {number} y1 - Starting Y position
   * @param {number} x2 - Ending X position
   * @param {number} y2 - Ending Y position
   * @param {number} tileToCheck - Tile type ID to check for (2 for FIREWALL)
   * @param {boolean} isRuleActive - Whether the relevant rule is active
   * @param {number} tileSize - Size of one tile in pixels
   * @param {Function} checkCollision - Collision checking function
   * @returns {boolean} - True if line of sight is blocked by the specific tile type
   */
  checkLineOfSightForSpecificTile(x1, y1, x2, y2, tileToCheck, isRuleActive, tileSize, checkCollision) {
    if (!isRuleActive) return false;
    
    const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1)) / 10;
    
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const checkX = x1 + (x2 - x1) * t;
      const checkY = y1 + (y2 - y1) * t;
      
      const tileX = Math.floor(checkX / tileSize);
      const tileY = Math.floor(checkY / tileSize);
      
      if (tileX < 0 || tileX >= 64 || tileY < 0 || tileY >= 64) {
        continue;
      }
      
      // Use the checkCollision function to check for walls
      // This will check for all wall types including firewalls when the rule is active
      if (checkCollision(checkX, checkY)) {
        // We would need to know the specific tile type, but for now we'll use the checkCollision result
        // In the original implementation, this function would check specifically for the tile type
        return true; // Assume collision means blocked
      }
    }
    
    return false; // Line of sight is clear of the specific tile type
  }
}
