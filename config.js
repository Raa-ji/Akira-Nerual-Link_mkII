/**
 * Akira - Neural Link (v1.11)
 * config.js - All static configuration and constants
 * 
 * DO NOT MODIFY: This file contains only static configuration data
 */

/**
 * Canvas dimensions
 * Note: Internal resolution will be set dynamically in main.js
 */
export const CANVAS_WIDTH = window.innerWidth;
export const CANVAS_HEIGHT = window.innerHeight;

/**
 * Map dimensions and tile configuration
 */
export const MAP_SIZE = 64; // Safe upper bound (64x56 actual)
export const TILE_SIZE = 64;
export const MAX_DEPTH = 32;

/**
 * Raycasting configuration
 */
export const FOV = Math.PI / 3;
export const RAY_COUNT = CANVAS_WIDTH / 4;

/**
 * Color palette for the game
 */
export const COLORS = {
  BLACK: '#000000',
  YELLOW: '#F9E644',
  NEON_PINK: '#FF00FF',
  CYAN: '#00FFFF',
  MAGENTA: '#FF1493',
  ELECTRIC_BLUE: '#0080FF',
  LIME_GREEN: '#00FF00',
  PURPLE: '#8B00FF',
  RED: '#FF0000',
  ORANGE: '#FFA500',
  WHITE: '#FFFFFF',
  CONTRAST_WALL: '#8C97CF',
  DARK_PURPLE: '#595959'
};

/**
 * Virus damage configuration
 */
export const VIRUS_DAMAGE_CONFIG = {
  DAMAGE_PER_HIT: 25,
  PLAYER_COOLDOWN: 1.0,
  HITBOX_RADIUS: TILE_SIZE / 8
};

/**
 * Capture and quarantine configuration
 */
export const CAPTURE_CONFIG = {
  COOLDOWN_BASE: 500 / 8,
  COOLDOWN_NODE_BONUS: -30,
  QUARANTINE_DURATION: 200 / 8,
  HUNT_WARNING_DELAY: 5,
  CAPTURE_RANGE: TILE_SIZE * 2.5,
  INTERRUPT_DISTANCE: TILE_SIZE * 6
};

/**
 * Infection cleaning configuration
 */
export const CLEANING_CONFIG = {
  CLEANUP_TIME: 96 / 8,
  MOVEMENT_INTERRUPT_DISTANCE: TILE_SIZE * 0.75,
  VIRUS_INTERRUPT_DISTANCE: TILE_SIZE * 3
};

/**
 * Infection effects configuration
 */
export const INFECTION_EFFECTS_CONFIG = {
  MOTOR_CONTROL_SPEED_MULTIPLIER: 0.5,
  LIFE_SUPPORT_HEALTH_DRAIN_RATE: 0.0625,
  EFFECTS_STACK: true
};

/**
 * Healing configuration
 */
export const HEALING_CONFIG = {
  LIFE_SUPPORT_HEAL_RATE: 2,
  COOLANT_HEAL_RATE: 5
};

/**
 * Virus movement and damage multipliers for Rule 4 (VIRUS IS SLOW)
 */
export const VIRUS_SLOW_MOVEMENT_MULTIPLIER = 0.5;
export const VIRUS_SLOW_DAMAGE_MULTIPLIER = 0.5;
export const VIRUS_INFECTION_TIME = 4.0; // seconds for a virus to infect a node

/**
 * Rule definitions
 * Format: { id, name, type, duration, cooldown }
 */
export const RULES = [
  {
    id: 1,
    name: "FIREWALL IS WALL",
    type: "TOGGLE",
    cooldown: 48 / 8
  },
  {
    id: 2,
    name: "NODES ARE LOCKED",
    type: "TOGGLE",
    cooldown: 64 / 8
  },
  {
    id: 3,
    name: "VIRUS IS STOP",
    type: "DURATION",
    duration: 3.5,
    cooldown: 52.5
  },
  {
    id: 4,
    name: "VIRUS IS SLOW",
    type: "DURATION",
    duration: 8,
    cooldown: 320 / 8
  },
  {
    id: 5,
    name: "COOLANT IS SAFE",
    type: "DURATION",
    duration: 6,
    cooldown: 192 / 8
  }
];

/**
 * Tile type IDs
 */
export const TILE = {
  EMPTY: 0,
  WALL: 1,
  FIREWALL: 2,
  COOLANT: 3,
  RULE_BLOCK: 4,
  SYSTEM_NODE: 5,
  ALTERNATE_WALL: 6,
  TUTORIAL_WALL: 7,
  CONTRAST_WALL: 8
};