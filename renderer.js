/**
 * Akira - Neural Link (v1.11)
 * renderer.js - Raycasting engine, sprite rendering, visual effects, and mini-map
 * 
 * Preserves all visual fidelity from the original v10 implementation
 */

"use strict";

// Import configuration constants
import { CANVAS_WIDTH, CANVAS_HEIGHT, MAP_SIZE, TILE_SIZE, MAX_DEPTH, FOV, RAY_COUNT, COLORS, TILE, RULES, VIRUS_INFECTION_TIME, FALSE_ALERT_CONFIG } from './config.js';
import { levelMap } from './mapData.js';

/**
 * Renderer class handling all canvas drawing operations
 * - Raycasting for 3D perspective
 * - Sprite rendering for nodes and viruses
 * - Visual infection effects (screen shake, RGB static)
 * - Mini-map radar rendering
 */
export default class Renderer {
  /**
   * @param {HTMLCanvasElement} canvas - Main game canvas
   * @param {HTMLCanvasElement} radarCanvas - Mini-map radar canvas
   */
  constructor(canvas, radarCanvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.radarCanvas = radarCanvas;
    this.radarCtx = radarCanvas.getContext('2d', { alpha: false });
    
    // Visual effects state
    this.shakeX = 0;
    this.shakeY = 0;
    this.shakeIntensity = 0;
    this.shakeDuration = 0;
  }

  /**
   * Main render loop - called each frame
   * @param {object} player - Player instance
   * @param {Array} viruses - Array of virus instances
   * @param {Array} systemNodes - Array of system node instances
   * @param {Array} levelMap - The 64x64 map grid
   * @param {object} infectionStates - Current infection states from player
   * @param {boolean} nodesLocked - Whether Rule 2 (NODES ARE LOCKED) is active
   */
  render(player, viruses, systemNodes, levelMap, infectionStates, nodesLocked) {
    // Clear screen with dark purple background
    this.ctx.fillStyle = COLORS.DARK_PURPLE;
    this.ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    // Render vaporwave floor gradient
    this.renderVaporwaveFloor(player);
    
    // Cast rays for 3D wall rendering
    this.castRays(player, levelMap);
    
    // Render sprites (nodes, viruses, UI indicators)
    this.renderSprites(player, viruses, systemNodes, infectionStates, nodesLocked);
    
    // Apply visual infection effects (screen shake, RGB static)
    this.applyVisualInfectionEffects(infectionStates);
    
    // Render false proximity alerts (Auditory Processing debuff)
    this.renderFalseAlerts(player, viruses);
    
    // Render mini-map radar
    this.drawMiniMap(player, levelMap, systemNodes);
  }

  /**
   * Render the vaporwave-style floor gradient with perspective grid
   * @param {object} player - Player instance for position calculation
   */
  renderVaporwaveFloor(player) {
    const w = CANVAS_WIDTH;
    const h = CANVAS_HEIGHT;
    const halfH = Math.floor(h / 2);
    
    // Create vertical gradient from dark purple to electric blue
    const gradient = this.ctx.createLinearGradient(0, halfH, 0, h);
    gradient.addColorStop(0, '#1a052e');
    gradient.addColorStop(0.3, '#2d004f');
    gradient.addColorStop(0.7, '#4d006e');
    gradient.addColorStop(1, '#6b098a');
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, halfH, w, h - halfH);
    
    // Calculate player's current tile position for grid alignment
    const currentTileX = Math.floor(player.x / TILE_SIZE);
    const currentTileZ = Math.floor(player.y / TILE_SIZE);
    
    // Draw horizontal grid lines (perspective lines)
    this.ctx.strokeStyle = '#FF1493';
    this.ctx.lineWidth = 2;
    
    for (let offset = 0; offset < MAX_DEPTH * 2; offset++) {
      const targetTileZ = currentTileZ + offset;
      if (targetTileZ < 1 || targetTileZ >= levelMap.length) continue;
      
      const zToLine = (targetTileZ * TILE_SIZE) - player.y;
      if (zToLine <= 0.5 || zToLine > MAX_DEPTH * TILE_SIZE) continue;
      
      const cameraHeight = TILE_SIZE * 0.75;
      const screenY = halfH + (cameraHeight / zToLine) * (h / 2);
      if (screenY < halfH || screenY > h) continue;
      
      const alpha = Math.max(0.2, 1 - offset / (MAX_DEPTH * 2));
      this.ctx.globalAlpha = alpha;
      this.ctx.beginPath();
      this.ctx.moveTo(0, screenY);
      this.ctx.lineTo(w, screenY);
      this.ctx.stroke();
    }
    
    // Draw vertical perspective lines (converging toward center)
    this.ctx.globalAlpha = 1;
    for (let offsetX = -12; offsetX <= 12; offsetX++) {
      if (offsetX === 0) continue;
      
      this.ctx.strokeStyle = '#00FFFF';
      this.ctx.lineWidth = 2;
      const alpha = Math.max(0.15, 1 - Math.abs(offsetX) / 14);
      this.ctx.globalAlpha = alpha;
      
      const centerX = w / 2;
      const spreadNear = offsetX * (w / 6);
      const spreadFar = offsetX * 8;
      
      this.ctx.beginPath();
      this.ctx.moveTo(centerX + spreadFar, halfH);
      this.ctx.lineTo(centerX + spreadNear, h);
      this.ctx.stroke();
    }
    
    // Draw diagonal pulse lines for vaporwave effect
    const time = Date.now() / 1000;
    const pulse = Math.sin(time * 2) * 0.1 + 0.9;
    
    this.ctx.strokeStyle = '#FF00FF';
    this.ctx.lineWidth = 1;
    this.ctx.globalAlpha = 0.3 * pulse;
    
    for (let i = -2; i <= 2; i++) {
      const centerX = w / 2 + i * 50;
      this.ctx.beginPath();
      this.ctx.moveTo(centerX, halfH);
      this.ctx.lineTo(centerX + i * 100, h);
      this.ctx.stroke();
    }
    
    this.ctx.globalAlpha = 1;
  }

  /**
   * Raycasting engine - casts rays from player position to create 3D perspective
   * @param {object} player - Player instance with position and angle
   * @param {Array} levelMap - The 64x64 map grid
   */
  castRays(player, levelMap) {
    const startAngle = player.angle - FOV / 2;
    const angleStep = FOV / RAY_COUNT;
    
    for (let i = 0; i < RAY_COUNT; i++) {
      const rayAngle = startAngle + i * angleStep;
      
      let x = player.x;
      let y = player.y;
      let dx = Math.cos(rayAngle);
      let dy = Math.sin(rayAngle);
      let distance = 0;
      let hitWall = false;
      let wallColor = COLORS.WHITE;
      
      // Ray march until we hit a wall or reach max depth
      while (distance < MAX_DEPTH * TILE_SIZE && !hitWall) {
        x += dx * 5;
        y += dy * 5;
        distance += 5;
        
        const tileX = Math.floor(x / TILE_SIZE);
        const tileY = Math.floor(y / TILE_SIZE);
        
        // Check bounds
        if (tileX < 0 || tileX >= levelMap[0].length || tileY < 0 || tileY >= levelMap.length) {
          hitWall = true;
          wallColor = COLORS.RED;
        } else {
          const tileType = levelMap[tileY][tileX];
          
          // Check for walls
          if (tileType === TILE.WALL || tileType === TILE.TUTORIAL_WALL || tileType === TILE.ALTERNATE_WALL || tileType === TILE.CONTRAST_WALL) {
            hitWall = true;
            wallColor = this.getWallColor(tileType, distance);
          } else if (tileType === TILE.FIREWALL && player.toggleStates[1]) {
            // Rule 1: FIREWALL IS WALL
            hitWall = true;
            wallColor = COLORS.YELLOW;
          }
        }
      }
      
      // Correct fish-eye effect by multiplying by cosine of angle offset
      const correctedDistance = distance * Math.cos(rayAngle - player.angle);
      const wallHeight = Math.min(CANVAS_HEIGHT, (TILE_SIZE / correctedDistance) * CANVAS_HEIGHT * 0.5);
      
      const xScreen = i * (CANVAS_WIDTH / RAY_COUNT);
      const yTop = (CANVAS_HEIGHT - wallHeight) / 2;
      const shadeFactor = Math.max(0.1, 1 - correctedDistance / (MAX_DEPTH * TILE_SIZE));
      
      // Apply shading and draw wall slice
      this.ctx.fillStyle = this.applyShade(wallColor, shadeFactor);
      this.ctx.fillRect(xScreen, yTop, CANVAS_WIDTH / RAY_COUNT + 1, wallHeight);
      
      // Add glow effect for close walls
      if (distance < TILE_SIZE * 5) {
        this.ctx.shadowBlur = 10;
        this.ctx.shadowColor = wallColor;
        this.ctx.fillRect(xScreen, yTop, CANVAS_WIDTH / RAY_COUNT + 1, wallHeight);
        this.ctx.shadowBlur = 0;
      }
    }
    
    // Draw coolant tile indicators on the floor
    this.drawCoolantIndicators(player, levelMap);
  }

  /**
   * Draw visual indicators for coolant tiles on the floor
   * @param {object} player - Player instance with position and angle
   * @param {Array} levelMap - The 64x64 map grid
   */
  drawCoolantIndicators(player, levelMap) {
    const viewDistance = MAX_DEPTH * TILE_SIZE * 0.75; // Draw within 75% of max depth
    
    // Calculate player's tile position
    const playerTileX = Math.floor(player.x / TILE_SIZE);
    const playerTileY = Math.floor(player.y / TILE_SIZE);
    
    // Draw coolant indicators in a radius around the player
    const drawRadius = 10; // tiles
    
    for (let y = -drawRadius; y <= drawRadius; y++) {
      for (let x = -drawRadius; x <= drawRadius; x++) {
        const mapY = playerTileY + y;
        const mapX = playerTileX + x;
        
        // Bounds check
        if (mapY < 0 || mapY >= levelMap.length || mapX < 0 || mapX >= levelMap[0].length) {
          continue;
        }
        
        // Check if this is a coolant tile
        if (levelMap[mapY][mapX] !== TILE.COOLANT) {
          continue;
        }
        
        // Calculate world position of this tile
        const tileWorldX = mapX * TILE_SIZE + TILE_SIZE / 2;
        const tileWorldY = mapY * TILE_SIZE + TILE_SIZE / 2;
        
        // Calculate distance from player
        const dx = tileWorldX - player.x;
        const dy = tileWorldY - player.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Skip if too far
        if (distance > viewDistance) {
          continue;
        }
        
        // Calculate angle from player to tile
        const angleToTile = Math.atan2(dy, dx);
        const angleDiff = angleToTile - player.angle;
        
        // Normalize angle to -PI to PI
        let normalizedAngle = angleDiff;
        while (normalizedAngle <= -Math.PI) normalizedAngle += Math.PI * 2;
        while (normalizedAngle > Math.PI) normalizedAngle -= Math.PI * 2;
        
        // Skip if tile is behind player
        if (Math.abs(normalizedAngle) > FOV / 2 + 0.2) {
          continue;
        }
        
        // Project to screen coordinates
        const cosAngle = Math.cos(-player.angle);
        const sinAngle = Math.sin(-player.angle);
        
        const rotatedX = dx * cosAngle - dy * sinAngle;
        const rotatedY = dx * sinAngle + dy * cosAngle;
        
        if (rotatedX <= 0) continue;
        
        const screenX = (rotatedY / rotatedX) * (CANVAS_WIDTH / (2 * Math.tan(FOV / 2))) + CANVAS_WIDTH / 2;
        const screenY = CANVAS_HEIGHT / 2;
        
        // Calculate size based on distance (smaller when farther away)
        const size = Math.max(4, 16 / (rotatedX / TILE_SIZE));
        
        // Calculate fade based on distance
        const fade = Math.max(0.2, 1 - distance / viewDistance);
        
        // Draw cyan circle
        this.ctx.save();
        this.ctx.globalAlpha = fade;
        this.ctx.fillStyle = COLORS.CYAN;
        this.ctx.shadowBlur = 10;
        this.ctx.shadowColor = COLORS.CYAN;
        
        this.ctx.beginPath();
        this.ctx.arc(screenX, screenY, size, 0, Math.PI * 2);
        this.ctx.fill();
        
        this.ctx.shadowBlur = 0;
        this.ctx.restore();
      }
    }
  }

  /**
   * Get wall color based on tile type
   * @param {number} tileType - The tile type constant
   * @param {number} distance - Distance from player
   * @returns {string} - Color hex string
   */
  getWallColor(tileType, distance) {
    switch (tileType) {
      case TILE.WALL:
        return COLORS.PURPLE;
      case TILE.TUTORIAL_WALL:
        return COLORS.NEON_PINK;
      case TILE.ALTERNATE_WALL:
        return COLORS.ELECTRIC_BLUE;
      case TILE.CONTRAST_WALL:
        return COLORS.CONTRAST_WALL;
      default:
        return COLORS.WHITE;
    }
  }

  /**
   * Apply distance-based shading to a color
   * @param {string} color - Color hex string
   * @param {number} factor - Shading factor (0.0 to 1.0)
   * @returns {string} - Darkened color string
   */
  applyShade(color, factor) {
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    return `rgb(${Math.floor(r * factor)}, ${Math.floor(g * factor)}, ${Math.floor(b * factor)})`;
  }

  /**
   * Render all sprites (nodes, viruses, UI indicators)
   * @param {object} player - Player instance
   * @param {Array} viruses - Array of virus instances
   * @param {Array} systemNodes - Array of system node instances
   * @param {object} infectionStates - Current infection states
   * @param {boolean} nodesLocked - Whether Rule 2 is active
   */
  renderSprites(player, viruses, systemNodes, infectionStates, nodesLocked) {
    // Render system nodes
    systemNodes.forEach(node => {
      const screenPos = this.projectToScreen(node.x, node.y, player);
      
      if (screenPos.visible && screenPos.z < TILE_SIZE * 10) {
        const spriteWidth = Math.max(20, 64 / screenPos.z * CANVAS_WIDTH * 0.5);
        const spriteHeight = spriteWidth;
        
        // Set color based on infection status
        this.ctx.fillStyle = node.infected ? COLORS.RED : node.color;
        this.ctx.shadowBlur = 15;
        this.ctx.shadowColor = node.infected ? COLORS.RED : node.color;
        
        // Draw pulsing effect for infected nodes
        if (node.infected && !nodesLocked) {
          const pulse = Math.sin(Date.now() / 200) * 3 + spriteWidth;
          this.ctx.fillRect(
            screenPos.x - pulse / 2,
            (CANVAS_HEIGHT - spriteHeight) / 2,
            pulse,
            spriteHeight
          );
        } else {
          this.ctx.fillRect(
            screenPos.x - spriteWidth / 2,
            (CANVAS_HEIGHT - spriteHeight) / 2,
            spriteWidth,
            spriteHeight
          );
        }
        
        // Calculate font size based on distance
        let baseFontSize = 30 / screenPos.z * CANVAS_WIDTH * 0.5;
        let fontSize = Math.max(14, Math.min(baseFontSize, 28));
        
        this.ctx.save();
        this.ctx.fillStyle = COLORS.WHITE;
        this.ctx.font = `${fontSize}px 'Courier New'`;
        this.ctx.textAlign = 'center';
        this.ctx.shadowColor = '#000000';
        this.ctx.shadowBlur = 3;
        this.ctx.shadowOffsetX = 1;
        this.ctx.shadowOffsetY = 1;
        
        // Draw node name
        const labelY = (CANVAS_HEIGHT - spriteHeight) / 2 - 8;
        this.ctx.fillText(node.name, screenPos.x, labelY);
        
        // Draw infection status
        if (node.infected) {
          const infectedFontSize = Math.max(10, Math.min(baseFontSize * 0.85, 20));
          this.ctx.fillStyle = COLORS.RED;
          this.ctx.font = `${infectedFontSize}px 'Courier New'`;
          const infectedLabelY = (CANVAS_HEIGHT + spriteHeight) / 2 + 8;
          
          if (node.effectName && !nodesLocked) {
            this.ctx.fillText(`⚠ ${node.effectName}`, screenPos.x, infectedLabelY);
          } else {
            this.ctx.fillText('⚠ INFECTED', screenPos.x, infectedLabelY);
          }
          
          // Draw cleaning progress if player is cleaning this node
          if (player.isCleaningNode && player.cleaningTargetNodeId === node.id) {
            const progressPct = Math.floor(player.cleaningProgress);
            this.ctx.fillStyle = COLORS.LIME_GREEN;
            this.ctx.font = `${infectedFontSize}px 'Courier New'`;
            const cleaningLabelY = infectedLabelY + 20;
            this.ctx.fillText(`🧹 CLEANING: ${progressPct}%`, screenPos.x, cleaningLabelY);
          }
        } else if (node.infectionProgress > 0 && !node.infected) {
          const progressPct = Math.floor((node.infectionProgress / VIRUS_INFECTION_TIME) * 100);
          const infectingFontSize = Math.max(10, Math.min(baseFontSize * 0.85, 20));
          this.ctx.fillStyle = COLORS.ORANGE;
          this.ctx.font = `${infectingFontSize}px 'Courier New'`;
          const infectingLabelY = (CANVAS_HEIGHT + spriteHeight) / 2 + 8;
          this.ctx.fillText(`⚠ INFECTING ${progressPct}%`, screenPos.x, infectingLabelY);
        } else if (nodesLocked) {
          // Draw locked indicator
          const lockedFontSize = Math.max(10, Math.min(baseFontSize * 0.85, 20));
          this.ctx.fillStyle = COLORS.CYAN;
          this.ctx.font = `${lockedFontSize}px 'Courier New'`;
          const lockedLabelY = (CANVAS_HEIGHT + spriteHeight) / 2 + 8;
          this.ctx.fillText('🔒 LOCKED', screenPos.x, lockedLabelY);
        } else if (node.id === 4 && !node.infected) {
          // Draw Life Support status
          const healFontSize = Math.max(10, Math.min(baseFontSize * 0.85, 20));
          this.ctx.fillStyle = COLORS.LIME_GREEN;
          this.ctx.font = `${healFontSize}px 'Courier New'`;
          const healLabelY = (CANVAS_HEIGHT + spriteHeight) / 2 + 8;
          
          const playerTileX = Math.floor(player.x / TILE_SIZE);
          const playerTileY = Math.floor(player.y / TILE_SIZE);
          const nodeTileX = Math.floor(node.x / TILE_SIZE);
          const nodeTileY = Math.floor(node.y / TILE_SIZE);
          
          if (playerTileX === nodeTileX && playerTileY === nodeTileY && player.health < 100) {
            this.ctx.fillText('💚 HEALING...', screenPos.x, healLabelY);
          } else {
            this.ctx.fillText('🔋 SECURE', screenPos.x, healLabelY);
          }
        }
        
        this.ctx.restore();
        this.ctx.shadowBlur = 0;
      }
    });
    
    // Render viruses
    viruses.forEach(virus => {
      const screenPos = this.projectToScreen(virus.x, virus.y, player);
      
      if (screenPos.visible && screenPos.z < TILE_SIZE * 15) {
        const spriteSize = Math.max(10, 32 / screenPos.z * CANVAS_WIDTH * 0.5);
        const pulse = Math.sin(Date.now() / 100) * 3;
        
        this.ctx.fillStyle = COLORS.RED;
        this.ctx.shadowBlur = 20;
        this.ctx.shadowColor = COLORS.RED;
        
        this.ctx.beginPath();
        this.ctx.arc(
          screenPos.x,
          screenPos.y + spriteSize / 4,
          (spriteSize / 2) + pulse,
          0,
          Math.PI * 2
        );
        this.ctx.fill();
        this.ctx.shadowBlur = 0;
      }
    });
    
    // Render virus carry indicator
    if (player.carryingVirusId !== null) {
      const pulse = Math.sin(Date.now() / 100) * 0.3 + 0.7;
      this.ctx.save();
      this.ctx.globalAlpha = pulse;
      this.ctx.fillStyle = COLORS.RED;
      this.ctx.beginPath();
      this.ctx.arc(CANVAS_WIDTH / 2, CANVAS_HEIGHT - 50, 20, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.fillStyle = COLORS.WHITE;
      this.ctx.font = '14px Courier New';
      this.ctx.textAlign = 'center';
      this.ctx.fillText('VIRUS CARRIED', CANVAS_WIDTH / 2, CANVAS_HEIGHT - 35);
      this.ctx.restore();
    }
    
    // Render node cleaning indicator
    if (player.isCleaningNode) {
      const pulse = Math.sin(Date.now() / 100) * 0.3 + 0.7;
      const progressPct = Math.floor(player.cleaningProgress);
      
      this.ctx.save();
      this.ctx.globalAlpha = pulse;
      this.ctx.strokeStyle = COLORS.LIME_GREEN;
      this.ctx.lineWidth = 4;
      
      this.ctx.beginPath();
      this.ctx.arc(
        CANVAS_WIDTH / 2,
        CANVAS_HEIGHT - 100,
        35 + Math.sin(Date.now() / 200) * 5,
        0,
        Math.PI * 2
      );
      this.ctx.stroke();
      
      const barWidth = 80;
      const barHeight = 12;
      const barX = CANVAS_WIDTH / 2 - barWidth / 2;
      const barY = CANVAS_HEIGHT - 95;
      
      this.ctx.fillStyle = '#333';
      this.ctx.fillRect(barX, barY, barWidth, barHeight);
      
      const gradient = this.ctx.createLinearGradient(barX, 0, barX + barWidth, 0);
      gradient.addColorStop(progressPct / 100, '#00FF00');
      gradient.addColorStop(progressPct / 100, '#333');
      this.ctx.fillStyle = gradient;
      this.ctx.fillRect(barX, barY, barWidth * progressPct / 100, barHeight);
      
      this.ctx.fillStyle = COLORS.LIME_GREEN;
      this.ctx.font = 'bold 14px Courier New';
      this.ctx.textAlign = 'center';
      this.ctx.fillText(`${progressPct}%`, CANVAS_WIDTH / 2, CANVAS_HEIGHT - 80);
      this.ctx.fillStyle = COLORS.WHITE;
      this.ctx.font = '12px Courier New';
      this.ctx.fillText('CLEANING NODE...', CANVAS_WIDTH / 2, CANVAS_HEIGHT - 65);
      this.ctx.restore();
    }
    
    // Render pending rule activation indicator (Neural Link delay)
    const pendingRules = Object.keys(player.pendingToggleRules).length;
    if (pendingRules > 0) {
      const pulse = Math.sin(Date.now() / 100) * 0.3 + 0.7;
      
      this.ctx.save();
      this.ctx.globalAlpha = pulse;
      this.ctx.strokeStyle = COLORS.ORANGE;
      this.ctx.lineWidth = 4;
      
      this.ctx.beginPath();
      this.ctx.arc(
        CANVAS_WIDTH / 2,
        CANVAS_HEIGHT - 150,
        30 + Math.sin(Date.now() / 200) * 3,
        0,
        Math.PI * 2
      );
      this.ctx.stroke();
      
      this.ctx.fillStyle = COLORS.ORANGE;
      this.ctx.font = 'bold 12px Courier New';
      this.ctx.textAlign = 'center';
      this.ctx.fillText(`⏱️ ${pendingRules} PENDING`, CANVAS_WIDTH / 2, CANVAS_HEIGHT - 140);
      
      if (pendingRules <= 2) {
        const ruleIds = Object.keys(player.pendingToggleRules).map(id => parseInt(id));
        this.ctx.fillStyle = COLORS.WHITE;
        this.ctx.font = '10px Courier New';
        
        let timeRemainingTexts = [];
        ruleIds.forEach(ruleId => {
          if (player.toggleDelayTimers[ruleId] > 0) {
            const remaining = Math.ceil(player.toggleDelayTimers[ruleId]);
            const ruleName = RULES.find(r => r.id === ruleId).name;
            timeRemainingTexts.push(`[${ruleId}] ${remaining}s`);
          }
        });
        
        if (timeRemainingTexts.length > 0) {
          this.ctx.fillText(timeRemainingTexts.join(' | '), CANVAS_WIDTH / 2, CANVAS_HEIGHT - 125);
        }
      }
      this.ctx.restore();
    }
  }

  /**
   * Render false proximity alerts (Auditory Processing debuff)
   * @param {object} player - Player instance
   * @param {Array} viruses - Array of virus instances
   */
  renderFalseAlerts(player, viruses) {
    if (!player.falseAlertActive) return;

    // Calculate fade alpha: start at 0.8, decay to 0 over the alert's duration
    const elapsed = FALSE_ALERT_CONFIG.DURATION - player.falseAlertTimer;
    const alpha = Math.max(0, 0.8 * (1 - elapsed / FALSE_ALERT_CONFIG.DURATION));
    
    if (alpha <= 0) return;

    // Pick a random screen position (20%–80% of screen width/height)
    // Pick once when alert starts and keep it fixed
    if (!player.falseAlertScreenX || !player.falseAlertScreenY) {
      player.falseAlertScreenX = CANVAS_WIDTH * (0.2 + Math.random() * 0.6);
      player.falseAlertScreenY = CANVAS_HEIGHT * (0.2 + Math.random() * 0.6);
    }

    // Offset toward nearest virus if any is within ~3 tiles
    let nearestVirus = null;
    let minDist = TILE_SIZE * 3;
    
    viruses.forEach(virus => {
      const dist = Math.hypot(player.x - virus.x, player.y - virus.y);
      if (dist < minDist) {
        minDist = dist;
        nearestVirus = virus;
      }
    });

    if (nearestVirus) {
      // Calculate angle from player to virus
      const dx = nearestVirus.x - player.x;
      const dy = nearestVirus.y - player.y;
      const angle = Math.atan2(dy, dx);
      
      // Shift indicator slightly in that direction (10-20% of screen width/height)
      const offsetDist = Math.min(CANVAS_WIDTH, CANVAS_HEIGHT) * 0.15;
      player.falseAlertScreenX += Math.cos(angle) * offsetDist;
      player.falseAlertScreenY += Math.sin(angle) * offsetDist;
    }

    // Draw a red pulsing dot (same visual pattern as virus sprites)
    const pulse = Math.sin(Date.now() / 100) * 3;
    const indicatorSize = 20;

    this.ctx.save();
    this.ctx.globalAlpha = alpha;
    this.ctx.fillStyle = COLORS.RED;
    this.ctx.shadowBlur = 20;
    this.ctx.shadowColor = COLORS.RED;
    
    this.ctx.beginPath();
    this.ctx.arc(
      player.falseAlertScreenX,
      player.falseAlertScreenY,
      indicatorSize + pulse,
      0,
      Math.PI * 2
    );
    this.ctx.fill();
    this.ctx.shadowBlur = 0;

    // Draw text below it: "⚠ PROXIMITY ALERT" in red, fading with alpha
    this.ctx.fillStyle = COLORS.RED;
    this.ctx.font = 'bold 16px Courier New';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('⚠ PROXIMITY ALERT', player.falseAlertScreenX, player.falseAlertScreenY + indicatorSize + 20);
    
    this.ctx.restore();
  }

  /**
   * Project 3D world coordinates to 2D screen coordinates
   * @param {number} worldX - World X position
   * @param {number} worldY - World Y position
   * @param {object} player - Player instance
   * @returns {object} - Screen coordinates and visibility
   */
  projectToScreen(worldX, worldY, player) {
    const dx = worldX - player.x;
    const dy = worldY - player.y;
    
    const cosAngle = Math.cos(-player.angle);
    const sinAngle = Math.sin(-player.angle);
    
    const rotatedX = dx * cosAngle - dy * sinAngle;
    const rotatedY = dx * sinAngle + dy * cosAngle;
    
    // Check if object is in front of player and within FOV
    if (rotatedX <= 0 || Math.abs(rotatedY / rotatedX) > Math.tan(FOV / 2)) {
      return { visible: false };
    }
    
    const z = rotatedX;
    const xScreen = (rotatedY / rotatedX) * (CANVAS_WIDTH / (2 * Math.tan(FOV / 2))) + CANVAS_WIDTH / 2;
    const yScreen = CANVAS_HEIGHT / 2;
    
    return {
      visible: true,
      x: xScreen,
      y: yScreen,
      z: z
    };
  }

  /**
   * Apply visual infection effects (screen shake, RGB static)
   * @param {object} infectionStates - Current infection states
   */
  applyVisualInfectionEffects(infectionStates) {
    if (!infectionStates) return;
    
    const visualProcessorInfected = infectionStates.visualProcessor;
    const auditoryProcessingInfected = infectionStates.auditoryProcessing;
    
    // VISUAL PROCESSOR EFFECT: Screen shake + color desaturation
    if (visualProcessorInfected) {
      const time = Date.now() / 100;
      const shakeX = Math.sin(time * 3) * 5 + Math.cos(time * 7) * 3;
      const shakeY = Math.cos(time * 2.5) * 4 + Math.sin(time * 5) * 2;
      
      this.ctx.save();
      this.ctx.translate(shakeX, shakeY);
      this.ctx.fillStyle = 'rgba(100, 100, 100, 0.15)';
      this.ctx.fillRect(-shakeX, -shakeY, CANVAS_WIDTH + shakeX * 2, CANVAS_HEIGHT + shakeY * 2);
      this.ctx.restore();
    }
    
    // AUDITORY PROCESSING EFFECT: RGB channel shift/static effect
    if (auditoryProcessingInfected && Math.random() < 0.3) {
      const imageData = this.ctx.getImageData(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      const data = imageData.data;
      
      for (let i = 0; i < data.length; i += 4) {
        if (Math.random() < 0.2) {
          // Swap R and B channels
          const tempR = data[i];
          data[i] = data[i + 2];
          data[i + 2] = tempR;
          
          if (Math.random() < 0.3) {
            // Boost a random channel
            const boostChannel = Math.floor(Math.random() * 3);
            data[i + boostChannel] = Math.min(255, data[i + boostChannel] + 80);
          }
        }
      }
      
      this.ctx.putImageData(imageData, 0, 0);
    }
  }

  /**
   * Draw the mini-map radar in the bottom-right corner
   * @param {object} player - Player instance
   * @param {Array} levelMap - The 64x64 map grid
   * @param {Array} systemNodes - Array of system node instances
   */
  drawMiniMap(player, levelMap, systemNodes) {
    if (!this.radarCanvas) return;
    
    // Clear radar canvas
    this.radarCtx.fillStyle = '#001428';
    this.radarCtx.fillRect(0, 0, this.radarCanvas.width, this.radarCanvas.height);
    
    // Calculate player's grid position
    const playerTileX = Math.floor(player.x / TILE_SIZE);
    const playerTileY = Math.floor(player.y / TILE_SIZE);
    
    // Radar view radius (tiles visible)
    const viewRadiusX = 12;
    const viewRadiusY = 5;
    
    // Center of radar canvas
    const centerX = this.radarCanvas.width / 2;
    const centerY = this.radarCanvas.height / 2;
    
    // Calculate pixel scale based on view radius
    const tileWidth = this.radarCanvas.width / (viewRadiusX * 2);
    const tileHeight = this.radarCanvas.height / (viewRadiusY * 2 + 1);
    
    // Draw visible tiles
    for (let y = -viewRadiusY; y <= viewRadiusY; y++) {
      for (let x = -viewRadiusX; x <= viewRadiusX; x++) {
        const mapY = playerTileY + y;
        const mapX = playerTileX + x;
        
        // Bounds check
        if (mapY >= 0 && mapY < levelMap.length &&
            mapX >= 0 && mapX < levelMap[0].length) {
          
          const tileType = levelMap[mapY][mapX];
          
          // Calculate screen position relative to player (center)
          const pixelX = centerX + x * tileWidth;
          const pixelY = centerY + y * tileHeight - (tileHeight / 2);
          
          const px = Math.max(0, pixelX);
          const py = Math.max(0, pixelY);
          const pw = Math.min(tileWidth, this.radarCanvas.width - px);
          const ph = Math.min(tileHeight, this.radarCanvas.height - py);
          
          // Draw based on tile type
          if (tileType === TILE.WALL || tileType === TILE.TUTORIAL_WALL || tileType === TILE.ALTERNATE_WALL || tileType === TILE.CONTRAST_WALL) {
            this.radarCtx.fillStyle = '#647895';
            if (tileType === TILE.TUTORIAL_WALL) this.radarCtx.fillStyle = '#b830c7';
            if (tileType === TILE.ALTERNATE_WALL) this.radarCtx.fillStyle = COLORS.ELECTRIC_BLUE;
            if (tileType === TILE.CONTRAST_WALL) this.radarCtx.fillStyle = COLORS.CONTRAST_WALL;
            this.radarCtx.fillRect(px, py, pw, ph);
          } else if (tileType === TILE.FIREWALL) {
            this.radarCtx.fillStyle = '#F9E644';
          } else if (tileType === TILE.SYSTEM_NODE) {
            // Find if this tile has a node and check infection status
            const node = systemNodes.find(n =>
              Math.floor(n.x / TILE_SIZE) === mapX &&
              Math.floor(n.y / TILE_SIZE) === mapY
            );
            this.radarCtx.fillStyle = node?.infected ? '#ff0000' : '#0080ff';
          } else if (tileType === TILE.COOLANT) {
            this.radarCtx.fillStyle = '#00ffff';
          } else {
            this.radarCtx.fillStyle = '#001428';
          }
          
          this.radarCtx.fillRect(px, py, pw, ph);
        }
      }
    }
    
    // Draw player indicator (arrow showing direction)
    this.radarCtx.save();
    this.radarCtx.translate(centerX, centerY);
    
    const arrowSize = 4;
    this.radarCtx.strokeStyle = '#00FF00';
    this.radarCtx.lineWidth = 1.5;
    
    // Draw crosshair point for player
    this.radarCtx.fillStyle = '#00FF00';
    this.radarCtx.beginPath();
    this.radarCtx.arc(0, 0, arrowSize / 2, 0, Math.PI * 2);
    this.radarCtx.fill();
    
    // Draw direction indicator (arrow showing facing direction)
    const arrowRadius = 6;
    
    // Calculate arrow tip position based on player angle
    // The arrow should point in the direction the player is facing
    const tipX = arrowRadius * Math.cos(player.angle);
    const tipY = arrowRadius * Math.sin(player.angle);
    
    // Calculate base points for the arrow triangle (perpendicular to facing direction)
    const baseAngle1 = player.angle + Math.PI / 2 + 0.6;
    const baseAngle2 = player.angle - Math.PI / 2 - 0.6;
    const baseRadius = 3;
    const baseX1 = baseRadius * Math.cos(baseAngle1);
    const baseY1 = baseRadius * Math.sin(baseAngle1);
    const baseX2 = baseRadius * Math.cos(baseAngle2);
    const baseY2 = baseRadius * Math.sin(baseAngle2);
    
    // Draw filled triangle pointing in player's direction
    this.radarCtx.beginPath();
    this.radarCtx.moveTo(tipX, tipY);
    this.radarCtx.lineTo(baseX1, baseY1);
    this.radarCtx.lineTo(baseX2, baseY2);
    this.radarCtx.closePath();
    this.radarCtx.fillStyle = '#00FF00';
    this.radarCtx.fill();
    
    this.radarCtx.restore();
    
    // Draw grid lines (optional but looks cool)
    this.radarCtx.strokeStyle = 'rgba(0, 255, 255, 0.1)';
    this.radarCtx.lineWidth = 1;
    
    for (let x = 0; x <= this.radarCanvas.width; x += tileWidth) {
      this.radarCtx.beginPath();
      this.radarCtx.moveTo(x, 0);
      this.radarCtx.lineTo(x, this.radarCanvas.height);
      this.radarCtx.stroke();
    }
    
    for (let y = 0; y <= this.radarCanvas.height; y += tileHeight) {
      this.radarCtx.beginPath();
      this.radarCtx.moveTo(0, y);
      this.radarCtx.lineTo(this.radarCanvas.width, y);
      this.radarCtx.stroke();
    }
  }

  /**
   * Trigger a glitch effect (screen shake with color distortion)
   */
  triggerGlitchEffect() {
    // Store shake parameters
    this.shakeIntensity = 10;
    this.shakeDuration = 0.3; // seconds
    
    // Apply immediate glitch effect
    for (let i = 0; i < 3; i++) {
      setTimeout(() => {
        const imageData = this.ctx.getImageData(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        const data = imageData.data;
        
        for (let j = 0; j < data.length; j += 4) {
          if (Math.random() < 0.1) {
            data[j] = Math.min(255, data[j] + 30); // Boost red
            data[j + 1] = Math.max(0, data[j + 1] - 30); // Reduce green
            data[j + 2] = Math.random() > 0.5 ? 255 : 0; // Random blue
          }
        }
        
        this.ctx.putImageData(imageData, 0, 0);
      }, i * 50);
    }
  }

  /**
   * Apply screen shake effect
   * @param {number} intensity - Shake intensity in pixels
   * @param {number} duration - Duration in seconds
   */
  applyScreenShake(intensity, duration) {
    this.shakeIntensity = intensity;
    this.shakeDuration = duration;
  }

  /**
   * Update and apply screen shake each frame
   * @param {number} dt - Delta time in seconds
   */
  updateScreenShake(dt) {
    if (this.shakeDuration > 0) {
      this.shakeDuration -= dt;
      
      if (this.shakeDuration > 0) {
        const time = Date.now() / 100;
        this.shakeX = Math.sin(time * 3) * this.shakeIntensity;
        this.shakeY = Math.cos(time * 2.5) * this.shakeIntensity;
        
        // Apply shake to context
        this.ctx.save();
        this.ctx.translate(this.shakeX, this.shakeY);
        this.ctx.restore();
      } else {
        this.shakeX = 0;
        this.shakeY = 0;
        this.shakeIntensity = 0;
      }
    }
  }
}
