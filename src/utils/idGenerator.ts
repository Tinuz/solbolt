/**
 * Utility functions for generating unique IDs
 */

let idCounter = 0;

/**
 * Generate a unique ID using timestamp + counter + random component
 */
export function generateUniqueId(prefix: string = ''): string {
  const timestamp = Date.now();
  const counter = ++idCounter;
  const random = Math.floor(Math.random() * 10000);
  
  return `${prefix}${timestamp}_${counter}_${random}`;
}

/**
 * Generate a unique trade ID
 */
export function generateTradeId(type: 'buy' | 'sell' | 'test' = 'buy'): string {
  return generateUniqueId(`${type}_`);
}

/**
 * Generate a unique position ID
 */
export function generatePositionId(): string {
  return generateUniqueId('pos_');
}

/**
 * Reset the counter (useful for testing)
 */
export function resetIdCounter(): void {
  idCounter = 0;
}
