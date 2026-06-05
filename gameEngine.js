/**
 * Akira - Neural Link (v1.11)
 * gameEngine.js - Game Loop & State. Orchestrates update/render loop and win/lose conditions
 * 
 * Central orchestrator that calls Player, AI, Rules, and Renderer
 */

"use strict";

// Import configuration
import { CANVAS_WIDTH, CANVAS_HEIGHT, TILE_SIZE, COLORS, TILE, RULES, VIRUS_DAMAGE_CONFIG, CAPTURE_CONFIG, CLEANING_CONFIG, INFECTION_EFFECTS_CONFIG, HEALING_CONFIG, MOUSE_SENSITIVITY, FALSE_ALERT_CONFIG } from './config.js';
import { levelMap } from './mapData.js';

// Import classes
import Player from './player.js';
import Virus from './virus.js';
import SystemNode from './node.js';
import RulesManager from './rulesManager.js';
import Renderer from './renderer.js';
import InputHandler from './inputHandler.js';

/**
 * GameEngine class - Main game loop and state management
 * Orchestrates all game systems: Player, AI, Rules, Renderer
 */
export default class GameEngine {
  /**
   * @param {HTMLCanvasElement} canvas - Main game canvas
   * @param {HTMLCanvasElement} radarCanvas - Mini-map radar canvas
   */
  constructor(canvas, radarCanvas) {
    this.canvas = canvas;
    this.radarCanvas = radarCanvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    
    // Game state
    this.gameRunning = false;
    this.isPaused = false;
    this.lastTime = 0;
    this.deltaTime = 0;
    
    // Systems
    this.inputHandler = new InputHandler();
    this.renderer = new Renderer(canvas, radarCanvas);
    
    // Set up pointer lock change listener
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement !== canvas) {
        // Pointer was released (e.g., Escape key pressed or clicked outside)
        this.isPaused = true;
        // Show the help overlay when pointer is released
        const overlay = document.getElementById('helpOverlay');
        if (overlay) {
          overlay.style.display = 'block';
        }
      }
    });
    
    // Entities (will be initialized in startGame)
    this.player = null;
    this.viruses = [];
    this.systemNodes = [];
    this.ruleBlocks = [];
    this.rulesManager = null;
    
    // Keys for input handling
    this.keys = {};
  }

  /**
   * Initialize all game entities and state
   */
  initializeGame() {
    // Initialize player first (so we can pass it to rules manager)
    this.player = new Player(60, 4, Math.PI / 2);
    
    // Initialize rules manager (passes player for shared state)
    this.rulesManager = new RulesManager(RULES, this.player);
    
    // Initialize viruses
    this.viruses = [
      new Virus(2, 3 * TILE_SIZE, 1.5 * TILE_SIZE, 48),
      new Virus(2, 62 * TILE_SIZE, 30 * TILE_SIZE, 48),  // Changed from 20 to 21 to avoid FIREWALL tile
      new Virus(62, 62 * TILE_SIZE, 45 * TILE_SIZE, 48)   // Changed from 40 to 42 to avoid TUTORIAL_WALL and ALTERNATE_WALL tiles
    ];
    
    // Initialize system nodes
    this.systemNodes = [
      new SystemNode(0, "Motor Control", 58 * TILE_SIZE, 40 * TILE_SIZE, COLORS.NEON_PINK, "MOTOR FAILURE"),
      new SystemNode(1, "Visual Processor", 21 * TILE_SIZE, 32 * TILE_SIZE, COLORS.YELLOW, "VISUAL DISTORTION"),
      new SystemNode(2, "Auditory Processing", 15 * TILE_SIZE, 52 * TILE_SIZE, COLORS.CYAN, "PHANTOM SIGNALS"),
      new SystemNode(3, "Neural Link", 35 * TILE_SIZE, 41 * TILE_SIZE, COLORS.MAGENTA, "COGNITIVE DELAY"),
      new SystemNode(4, "Life Support", 62 * TILE_SIZE, 3 * TILE_SIZE, COLORS.LIME_GREEN, "LIFE SUPPORT FAILURE")
    ];
    
    // Initialize rule blocks
    this.ruleBlocks = [
      { id: 1, x: 3.5 * TILE_SIZE, y: 10.5 * TILE_SIZE, acquiredByPlayer: true },
      { id: 2, x: 15 * TILE_SIZE, y: 20 * TILE_SIZE, acquiredByPlayer: true },
      { id: 3, x: 25 * TILE_SIZE, y: 30 * TILE_SIZE, acquiredByPlayer: true },
      { id: 4, x: 35 * TILE_SIZE, y: 40 * TILE_SIZE, acquiredByPlayer: true },
      { id: 5, x: 45 * TILE_SIZE, y: 50 * TILE_SIZE, acquiredByPlayer: true }
    ];
    
    // Initialize player state
    this.initializePlayerState();
  }

  /**
   * Initialize player state at game start
   */
  initializePlayerState() {
    // RulesManager handles toggleStates, durationTimers, lastActivationTime initialization
    
    // Start with firewalls ON and a cooldown
    this.player.toggleStates[1] = true;
    this.player.toggleStates['cooldown_1'] = 5;

    // All rules are initially acquired by player
    this.player.acquiredRules = RULES.map(rule => rule.id);

    this.player.lastDamageTime = Date.now() / 1000;
    this.player.carryingVirusId = null;
    this.player.isQuarantining = false;
    this.player.quarantineProgress = 0;
    this.player.captureReadyTime = 0;
    this.player.huntModeActive = false;
    this.player.huntWarningTimer = 0;

    // Initialize cleaning state
    this.player.isCleaningNode = false;
    this.player.cleaningTargetNodeId = null;
    this.player.cleaningProgress = 0;
    this.player.cleaningStartPosition = { x: 0, y: 0 };

    // Initialize infection states
    this.player.infectionStates = {
      motorControl: false,
      visualProcessor: false,
      auditoryProcessing: false,
      neuralLink: false,
      lifeSupport: false
    };
    this.player.activeInfectionEffects = 0;
  }

  /**
   * Start the game
   */
  startGame() {
    document.getElementById('startScreen').style.display = 'none';
    this.initializeGame();
    this.gameRunning = true;
    this.isPaused = false;
    this.lastTime = performance.now();
    
    // Auto-request pointer lock on game start
    this.inputHandler.requestPointerLock(this.canvas);
    
    requestAnimationFrame((currentTime) => this.gameLoop(currentTime));
  }

  /**
   * Main game loop
   * @param {number} currentTime - Current timestamp
   */
  gameLoop(currentTime) {
    if (!this.gameRunning || this.isPaused) return;

    this.deltaTime = (currentTime - this.lastTime) / 1000;
    if (this.deltaTime > 0.1) this.deltaTime = 0.1;

    this.update(this.deltaTime);
    this.render();

    this.lastTime = currentTime;
    requestAnimationFrame((time) => this.gameLoop(time));
  }

  /**
   * Update all game systems
   * @param {number} dt - Delta time in seconds
   */
  update(dt) {
    // 1. Reset player state for the current frame
    this.player.speedMultiplier = 1.0;

    // 2. Update rules
    this.rulesManager.update(dt);

    // 3. Apply rule effects
    this.applyRuleEffects();

    // 4. Apply node infection effects
    this.applyNodeInfectionEffects(dt);

    // 4a. Update false proximity alerts (Auditory Processing debuff)
    this.updateFalseAlerts(dt);

    // 5. Handle input
    this.handleInput(dt);

    // 6. Check rule acquisition
    this.checkRuleAcquisition();

    // 7. Update virus AI
    this.updateVirusAI(dt);

    // 7a. Update node infection progress after viruses move
    this.systemNodes.forEach(node => node.update(dt, this.viruses, this.rulesManager.isRuleActive(2)));

    // 8. Check capture cooldown reduction
    this.checkCaptureCooldownReduction();

    // 9. Update hunt mode
    this.updateHuntMode(dt);

    // 10. Update quarantine sequence
    this.updateQuarantineSequence(dt);

    // 11. Update infection cleaning
    this.updateInfectionCleaning(dt);

    // 12. Check healing sources
    this.checkHealingSources(dt);

    // 13. Check win/lose conditions
    this.checkWinLoseConditions();

    // 14. Update HUD
    this.updateHUD();
  }

  /**
   * Render all game systems
   */
  render() {
    // Get current infection states
    const infectionStates = this.player.infectionStates;
    const nodesLocked = this.rulesManager.isRuleActive(2);

    // Render everything
    this.renderer.render(
      this.player,
      this.viruses,
      this.systemNodes,
      levelMap,
      infectionStates,
      nodesLocked
    );
  }

  /**
   * Apply rule effects to game state
   */
  applyRuleEffects() {
    RULES.forEach(rule => {
      const isActive = rule.type === "TOGGLE" ? this.player.toggleStates[rule.id] : (this.player.durationTimers[rule.id] > 0);

      // Reset virus specific effects each frame
      this.viruses.forEach(virus => {
        virus.stopped = false;
        virus.slowed = false;
      });

      if (!isActive) return;

      switch (rule.id) {
        case 1:
          // FIREWALL IS WALL: Handled in checkCollision
          break;
        case 2:
          // NODES ARE LOCKED: Handled in applyNodeInfectionEffects and checkStartCleaning
          break;
        case 3:
          // VIRUS IS STOP
          this.viruses.forEach(virus => virus.stopped = true);
          this.checkPlayerNearStoppedViruses();
          break;
        case 4:
          // VIRUS IS SLOW
          this.viruses.forEach(virus => virus.slowed = true);
          break;
        case 5:
          // COOLANT IS SAFE: Handled in checkHealingSources
          break;
      }
    });
  }

  /**
   * Update false proximity alerts (Auditory Processing debuff)
   * @param {number} dt - Delta time in seconds
   */
  updateFalseAlerts(dt) {
    const auditoryProcessingInfected = this.player.infectionStates?.auditoryProcessing;
    const nodesLocked = this.rulesManager.isRuleActive(2);

    // Only run the timer when Auditory Processing is infected AND Rule 2 is NOT active
    if (!auditoryProcessingInfected || nodesLocked) {
      this.player.falseAlertActive = false;
      this.player.falseAlertScreenX = null;
      this.player.falseAlertScreenY = null;
      return;
    }

    // When falseAlertTimer <= 0: activate a fake alert
    if (this.player.falseAlertTimer <= 0) {
      this.player.falseAlertActive = true;
      // Reset timer to random value between 4-8 seconds
      this.player.falseAlertTimer = FALSE_ALERT_CONFIG.MIN_INTERVAL + 
        Math.random() * (FALSE_ALERT_CONFIG.MAX_INTERVAL - FALSE_ALERT_CONFIG.MIN_INTERVAL);
      // Reset screen position for new alert
      this.player.falseAlertScreenX = null;
      this.player.falseAlertScreenY = null;
    }

    // When falseAlertActive and timer > 0: countdown
    if (this.player.falseAlertActive) {
      this.player.falseAlertTimer -= dt;
      if (this.player.falseAlertTimer <= 0) {
        this.player.falseAlertActive = false;
        this.player.falseAlertScreenX = null;
        this.player.falseAlertScreenY = null;
      }
    }
  }

  /**
   * Apply infection effects from all infected nodes
   * @param {number} dt - Delta time in seconds
   */
  applyNodeInfectionEffects(dt) {
    let motorControlInfected = false;
    let visualProcessorInfected = false;
    let auditoryProcessingInfected = false;
    let neuralLinkInfected = false;
    let lifeSupportInfected = false;
    let activeEffectCount = 0;

    this.systemNodes.forEach(node => {
      // Locked nodes (Rule 2) don't apply effects even if infected!
      if (!node.infected || this.rulesManager.isRuleActive(2)) return;

      switch (node.id) {
        case 0:
          motorControlInfected = true;
          activeEffectCount++;
          break;
        case 1:
          visualProcessorInfected = true;
          activeEffectCount++;
          break;
        case 2:
          auditoryProcessingInfected = true;
          activeEffectCount++;
          break;
        case 3:
          neuralLinkInfected = true;
          activeEffectCount++;
          break;
        case 4:
          lifeSupportInfected = true;
          activeEffectCount++;
          break;
      }
    });

    // Store infection states for use in other functions
    this.player.infectionStates = {
      motorControl: motorControlInfected,
      visualProcessor: visualProcessorInfected,
      auditoryProcessing: auditoryProcessingInfected,
      neuralLink: neuralLinkInfected,
      lifeSupport: lifeSupportInfected
    };

    // Apply Motor Control effect (50% speed reduction)
    if (motorControlInfected) {
      this.player.speedMultiplier *= INFECTION_EFFECTS_CONFIG.MOTOR_CONTROL_SPEED_MULTIPLIER;
    }

    // Apply Life Support effect (health drain over time)
    if (lifeSupportInfected) {
      const healthDrain = INFECTION_EFFECTS_CONFIG.LIFE_SUPPORT_HEALTH_DRAIN_RATE * dt;
      this.player.health -= healthDrain;

      // Prevent negative health
      if (this.player.health < 0) this.player.health = 0;
    }

    // Reset false alert timer when Auditory Processing becomes infected
    if (auditoryProcessingInfected && !this.rulesManager.isRuleActive(2)) {
      if (this.player.falseAlertTimer <= 0) {
        this.player.falseAlertTimer = FALSE_ALERT_CONFIG.MIN_INTERVAL + 
          Math.random() * (FALSE_ALERT_CONFIG.MAX_INTERVAL - FALSE_ALERT_CONFIG.MIN_INTERVAL);
      }
    }

    // Store active effect count for HUD display
    this.player.activeInfectionEffects = activeEffectCount;
  }

  /**
   * Handle player input
   * @param {number} dt - Delta time in seconds
   */
  handleInput(dt) {
    const moveSpeed = this.player.speed * (this.player.speedMultiplier || 1.0) * dt;
    let movingForwardDirection = 0;
    let strafeDirection = 0;
    let turnLeft = false;
    let turnRight = false;

    // Forward/backward movement
    if (this.keys['w'] === true || this.keys['W'] === true || this.keys['ArrowUp'] === true) {
      movingForwardDirection = 1;
    } else if (this.keys['s'] === true || this.keys['S'] === true || this.keys['ArrowDown'] === true) {
      movingForwardDirection = -1;
    }

    // Strafe left/right
    if (this.keys['a'] === true || this.keys['A'] === true) {
      strafeDirection = -1;
    } else if (this.keys['d'] === true || this.keys['D'] === true) {
      strafeDirection = 1;
    }

    // Turning
    if (this.keys['ArrowLeft'] === true || this.keys['q'] === true || this.keys['Q'] === true) {
      turnLeft = true;
    }
    if (this.keys['e'] === true || this.keys['E'] === true || this.keys['ArrowRight'] === true) {
      turnRight = true;
    }

    // Restrict forward/backward movement during quarantine or cleaning
    if (this.player.isQuarantining || this.player.isCleaningNode) {
      movingForwardDirection = 0;
      strafeDirection = 0;
    }

    // Apply turning
    if (turnLeft) this.player.angle -= this.player.turnSpeed * dt;
    if (turnRight) this.player.angle += this.player.turnSpeed * dt;

    // Apply mouse look rotation
    const mouseRotation = this.inputHandler.getMouseDelta() * MOUSE_SENSITIVITY;
    this.player.angle += mouseRotation;

    // Normalize angle to [0, 2π) to prevent floating-point drift
    this.player.angle = this.player.angle % (2 * Math.PI);
    if (this.player.angle < 0) this.player.angle += 2 * Math.PI;

    let dx = 0;
    let dy = 0;

    // Calculate forward/backward movement
    if (movingForwardDirection !== 0) {
      const forwardX = Math.cos(this.player.angle);
      const forwardY = Math.sin(this.player.angle);
      dx += forwardX * moveSpeed * movingForwardDirection;
      dy += forwardY * moveSpeed * movingForwardDirection;
    }

    // Calculate strafing movement
    if (strafeDirection !== 0) {
      const strafeX = Math.cos(this.player.angle + Math.PI / 2);
      const strafeY = Math.sin(this.player.angle + Math.PI / 2);
      dx += strafeX * moveSpeed * strafeDirection;
      dy += strafeY * moveSpeed * strafeDirection;
    }

    // Move player if there's any calculated movement
    if (dx !== 0 || dy !== 0) {
      this.movePlayer(dx, dy);
    }

    // Handle rule activation keys (1-5 for player)
    for (let i = 1; i <= RULES.length; i++) {
      if (this.keys[String(i)] === true) {
        this.rulesManager.activateRule(i, 'player', this.systemNodes);
      }
    }
  }

  /**
   * Move player with collision detection
   * @param {number} dx - X movement delta
   * @param {number} dy - Y movement delta
   */
  movePlayer(dx, dy) {
    const newX = this.player.x + dx;
    const newY = this.player.y + dy;

    if (!this.checkCollision(newX, this.player.y)) {
      this.player.x = newX;
    }
    if (!this.checkCollision(this.player.x, newY)) {
      this.player.y = newY;
    }
  }

  /**
   * Check collision with map tiles
   * @param {number} x - X position to check
   * @param {number} y - Y position to check
   * @returns {boolean} True if collision detected
   */
  checkCollision(x, y) {
    const tileX = Math.floor(x / TILE_SIZE);
    const tileY = Math.floor(y / TILE_SIZE);

    if (tileX < 0 || tileX >= levelMap[0].length || tileY < 0 || tileY >= levelMap.length) {
      return true;
    }

    const tileType = levelMap[tileY][tileX];
    let isWall = false;

    switch (tileType) {
      case TILE.WALL:
      case TILE.TUTORIAL_WALL:
        isWall = true;
        break;
      case TILE.FIREWALL:
        isWall = this.player.toggleStates[1]; // Rule 1: FIREWALL IS WALL
        break;
    }

    return isWall;
  }

  /**
   * Check rule acquisition (placeholder for future expansion)
   */
  checkRuleAcquisition() {
    // All rules are acquired from the start now
  }

  /**
   * Update virus AI
   * @param {number} dt - Delta time in seconds
   */
  updateVirusAI(dt) {
    this.viruses.forEach(virus => {
      virus.update(
        dt,
        this.player,
        this.rulesManager,
        this.systemNodes,
        this.ruleBlocks,
        (x, y) => this.checkCollision(x, y),
        (virus) => this.tryDealPlayerDamage(virus),
        this.player.huntModeActive,
        CAPTURE_CONFIG,
        VIRUS_DAMAGE_CONFIG,
        TILE_SIZE
      );
    });
  }

  /**
   * Check if there's a clear line of sight between two points
   * @param {number} x1 - Start X
   * @param {number} y1 - Start Y
   * @param {number} x2 - End X
   * @param {number} y2 - End Y
   * @returns {boolean} True if line of sight is clear
   */
  hasLineOfSight(x1, y1, x2, y2) {
    const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1)) / 10;
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const checkX = x1 + (x2 - x1) * t;
      const checkY = y1 + (y2 - y1) * t;
      const tileX = Math.floor(checkX / TILE_SIZE);
      const tileY = Math.floor(checkY / TILE_SIZE);

      if (tileX < 0 || tileX >= levelMap[0].length || tileY < 0 || tileY >= levelMap.length) {
        return true;
      }

      const tileType = levelMap[tileY][tileX];
      if (tileType === TILE.WALL || tileType === TILE.TUTORIAL_WALL || (tileType === TILE.FIREWALL && this.player.toggleStates[1] === true)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Check if there's a specific tile type blocking line of sight
   * @param {number} x1 - Start X
   * @param {number} y1 - Start Y
   * @param {number} x2 - End X
   * @param {number} y2 - End Y
   * @param {number} tileToCheck - Tile type to check for
   * @param {boolean} isRuleActive - Whether the rule is active
   * @returns {boolean} True if line of sight is blocked by the specific tile
   */
  checkLineOfSightForSpecificTile(x1, y1, x2, y2, tileToCheck, isRuleActive) {
    if (!isRuleActive) return false;

    const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1)) / 10;
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const checkX = x1 + (x2 - x1) * t;
      const checkY = y1 + (y2 - y1) * t;
      const tileX = Math.floor(checkX / TILE_SIZE);
      const tileY = Math.floor(checkY / TILE_SIZE);

      if (tileX < 0 || tileX >= levelMap[0].length || tileY < 0 || tileY >= levelMap.length) {
        continue;
      }

      const tileType = levelMap[tileY][tileX];
      if (tileType === tileToCheck) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if player is near stopped viruses (Rule 3 effect)
   */
  checkPlayerNearStoppedViruses() {
    let nearVirus = false;
    const isVirusStopActive = this.player.durationTimers[3] > 0;

    if (isVirusStopActive) {
      this.viruses.forEach(virus => {
        if (virus.stopped) {
          const dist = Math.hypot(this.player.x - virus.x, this.player.y - virus.y);
          if (dist < TILE_SIZE * 3) nearVirus = true;
        }
      });

      if (nearVirus) {
        this.player.speedMultiplier *= 0.6;
      }
    }
  }

  /**
   * Try to deal damage to player
   * @param {object} attackingVirus - The virus attempting to deal damage
   * @returns {boolean} True if damage was dealt
   */
  tryDealPlayerDamage(attackingVirus) {
    const currentTime = Date.now() / 1000;

    // Check Rule 3: VIRUS IS STOP
    if (attackingVirus.stopped) {
      return false;
    }

    // Player damage cooldown
    const timeSinceLastDamage = currentTime - this.player.lastDamageTime;
    if (timeSinceLastDamage < VIRUS_DAMAGE_CONFIG.PLAYER_COOLDOWN) {
      return false;
    }

    let damageToDeal = VIRUS_DAMAGE_CONFIG.DAMAGE_PER_HIT;

    // Check Rule 4: VIRUS IS SLOW - reduces damage rate
    if (attackingVirus.slowed) {
      damageToDeal *= 0.5;
    }

    if (this.player.health > 0) {
      this.player.health -= damageToDeal;
      this.player.lastDamageTime = currentTime;
      return true;
    }

    return false;
  }

  /**
   * Check capture cooldown reduction
   */
  checkCaptureCooldownReduction() {
    if (this.player.captureReadyTime <= 0) return;

    const tileX = Math.floor(this.player.x / TILE_SIZE);
    const tileY = Math.floor(this.player.y / TILE_SIZE);

    if (tileX >= 0 && tileX < levelMap[0].length && tileY >= 0 && tileY < levelMap.length) {
      const tileType = levelMap[tileY][tileX];
      if (tileType === TILE.SYSTEM_NODE) {
        this.player.captureReadyTime -= 0.1;
        if (this.player.captureReadyTime < 0) {
          this.player.captureReadyTime = 0;
        }
      }
    }
  }

  /**
   * Update hunt mode
   * @param {number} dt - Delta time in seconds
   */
  updateHuntMode(dt) {
    if (this.player.huntWarningTimer > 0 && !this.player.isQuarantining) {
      this.player.huntWarningTimer -= dt;
      if (this.player.huntWarningTimer <= 0) {
        this.player.huntModeActive = true;
      }
    }

    // If there are no viruses left and player is not carrying/quarantining, then hunt mode is truly over
    if (this.viruses.length === 0 && this.player.carryingVirusId === null && !this.player.isQuarantining) {
      this.player.huntModeActive = false;
      this.player.huntWarningTimer = 0;
    }
  }

  /**
   * Update quarantine sequence
   * @param {number} dt - Delta time in seconds
   */
  updateQuarantineSequence(dt) {
    if (!this.player.isQuarantining) return;

    const interruptDistance = CAPTURE_CONFIG.INTERRUPT_DISTANCE;
    let interrupted = false;

    this.viruses.forEach(virus => {
      const distToPlayer = Math.hypot(this.player.x - virus.x, this.player.y - virus.y);
      if (distToPlayer < interruptDistance) {
        interrupted = true;
      }
    });

    if (interrupted) {
      this.player.isQuarantining = false;
      this.player.quarantineProgress = 0;
      return;
    }

    this.player.quarantineProgress += dt * 100 / CAPTURE_CONFIG.QUARANTINE_DURATION;
    if (this.player.quarantineProgress >= 100) {
      this.completeQuarantine();
    }
  }

  /**
   * Update infection cleaning
   * @param {number} dt - Delta time in seconds
   */
  updateInfectionCleaning(dt) {
    if (!this.player.isCleaningNode) {
      this.checkStartCleaning();
      return;
    }

    const targetNode = this.systemNodes.find(n => n.id === this.player.cleaningTargetNodeId);

    if (!targetNode || !targetNode.infected || this.rulesManager.isRuleActive(2)) {
      this.cancelInfectionCleaning("Invalid target");
      return;
    }

    const interruptDistance = CLEANING_CONFIG.MOVEMENT_INTERRUPT_DISTANCE;
    let interrupted = false;
    let reason = "";

    // Check 1: Player moved too far from starting position
    const distMoved = Math.hypot(
      this.player.x - this.player.cleaningStartPosition.x,
      this.player.y - this.player.cleaningStartPosition.y
    );

    if (distMoved > interruptDistance) {
      interrupted = true;
      reason = "Movement";
    }

    // Check 2: Virus too close
    for (const virus of this.viruses) {
      const distToVirus = Math.hypot(this.player.x - virus.x, this.player.y - virus.y);
      if (distToVirus < CLEANING_CONFIG.VIRUS_INTERRUPT_DISTANCE) {
        interrupted = true;
        reason = `Virus #${virus.id + 1} proximity`;
        break;
      }
    }

    // Check 3: Player carrying virus or quarantining
    if (this.player.carryingVirusId !== null || this.player.isQuarantining) {
      interrupted = true;
      reason = "Player busy";
    }

    if (interrupted) {
      this.cancelInfectionCleaning(reason);
      return;
    }

    // Progress cleaning
    this.player.cleaningProgress += dt * 100 / CLEANING_CONFIG.CLEANUP_TIME;

    if (this.player.cleaningProgress >= 100) {
      this.completeNodeCleaning(targetNode);
    }
  }

  /**
   * Check if player should start cleaning a node
   */
  checkStartCleaning() {
    if (this.player.isQuarantining || this.player.carryingVirusId !== null) return;

    const playerTileX = Math.floor(this.player.x / TILE_SIZE);
    const playerTileY = Math.floor(this.player.y / TILE_SIZE);

    // Find infected node at player position
    let targetNode = null;

    for (const node of this.systemNodes) {
      if (!node.infected || this.rulesManager.isRuleActive(2)) continue;

      const nodeTileX = Math.floor(node.x / TILE_SIZE);
      const nodeTileY = Math.floor(node.y / TILE_SIZE);

      if (playerTileX === nodeTileX && playerTileY === nodeTileY) {
        targetNode = node;
        break;
      }
    }

    // Start cleaning if found a valid target
    if (targetNode && !this.player.isCleaningNode) {
      this.player.isCleaningNode = true;
      this.player.cleaningTargetNodeId = targetNode.id;
      this.player.cleaningProgress = 0;
      this.player.cleaningStartPosition = { x: this.player.x, y: this.player.y };
    }
  }

  /**
   * Cancel infection cleaning
   * @param {string} reason - Reason for cancellation
   */
  cancelInfectionCleaning(reason = "Cancelled") {
    const targetNode = this.systemNodes.find(n => n.id === this.player.cleaningTargetNodeId);
    const progressPct = Math.floor(this.player.cleaningProgress);

    this.player.isCleaningNode = false;
    this.player.cleaningTargetNodeId = null;
    this.player.cleaningProgress = 0;
  }

  /**
   * Complete node cleaning
   * @param {object} node - The node to clean
   */
  completeNodeCleaning(node) {
    node.infected = false;
    this.player.isCleaningNode = false;
    this.player.cleaningTargetNodeId = null;
    this.player.cleaningProgress = 0;

    this.renderer.triggerGlitchEffect();
  }

  /**
   * Check healing sources
   * @param {number} dt - Delta time in seconds
   */
  checkHealingSources(dt) {
    const lifeSupportNode = this.systemNodes.find(n => n.id === 4);
    const playerTileX = Math.floor(this.player.x / TILE_SIZE);
    const playerTileY = Math.floor(this.player.y / TILE_SIZE);

    // Life Support infection blocks ALL healing
    if (lifeSupportNode && lifeSupportNode.infected && !this.rulesManager.isRuleActive(2)) {
      return;
    }

    // Life Support healing
    if (lifeSupportNode && !lifeSupportNode.infected && !this.rulesManager.isRuleActive(2)) {
      const nodeTileX = Math.floor(lifeSupportNode.x / TILE_SIZE);
      const nodeTileY = Math.floor(lifeSupportNode.y / TILE_SIZE);

      if (playerTileX === nodeTileX && playerTileY === nodeTileY) {
        if (this.player.health < 100) {
          const healAmount = HEALING_CONFIG.LIFE_SUPPORT_HEAL_RATE * dt;
          this.player.health = Math.min(100, this.player.health + healAmount);
        }
      }
    }

    // Coolant healing (only works with Rule 5 active)
    if (playerTileX >= 0 && playerTileX < levelMap[0].length && playerTileY >= 0 && playerTileY < levelMap.length) {
      const tileType = levelMap[playerTileY][playerTileX];

      if (tileType === TILE.COOLANT && this.player.health < 100) {
        const coolantRuleActive = this.rulesManager.isRuleActive(5);
        if (coolantRuleActive) {
          this.player.health = Math.min(100, this.player.health + HEALING_CONFIG.COOLANT_HEAL_RATE * dt);
        }
      }
    }
  }

  /**
   * Check win/lose conditions
   */
  checkWinLoseConditions() {
    if (this.player.health <= 0) {
      this.gameOver("NEURAL OVERLOAD - BLUE SCREEN", COLORS.RED);
      return;
    }

    const infectedNodes = this.systemNodes.filter(n => n.infected).length;

    if (infectedNodes >= 5) {
      this.gameOver("FULL SYSTEM COMPROMISE", COLORS.RED);
      return;
    }

    const quarantinedCount = 3 - this.viruses.length;

    // Win condition: All viruses quarantined AND at most 1 node infected
    if (quarantinedCount >= 3 && infectedNodes <= 1) {
      this.gameOver("SYSTEM QUARANTINED - VICTORY", COLORS.LIME_GREEN);
    }
  }

  /**
   * Handle game over
   * @param {string} message - Game over message
   * @param {string} color - Text color
   */
  gameOver(message, color) {
    this.gameRunning = false;
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(0, 0, 0, 0.9);
      color: ${color};
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      z-index: 300;
      font-size: 48px;
      text-shadow: 0 0 20px ${color};
    `;
    overlay.innerHTML = `
      <div>${message}</div>
      <button onclick="location.reload()" style="margin-top:50px;padding:15px 40px;font-size:24px;background:${COLORS.MAGENTA};border:none;color:#fff;cursor:pointer;">RETRY</button>
    `;
    document.body.appendChild(overlay);
  }

  /**
   * Update HUD
   */
  updateHUD() {
    if (this.isPaused || !this.gameRunning) return;

    document.getElementById('healthText').textContent = Math.floor(this.player.health) + '%';
    document.getElementById('healthFill').style.width = this.player.health + '%';

    const nodesSecure = this.systemNodes.filter(n => !n.infected).length;
    document.getElementById('nodesSecureText').textContent = `${nodesSecure}/5`;

    const virusesActive = this.viruses.length;
    const virusesQuarantined = 3 - virusesActive;
    document.getElementById('virusesActiveText').textContent = `${virusesActive} (${virusesQuarantined} quarantined)`;

    this.updateInfectionEffectsHUD();
    this.updateCaptureStatusHUD();
    this.updateRuleDisplays();
  }

  /**
   * Update infection effects HUD
   */
  updateInfectionEffectsHUD() {
    const infectionContainer = document.getElementById('infectionEffectsSection');
    if (!infectionContainer) return;

    const activeEffects = this.getActiveInfectionEffects();

    if (activeEffects.length === 0) {
      infectionContainer.innerHTML = '';
      return;
    }

    let html = '<div class="infection-warning">';
    const severityClass = activeEffects.length >= 2 ? 'critical' : '';
    const severityLabel = activeEffects.length >= 2 ? '⚠️ CRITICAL SYSTEM FAILURE ⚠️' : '⚠️ INFECTION EFFECTS ACTIVE';

    html += `<div class="infection-warning-title ${severityClass}">${severityLabel}</div>`;

    activeEffects.forEach(effect => {
      const criticalClass = effect.isCritical ? 'critical' : '';
      const severityIcon = effect.isCritical ? '🔴' : '⚠️';

      html += `<div class="infection-effect-item ${criticalClass}">`;
      html += `${severityIcon} <strong>${effect.node.name}</strong>: ${effect.effectName}`;

      switch (effect.node.id) {
        case 0:
          html += ' - Movement impaired';
          break;
        case 1:
          html += ' - Visual distortion active';
          break;
        case 2:
          html += ' - Phantom signals detected';
          break;
        case 3:
          html += ' - Rules activate slowly!';
          break;
        case 4:
          html += ' - Health draining, healing blocked';
          break;
      }

      html += `</div>`;
    });

    html += `<div style="margin-top: 5px; color: #FFA500; font-size: 10px;">💡 TIP: Activate "NODES ARE LOCKED" [Rule 2] to block infection effects!</div>`;

    const lifeSupportNode = this.systemNodes.find(n => n.id === 4);
    if (lifeSupportNode && !lifeSupportNode.infected) {
      html += `<div style="margin-top: 5px; color: #00FF00; font-size: 10px;">💚 Life Support secure - stand on it to heal!</div>`;
    }

    html += '</div>';
    infectionContainer.innerHTML = html;
  }

  /**
   * Get active infection effects
   * @returns {Array} Array of active effect objects
   */
  getActiveInfectionEffects() {
    const activeEffects = [];
    this.systemNodes.forEach(node => {
      if (node.infected && !this.rulesManager.isRuleActive(2) && node.effectName) {
        let severity = "WARNING";
        let isCritical = false;

        if (this.player.activeInfectionEffects >= 2) {
          severity = "CRITICAL";
          isCritical = true;
        }

        activeEffects.push({
          node: node,
          effectName: node.effectName,
          severity: severity,
          isCritical: isCritical
        });
      }
    });
    return activeEffects;
  }

  /**
   * Update capture status HUD
   */
  updateCaptureStatusHUD() {
    let captureHTML = '<div class="rule-section"><div class="rule-title">CAPTURE STATUS:</div>';

    if (this.player.carryingVirusId !== null) {
      captureHTML += `<div class="rule-item active" style="background: rgba(255, 0, 0, 0.3);">`;
      captureHTML += `<span>CARRYING VIRUS #${this.player.carryingVirusId + 1}</span>`;
      captureHTML += `<span>[QUARANTINE TO DEPOSIT]</span></div>`;

      if (this.player.isQuarantining) {
        const progressBar = Math.floor(this.player.quarantineProgress);
        captureHTML += `<div style="margin-top: 10px;">`;
        captureHTML += `<div style="color: #FFA500; margin-bottom: 3px;">QUARANTINE PROGRESS:</div>`;
        captureHTML += `<div style="width: 100%; height: 20px; background: #333; border: 2px solid #8B00FF;">`;
        captureHTML += `<div style="width: ${progressBar}%; height: 100%; background: linear-gradient(90deg, #FFA500, #FFFF00); transition: width 0.1s;"></div>`;
        captureHTML += `</div><div style="color: #FFFF00; text-align: center; margin-top: 3px;">${progressBar}% - DO NOT MOVE!</div></div>`;
      }
    } else {
      const currentTime = Date.now() / 1000;
      const captureStatus = (currentTime >= this.player.captureReadyTime) ? 'READY TO CAPTURE [C]' : `${Math.ceil(this.player.captureReadyTime - currentTime)}s COOLDOWN`;
      const statusClass = (currentTime >= this.player.captureReadyTime) ? 'ready' : 'cooldown';

      captureHTML += `<div class="rule-item ${statusClass}">`;
      captureHTML += `<span>CAPTURE VIRUS [C]</span><span>${captureStatus}</span></div>`;
    }

    if (this.player.huntWarningTimer > 0) {
      captureHTML += `<div class="rule-item cooldown" style="background: rgba(255, 0, 0, 0.4); border: 2px solid #FF0000;">`;
      captureHTML += `<span>⚠️ HUNT MODE WARNING</span><span>${Math.ceil(this.player.huntWarningTimer)}s</span></div>`;
    } else if (this.player.huntModeActive) {
      captureHTML += `<div class="rule-item cooldown" style="background: rgba(255, 0, 0, 0.5); border: 2px solid #FF4400;">`;
      captureHTML += `<span>🔥 HUNT MODE ACTIVE!</span><span>VIRUSES ARE COMING</span></div>`;
    }

    if (this.player.isCleaningNode) {
      const targetNode = this.systemNodes.find(n => n.id === this.player.cleaningTargetNodeId);
      const progressPct = Math.floor(this.player.cleaningProgress);

      captureHTML += `<div class="rule-item active" style="background: rgba(0, 255, 0, 0.3); border: 2px solid #00FF00;">`;
      captureHTML += `<span>🧹 CLEANING ${targetNode?.name || 'NODE'}</span>`;
      captureHTML += `<span>${progressPct}% - HOLD STILL!</span></div>`;

      const nearbyVirus = this.viruses.some(v => Math.hypot(this.player.x - v.x, this.player.y - v.y) < CLEANING_CONFIG.VIRUS_INTERRUPT_DISTANCE);

      captureHTML += `<div style="margin-top: 8px;">`;
      captureHTML += `<div style="color: #00FF00; margin-bottom: 3px; font-size: 10px;">CLEANING PROGRESS:</div>`;
      captureHTML += `<div style="width: 100%; height: 16px; background: #333; border: 2px solid ${nearbyVirus ? '#FF0000' : '#8B00FF'};">`;
      const barColor = nearbyVirus ? 'linear-gradient(90deg, #FF4400, #FFFF00)' : 'linear-gradient(90deg, #00FF00, #FFFF00)';
      captureHTML += `<div style="width: ${progressPct}%; height: 100%; background: ${barColor}; transition: width 0.1s;"></div>`;
      captureHTML += `</div>`;

      if (nearbyVirus) {
        captureHTML += `<div style="color: #FF4400; text-align: center; margin-top: 3px; font-size: 10px;">⚠️ VIRUS NEARBY - CLEANING AT RISK!</div>`;
      } else {
        captureHTML += `<div style="color: #FFFF00; text-align: center; margin-top: 3px; font-size: 10px;">${progressPct}% COMPLETE</div>`;
      }
      captureHTML += `</div>`;
    }

    const pendingRules = Object.keys(this.player.pendingToggleRules).length;
    if (pendingRules > 0) {
      captureHTML += `<div class="rule-item cooldown" style="background: rgba(255, 165, 0, 0.3); border: 2px solid #FFA500;">`;
      captureHTML += `<span>⏱️ PENDING RULE ACTIVATIONS</span><span>${pendingRules} rule${pendingRules > 1 ? 's' : ''}</span></div>`;

      let timeRemainingTexts = [];
      Object.keys(this.player.pendingToggleRules).forEach(ruleId => {
        if (this.player.toggleDelayTimers[ruleId] > 0) {
          const remaining = Math.ceil(this.player.toggleDelayTimers[ruleId]);
          const ruleName = RULES.find(r => r.id === parseInt(ruleId)).name;
          timeRemainingTexts.push(`[${ruleId}] ${remaining}s`);
        }
      });

      if (timeRemainingTexts.length > 0) {
        captureHTML += `<div style="margin-top: 5px; color: #FFA500; font-size: 10px;">${timeRemainingTexts.join(' | ')}</div>`;
      }
      captureHTML += `</div>`;
    }

    captureHTML += '</div>';
    const captureContainer = document.getElementById('captureStatusSection');
    if (captureContainer) captureContainer.innerHTML = captureHTML;
  }

  /**
   * Update rule displays
   */
  updateRuleDisplays() {
    const toggleContainer = document.getElementById('toggleRules');
    const durationContainer = document.getElementById('durationRules');

    let toggleHTML = '';
    let durationHTML = '';

    RULES.forEach(rule => {
      if (!this.player.acquiredRules.includes(rule.id)) return;

      if (rule.type === "TOGGLE") {
        const isActive = this.player.toggleStates[rule.id];
        const isOnCooldown = (this.player.toggleStates[`cooldown_${rule.id}`] || 0) > 0;
        const isPending = this.player.pendingToggleRules[rule.id] !== undefined;

        toggleHTML += `<div class="rule-item ${isActive ? 'active' : ''} ${isOnCooldown ? 'cooldown' : ''} ${isPending ? 'cooldown' : ''}">`;
        toggleHTML += `<span>[${rule.id}] ${rule.name}</span>`;

        if (isPending) {
          const remainingTime = Math.ceil(this.player.toggleDelayTimers[rule.id]);
          toggleHTML += `<span>⏱️ PENDING (${remainingTime}s)</span></div>`;
        } else if (rule.id === 2 && this.player.activeInfectionEffects > 0) {
          const activeCount = this.player.activeInfectionEffects;
          toggleHTML += `<span>${isOnCooldown ? Math.ceil(this.player.toggleStates[`cooldown_${rule.id}`]) + 's CD' : (isActive ? '[ACTIVE - EFFECTS BLOCKED]' : `[INACTIVE - ${activeCount} effect${activeCount > 1 ? 's' : ''} active]`)}</span></div>`;
        } else {
          toggleHTML += `<span>${isOnCooldown ? Math.ceil(this.player.toggleStates[`cooldown_${rule.id}`]) + 's CD' : (isActive ? '[ACTIVE]' : '[INACTIVE]')}</span></div>`;
        }
      } else if (rule.type === "DURATION") {
        const timer = this.player.durationTimers[rule.id];
        let status, className;

        if (timer > 0) {
          status = `${Math.ceil(timer)}s`;
          className = 'active';
        } else if (timer < -1) {
          status = `${Math.abs(timer).toFixed(1)}s CD`;
          className = 'cooldown';
        } else {
          status = 'READY';
          className = 'ready';
        }

        durationHTML += `<div class="rule-item ${className}">`;
        durationHTML += `<span>[${rule.id}] ${rule.name}</span><span>${status}</span></div>`;
      }
    });

    toggleContainer.innerHTML = toggleHTML || '<div style="color: #8B00FF;">No toggle rules available.</div>';
    durationContainer.innerHTML = durationHTML || '<div style="color: #8B00FF;">No duration rules available.</div>';
  }

  /**
   * Handle keyboard input
   * @param {KeyboardEvent} e - Keyboard event
   */
  handleKeyDown(e) {
    this.keys[e.key] = true;

    if (e.key === 'Escape') {
      // Release pointer lock and show help overlay
      if (document.pointerLockElement === this.canvas) {
        document.exitPointerLock();
      }
      this.toggleHelp();
    }

    if (e.key.toLowerCase() === 'c' && !this.player.isQuarantining && !this.player.isCleaningNode) {
      this.attemptCapture();
    }

    if (e.key.toLowerCase() === 'v' && !this.keys['ArrowLeft'] && !this.keys['a'] && !this.keys['A']) {
      this.attemptQuarantine();
    }
  }

  /**
   * Handle key release
   * @param {KeyboardEvent} e - Keyboard event
   */
  handleKeyUp(e) {
    this.keys[e.key] = false;
  }

  /**
   * Toggle help overlay
   */
  toggleHelp() {
    const overlay = document.getElementById('helpOverlay');
    if (this.isPaused) {
      overlay.style.display = 'none';
      this.isPaused = false;
      this.gameRunning = true;
      this.lastTime = performance.now();
      
      // Re-request pointer lock when resuming (only if game is running)
      if (this.gameRunning && this.player) {
        this.inputHandler.requestPointerLock(this.canvas);
      }
      
      requestAnimationFrame((time) => this.gameLoop(time));
    } else {
      overlay.style.display = 'block';
      this.isPaused = true;
      this.gameRunning = false;
      
      // Release pointer lock when showing help
      if (document.pointerLockElement === this.canvas) {
        document.exitPointerLock();
      }
    }
  }

  /**
   * Attempt to capture a virus
   * @returns {boolean} True if capture succeeded
   */
  attemptCapture() {
    if (this.player.carryingVirusId !== null) {
      return false;
    }

    const currentTime = Date.now() / 1000;
    if (currentTime < this.player.captureReadyTime) {
      return false;
    }

    let targetVirus = null;
    let minDist = Infinity;

    this.viruses.forEach(virus => {
      const dist = Math.hypot(this.player.x - virus.x, this.player.y - virus.y);
      if (dist < CAPTURE_CONFIG.CAPTURE_RANGE && dist < minDist) {
        minDist = dist;
        targetVirus = virus;
      }
    });

    if (!targetVirus) {
      return false;
    }

    this.player.carryingVirusId = targetVirus.id;
    this.player.captureReadyTime = currentTime + CAPTURE_CONFIG.COOLDOWN_BASE;
    this.viruses.splice(this.viruses.indexOf(targetVirus), 1);

    this.startHuntModeWarning();
    this.renderer.triggerGlitchEffect();
    return true;
  }

  /**
   * Attempt to start quarantine sequence
   * @returns {boolean} True if quarantine started
   */
  attemptQuarantine() {
    if (this.player.carryingVirusId === null) {
      return false;
    }

    if (this.player.isQuarantining) {
      return false;
    }

    this.player.isQuarantining = true;
    this.player.quarantineProgress = 0;
    this.player.huntModeActive = false;
    this.player.huntWarningTimer = 0;

    this.renderer.triggerGlitchEffect();
    return true;
  }

  /**
   * Complete quarantine sequence
   */
  completeQuarantine() {
    if (this.player.carryingVirusId === null) return;

    this.player.carryingVirusId = null;
    this.player.isQuarantining = false;
    this.player.quarantineProgress = 0;
    this.player.huntWarningTimer = 0;

    this.renderer.triggerGlitchEffect();
    this.checkWinLoseConditions();
  }

  /**
   * Start hunt mode warning
   */
  startHuntModeWarning() {
    this.player.huntWarningTimer = CAPTURE_CONFIG.HUNT_WARNING_DELAY;
  }
}
