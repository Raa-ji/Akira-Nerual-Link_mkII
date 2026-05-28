/**
 * Akira - Neural Link (v1.11)
 * main.js - Entry point. Imports all modules, initializes the game engine, and starts the loop.
 * 
 * This is the single entry point for the ES6 module architecture.
 */

"use strict";

// Import configuration
import { CANVAS_WIDTH, CANVAS_HEIGHT, TILE_SIZE, COLORS, TILE, RULES } from './config.js';
import { levelMap } from './mapData.js';

// Import classes
import GameEngine from './gameEngine.js';

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', () => {
  // Get canvas elements
  const canvas = document.getElementById('gameCanvas');
  const radarCanvas = document.getElementById('miniMapCanvas');

  // Set canvas dimensions
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;

  // Initialize the game engine
  const gameEngine = new GameEngine(canvas, radarCanvas);

  // Set up event listeners
  document.addEventListener('keydown', (e) => gameEngine.handleKeyDown(e));
  document.addEventListener('keyup', (e) => gameEngine.handleKeyUp(e));

  // Start button handler
  document.getElementById('startButton').addEventListener('click', () => {
    gameEngine.startGame();
  });

  // Window resize handler
  window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  });

  console.log('Neural Link initialized. Ready to start.');
});
