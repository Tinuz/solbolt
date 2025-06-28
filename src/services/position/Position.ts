/**
 * Position Class
 * Autonomous position management with exit logic like Python implementation
 */

import { PublicKey } from '@solana/web3.js';
import { 
  PositionData, 
  PositionConfig, 
  ExitReason, 
  PnLData, 
  ExitConditionResult 
} from './types';

export class Position {
  private data: PositionData;

  constructor(data: PositionData) {
    this.data = { ...data };
  }

  /**
   * Create position from successful buy transaction
   * Mirrors Python create_from_buy_result class method
   */
  static createFromBuyResult(
    mint: PublicKey,
    symbol: string,
    name: string,
    entryPrice: number,
    quantity: number,
    solInvested: number,
    config: PositionConfig = {},
    transactionSignature?: string
  ): Position {
    let takeProfitPrice: number | undefined;
    if (config.takeProfitPercentage !== undefined) {
      takeProfitPrice = entryPrice * (1 + config.takeProfitPercentage);
    }

    let stopLossPrice: number | undefined;
    if (config.stopLossPercentage !== undefined) {
      stopLossPrice = entryPrice * (1 - config.stopLossPercentage);
    }

    const data: PositionData = {
      mint,
      symbol,
      name,
      entryPrice,
      quantity,
      entryTime: new Date(),
      solInvested,
      takeProfitPrice,
      stopLossPrice,
      maxHoldTime: config.maxHoldTime,
      highWaterMark: entryPrice, // Start with entry price
      isActive: true,
      transactionSignature
    };

    console.log(`📊 Created new position:`, {
      symbol,
      entryPrice: entryPrice.toFixed(8),
      quantity: quantity.toFixed(6),
      solInvested: solInvested.toFixed(6),
      takeProfitPrice: takeProfitPrice?.toFixed(8),
      stopLossPrice: stopLossPrice?.toFixed(8)
    });

    return new Position(data);
  }

  /**
   * Check if position should be exited based on current conditions
   * Mirrors Python should_exit method with enhanced logic
   */
  shouldExit(currentPrice: number): ExitConditionResult {
    if (!this.data.isActive) {
      return { shouldExit: false, urgency: 'low' };
    }

    // Update high water mark for trailing stop
    if (currentPrice > (this.data.highWaterMark || 0)) {
      this.data.highWaterMark = currentPrice;
      this.updateTrailingStop(currentPrice);
    }

    // Check take profit (high urgency)
    if (this.data.takeProfitPrice && currentPrice >= this.data.takeProfitPrice) {
      return { 
        shouldExit: true, 
        reason: ExitReason.TAKE_PROFIT,
        urgency: 'high'
      };
    }

    // Check stop loss (high urgency)
    if (this.data.stopLossPrice && currentPrice <= this.data.stopLossPrice) {
      return { 
        shouldExit: true, 
        reason: ExitReason.STOP_LOSS,
        urgency: 'high'
      };
    }

    // Check trailing stop loss (high urgency)
    if (this.data.trailingStopPrice && currentPrice <= this.data.trailingStopPrice) {
      return { 
        shouldExit: true, 
        reason: ExitReason.STOP_LOSS,
        urgency: 'high'
      };
    }

    // Check max hold time (medium urgency)
    if (this.data.maxHoldTime) {
      const elapsedTime = (Date.now() - this.data.entryTime.getTime()) / 1000;
      if (elapsedTime >= this.data.maxHoldTime) {
        return { 
          shouldExit: true, 
          reason: ExitReason.MAX_HOLD_TIME,
          urgency: 'medium'
        };
      }
    }

    return { shouldExit: false, urgency: 'low' };
  }

  /**
   * Close position with exit details
   */
  closePosition(exitPrice: number, exitReason: ExitReason, transactionSignature?: string): void {
    this.data.isActive = false;
    this.data.exitPrice = exitPrice;
    this.data.exitReason = exitReason;
    this.data.exitTime = new Date();
    
    if (transactionSignature) {
      this.data.transactionSignature = transactionSignature;
    }

    const pnl = this.calculatePnL(exitPrice);
    
    console.log(`📊 Position closed:`, {
      symbol: this.data.symbol,
      exitReason,
      entryPrice: this.data.entryPrice.toFixed(8),
      exitPrice: exitPrice.toFixed(8),
      pnl: pnl.unrealizedPnlSol.toFixed(6),
      roi: pnl.roi.toFixed(2) + '%',
      holdTime: this.getHoldTimeString()
    });
  }

  /**
   * Calculate profit/loss for position
   * Fixed Python-style calculation with correct ROI
   */
  calculatePnL(currentPrice?: number): PnLData {
    if (this.data.isActive && currentPrice === undefined) {
      throw new Error('Current price required for active position');
    }

    const priceToUse = this.data.isActive ? currentPrice! : this.data.exitPrice!;
    
    const priceChange = priceToUse - this.data.entryPrice;
    const priceChangePercent = (priceChange / this.data.entryPrice) * 100;
    
    // Python-style PnL calculation: price_change * quantity
    const unrealizedPnlSol = priceChange * this.data.quantity;
    
    const currentValue = priceToUse * this.data.quantity;
    // Fixed ROI calculation: (profit / initial investment) * 100
    const roi = (unrealizedPnlSol / this.data.solInvested) * 100;

    return {
      entryPrice: this.data.entryPrice,
      currentPrice: priceToUse,
      priceChange,
      priceChangePercent,
      unrealizedPnlSol,
      quantity: this.data.quantity,
      solInvested: this.data.solInvested,
      currentValue,
      roi
    };
  }

  /**
   * Update trailing stop loss based on high water mark
   */
  private updateTrailingStop(currentPrice: number): void {
    // Only update if we have a trailing stop configured
    const config = this.getConfig();
    if (!config.trailingStopLoss) return;

    // Calculate new trailing stop price
    const newTrailingStop = currentPrice * (1 - config.trailingStopLoss);
    
    // Only update if the new stop is higher than current (trailing up)
    if (!this.data.trailingStopPrice || newTrailingStop > this.data.trailingStopPrice) {
      this.data.trailingStopPrice = newTrailingStop;
    }
  }

  /**
   * Get position configuration
   */
  private getConfig(): PositionConfig {
    const entryPrice = this.data.entryPrice;
    return {
      takeProfitPercentage: this.data.takeProfitPrice ? 
        (this.data.takeProfitPrice - entryPrice) / entryPrice : undefined,
      stopLossPercentage: this.data.stopLossPrice ? 
        (entryPrice - this.data.stopLossPrice) / entryPrice : undefined,
      maxHoldTime: this.data.maxHoldTime
    };
  }

  /**
   * Get human readable hold time
   */
  private getHoldTimeString(): string {
    const holdTimeMs = (this.data.exitTime || new Date()).getTime() - this.data.entryTime.getTime();
    const holdTimeMinutes = Math.floor(holdTimeMs / 60000);
    
    if (holdTimeMinutes < 60) {
      return `${holdTimeMinutes}m`;
    }
    
    const hours = Math.floor(holdTimeMinutes / 60);
    const minutes = holdTimeMinutes % 60;
    return `${hours}h ${minutes}m`;
  }

  // Getters
  get mint(): PublicKey { return this.data.mint; }
  get symbol(): string { return this.data.symbol; }
  get name(): string { return this.data.name; }
  get entryPrice(): number { return this.data.entryPrice; }
  get quantity(): number { return this.data.quantity; }
  get solInvested(): number { return this.data.solInvested; }
  get isActive(): boolean { return this.data.isActive; }
  get entryTime(): Date { return this.data.entryTime; }
  get exitTime(): Date | undefined { return this.data.exitTime; }
  get exitReason(): ExitReason | undefined { return this.data.exitReason; }
  get transactionSignature(): string | undefined { return this.data.transactionSignature; }

  /**
   * Get full position data (for serialization)
   */
  getData(): PositionData {
    return { ...this.data };
  }

  /**
   * String representation
   */
  toString(): string {
    const status = this.data.isActive ? 'ACTIVE' : 
      (this.data.exitReason ? `CLOSED (${this.data.exitReason})` : 'CLOSED (UNKNOWN)');
    
    return `Position(${this.data.symbol}: ${this.data.quantity.toFixed(6)} @ ${this.data.entryPrice.toFixed(8)} SOL - ${status})`;
  }
}
