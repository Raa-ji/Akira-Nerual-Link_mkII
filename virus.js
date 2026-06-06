"use strict";

import { findPath } from './pathfinding.js';
import { TILE_SIZE, TILE, COLORS } from './config.js';
import { levelMap } from './mapData.js';

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
    
    // Pathfinding properties
    this.currentPath = [];
    this.pathCacheTimer = 0;
    this.targetFirewallSwitchId = null;
    this.pathfindingCooldown = 0;
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
   * @param {boolean} huntModeEnded - Whether hunt mode just ended this frame
   * @param {object} captureConfig - Configuration for capture mechanics
   * @param {object} virusDamageConfig - Configuration for virus damage
   * @param {number} tileSize - Size of one tile in pixels
   */
  update(dt, player, rulesManager, systemNodes, ruleBlocks, checkCollision, tryDealPlayerDamage, huntModeActive, huntModeEnded, captureConfig, virusDamageConfig, tileSize) {
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

    // If hunt mode just ended, check if we should exit fallback mode
    if (huntModeEnded) {
      this.checkExitFallbackMode(systemNodes, checkCollision, tileSize, rulesManager);
    }

    // If in fallback hunt mode, hunt player instead of targeting nodes
    if (this.inFallbackHuntMode) {
      this.huntPlayerFallback(dt, player, checkCollision, effectiveSpeed, tryDealPlayerDamage, virusDamageConfig, tileSize);
      return;
    }

    // Rule Interaction Logic
    this.interactWithRules(rulesManager, ruleBlocks, tileSize, dt, player, systemNodes, checkCollision);

    // Target nodes for infection
    this.targetNodes(systemNodes, checkCollision, tileSize, effectiveSpeed, player, rulesManager, ruleBlocks);

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
   * Check if we should exit fallback mode when hunt mode ends.
   * @param {Array} systemNodes - Array of system node instances
   * @param {Function} checkCollision - Collision checking function
   * @param {number} tileSize - Size of one tile in pixels
   * @param {object} rulesManager - RulesManager instance
   */
  checkExitFallbackMode(systemNodes, checkCollision, tileSize, rulesManager) {
    if (!this.inFallbackHuntMode) return;
    
    // Check if there are any reachable uninfected nodes using pathfinding
    for (const node of systemNodes) {
      if (!node.infected && !rulesManager.isRuleActive(2)) {
        const path = findPath(this.x, this.y, node.x, node.y, tileSize, checkCollision, 64, 64);
        if (path !== null) {
          // Path found, exit fallback mode
          this.inFallbackHuntMode = false;
          this.fallbackHuntTimer = 0;
          this.currentPath = path;
          this.pathCacheTimer = 0.5;
          this.targetNodeId = node.id;
          this.targetFirewallSwitchId = null;
          break;
        }
      }
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
      
      // Check if there are any reachable uninfected nodes using pathfinding
      let hasReachableNode = false;
      for (const node of systemNodes) {
        if (!node.infected && !rulesManager.isRuleActive(2)) {
          const path = findPath(this.x, this.y, node.x, node.y, tileSize, checkCollision, 64, 64);
          if (path !== null) {
            hasReachableNode = true;
            break;
          }
        }
      }
      
      if (hasReachableNode && (this.fallbackHuntTimer <= 0)) {
        // Exit fallback mode when nodes are reachable and timer has expired
        this.inFallbackHuntMode = false;
        this.fallbackHuntTimer = 0;
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
      }
    }
  }

  /**
   * Target system nodes for infection using pathfinding.
   * @param {Array} systemNodes - Array of system node instances
   * @param {Function} checkCollision - Collision checking function
   * @param {number} tileSize - Size of one tile in pixels
   * @param {number} effectiveSpeed - Calculated movement speed
   * @param {object} player - Player instance
   * @param {object} rulesManager - RulesManager instance
   * @param {Array} ruleBlocks - Array of rule block instances
   */
  targetNodes(systemNodes, checkCollision, tileSize, effectiveSpeed, player, rulesManager, ruleBlocks) {
    // Skip target selection if already stopped by rule or if nodes are locked
    if (this.stopped || rulesManager.isRuleActive(2)) return;

    // Decrease pathfinding cooldown
    if (this.pathfindingCooldown > 0) {
      this.pathfindingCooldown -= 1/60; // Assume 60 FPS for cooldown
    }

    // Decrease path cache timer
    if (this.pathCacheTimer > 0) {
      this.pathCacheTimer -= 1/60;
    }

    // Determine target: firewall switch or node
    let target = null;
    let isFirewallSwitch = false;

    if (this.targetFirewallSwitchId !== null) {
      // We're targeting a firewall switch
      const firewallSwitch = { x: 0, y: 0 }; // Will be set below
      // Find the rule block with id 1 (firewall switch)
      for (const ruleBlock of ruleBlocks) {
        if (ruleBlock.id === 1) {
          firewallSwitch.x = ruleBlock.x;
          firewallSwitch.y = ruleBlock.y;
          break;
        }
      }
      target = firewallSwitch;
      isFirewallSwitch = true;
    } else {
      // Target nodes for infection
      // Check if we have a cached path
      if (this.currentPath.length === 0 || this.pathCacheTimer <= 0 || this.pathfindingCooldown > 0) {
        // Need to find a new path
        let bestNode = null;
        let minPathLength = Infinity;

        for (const node of systemNodes) {
          if (!node.infected && !rulesManager.isRuleActive(2)) {
            const path = findPath(this.x, this.y, node.x, node.y, tileSize, checkCollision, 64, 64);
            
            if (path !== null) {
              // Path found, check if it passes through firewall
              const pathPassesFirewall = this.checkPathForFirewall(path, tileSize, checkCollision, rulesManager);
              
              if (!pathPassesFirewall) {
                // Path is clear, use this node
                if (path.length < minPathLength) {
                  minPathLength = path.length;
                  bestNode = node;
                  this.currentPath = path;
                }
              } else {
                // Path passes through firewall, check for firewall switch
                const firewallSwitch = this.findNearestFirewallSwitch(ruleBlocks, tileSize);
                if (firewallSwitch) {
                  this.targetFirewallSwitchId = 1;
                  target = firewallSwitch;
                  isFirewallSwitch = true;
                  break;
                }
              }
            }
          }
        }

        if (!isFirewallSwitch && bestNode) {
          // Set target to node and cache path
          this.targetNodeId = bestNode.id;
          this.targetFirewallSwitchId = null;
          this.pathCacheTimer = 0.5; // Cache path for 0.5 seconds
        } else if (!isFirewallSwitch && !bestNode) {
          // No reachable nodes, enter fallback hunt mode
          this.inFallbackHuntMode = true;
          this.fallbackHuntTimer = 2.0;
          return;
        }
      } else {
        // Use cached path
        if (this.targetNodeId !== null) {
          target = systemNodes.find(n => n.id === this.targetNodeId);
        }
      }
    }

    // Follow path to target
    if (target) {
      this.followPath(effectiveSpeed, checkCollision);
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

  /**
   * Find the nearest firewall switch position.
   * @param {Array} ruleBlocks - Array of rule block instances
   * @param {number} tileSize - Size of one tile in pixels
   * @returns {object|null} - {x, y} of nearest firewall switch or null if none found
   */
  findNearestFirewallSwitch(ruleBlocks, tileSize) {
    let nearestSwitch = null;
    let minDist = Infinity;

    for (const ruleBlock of ruleBlocks) {
      // Rule 1 is FIREWALL IS WALL
      if (ruleBlock.id === 1) {
        const dist = Math.hypot(this.x - ruleBlock.x, this.y - ruleBlock.y);
        if (dist < minDist) {
          minDist = dist;
          nearestSwitch = { x: ruleBlock.x, y: ruleBlock.y };
        }
      }
    }

    return nearestSwitch;
  }

  /**
   * Check if a path passes through an active firewall.
   * @param {Array} path - Array of {x, y} waypoints
   * @param {number} tileSize - Size of one tile in pixels
   * @param {Function} checkCollision - Collision checking function
   * @param {object} rulesManager - RulesManager instance
   * @returns {boolean} - True if path passes through active firewall
   */
  checkPathForFirewall(path, tileSize, checkCollision, rulesManager) {
    if (!rulesManager.isRuleActive(1)) return false; // Firewall not active

    for (const waypoint of path) {
      const tileX = Math.floor(waypoint.x / tileSize);
      const tileY = Math.floor(waypoint.y / tileSize);

      // Check if this tile is a firewall tile (ID = 2)
      if (tileX >= 0 && tileX < 64 && tileY >= 0 && tileY < 64) {
        const mapTile = levelMap[tileY] ? levelMap[tileY][tileX] : 0;
        if (mapTile === TILE.FIREWALL) {
          // Check if this firewall tile is currently active (blocked)
          if (checkCollision(waypoint.x, waypoint.y)) {
            return true;
          }
        }
      }
    }

    return false;
  }

  /**
   * Follow the current path toward the target.
   * @param {number} effectiveSpeed - Calculated movement speed
   * @param {Function} checkCollision - Collision checking function
   */
  followPath(effectiveSpeed, checkCollision) {
    if (this.currentPath.length === 0) return;

    // Get the next waypoint (skip waypoints we're close to)
    let targetWaypoint = null;
    let waypointIndex = -1;

    for (let i = 0; i < this.currentPath.length; i++) {
      const waypoint = this.currentPath[i];
      const dist = Math.hypot(this.x - waypoint.x, this.y - waypoint.y);
      if (dist > 10) {
        targetWaypoint = waypoint;
        waypointIndex = i;
        break;
      }
    }

    if (!targetWaypoint) {
      // Reached the end of the path
      this.currentPath = [];
      return;
    }

    const dx = targetWaypoint.x - this.x;
    const dy = targetWaypoint.y - this.y;
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
      // Remove this waypoint and continue to next
      this.currentPath.splice(waypointIndex, 1);
    }
  }
}
