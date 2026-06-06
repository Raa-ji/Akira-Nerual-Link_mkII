"use strict";

/**
 * Pathfinding module for the Akira - Neural Link raycasting game.
 * Implements A* pathfinding algorithm with grid-based navigation.
 */

import { TILE_SIZE, TILE } from './config.js';
import { levelMap } from './mapData.js';

/**
 * Priority Queue implementation for A* algorithm
 */
class PriorityQueue {
  constructor() {
    this.elements = [];
  }

  enqueue(element, priority) {
    this.elements.push({ element, priority });
    this.elements.sort((a, b) => a.priority - b.priority);
  }

  dequeue() {
    return this.elements.shift().element;
  }

  isEmpty() {
    return this.elements.length === 0;
  }
}

/**
 * Check if a grid position is a wall
 * @param {number} gridX - Grid X coordinate
 * @param {number} gridY - Grid Y coordinate
 * @param {number} tileSize - Size of one tile in pixels
 * @param {Function} checkCollision - Collision checking function
 * @returns {boolean} - True if position is a wall
 */
function isWall(gridX, gridY, tileSize, checkCollision) {
  const x = gridX * tileSize + tileSize / 2;
  const y = gridY * tileSize + tileSize / 2;
  return checkCollision(x, y);
}

/**
 * Calculate Manhattan distance between two grid positions
 * @param {number} x1 - Start grid X
 * @param {number} y1 - Start grid Y
 * @param {number} x2 - End grid X
 * @param {number} y2 - End grid Y
 * @returns {number} - Manhattan distance
 */
function manhattanDistance(x1, y1, x2, y2) {
  return Math.abs(x1 - x2) + Math.abs(y1 - y2);
}

/**
 * Find a path from start to target using A* algorithm
 * @param {number} startX - Start X position in pixels
 * @param {number} startY - Start Y position in pixels
 * @param {number} targetX - Target X position in pixels
 * @param {number} targetY - Target Y position in pixels
 * @param {number} tileSize - Size of one tile in pixels
 * @param {Function} checkCollision - Collision checking function
 * @param {number} mapWidth - Map width in tiles
 * @param {number} mapHeight - Map height in tiles
 * @returns {Array|null} - Array of {x, y} waypoints or null if no path found
 */
export function findPath(startX, startY, targetX, targetY, tileSize, checkCollision, mapWidth, mapHeight) {
  const startGridX = Math.floor(startX / tileSize);
  const startGridY = Math.floor(startY / tileSize);
  const targetGridX = Math.floor(targetX / tileSize);
  const targetGridY = Math.floor(targetY / tileSize);

  // Check if start or target is in a wall
  if (isWall(startGridX, startGridY, tileSize, checkCollision) ||
      isWall(targetGridX, targetGridY, tileSize, checkCollision)) {
    return null;
  }

  const openSet = new PriorityQueue();
  const closedSet = new Set();
  const cameFrom = new Map();
  const gScore = new Map();
  const fScore = new Map();

  const startKey = `${startGridX},${startGridY}`;
  const targetKey = `${targetGridX},${targetGridY}`;

  gScore.set(startKey, 0);
  fScore.set(startKey, manhattanDistance(startGridX, startGridY, targetGridX, targetGridY));
  openSet.enqueue({ x: startGridX, y: startGridY }, fScore.get(startKey));

  while (!openSet.isEmpty()) {
    const current = openSet.dequeue();
    const currentKey = `${current.x},${current.y}`;

    if (currentKey === targetKey) {
      return reconstructPath(cameFrom, current.x, current.y);
    }

    closedSet.add(currentKey);

    // Check neighbors (up, down, left, right)
    const neighbors = [
      { x: current.x + 1, y: current.y },
      { x: current.x - 1, y: current.y },
      { x: current.x, y: current.y + 1 },
      { x: current.x, y: current.y - 1 }
    ];

    for (const neighbor of neighbors) {
      // Check bounds
      if (neighbor.x < 0 || neighbor.x >= mapWidth || neighbor.y < 0 || neighbor.y >= mapHeight) {
        continue;
      }

      const neighborKey = `${neighbor.x},${neighbor.y}`;

      if (closedSet.has(neighborKey)) {
        continue;
      }

      // Check if neighbor is a wall
      if (isWall(neighbor.x, neighbor.y, tileSize, checkCollision)) {
        continue;
      }

      const tentativeG = gScore.get(currentKey) + 1;

      if (tentativeG < (gScore.get(neighborKey) ?? Infinity)) {
        cameFrom.set(neighborKey, current);
        gScore.set(neighborKey, tentativeG);
        fScore.set(neighborKey, tentativeG + manhattanDistance(neighbor.x, neighbor.y, targetGridX, targetGridY));
        
        if (!openSet.elements.some(e => e.element.x === neighbor.x && e.element.y === neighbor.y)) {
          openSet.enqueue(neighbor, fScore.get(neighborKey));
        }
      }
    }
  }

  return null; // No path found
}

/**
 * Reconstruct the path from the cameFrom map
 * @param {Map} cameFrom - Map of grid positions to their predecessors
 * @param {number} targetGridX - Target grid X
 * @param {number} targetGridY - Target grid Y
 * @returns {Array|null} - Array of {x, y} waypoints in pixels or null if no path
 */
function reconstructPath(cameFrom, targetGridX, targetGridY) {
  const path = [];
  let current = { x: targetGridX, y: targetGridY };
  
  while (current) {
    // Convert grid position to pixel center position
    path.push({
      x: current.x * TILE_SIZE + TILE_SIZE / 2,
      y: current.y * TILE_SIZE + TILE_SIZE / 2
    });
    
    const currentKey = `${current.x},${current.y}`;
    current = cameFrom.get(currentKey);
  }
  
  return path.reverse();
}
