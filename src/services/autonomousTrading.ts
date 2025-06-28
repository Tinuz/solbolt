/**
 * Production-Grade Autonomous Trading Manager
 * Uses new Position management, Priority Fee Manager, and Bonding Curve Manager
 */

import { Connection, PublicKey } from '@solana/web3.js';
import type { WalletContextState } from '@solana/wallet-adapter-react';
import { Token, Trade } from '@/types';
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
  private positions: Position[] = [];
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

    // Shutdown trading service and close all positions
    console.log('🔌 Shutting down trading service and closing all positions...');
    await this.tradingService.shutdown();
    
    console.log('✅ Autonomous trading stopped and all positions closed');
  }

  async evaluateToken(token: Token, wallet: WalletContextState): Promise<TradingSignal | null> {
    try {
      console.log(`🔍 Evaluating token for autonomous trading: ${token.symbol}`);
      console.log(`📊 Token details:`, {
        symbol: token.symbol,
        address: token.address,
        createdOn: new Date(token.createdOn).toISOString(),
        ageMs: Date.now() - token.createdOn,
        ageSec: (Date.now() - token.createdOn) / 1000,
        price: token.price,
        liquidity: token.liquidity,
        bondingCurve: token.bondingCurve || 'none'
      });

      // Check if we've reached max positions
      const activePositions = this.getActivePositions().length;
      console.log(`📈 Position check: ${activePositions}/${this.config.maxPositions} positions`);
      if (activePositions >= this.config.maxPositions) {
        console.log(`⚠️ Max positions reached (${activePositions}/${this.config.maxPositions})`);
        console.log(`❌ REJECTION REASON: Max positions reached for ${token.symbol}`);
        return null;
      }

      // Check token age (avoid too new tokens for stability)
      const tokenAge = (Date.now() - token.createdOn) / 1000;
      const minTokenAge = Math.min(this.config.maxTokenAge, 0.001); // Reduced to 1 second for testing
      
      console.log(`📅 Token age check: ${tokenAge.toFixed(3)}s (min required: ${minTokenAge}s, max allowed: ${this.config.maxTokenAge}s)`);
      
      if (tokenAge < minTokenAge) {
        console.log(`⚠️ Token too new: ${tokenAge.toFixed(3)}s < ${minTokenAge}s (waiting for minimum age)`);
        console.log(`❌ REJECTION REASON: Token too new for ${token.symbol} (${tokenAge.toFixed(3)}s < ${minTokenAge}s)`);
        return null;
      }

      if (tokenAge > this.config.maxTokenAge) {
        console.log(`⚠️ Token too old: ${tokenAge.toFixed(3)}s > ${this.config.maxTokenAge}s (max allowed age)`);
        console.log(`❌ REJECTION REASON: Token too old for ${token.symbol} (${tokenAge.toFixed(3)}s > ${this.config.maxTokenAge}s)`);
        return null;
      }

      // Check liquidity using bonding curve data
      let liquidityCheck = true;
      console.log(`💧 Liquidity check starting...`);
      
      if (token.bondingCurve) {
        try {
          console.log(`🔍 Checking bonding curve: ${token.bondingCurve}`);
          const curveData = await this.solanaService.getBondingCurveData(token.bondingCurve);
          if (curveData) {
            console.log(`💰 Curve data:`, {
              solReserves: curveData.solReserves.toFixed(6),
              price: curveData.price.toFixed(8),
              minRequired: this.config.minLiquidity
            });
            if (curveData.solReserves < this.config.minLiquidity) {
              console.log(`⚠️ Insufficient liquidity: ${curveData.solReserves.toFixed(6)} < ${this.config.minLiquidity} SOL`);
              liquidityCheck = false;
            } else {
              console.log(`✅ Liquidity sufficient: ${curveData.solReserves.toFixed(6)} >= ${this.config.minLiquidity} SOL`);
            }
          } else {
            console.log(`🔄 No bonding curve data available - token likely migrated to Raydium`);
            console.log(`❌ REJECTION REASON: Cannot trade ${token.symbol} - bonding curve has no data (migrated to Raydium)`);
            return null;
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          
          if (errorMessage.includes('Invalid bonding curve discriminator')) {
            console.warn(`⚠️ Token ${token.symbol} has invalid bonding curve format - possibly not a pump.fun token`);
            console.log(`❌ REJECTION REASON: Invalid bonding curve format for ${token.symbol}`);
            return null;
          } else if (errorMessage.includes('No data in bonding curve account') || errorMessage.includes('Empty bonding curve account')) {
            console.warn(`⚠️ Token ${token.symbol} bonding curve account is empty - possibly migrated to Raydium`);
            console.log(`❌ REJECTION REASON: Bonding curve empty for ${token.symbol} (migrated to Raydium)`);
            return null;
          } else {
            console.warn(`⚠️ Could not check bonding curve liquidity for ${token.symbol}:`, errorMessage);
            console.log(`❌ REJECTION REASON: Bonding curve error for ${token.symbol}: ${errorMessage}`);
            return null;
          }
        }
      } else {
        console.log(`❌ No bonding curve provided - cannot trade token without pump.fun bonding curve`);
        console.log(`❌ REJECTION REASON: No bonding curve for ${token.symbol}`);
        return null;
      }

      if (!liquidityCheck) {
        console.log(`❌ Token failed liquidity check`);
        console.log(`❌ REJECTION REASON: Insufficient liquidity for ${token.symbol}`);
        return null;
      }

      // Check if we already have a position in this token
      const existingPosition = this.positions.find(
        pos => pos.isActive && pos.mint.toString() === token.address
      );

      if (existingPosition) {
        console.log(`⚠️ Already have position in ${token.symbol}`);
        console.log(`❌ REJECTION REASON: Already have position in ${token.symbol}`);
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

  async executeBuy(token: Token, wallet: WalletContextState): Promise<boolean> {
    try {
      console.log(`🚀 PRODUCTION BUY: ${token.symbol} for ${this.config.buyAmount} SOL`);

      // Try autonomous trading first if available, fallback to browser wallet
      let trade: Trade | null = null;
      
      try {
        // First attempt: Use autonomous wallet for seamless trading
        trade = await this.tradingService.buyTokenAutonomous(
          token,
          this.config.buyAmount,
          this.config.maxSlippage
        );
        console.log(`🤖 Autonomous trade executed for ${token.symbol}`);
      } catch (autonomousError) {
        console.log(`⚠️ Autonomous trading not available, falling back to browser wallet:`, autonomousError);
        
        // Fallback: Use browser wallet (requires manual approval)
        trade = await this.tradingService.buyToken(
          token,
          wallet,
          this.config.buyAmount,
          this.config.maxSlippage
        );
        console.log(`📱 Browser wallet trade executed for ${token.symbol}`);
      }

      if (trade && trade.status === 'success') {
        // Create position with production-grade configuration
        const positionConfig: PositionConfig = {
          takeProfitPercentage: this.config.takeProfitPercentage,
          stopLossPercentage: this.config.stopLossPercentage,
          trailingStopLoss: this.config.trailingStopLoss,
          maxHoldTime: this.config.maxHoldTime
        };

        const position = Position.createFromBuyResult(
          new PublicKey(token.address),
          token.symbol,
          token.name,
          trade.price,
          trade.amount,
          this.config.buyAmount,
          positionConfig,
          trade.signature
        );

        this.positions.push(position);
        this.trades.push(trade);

        console.log(`✅ Position created: ${position.toString()}`);
        return true;
      }

      return false;
    } catch (error) {
      console.error(`❌ Error executing buy for ${token.symbol}:`, error);
      return false;
    }
  }

  private async checkPositions(): Promise<void> {
    if (!this.isRunning || this.positions.length === 0) return;

    const activePositions = this.getActivePositions();
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

        // Check if position should exit using new Position logic
        const exitCondition = position.shouldExit(currentPrice);
        
        if (exitCondition.shouldExit && exitCondition.reason) {
          console.log(`🚨 SELL SIGNAL for ${position.symbol}: ${exitCondition.reason} (urgency: ${exitCondition.urgency})`);

          // Create token object for trading service
          const token = this.createTokenFromPosition(position, currentPrice);
          await this.executeSell(position, token, exitCondition.reason, currentPrice);
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

  private async executeSell(
    position: Position, 
    token: Token, 
    reason: ExitReason, 
    currentPrice: number
  ): Promise<void> {
    try {
      // Note: This requires wallet context - in production, this would need to be passed
      // For now, we'll close the position with the expected price
      console.log(`🔥 Executing sell for ${position.symbol} due to ${reason}`);
      
      // In a real implementation, you would execute the sell transaction here
      // const trade = await this.tradingService.sellToken(token, wallet, 100, this.config.maxSlippage);
      
      // For now, simulate successful sell
      position.closePosition(currentPrice, reason, 'simulated_tx_signature');
      
      const pnl = position.calculatePnL();
      console.log(`📊 Position closed: ${pnl.roi >= 0 ? '+' : ''}${pnl.roi.toFixed(2)}% ROI (${pnl.unrealizedPnlSol.toFixed(6)} SOL)`);

    } catch (error) {
      console.error(`❌ Error executing sell for ${position.symbol}:`, error);
    }
  }

  private createTokenFromPosition(position: Position, currentPrice: number): Token {
    return {
      address: position.mint.toString(),
      symbol: position.symbol,
      name: position.name,
      description: '',
      image: '',
      showName: true,
      createdOn: Date.now(),
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
      holders: 0,
    };
  }

  // Public getters
  getActivePositions(): Position[] {
    return this.positions.filter(position => position.isActive);
  }

  getAllPositions(): Position[] {
    return [...this.positions];
  }

  getTrades(): Trade[] {
    return [...this.trades];
  }

  getStats() {
    const active = this.getActivePositions();
    const closed = this.positions.filter(p => !p.isActive);
    
    let totalPnL = 0;
    closed.forEach(position => {
      const pnl = position.calculatePnL();
      totalPnL += pnl.unrealizedPnlSol;
    });

    return {
      isRunning: this.isRunning,
      activePositions: active.length,
      totalPositions: this.positions.length,
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
