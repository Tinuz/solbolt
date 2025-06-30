import { Connection, PublicKey } from '@solana/web3.js';
import type { WalletContextState } from '@solana/wallet-adapter-react';
import type { Token, Trade, Position, BotConfig } from '@/types';
import { TokenMonitorService } from './tokenMonitor';
import { TradingService } from './trading';
import { SolanaService } from './solana';
import { AutonomousTradingManager, AutonomousTradingConfig } from './autonomousTrading';
import configService from './config';
import type { PumpPortalMessage } from './pumpFunWebSocket';

export interface BotStats {
  tokensDetected: number;
  tradesExecuted: number;
  successfulTrades: number;
  failedTrades: number;
  totalPnl: number;
  totalPnlPercent: number;
  uptime: number;
  startTime: number;
}

export interface BotEventListener {
  onTokenDetected?: (token: Token) => void;
  onTradeExecuted?: (trade: Trade) => void;
  onPositionOpened?: (position: Position) => void;
  onPositionClosed?: (position: Position, trade: Trade) => void;
  onPriceUpdate?: (update: { tokenAddress: string; tokenSymbol: string; currentPrice: number; entryPrice: number; pnl: number; pnlPercent: number; amount: number; solInvested: number; }) => void;
  onError?: (error: Error) => void;
  onStatusChange?: (isRunning: boolean) => void;
  onStatsUpdate?: (stats: BotStats) => void;
}

export class PumpFunTradingBot {
  private connection: Connection;
  private wallet: WalletContextState;
  private config: BotConfig;
  private tokenMonitor: TokenMonitorService;
  private tradingService: TradingService;
  private solanaService: SolanaService;
  private autonomousTrading: AutonomousTradingManager | null = null;
  
  // Bot state
  private isRunning = false;
  private positions: Map<string, Position> = new Map();
  private trades: Trade[] = [];
  private stats: BotStats;
  private listeners: BotEventListener[] = [];
  
  // Intervals and timers
  private statsUpdateInterval: NodeJS.Timeout | null = null;
  
  constructor(
    connection: Connection,
    wallet: WalletContextState,
    config: BotConfig
  ) {
    this.connection = connection;
    this.wallet = wallet;
    this.config = config;
    
    // Initialize services
    this.tokenMonitor = new TokenMonitorService();
    this.tradingService = new TradingService(connection);
    // Use the same connection endpoint to ensure consistency
    const endpoint = connection.rpcEndpoint;
    console.log(`🔗 PumpFunBot: Using RPC endpoint from connection: ${endpoint}`);
    this.solanaService = new SolanaService(endpoint);
    
    // Set up price update callback
    this.tradingService.setOnPriceUpdateCallback((data) => {
      if (data.type === 'positionClosed') {
        // Handle position closure
        this.handlePositionClosure(data);
      } else {
        // Handle regular price update
        this.notifyListeners('onPriceUpdate', data);
      }
    });
    
    // Initialize stats
    this.stats = {
      tokensDetected: 0,
      tradesExecuted: 0,
      successfulTrades: 0,
      failedTrades: 0,
      totalPnl: 0,
      totalPnlPercent: 0,
      uptime: 0,
      startTime: Date.now(),
    };
    
    this.setupEventListeners();
  }

  private setupEventListeners() {
    // Listen for new tokens
    this.tokenMonitor.onNewToken(async (token: Token) => {
      this.stats.tokensDetected++;
      this.notifyListeners('onTokenDetected', token);
      
      // Evaluate if we should buy this token
      if (this.isRunning && this.shouldProcessToken(token)) {
        await this.handleNewToken(token);
      }
    });

    // Listen for trade events
    this.tokenMonitor.onTrade((trade: PumpPortalMessage) => {
      console.log(`Market activity: ${trade.txType} on ${trade.mint}`);
    });
  }

  addListener(listener: BotEventListener) {
    this.listeners.push(listener);
  }

  removeListener(listener: BotEventListener) {
    this.listeners = this.listeners.filter(l => l !== listener);
  }

  private notifyListeners(event: keyof BotEventListener, ...args: any[]) {
    this.listeners.forEach(listener => {
      const handler = listener[event];
      if (handler) {
        try {
          (handler as any)(...args);
        } catch (error) {
          console.error(`Error in event listener for ${event}:`, error);
        }
      }
    });
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('Bot is already running');
      return;
    }

    try {
      console.log('🚀 Starting SolBot v3...');
      
      // Initialize autonomous trading if enabled
      if (this.config.enabled && this.wallet.publicKey) {
        const autonomousConfig: AutonomousTradingConfig = {
          enabled: true,
          maxPositions: this.config.maxPositions,
          buyAmount: this.config.buyAmount,
          stopLossPercentage: this.config.stopLoss,
          takeProfitPercentage: this.config.takeProfit,
          maxSlippage: this.config.slippage,
          minLiquidity: 1, // Very low for testing (was 10)
          maxTokenAge: this.config.maxTokenAge * 60, // Convert to seconds
          priceCheckInterval: 30000 // 30 seconds
        };
        
        this.autonomousTrading = new AutonomousTradingManager(
          autonomousConfig,
          this.connection,
          this.tradingService,
          this.solanaService
        );
        
        this.autonomousTrading.start();
      }
      
      // Start token monitoring
      await this.tokenMonitor.startListening();
      
      // Start stats updates
      this.startStatsUpdate();
      
      this.isRunning = true;
      this.stats.startTime = Date.now();
      
      this.notifyListeners('onStatusChange', true);
      
      console.log('✅ Bot started successfully');
    } catch (error) {
      console.error('❌ Failed to start bot:', error);
      this.notifyListeners('onError', error as Error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      console.log('Bot is not running');
      return;
    }

    try {
      console.log('⏹️ Stopping SolBot v3...');
      
      this.isRunning = false;
      
      // Stop token monitoring
      this.tokenMonitor.stopListening();
      
      // Stop autonomous trading
      if (this.autonomousTrading) {
        await this.autonomousTrading.stop();
        this.autonomousTrading = null;
      }
      
      // Stop stats updates
      if (this.statsUpdateInterval) {
        clearInterval(this.statsUpdateInterval);
        this.statsUpdateInterval = null;
      }
      
      this.notifyListeners('onStatusChange', false);
      
      console.log('✅ Bot stopped successfully');
    } catch (error) {
      console.error('❌ Failed to stop bot:', error);
      this.notifyListeners('onError', error as Error);
      throw error;
    }
  }

  private shouldProcessToken(token: Token): boolean {
    console.log(`🔎 PumpFunBot: Pre-filtering token ${token.symbol}:`, {
      symbol: token.symbol,
      address: token.address,
      createdOn: token.createdOn,
      currentTime: Date.now()
    });

    // Check if token is too old
    const tokenAge = (Date.now() - token.createdOn) / (1000 * 60); // minutes
    console.log(`📅 Token age check: ${tokenAge.toFixed(2)} minutes (max: ${this.config.maxTokenAge} minutes)`);
    if (tokenAge > this.config.maxTokenAge) {
      console.log(`❌ Token too old in pre-filter: ${tokenAge.toFixed(2)}min > ${this.config.maxTokenAge}min`);
      return false;
    }
    
    // Check if we already have a position
    const hasPosition = this.positions.has(token.address);
    console.log(`💼 Position check: ${hasPosition ? 'ALREADY EXISTS' : 'NONE'}`);
    if (hasPosition) {
      console.log(`❌ Already have position for ${token.symbol}`);
      return false;
    }
    
    // Check max positions
    const openPositions = Array.from(this.positions.values()).filter(p => p.status === 'open');
    console.log(`📊 Position limit check: ${openPositions.length}/${this.config.maxPositions}`);
    if (openPositions.length >= this.config.maxPositions) {
      console.log(`❌ Max positions reached in pre-filter: ${openPositions.length} >= ${this.config.maxPositions}`);
      return false;
    }
    
    console.log(`✅ Token ${token.symbol} passed pre-filter - sending to autonomous trading`);
    return true;
  }

  private async handleNewToken(token: Token): Promise<void> {
    try {
      console.log(`🔍 PumpFunBot: Evaluating new token: ${token.symbol} (${token.name})`);
      console.log(`📊 Bot config:`, {
        enabled: this.config.enabled,
        maxTokenAge: this.config.maxTokenAge,
        maxPositions: this.config.maxPositions,
        buyAmount: this.config.buyAmount
      });
      console.log(`🤖 Autonomous trading status:`, {
        exists: !!this.autonomousTrading,
        isActive: this.autonomousTrading?.isRunningTrading() || false
      });
      
      // Use autonomous trading if available
      if (this.autonomousTrading && this.autonomousTrading.isRunningTrading()) {
        console.log(`🤖 Evaluating token for autonomous trading: ${token.symbol}`);
        try {
          const signal = await this.autonomousTrading.shouldBuyToken(token);
          if (signal && signal.action === 'buy') {
            console.log(`🎯 Autonomous trading signal: ${signal.action} ${token.symbol} - ${signal.reason}`);
            const success = await this.autonomousTrading.executeBuy(token);
            if (success) {
              console.log(`✅ Autonomous buy executed for ${token.symbol}`);
              // Get the latest trade from the manager
              const trades = this.autonomousTrading.getTrades();
              const latestTrade = trades[trades.length - 1];
              if (latestTrade) {
                this.addTrade(latestTrade);
              }
            } else {
              console.log(`❌ Autonomous buy failed for ${token.symbol}`);
            }
          } else {
            if (signal === null) {
              console.log(`❌ No trading signal generated for ${token.symbol} (shouldBuyToken returned null)`);
              console.log(`🔍 Check autonomous trading logs above for specific rejection reason`);
            } else {
              console.log(`❌ Unexpected signal result for ${token.symbol}:`, signal);
            }
          }
        } catch (error) {
          console.error(`❌ Error evaluating token ${token.symbol} for autonomous trading:`, error);
        }
        return;
      }

      // Fallback to basic evaluation
      console.log(`❌ Token ${token.symbol} evaluated but no autonomous trading active`);
    } catch (error) {
      console.error(`❌ Error handling new token ${token.symbol}:`, error);
      this.notifyListeners('onError', error as Error);
    }
  }

  private addTrade(trade: Trade): void {
    this.trades.push(trade);
    this.stats.tradesExecuted++;
    
    if (trade.status === 'success') {
      this.stats.successfulTrades++;
    } else if (trade.status === 'failed') {
      this.stats.failedTrades++;
    }
    
    this.notifyListeners('onTradeExecuted', trade);
    
    // Create position for buy trades
    if (trade.type === 'buy' && trade.status === 'success') {
      const position: Position = {
        id: `pos_${trade.id}`,
        tokenAddress: trade.tokenAddress,
        tokenSymbol: trade.tokenSymbol,
        tokenName: trade.tokenSymbol,
        amount: trade.amount,
        entryPrice: trade.price,
        currentPrice: trade.price,
        solInvested: trade.amount * trade.price,
        currentValue: trade.amount * trade.price,
        pnl: 0,
        pnlPercent: 0,
        pnlPercentage: 0,
        openedAt: trade.timestamp,
        status: 'open'
      };
      
      this.positions.set(trade.tokenAddress, position);
      this.notifyListeners('onPositionOpened', position);
    }
  }

  /**
   * Handle position closure events
   */
  private handlePositionClosure(data: any): void {
    const { tokenAddress, tokenSymbol, exitPrice, exitReason, sellTrade } = data;
    
    console.log(`🔄 Handling position closure for ${tokenSymbol}...`);
    
    // Update position status in our tracking
    const position = this.positions.get(tokenAddress);
    if (position) {
      position.status = 'closed';
      position.exitPrice = exitPrice;
      position.exitReason = exitReason;
      position.exitTimestamp = Date.now();
      
      // Calculate final PnL
      const pnl = position.currentValue - position.solInvested;
      const pnlPercent = position.solInvested > 0 ? (pnl / position.solInvested) * 100 : 0;
      
      position.pnl = pnl;
      position.pnlPercent = pnlPercent;
      position.pnlPercentage = pnlPercent;
      
      console.log(`💰 Position ${tokenSymbol} closed with ${pnlPercent > 0 ? 'profit' : 'loss'}: ${pnlPercent.toFixed(2)}%`);
    }
    
    // Add sell trade to history with correct values, but prevent duplicates
    if (sellTrade) {
      const alreadyExists = this.trades.some(t => t.signature && sellTrade.signature && t.signature === sellTrade.signature);
      if (!alreadyExists) {
        this.trades.unshift(sellTrade);
      }
      // Update stats
      this.stats.tradesExecuted++;
      if (sellTrade.status === 'success') {
        this.stats.successfulTrades++;
        // Calculate PnL for stats if we have position info
        if (position) {
          this.stats.totalPnl += position.pnl || 0;
          this.stats.totalPnlPercent = this.stats.successfulTrades > 0 
            ? (this.stats.totalPnl / this.stats.successfulTrades) * 100 
            : 0;
        }
      } else {
        this.stats.failedTrades++;
      }
    }
    
    // Notify UI about position closure
    this.notifyListeners('onPositionClosed', position, sellTrade);
    this.notifyListeners('onTradeExecuted', sellTrade);
    this.notifyListeners('onStatsUpdate', this.stats);
    
    console.log(`✅ Position closure handled for ${tokenSymbol}`);
  }

  private startStatsUpdate(): void {
    this.statsUpdateInterval = setInterval(() => {
      if (this.isRunning) {
        this.stats.uptime = Date.now() - this.stats.startTime;
        this.notifyListeners('onStatsUpdate', this.stats);
      }
    }, 1000);
  }

  updateConfig(newConfig: Partial<BotConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Update autonomous trading config if active
    if (this.autonomousTrading) {
      this.autonomousTrading.updateConfig({
        enabled: newConfig.enabled ?? this.config.enabled,
        maxPositions: newConfig.maxPositions || this.config.maxPositions,
        buyAmount: newConfig.buyAmount || this.config.buyAmount,
        stopLossPercentage: newConfig.stopLoss || this.config.stopLoss,
        takeProfitPercentage: newConfig.takeProfit || this.config.takeProfit,
        maxSlippage: newConfig.slippage || this.config.slippage,
        minLiquidity: 1000, // Default value
        maxTokenAge: (newConfig.maxTokenAge || this.config.maxTokenAge) * 60,
        priceCheckInterval: 30000 // Default 30 seconds
      });
    }
  }

  // Getters
  getStats(): BotStats {
    return { ...this.stats };
  }

  getPositions(): Position[] {
    return Array.from(this.positions.values());
  }

  getTrades(): Trade[] {
    return [...this.trades];
  }

  getConfig(): BotConfig {
    return { ...this.config };
  }

  isActive(): boolean {
    return this.isRunning;
  }

  getConnectionStatus(): string {
    return this.tokenMonitor.getConnectionStatus();
  }
}
