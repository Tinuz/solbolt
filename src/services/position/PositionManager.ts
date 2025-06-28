/**
 * Position Manager Service
 * Monitors active positions and executes exits like Python implementation
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { EventEmitter } from 'events';
import { Position } from './Position';
import { ExitReason, PositionConfig, PositionData } from './types';
import { SolanaService } from '../solana';
import type { Token } from '@/types';
import { BondingCurveManager } from '../bondingCurve/manager';

export interface PositionManagerConfig {
  priceCheckInterval: number; // seconds, default 10
  enableLogging: boolean;     // default true
}

export interface PositionPriceUpdate {
  tokenAddress: string;
  tokenSymbol: string;
  currentPrice: number;
  entryPrice: number;
  pnl: number;
  pnlPercent: number;
  amount: number;
  solInvested: number;
}

export class PositionManager extends EventEmitter {
  private positions = new Map<string, Position>();
  private monitoringTasks = new Map<string, NodeJS.Timeout>();
  private connection: Connection;
  private solanaService: SolanaService;
  private bondingCurveManager: BondingCurveManager;
  private config: PositionManagerConfig;

  constructor(
    connection: Connection,
    solanaService: SolanaService,
    bondingCurveManager: BondingCurveManager,
    config: Partial<PositionManagerConfig> = {}
  ) {
    super(); // ⭐ Call EventEmitter constructor
    
    this.connection = connection;
    this.solanaService = solanaService;
    this.bondingCurveManager = bondingCurveManager;
    this.config = {
      priceCheckInterval: 10,
      enableLogging: true,
      ...config
    };
  }

  /**
   * Create and start monitoring a new position
   * Mirrors Python's position creation and monitoring flow
   */
  createPosition(
    token: Token,
    entryPrice: number,
    quantity: number,
    solInvested: number,
    config: PositionConfig = {},
    transactionSignature?: string
  ): Position {
    const position = Position.createFromBuyResult(
      new PublicKey(token.address),
      token.symbol,
      token.name || token.symbol,
      entryPrice,
      quantity,
      solInvested,
      config,
      transactionSignature
    );

    const positionId = token.address;
    this.positions.set(positionId, position);

    // Start monitoring this position
    this.startMonitoring(positionId, token);

    return position;
  }

  /**
   * Start monitoring a position until exit conditions are met
   * Mirrors Python's _monitor_position_until_exit method
   */
  private startMonitoring(positionId: string, token: Token): void {
    if (this.config.enableLogging) {
      console.log(`📊 Starting position monitoring for ${token.symbol} (check interval: ${this.config.priceCheckInterval}s)`);
    }

    const monitoringTask = setInterval(async () => {
      await this.checkPositionExit(positionId, token);
    }, this.config.priceCheckInterval * 1000);

    this.monitoringTasks.set(positionId, monitoringTask);
  }

  /**
   * Check if position should exit and handle exit logic
   * Mirrors Python's position monitoring logic
   */
  private async checkPositionExit(positionId: string, token: Token): Promise<void> {
    const position = this.positions.get(positionId);
    
    if (!position || !position.isActive) {
      this.stopMonitoring(positionId);
      return;
    }

    try {
      // Get current price from bonding curve (like Python)
      const curveData = await this.solanaService.getBondingCurveData(token.bondingCurve);
      if (!curveData) {
        if (this.config.enableLogging) {
          console.warn(`⚠️ Could not get price for ${token.symbol}, skipping check`);
        }
        return;
      }

      const currentPrice = curveData.price;
      
      // Check if position should be exited
      const exitCondition = position.shouldExit(currentPrice);
      
      if (exitCondition.shouldExit && exitCondition.reason) {
        if (this.config.enableLogging) {
          console.log(`🚨 Exit condition met for ${token.symbol}: ${exitCondition.reason} (urgency: ${exitCondition.urgency})`);
          console.log(`📈 Current price: ${currentPrice.toFixed(8)} SOL`);
          
          // Log PnL before exit
          const pnl = position.calculatePnL(currentPrice);
          console.log(`💰 Position PnL: ${pnl.priceChangePercent.toFixed(2)}% (${pnl.unrealizedPnlSol.toFixed(6)} SOL)`);
        }

        // Execute sell (this should be handled by the caller via callback)
        this.emit('positionExit', {
          position,
          token,
          currentPrice,
          exitReason: exitCondition.reason,
          urgency: exitCondition.urgency
        });

        // Stop monitoring this position
        this.stopMonitoring(positionId);
      } else {
        // Update position with current price and emit price update event
        const pnl = position.calculatePnL(currentPrice);
        
        // ⭐ EMIT PRICE UPDATE EVENT for UI
        this.emit('priceUpdate', {
          tokenAddress: token.address,
          tokenSymbol: token.symbol,
          currentPrice,
          entryPrice: position.entryPrice,
          pnl: pnl.unrealizedPnlSol,
          pnlPercent: pnl.priceChangePercent,
          amount: position.quantity,
          solInvested: position.solInvested
        } as PositionPriceUpdate);

        // Log current status (debug level)
        if (this.config.enableLogging) {
          console.debug(`📊 ${token.symbol} status: ${currentPrice.toFixed(8)} SOL (${pnl.priceChangePercent > 0 ? '+' : ''}${pnl.priceChangePercent.toFixed(2)}%)`);
        }
      }

    } catch (error) {
      if (this.config.enableLogging) {
        console.error(`❌ Error monitoring position ${token.symbol}:`, error);
      }
      // Continue monitoring despite errors (like Python implementation)
    }
  }

  /**
   * Stop monitoring a position
   */
  private stopMonitoring(positionId: string): void {
    const task = this.monitoringTasks.get(positionId);
    if (task) {
      clearInterval(task);
      this.monitoringTasks.delete(positionId);
    }
  }

  /**
   * Close a position with exit details
   * Should be called after successful sell transaction
   */
  closePosition(
    positionId: string, 
    exitPrice: number, 
    exitReason: ExitReason,
    transactionSignature?: string
  ): boolean {
    const position = this.positions.get(positionId);
    if (!position) {
      console.warn(`⚠️ Position ${positionId} not found for closing`);
      return false;
    }

    position.closePosition(exitPrice, exitReason, transactionSignature);
    this.stopMonitoring(positionId);

    if (this.config.enableLogging) {
      const pnl = position.calculatePnL();
      console.log(`✅ Position closed: ${position.symbol} - ${exitReason}`);
      console.log(`📊 Final PnL: ${pnl.priceChangePercent.toFixed(2)}% (${pnl.unrealizedPnlSol.toFixed(6)} SOL)`);
    }

    return true;
  }

  /**
   * Get all active positions
   */
  getActivePositions(): Position[] {
    return Array.from(this.positions.values()).filter(p => p.isActive);
  }

  /**
   * Get all positions (active and closed)
   */
  getAllPositions(): Position[] {
    return Array.from(this.positions.values());
  }

  /**
   * Get position by token address
   */
  getPosition(tokenAddress: string): Position | undefined {
    return this.positions.get(tokenAddress);
  }

  /**
   * Emergency close all active positions
   * Should be called when bot is stopped - NOW WITH ACTUAL SELLING
   */
  async emergencyCloseAllPositions(): Promise<void> {
    const activePositions = this.getActivePositions();
    
    if (activePositions.length === 0) {
      console.log(`📊 No active positions to close`);
      return;
    }

    console.log(`🚨 Emergency closing ${activePositions.length} active position(s) WITH ACTUAL SELLING...`);
    
    for (const position of activePositions) {
      try {
        const positionId = position.mint.toString();
        
        // Get current price for final PnL calculation
        let currentPrice = position.entryPrice; // fallback
        try {
          // We need to create a basic token object for selling
          const token = {
            address: positionId,
            symbol: position.symbol,
            name: position.name,
            bondingCurve: '', // Will be calculated by trading service
            price: currentPrice,
            marketCap: 0,
            volume24h: 0,
            priceChange24h: 0,
            liquidity: 0,
            holders: 0,
            timestamp: Date.now(),
            description: '',
            image: '',
            showName: false,
            createdOn: Date.now(),
            twitter: '',
            telegram: '',
            website: '',
            usdMarketCap: 0,
            complete: false,
            nsfw: false,
            mint: positionId,
            creator: '',
            virtual_sol_reserves: 0,
            virtual_token_reserves: 0,
            sol_reserves: 0,
            token_reserves: 0,
            associatedBondingCurve: '',
            progress: 0,
            virtualSolReserves: 0,
            virtualTokenReserves: 0
          };

          // Try to get current price from bonding curve
          const curveData = await this.solanaService.getBondingCurveData(token.bondingCurve);
          if (curveData) {
            currentPrice = curveData.price;
          }
        } catch (error) {
          console.warn(`⚠️ Could not get current price for ${position.symbol}, using entry price`);
        }

        // Emit emergency exit signal to trigger ACTUAL SELLING
        console.log(`🚨 Emergency SELL signal for ${position.symbol} at ${currentPrice.toFixed(8)} SOL`);
        
        this.emit('positionExit', {
          position,
          token: {
            address: positionId,
            symbol: position.symbol,
            name: position.name,
            bondingCurve: '', // Will be calculated by trading service if needed
            price: currentPrice,
            marketCap: 0,
            volume24h: 0,
            priceChange24h: 0,
            liquidity: 0,
            holders: 0,
            // Add minimal required Token properties
            description: '',
            image: '',
            showName: false,
            createdOn: Date.now(),
            twitter: '',
            telegram: '',
            website: '',
            usdMarketCap: 0,
            complete: false,
            nsfw: false,
            mint: positionId,
            creator: '',
            virtual_sol_reserves: 0,
            virtual_token_reserves: 0,
            sol_reserves: 0,
            token_reserves: 0,
            associatedBondingCurve: '',
            progress: 0,
            virtualSolReserves: 0,
            virtualTokenReserves: 0,
            timestamp: Date.now()
          } as Token,
          currentPrice,
          exitReason: ExitReason.MANUAL,
          urgency: 'high'
        });

        console.log(`🔄 Waiting for sell transaction to complete for ${position.symbol}...`);
        
        // Give some time for the sell transaction to execute
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Position will be closed by the sell transaction handler
        console.log(`✅ Emergency sell initiated for: ${position.symbol}`);
        
      } catch (error) {
        console.error(`❌ Error emergency selling position ${position.symbol}:`, error);
        // Force close position tracking anyway
        position.closePosition(position.entryPrice, ExitReason.MANUAL);
        this.stopMonitoring(position.mint.toString());
      }
    }

    console.log(`🚨 Emergency close completed - sell transactions initiated for all active positions`);
  }

  /**
   * Helper to find token by address from stored positions
   */
  private findTokenByAddress(address: string): Token | undefined {
    // For emergency exits, we don't need a complete token object
    // Return undefined to skip token-dependent operations
    return undefined;
  }

  /**
   * Stop all monitoring and cleanup
   * Enhanced with emergency position closing
   */
  async shutdown(forceClosePositions: boolean = true): Promise<void> {
    console.log(`🔌 PositionManager shutdown initiated...`);
    
    if (forceClosePositions) {
      await this.emergencyCloseAllPositions();
    }
    
    // Stop all monitoring tasks
    for (const [positionId] of this.monitoringTasks) {
      this.stopMonitoring(positionId);
    }
    
    // Clear all event listeners (EventEmitter)
    this.removeAllListeners();
    
    // Clear positions if force close was requested
    if (forceClosePositions) {
      this.positions.clear();
    }
    
    console.log(`🔌 PositionManager shutdown complete`);
  }
}
