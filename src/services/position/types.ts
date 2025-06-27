/**
 * Position Management Types
 * Based on Python implementation for autonomous trading
 */

import { PublicKey } from '@solana/web3.js';

export enum ExitReason {
  TAKE_PROFIT = 'take_profit',
  STOP_LOSS = 'stop_loss',
  MAX_HOLD_TIME = 'max_hold_time',
  MANUAL = 'manual',
  GRADUATION = 'graduation', // When token graduates to Raydium
  LOW_LIQUIDITY = 'low_liquidity'
}

export interface PositionConfig {
  takeProfitPercentage?: number; // e.g., 0.5 for 50% profit
  stopLossPercentage?: number;   // e.g., 0.2 for 20% loss
  maxHoldTime?: number;          // seconds
  trailingStopLoss?: number;     // percentage for trailing stop
}

export interface PositionData {
  // Token information
  mint: PublicKey;
  symbol: string;
  name: string;
  
  // Position details
  entryPrice: number;
  quantity: number;
  entryTime: Date;
  solInvested: number;
  
  // Exit conditions
  takeProfitPrice?: number;
  stopLossPrice?: number;
  maxHoldTime?: number;
  trailingStopPrice?: number;
  highWaterMark?: number; // For trailing stop loss
  
  // Status
  isActive: boolean;
  exitReason?: ExitReason;
  exitPrice?: number;
  exitTime?: Date;
  transactionSignature?: string;
}

export interface PnLData {
  entryPrice: number;
  currentPrice: number;
  priceChange: number;
  priceChangePercent: number;
  unrealizedPnlSol: number;
  quantity: number;
  solInvested: number;
  currentValue: number;
  roi: number; // Return on investment percentage
}

export interface ExitConditionResult {
  shouldExit: boolean;
  reason?: ExitReason;
  urgency: 'low' | 'medium' | 'high'; // For prioritizing exits
}
