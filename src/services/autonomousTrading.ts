import { Connection, PublicKey } from '@solana/web3.js';
import type { WalletContextState } from '@solana/wallet-adapter-react';
import { Token, Position, Trade } from '@/types';
import { TradingService } from './trading';
import { SolanaService } from './solana';

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
}

export interface TradingSignal {
  action: 'buy' | 'sell';
  token: Token;
  confidence: number;
  reason: string;
}

export class AutonomousTradingManager {
  private config: AutonomousTradingConfig;
  private connection: Connection;
  private wallet: WalletContextState;
  private tradingService: TradingService;
  private solanaService: SolanaService;
  private positions: Map<string, Position> = new Map();
  private isRunning: boolean = false;
  private priceCheckInterval: NodeJS.Timeout | null = null;

  constructor(connection: Connection, wallet: WalletContextState, config: AutonomousTradingConfig) {
    this.connection = connection;
    this.wallet = wallet;
    this.config = config;
    this.tradingService = new TradingService(connection);
    this.solanaService = new SolanaService();
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    
    this.isRunning = true;
    console.log('🤖 Autonomous trading manager started');
    
    this.startPriceMonitoring();
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    
    if (this.priceCheckInterval) {
      clearInterval(this.priceCheckInterval);
      this.priceCheckInterval = null;
    }
    
    console.log('⏹️ Autonomous trading manager stopped');
  }

  private startPriceMonitoring(): void {
    this.priceCheckInterval = setInterval(async () => {
      await this.checkPositions();
    }, this.config.priceCheckInterval);
  }

  private async checkPositions(): Promise<void> {
    console.log(`📊 Checking ${this.positions.size} open positions for price updates...`);
    
    for (const [tokenAddress, position] of this.positions) {
      if (position.status !== 'open') continue;
      
      try {
        console.log(`🔍 Checking position: ${position.tokenSymbol} (entry: ${position.entryPrice})`);
        
        // Get current token price using SolanaService (REAL DATA)
        const currentPrice = await this.solanaService.getTokenPrice(tokenAddress);
        if (currentPrice <= 0) {
          console.warn(`⚠️ Could not get price for ${position.tokenSymbol}, skipping`);
          continue;
        }

        // Update position with current price
        const oldPrice = position.currentPrice;
        position.currentPrice = currentPrice;
        position.currentValue = position.amount * currentPrice;
        position.pnl = position.currentValue - position.solInvested;
        position.pnlPercent = ((position.currentValue - position.solInvested) / position.solInvested) * 100;
        position.pnlPercentage = position.pnlPercent;

        console.log(`💹 ${position.tokenSymbol}: ${oldPrice.toFixed(8)} → ${currentPrice.toFixed(8)} SOL (${position.pnlPercent >= 0 ? '+' : ''}${position.pnlPercent.toFixed(2)}%)`);

        // Check if we should sell this position
        const shouldSell = await this.shouldSellPosition(position);
        if (shouldSell) {
          console.log(`🚨 SELL SIGNAL for ${position.tokenSymbol}: ${shouldSell.reason}`);
          
          // Create token object for selling
          const token = {
            address: position.tokenAddress,
            symbol: position.tokenSymbol,
            name: position.tokenName,
            price: currentPrice
          } as any;

          // Execute sell trade
          const sellSignal = {
            action: 'sell' as const,
            token,
            confidence: 1.0,
            reason: shouldSell.reason
          };

          const sellTrade = await this.executeTrade(sellSignal);
          if (sellTrade && sellTrade.status === 'success') {
            console.log(`✅ Successfully sold ${position.tokenSymbol} for ${sellTrade.signature}`);
          } else {
            console.error(`❌ Failed to sell ${position.tokenSymbol}`);
          }
        }
        
      } catch (error) {
        console.error(`❌ Error checking position for ${position.tokenSymbol}:`, error);
      }
    }
  }

  private async shouldSellPosition(position: Position): Promise<{ sell: boolean; reason: string } | null> {
    try {
      const priceChangePercent = position.pnlPercent;

      // Take profit check
      if (priceChangePercent >= this.config.takeProfitPercentage) {
        return {
          sell: true,
          reason: `Take profit hit: ${priceChangePercent.toFixed(2)}% >= ${this.config.takeProfitPercentage}%`
        };
      }

      // Stop loss check
      if (priceChangePercent <= -this.config.stopLossPercentage) {
        return {
          sell: true,
          reason: `Stop loss hit: ${priceChangePercent.toFixed(2)}% <= -${this.config.stopLossPercentage}%`
        };
      }

      // Token age check (emergency sell after X time)
      const positionAge = Date.now() - position.openedAt;
      const maxPositionAge = 24 * 60 * 60 * 1000; // 24 hours
      if (positionAge > maxPositionAge) {
        return {
          sell: true,
          reason: `Position too old: ${Math.round(positionAge / (60 * 60 * 1000))} hours`
        };
      }

      return null;
    } catch (error) {
      console.error(`❌ Error evaluating sell conditions for ${position.tokenSymbol}:`, error);
      return null;
    }
  }

  async processToken(token: Token): Promise<TradingSignal | null> {
    console.log(`🤖 AutonomousTrading: Processing token ${token.symbol}`);
    
    if (!this.config.enabled) {
      console.log(`❌ Autonomous trading disabled in config`);
      return null;
    }
    
    if (!this.shouldTradeToken(token)) {
      console.log(`❌ Token ${token.symbol} failed trading criteria`);
      return null;
    }
    
    const openPositions = Array.from(this.positions.values()).filter(p => p.status === 'open');
    console.log(`📊 Current open positions: ${openPositions.length}/${this.config.maxPositions}`);
    
    if (openPositions.length >= this.config.maxPositions) {
      console.log('⚠️ Max positions reached, skipping token');
      return null;
    }
    
    console.log(`🎯 Creating BUY signal for ${token.symbol}`);
    return {
      action: 'buy',
      token,
      confidence: 0.8,
      reason: 'New token detected with good fundamentals'
    };
  }

  private shouldTradeToken(token: Token): boolean {
    console.log(`🔍 Evaluating token ${token.symbol} for trading:`, {
      symbol: token.symbol,
      name: token.name,
      price: token.price
    });
    
    // Basic validation
    if (!token.symbol || !token.name || !token.address) {
      console.log(`❌ Missing basic token data`);
      return false;
    }
    
    // Price validation  
    if (!token.price || token.price <= 0) {
      console.log(`❌ Invalid token price: ${token.price}`);
      return false;
    }
    
    // Liquidity check (if available)
    if (token.liquidity && token.liquidity < this.config.minLiquidity) {
      console.log(`❌ Low liquidity: ${token.liquidity} < ${this.config.minLiquidity}`);
      return false;
    }
    
    // Token age check (if available)
    if (token.createdOn) {
      const tokenAge = Date.now() - token.createdOn;
      const maxAge = this.config.maxTokenAge * 60 * 1000; // minutes to ms
      if (tokenAge > maxAge) {
        console.log(`❌ Token too old: ${tokenAge}ms > ${maxAge}ms`);
        return false;
      }
    }
    
    console.log(`✅ Token ${token.symbol} passed all criteria`);
    return true;
  }

  async executeTrade(signal: TradingSignal): Promise<Trade | null> {
    try {
      console.log(`💼 Executing ${signal.action.toUpperCase()} trade for ${signal.token.symbol}`);
      console.log(`📋 Signal confidence: ${signal.confidence}, reason: ${signal.reason}`);
      
      if (!this.wallet.publicKey) {
        console.error('❌ Wallet not connected');
        return null;
      }

      let trade: Trade | null = null;

      if (signal.action === 'buy') {
        console.log(`💰 Buying ${this.config.buyAmount} SOL worth of ${signal.token.symbol}`);
        trade = await this.tradingService.buyToken(
          signal.token,
          this.wallet,
          this.config.buyAmount,
          this.config.maxSlippage
        );

        // If buy successful, add to positions
        if (trade && trade.status === 'success') {
          const position: Position = {
            id: trade.id,
            tokenAddress: signal.token.address,
            tokenSymbol: signal.token.symbol,
            tokenName: signal.token.name,
            amount: trade.amount, // Use trade.amount instead of trade.tokenAmount
            entryPrice: signal.token.price,
            currentPrice: signal.token.price,
            solInvested: this.config.buyAmount,
            currentValue: this.config.buyAmount,
            pnl: 0,
            pnlPercent: 0,
            pnlPercentage: 0,
            status: 'open',
            openedAt: Date.now()
          };
          
          this.positions.set(signal.token.address, position);
          console.log(`✅ Added position for ${signal.token.symbol} to tracking`);
        }

      } else if (signal.action === 'sell') {
        const position = this.positions.get(signal.token.address);
        if (!position || position.status !== 'open') {
          console.error(`❌ No open position found for ${signal.token.symbol}`);
          return null;
        }

        console.log(`💸 Selling ${position.amount} ${signal.token.symbol}`);
        trade = await this.tradingService.sellToken(
          signal.token,
          this.wallet,
          position.amount,
          this.config.maxSlippage
        );

        // If sell successful, close position
        if (trade && trade.status === 'success') {
          position.status = 'closed';
          position.closedAt = Date.now();
          console.log(`✅ Closed position for ${signal.token.symbol}`);
        }
      }

      return trade;

    } catch (error) {
      console.error(`❌ Error executing ${signal.action} trade for ${signal.token.symbol}:`, error);
      return null;
    }
  }

  getPositions(): Position[] {
    return Array.from(this.positions.values());
  }

  getOpenPositions(): Position[] {
    return Array.from(this.positions.values()).filter(p => p.status === 'open');
  }

  updateConfig(config: AutonomousTradingConfig): void {
    this.config = config;
    console.log('🔧 Autonomous trading config updated');
  }

  getStats() {
    const positions = this.getPositions();
    const openPositions = this.getOpenPositions();
    const totalInvested = positions.reduce((sum, p) => sum + p.solInvested, 0);
    const totalValue = openPositions.reduce((sum, p) => sum + p.currentValue, 0);
    const totalPnl = positions.reduce((sum, p) => sum + p.pnl, 0);

    return {
      totalPositions: positions.length,
      openPositions: openPositions.length,
      totalInvested,
      totalValue,
      totalPnl,
      totalPnlPercent: totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0
    };
  }

  isActive(): boolean {
    return this.isRunning;
  }
}
