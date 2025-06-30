/**
 * Production-Grade Autonomous Trading Manager
 * Uses new Position management, Priority Fee Manager, and Bonding Curve Manager
 * Refactored to work entirely through PositionManager without local position tracking
 */

import { Connection, PublicKey } from '@solana/web3.js';
import type { WalletContextState } from '@solana/wallet-adapter-react';
import { Token, Trade, Position as UIPosition } from '@/types';
import { TradingService } from './trading';
import { SolanaService } from './solana';
import { Position, PositionConfig, ExitReason } from './position';
import { BondingCurveManager } from './bondingCurve';

export interface AutonomousTradingConfig {
  enabled: boolean;
  maxPositions: number;
  buyAmount: number;
  stopLossPercentage: number;
  takeProfitPercentage: number;
  maxSlippage: number;
  minLiquidity: number;
  maxTokenAge: number;
  priceCheckInterval: number;
  trailingStopLoss?: number;
  maxHoldTime?: number; // seconds
}

export interface TradingSignal {
  action: 'buy' | 'sell';
  reason: string;
  confidence: number;
  urgency: 'low' | 'medium' | 'high';
}

export class AutonomousTradingManager {
  private config: AutonomousTradingConfig;
  private connection: Connection;
  private tradingService: TradingService;
  private solanaService: SolanaService;
  private bondingCurveManager: BondingCurveManager;
  private isRunning: boolean = false;
  private priceCheckInterval: NodeJS.Timeout | null = null;
  private trades: Trade[] = [];

  constructor(
    config: AutonomousTradingConfig,
    connection: Connection,
    tradingService: TradingService,
    solanaService: SolanaService
  ) {
    this.config = config;
    this.connection = connection;
    this.tradingService = tradingService;
    this.solanaService = solanaService;
    this.bondingCurveManager = solanaService.getBondingCurveManager();
    
    console.log('🤖 Production-grade Autonomous Trading Manager initialized');
    console.log(`📊 Config:`, {
      maxPositions: config.maxPositions,
      buyAmount: config.buyAmount,
      stopLoss: config.stopLossPercentage,
      takeProfit: config.takeProfitPercentage,
      trailingStop: config.trailingStopLoss,
      maxHoldTime: config.maxHoldTime ? `${config.maxHoldTime}s` : 'none'
    });
  }

  start(): void {
    if (this.isRunning) return;
    
    // Verify autonomous wallet is properly configured
    const autonomousWallet = this.tradingService.getAutonomousWallet();
    if (!autonomousWallet) {
      console.error('❌ Autonomous wallet not configured! Set NEXT_PUBLIC_AUTONOMOUS_PRIVATE_KEY in environment variables.');
      console.log('💡 Without autonomous wallet, manual signing will be required for each trade.');
      throw new Error('Autonomous wallet required for autonomous trading');
    }
    
    console.log('✅ Autonomous wallet configured:', autonomousWallet.publicKey.toString());
    
    this.isRunning = true;
    console.log('🚀 Starting production autonomous trading with advanced position management...');
    
    // Start price monitoring with the new Position system
    this.priceCheckInterval = setInterval(
      () => this.checkPositions(),
      this.config.priceCheckInterval
    );
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    console.log('🛑 Stopping autonomous trading...');
    
    if (this.priceCheckInterval) {
      clearInterval(this.priceCheckInterval);
      this.priceCheckInterval = null;
    }

    // Close all active positions when stopping
    const positionManager = this.tradingService.getPositionManager();
    if (positionManager) {
      await positionManager.emergencyCloseAllPositions();
    }
  }

  async shouldBuyToken(token: Token): Promise<TradingSignal | null> {
    try {
      console.log(`🔍 Evaluating token: ${token.symbol} for autonomous trading...`);

      // Token data validatie
      if (!token.address || !token.symbol || !token.name) {
        console.log(`❌ REJECTION REASON: Missing token data for ${token.symbol}`);
        return null;
      }

      // Validate bonding curve exists
      if (!token.bondingCurve || token.bondingCurve === 'none') {
        console.log(`❌ REJECTION REASON: No bonding curve for ${token.symbol}`);
        return null;
      }

      console.log(`📋 Token validation passed for ${token.symbol}`);
      console.log(`💰 Market cap: $${token.marketCap?.toLocaleString() || 'unknown'}`);
      console.log(`🏊 Liquidity: ${token.liquidity?.toFixed(4) || 'unknown'} SOL`);
      console.log(`💱 Current price: ${token.price?.toFixed(8) || 'unknown'} SOL`);
      console.log(`🎯 Bonding curve: ${token.bondingCurve}`);

      // Check liquidity
      if (token.liquidity !== undefined && token.liquidity < this.config.minLiquidity) {
        console.log(`⚠️ Low liquidity: ${token.liquidity.toFixed(4)} SOL < ${this.config.minLiquidity} SOL minimum`);
        console.log(`❌ REJECTION REASON: Insufficient liquidity for ${token.symbol}`);
        return null;
      }

      // Check if we've reached max positions
      const activePositions = this.getActivePositionsCount();
      console.log(`📈 Position check: ${activePositions}/${this.config.maxPositions} positions`);
      if (activePositions >= this.config.maxPositions) {
        console.log(`⚠️ Max positions reached (${activePositions}/${this.config.maxPositions})`);
        console.log(`❌ REJECTION REASON: Max positions reached for ${token.symbol}`);
        return null;
      }

      // Check if we already have a position in this token
      const existingPosition = this.hasPositionForToken(token.address);
      if (existingPosition) {
        console.log(`⚠️ Already have position in ${token.symbol}`);
        console.log(`❌ REJECTION REASON: Already have position in ${token.symbol}`);
        return null;
      }

      // Check token age (avoid too new tokens for stability)
      const tokenAge = (Date.now() - token.createdOn) / 1000;
      const minTokenAge = Math.min(this.config.maxTokenAge, 0.001); // Reduced to 1 second for testing
      
      console.log(`📅 Token age check: ${tokenAge.toFixed(3)}s (min required: ${minTokenAge}s, max allowed: ${this.config.maxTokenAge}s)`);
      
      if (tokenAge < minTokenAge) {
        console.log(`⚠️ Token too new: ${tokenAge.toFixed(3)}s < ${minTokenAge}s (waiting for minimum age)`);
        console.log(`❌ REJECTION REASON: Token too new for ${token.symbol}`);
        return null;
      }

      if (tokenAge > this.config.maxTokenAge) {
        console.log(`⚠️ Token too old: ${tokenAge.toFixed(3)}s > ${this.config.maxTokenAge}s (avoiding stale tokens)`);
        console.log(`❌ REJECTION REASON: Token too old for ${token.symbol}`);
        return null;
      }

      // Check liquidity
      if (token.liquidity !== undefined && token.liquidity < this.config.minLiquidity) {
        console.log(`⚠️ Low liquidity: ${token.liquidity.toFixed(4)} SOL < ${this.config.minLiquidity} SOL minimum`);
        console.log(`❌ REJECTION REASON: Insufficient liquidity for ${token.symbol}`);
        return null;
      }

      // All checks passed - generate buy signal
      console.log(`✅ All checks passed! Generating BUY signal for ${token.symbol}`);
      return {
        action: 'buy',
        reason: 'Token meets all criteria for autonomous trading',
        confidence: 0.8,
        urgency: 'medium'
      };

    } catch (error) {
      console.error(`❌ Error evaluating token ${token.symbol}:`, error);
      console.log(`❌ REJECTION REASON: Error during evaluation for ${token.symbol}:`, error);
      return null;
    }
  }

  async executeBuy(token: Token): Promise<boolean> {
    try {
      console.log(`🎯 Executing autonomous buy for ${token.symbol}...`);

      const result = await this.tradingService.buyTokenAutonomous(
        token,
        this.config.buyAmount,
        this.config.maxSlippage
      );

      if (result && result.status === 'success' && result.signature) {
        console.log(`✅ Buy successful for ${token.symbol}! Signature: ${result.signature}`);

        // Trade record is already created by TradingService, just add to local tracking
        this.trades.push(result);

        console.log(`✅ Buy executed and position created for ${token.symbol}`);
        return true;
      }

      return false;
    } catch (error) {
      console.error(`❌ Error executing buy for ${token.symbol}:`, error);
      return false;
    }
  }

  private async checkPositions(): Promise<void> {
    if (!this.isRunning) return;

    const positionManager = this.tradingService.getPositionManager();
    if (!positionManager) return;

    const activePositions = positionManager.getActivePositions();
    if (activePositions.length === 0) return;

    console.log(`🔍 Checking ${activePositions.length} active positions...`);

    for (const position of activePositions) {
      try {
        console.log(`🔍 Checking position: ${position.symbol} (entry: ${position.entryPrice.toFixed(8)})`);

        // Get current price using bonding curve for accuracy
        const currentPrice = await this.solanaService.getTokenPrice(position.mint.toString());

        if (currentPrice <= 0) {
          console.warn(`⚠️ Could not get price for ${position.symbol}, skipping`);
          continue;
        }

        // Check if position should exit using Position logic
        const exitCondition = position.shouldExit(currentPrice);
        
        if (exitCondition.shouldExit && exitCondition.reason) {
          console.log(`🚨 SELL SIGNAL for ${position.symbol}: ${exitCondition.reason} (urgency: ${exitCondition.urgency})`);

          // Create token object for sell
          const tokenForSell: Token = {
            address: position.mint.toString(),
            name: position.name,
            symbol: position.symbol,
            description: '',
            image: '',
            showName: true,
            createdOn: position.entryTime.getTime(),
            website: '',
            telegram: '',
            twitter: '',
            bondingCurve: '',
            associatedBondingCurve: '',
            creator: '',
            marketCap: 0,
            price: currentPrice,
            progress: 0,
            virtualSolReserves: 0,
            virtualTokenReserves: 0,
            liquidity: 0,
            volume24h: 0,
            priceChange24h: 0,
            holders: 0
          };

          // Execute sell through TradingService which will handle position closing
          await this.tradingService.sellTokenAutonomous(tokenForSell, this.config.maxSlippage);
        } else {
          // Log current PnL for active positions
          const pnl = position.calculatePnL(currentPrice);
          if (Math.abs(pnl.roi) > 1) { // Only log significant changes
            console.log(`💹 ${position.symbol}: ${pnl.roi >= 0 ? '+' : ''}${pnl.roi.toFixed(2)}% ROI (${pnl.unrealizedPnlSol.toFixed(6)} SOL)`);
          }
        }

      } catch (error) {
        console.error(`❌ Error checking position ${position.symbol}:`, error);
      }
    }
  }

  // Helper methods to work with PositionManager
  private getActivePositionsCount(): number {
    const positionManager = this.tradingService.getPositionManager();
    if (!positionManager) return 0;
    return positionManager.getActivePositions().length;
  }

  private hasPositionForToken(tokenAddress: string): boolean {
    const positionManager = this.tradingService.getPositionManager();
    if (!positionManager) return false;
    
    const activePositions = positionManager.getActivePositions();
    return activePositions.some(pos => pos.mint.toString() === tokenAddress);
  }

  // Public getters that map to UI types
  getActivePositions(): UIPosition[] {
    const positionManager = this.tradingService.getPositionManager();
    if (!positionManager) return [];

    return positionManager.getActivePositions().map(pos => {
      const pnl = pos.calculatePnL();
      return {
        id: pos.mint.toString(),
        tokenAddress: pos.mint.toString(),
        tokenSymbol: pos.symbol,
        tokenName: pos.name,
        amount: pos.quantity,
        entryPrice: pos.entryPrice,
        currentPrice: pnl.currentPrice,
        solInvested: pos.solInvested,
        currentValue: pnl.currentValue,
        pnl: pnl.unrealizedPnlSol,
        pnlPercent: pnl.priceChangePercent,
        pnlPercentage: pnl.priceChangePercent,
        openedAt: pos.entryTime.getTime(),
        status: pos.isActive ? 'open' as const : 'closed' as const
      };
    });
  }

  getAllPositions(): UIPosition[] {
    const positionManager = this.tradingService.getPositionManager();
    if (!positionManager) return [];

    return positionManager.getAllPositions().map(pos => {
      const pnl = pos.calculatePnL();
      return {
        id: pos.mint.toString(),
        tokenAddress: pos.mint.toString(),
        tokenSymbol: pos.symbol,
        tokenName: pos.name,
        amount: pos.quantity,
        entryPrice: pos.entryPrice,
        currentPrice: pnl.currentPrice,
        solInvested: pos.solInvested,
        currentValue: pnl.currentValue,
        pnl: pnl.unrealizedPnlSol,
        pnlPercent: pnl.priceChangePercent,
        pnlPercentage: pnl.priceChangePercent,
        openedAt: pos.entryTime.getTime(),
        closedAt: pos.exitTime?.getTime(),
        status: pos.isActive ? 'open' as const : 'closed' as const,
        exitReason: pos.exitReason?.toString(),
        exitTimestamp: pos.exitTime?.getTime()
      };
    });
  }

  getTrades(): Trade[] {
    return [...this.trades];
  }

  getStats() {
    const active = this.getActivePositions();
    const all = this.getAllPositions();
    const closed = all.filter(p => p.status === 'closed');
    
    let totalPnL = 0;
    closed.forEach(position => {
      totalPnL += position.pnl;
    });

    return {
      isRunning: this.isRunning,
      activePositions: active.length,
      totalPositions: all.length,
      totalTrades: this.trades.length,
      totalPnL: totalPnL,
      config: this.config
    };
  }

  updateConfig(newConfig: Partial<AutonomousTradingConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log('🔧 Trading config updated:', newConfig);
  }

  isRunningTrading(): boolean {
    return this.isRunning;
  }
}
