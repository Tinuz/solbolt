import { useState, useEffect, useCallback, useRef } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import type { Token, Trade, Position, BotConfig } from '@/types';
import { PumpFunTradingBot, type BotStats, type BotEventListener } from '@/services/pumpFunBot';
import { RiskManager } from '@/services/riskManager';
import { AnalyticsService } from '@/services/analytics';

export interface UseBotState {
  // Bot state
  isRunning: boolean;
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error';
  
  // Data
  tokens: Token[];
  trades: Trade[];
  positions: Position[];
  stats: BotStats;
  config: BotConfig;
  
  // Actions
  startBot: () => Promise<void>;
  stopBot: () => Promise<void>;
  updateConfig: (newConfig: Partial<BotConfig>) => void;
  clearHistory: () => void;
  updatePositionPrices: (tokenAddress: string, newPrice: number) => void; // ⭐ ADD
  addTestPosition: () => void; // 🧪 TEST function
  
  // Utils
  formatTime: (timestamp: number) => string;
  formatDuration: (ms: number) => string;
  formatPrice: (price: number) => string;
  
  // Analytics
  getPerformanceMetrics: () => any;
  exportData: () => string;
  
  // Internal refs
  analytics: AnalyticsService;
  riskManager: RiskManager;
}

export function useBot(): UseBotState {
  const wallet = useWallet();
  const { connection } = useConnection();
  
  // Bot instances
  const botRef = useRef<PumpFunTradingBot | null>(null);
  const riskManager = useRef(new RiskManager()).current;
  const analytics = useRef(new AnalyticsService()).current;
  
  // State
  const [isRunning, setIsRunning] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('disconnected');
  const [tokens, setTokens] = useState<Token[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [stats, setStats] = useState<BotStats>({
    tokensDetected: 0,
    tradesExecuted: 0,
    successfulTrades: 0,
    failedTrades: 0,
    totalPnl: 0,
    totalPnlPercent: 0,
    uptime: 0,
    startTime: Date.now()
  });
  
  const [config, setConfig] = useState<BotConfig>(() => {
    const botConfig = {
      enabled: true,
      maxTokenAge: 30, // 30 minutes
      buyAmount: parseFloat(process.env.NEXT_PUBLIC_DEFAULT_BUY_AMOUNT || '0.001'), // Use env var
      sellPercentage: 100,
      stopLoss: parseFloat(process.env.NEXT_PUBLIC_STOP_LOSS_PERCENTAGE || '20'),
      takeProfit: parseFloat(process.env.NEXT_PUBLIC_TAKE_PROFIT_PERCENTAGE || '100'),
      maxPositions: parseInt(process.env.NEXT_PUBLIC_MAX_CONCURRENT_POSITIONS || '1'), // ⭐ KEY FIX: Use env var
      slippage: parseFloat(process.env.NEXT_PUBLIC_MAX_SLIPPAGE || '5')
    };
    
    console.log('🔧 Bot Config loaded from environment:', {
      maxPositions: botConfig.maxPositions,
      buyAmount: botConfig.buyAmount,
      stopLoss: botConfig.stopLoss,
      takeProfit: botConfig.takeProfit,
      fromEnv: {
        MAX_CONCURRENT_POSITIONS: process.env.NEXT_PUBLIC_MAX_CONCURRENT_POSITIONS,
        DEFAULT_BUY_AMOUNT: process.env.NEXT_PUBLIC_DEFAULT_BUY_AMOUNT,
        MAX_SLIPPAGE: process.env.NEXT_PUBLIC_MAX_SLIPPAGE
      }
    });
    
    return botConfig;
  });

  // Bot event listener
  const botEventListener: BotEventListener = {
    onTokenDetected: (token: Token) => {
      console.log('🔍 Token detected:', token.symbol);
      setTokens(prev => [token, ...prev.slice(0, 49)]); // Keep last 50
      setStats(prev => ({ ...prev, tokensDetected: prev.tokensDetected + 1 }));
    },
    
    onTradeExecuted: (trade: Trade) => {
      console.log('💱 Trade executed:', trade.type, trade.tokenSymbol);
      setTrades(prev => [trade, ...prev.slice(0, 99)]); // Keep last 100
      setStats(prev => ({ 
        ...prev, 
        tradesExecuted: prev.tradesExecuted + 1,
        successfulTrades: trade.status === 'success' ? prev.successfulTrades + 1 : prev.successfulTrades,
        failedTrades: trade.status === 'failed' ? prev.failedTrades + 1 : prev.failedTrades
      }));
      
      // Update positions based on trade
      if (trade.type === 'buy') {
        // Calculate token amount from SOL investment and token price
        const tokenAmount = trade.amount / trade.price; // trade.amount is SOL invested, trade.price is token price
        
        const position: Position = {
          id: `pos_${trade.id}`,
          tokenAddress: trade.tokenAddress,
          tokenSymbol: trade.tokenSymbol,
          tokenName: trade.tokenSymbol,
          amount: tokenAmount, // ⭐ FIX: Use calculated token amount, not SOL amount
          entryPrice: trade.price,
          currentPrice: trade.price,
          solInvested: trade.amount, // This is the SOL amount invested
          currentValue: trade.amount, // Initially same as invested
          pnl: 0,
          pnlPercent: 0,
          pnlPercentage: 0,
          openedAt: trade.timestamp,
          status: 'open'
        };
        
        console.log(`📊 Created position for ${trade.tokenSymbol}:`, {
          tokenAmount: tokenAmount.toFixed(6),
          solInvested: trade.amount.toFixed(6),
          entryPrice: trade.price.toFixed(8)
        });
        
        setPositions(prev => [position, ...prev]);
      } else {
        // Close position on sell
        setPositions(prev => prev.map(pos => 
          pos.tokenAddress === trade.tokenAddress 
            ? { ...pos, status: 'closed' as const, closedAt: trade.timestamp }
            : pos
        ));
      }
    },
    
    onPositionClosed: (position: Position) => {
      setPositions(prev => prev.map(pos => 
        pos.id === position.id ? position : pos
      ));
    },
    
    onPriceUpdate: (update: { tokenAddress: string; tokenSymbol: string; currentPrice: number; entryPrice: number; pnl: number; pnlPercent: number; amount: number; solInvested: number; }) => {
      console.log('📊 Price update received:', update.tokenSymbol, 'Current:', update.currentPrice, 'PnL:', update.pnlPercent.toFixed(2) + '%');
      
      // Update the position with new price data
      setPositions(prev => prev.map(pos => {
        if (pos.tokenAddress === update.tokenAddress && pos.status === 'open') {
          const currentValue = update.amount * update.currentPrice;
          return {
            ...pos,
            currentPrice: update.currentPrice,
            currentValue,
            pnl: update.pnl,
            pnlPercent: update.pnlPercent,
            pnlPercentage: update.pnlPercent
          };
        }
        return pos;
      }));
    },
    
    onError: (error: Error) => {
      console.error('❌ Bot error:', error);
      setConnectionStatus('error');
    },
    
    onStatusChange: (running: boolean) => {
      setIsRunning(running);
      setConnectionStatus(running ? 'connected' : 'disconnected');
    }
  };

  // Initialize bot
  const initializeBot = useCallback(async () => {
    if (!wallet.connected || !wallet.publicKey || botRef.current) return;
    
    try {
      setConnectionStatus('connecting');
      
      const bot = new PumpFunTradingBot(
        connection,
        wallet,
        config
      );
      
      bot.addListener(botEventListener);
      
      botRef.current = bot;
      setConnectionStatus('connected');
      
      console.log('✅ Bot initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize bot:', error);
      setConnectionStatus('error');
    }
  }, [wallet.connected, wallet.publicKey, config]);

  // Start bot
  const startBot = useCallback(async () => {
    if (!botRef.current) {
      await initializeBot();
      if (!botRef.current) throw new Error('Failed to initialize bot');
    }
    
    try {
      await botRef.current.start();
      setIsRunning(true);
      setConnectionStatus('connected');
      setStats(prev => ({ ...prev, startTime: Date.now(), uptime: 0 }));
      console.log('🚀 Bot started successfully');
    } catch (error) {
      console.error('❌ Failed to start bot:', error);
      setConnectionStatus('error');
      throw error;
    }
  }, [initializeBot]);

  // Stop bot
  const stopBot = useCallback(async () => {
    if (!botRef.current) return;
    
    try {
      await botRef.current.stop();
      setIsRunning(false);
      setConnectionStatus('disconnected');
      console.log('⏹️ Bot stopped');
    } catch (error) {
      console.error('❌ Failed to stop bot:', error);
      throw error;
    }
  }, []);

  // Update config
  const updateConfig = useCallback((newConfig: Partial<BotConfig>) => {
    setConfig(prev => ({ ...prev, ...newConfig }));
    
    if (botRef.current) {
      botRef.current.updateConfig({ ...config, ...newConfig });
    }
  }, [config]);

  // Clear history
  const clearHistory = useCallback(() => {
    setTrades([]);
    setTokens([]);
    setPositions(prev => prev.filter(pos => pos.status === 'open'));
    setStats(prev => ({
      ...prev,
      tokensDetected: 0,
      tradesExecuted: 0,
      successfulTrades: 0,
      failedTrades: 0
    }));
  }, []);

  // Function to update positions with new price data
  const updatePositionPrices = useCallback((tokenAddress: string, newPrice: number) => {
    setPositions(prev => prev.map(pos => {
      if (pos.tokenAddress === tokenAddress && pos.status === 'open') {
        const currentValue = pos.amount * newPrice;
        const pnl = currentValue - pos.solInvested;
        const pnlPercent = pos.solInvested > 0 ? (pnl / pos.solInvested) * 100 : 0;
        
        return {
          ...pos,
          currentPrice: newPrice,
          currentValue,
          pnl,
          pnlPercent,
          pnlPercentage: pnlPercent
        };
      }
      return pos;
    }));
  }, []);

  // TEST: Add a dummy position for testing the amount calculation
  const addTestPosition = useCallback(() => {
    const testTrade: Trade = {
      id: 'test_' + Date.now(),
      type: 'buy',
      tokenAddress: 'HwN6vNdaY89fzuHUhzLD9JyCdyCtpvxE2tApw1u5pump',
      tokenSymbol: 'INTERN', 
      amount: 0.001, // 0.001 SOL invested
      price: 0.00000003, // $0.00000003 per token
      timestamp: Date.now(),
      status: 'success'
    };

    // This should create a position with:
    // - amount: 0.001 / 0.00000003 = 33,333.33 tokens
    // - solInvested: 0.001 SOL
    const tokenAmount = testTrade.amount / testTrade.price;
    
    const position: Position = {
      id: `pos_${testTrade.id}`,
      tokenAddress: testTrade.tokenAddress,
      tokenSymbol: testTrade.tokenSymbol,
      tokenName: testTrade.tokenSymbol,
      amount: tokenAmount,
      entryPrice: testTrade.price,
      currentPrice: testTrade.price,
      solInvested: testTrade.amount,
      currentValue: testTrade.amount,
      pnl: 0,
      pnlPercent: 0,
      pnlPercentage: 0,
      openedAt: testTrade.timestamp,
      status: 'open'
    };
    
    console.log(`🧪 TEST: Added test position:`, {
      tokenAmount: tokenAmount.toFixed(2),
      solInvested: testTrade.amount,
      price: testTrade.price
    });
    
    setPositions(prev => [position, ...prev]);
    setTrades(prev => [testTrade, ...prev]);
  }, []);

  // Utility functions
  const formatTime = useCallback((timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString();
  }, []);

  const formatDuration = useCallback((ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }, []);

  const formatPrice = useCallback((price: number) => {
    if (price >= 1) {
      return price.toFixed(3);
    } else if (price >= 0.001) {
      return price.toFixed(6);
    } else {
      return price.toExponential(2);
    }
  }, []);

  // Analytics
  const getPerformanceMetrics = useCallback(() => {
    const openPositions = positions.filter(p => p.status === 'open');
    const closedPositions = positions.filter(p => p.status === 'closed');
    const successfulTrades = trades.filter(t => t.status === 'success');
    
    return {
      totalTrades: trades.length,
      successfulTrades: successfulTrades.length,
      successRate: trades.length > 0 ? (successfulTrades.length / trades.length) * 100 : 0,
      totalPnl: closedPositions.reduce((sum, pos) => sum + pos.pnl, 0),
      openPositions: openPositions.length,
      averageTradeSize: trades.length > 0 ? trades.reduce((sum, t) => sum + (t.amount * t.price), 0) / trades.length : 0
    };
  }, [trades, positions]);

  const exportData = useCallback(() => {
    const data = {
      trades,
      positions,
      tokens,
      stats,
      config,
      timestamp: Date.now(),
      performance: getPerformanceMetrics()
    };
    return JSON.stringify(data, null, 2);
  }, [trades, positions, tokens, stats, config, getPerformanceMetrics]);

  // Update stats periodically
  useEffect(() => {
    const interval = setInterval(() => {
      if (isRunning) {
        setStats(prev => ({
          ...prev,
          uptime: Date.now() - prev.startTime,
          successRate: prev.tradesExecuted > 0 ? (prev.successfulTrades / prev.tradesExecuted) * 100 : 0
        }));
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning]);

  // Calculate real-time P&L
  useEffect(() => {
    const calculatePnl = () => {
      const openPositions = positions.filter(p => p.status === 'open');
      const closedPositions = positions.filter(p => p.status === 'closed');
      
      const openPnl = openPositions.reduce((sum, pos) => sum + pos.pnl, 0);
      const closedPnl = closedPositions.reduce((sum, pos) => sum + pos.pnl, 0);
      
      setStats(prev => ({
        ...prev,
        totalPnl: openPnl + closedPnl
      }));
    };

    calculatePnl();
  }, [positions]);

  // Initialize on wallet connection
  useEffect(() => {
    if (wallet.connected && wallet.publicKey) {
      initializeBot();
    } else {
      // Clean up when wallet disconnects
      if (botRef.current && isRunning) {
        stopBot();
      }
      botRef.current = null;
      setConnectionStatus('disconnected');
    }
  }, [wallet.connected, wallet.publicKey, initializeBot, isRunning, stopBot]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (botRef.current && isRunning) {
        botRef.current.stop();
      }
    };
  }, [isRunning]);

  return {
    // State
    isRunning,
    connectionStatus,
    tokens,
    trades,
    positions,
    stats,
    config,
    
    // Actions
    startBot,
    stopBot,
    updateConfig,
    clearHistory,
    updatePositionPrices, // ⭐ ADD: Function to update position prices
    addTestPosition, // 🧪 TEST function
    
    // Utils
    formatTime,
    formatDuration,
    formatPrice,
    
    // Analytics
    getPerformanceMetrics,
    exportData,
    
    // Internal refs
    analytics,
    riskManager
  };
}
