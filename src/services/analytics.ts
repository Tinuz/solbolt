import type { Trade, Position, Token } from '@/types';

export interface PerformanceMetrics {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalReturn: number;
  totalReturnPercent: number;
  bestTrade: number;
  worstTrade: number;
  avgTradeReturn: number;
  profitFactor: number;
  sharpeRatio: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  avgHoldTime: number;
  tradingVolume: number;
}

export interface TokenAnalytics {
  symbol: string;
  address: string;
  timesTraded: number;
  totalPnL: number;
  winRate: number;
  avgReturn: number;
  bestTrade: number;
  worstTrade: number;
  lastTraded: number;
}

export interface TradingSession {
  startTime: number;
  endTime: number;
  duration: number;
  tokensDetected: number;
  tradesExecuted: number;
  successfulTrades: number;
  totalPnL: number;
  pnlPercent: number;
  maxDrawdown: number;
}

export class AnalyticsService {
  calculatePerformanceMetrics(trades: Trade[], initialBalance: number): PerformanceMetrics {
    const successfulTrades = trades.filter(t => t.status === 'success');
    const buyTrades = successfulTrades.filter(t => t.type === 'buy');
    const sellTrades = successfulTrades.filter(t => t.type === 'sell');
    
    // Group trades by token to calculate PnL
    const tradesByToken = new Map<string, { buy?: Trade; sell?: Trade }>();
    
    buyTrades.forEach(trade => {
      tradesByToken.set(trade.tokenAddress, { 
        ...tradesByToken.get(trade.tokenAddress), 
        buy: trade 
      });
    });
    
    sellTrades.forEach(trade => {
      tradesByToken.set(trade.tokenAddress, { 
        ...tradesByToken.get(trade.tokenAddress), 
        sell: trade 
      });
    });

    // Calculate individual trade returns
    const tradeReturns: number[] = [];
    const tradeDurations: number[] = [];
    let totalReturn = 0;
    let totalVolume = 0;

    for (const [tokenAddress, { buy, sell }] of tradesByToken) {
      if (buy && sell) {
        const pnl = sell.amount - buy.amount;
        const returnPercent = (pnl / buy.amount) * 100;
        tradeReturns.push(returnPercent);
        totalReturn += pnl;
        totalVolume += buy.amount;
        
        const holdTime = sell.timestamp - buy.timestamp;
        tradeDurations.push(holdTime);
      }
    }

    const winningTrades = tradeReturns.filter(r => r > 0).length;
    const losingTrades = tradeReturns.filter(r => r <= 0).length;
    const winRate = tradeReturns.length > 0 ? winningTrades / tradeReturns.length : 0;
    
    const totalReturnPercent = initialBalance > 0 ? (totalReturn / initialBalance) * 100 : 0;
    const bestTrade = tradeReturns.length > 0 ? Math.max(...tradeReturns) : 0;
    const worstTrade = tradeReturns.length > 0 ? Math.min(...tradeReturns) : 0;
    const avgTradeReturn = tradeReturns.length > 0 ? 
      tradeReturns.reduce((a, b) => a + b, 0) / tradeReturns.length : 0;

    // Profit factor
    const grossWins = tradeReturns.filter(r => r > 0).reduce((a, b) => a + b, 0);
    const grossLosses = Math.abs(tradeReturns.filter(r => r <= 0).reduce((a, b) => a + b, 0));
    const profitFactor = grossLosses > 0 ? grossWins / grossLosses : grossWins > 0 ? Infinity : 0;

    // Sharpe ratio (simplified)
    const avgReturn = avgTradeReturn;
    const variance = tradeReturns.length > 0 ? 
      tradeReturns.reduce((sum, ret) => sum + Math.pow(ret - avgReturn, 2), 0) / tradeReturns.length : 0;
    const stdDev = Math.sqrt(variance);
    const sharpeRatio = stdDev > 0 ? avgReturn / stdDev : 0;

    // Max drawdown
    let maxDrawdown = 0;
    let maxDrawdownPercent = 0;
    let peak = initialBalance;
    let runningBalance = initialBalance;

    const sortedTrades = successfulTrades
      .filter(t => t.type === 'sell')
      .sort((a, b) => a.timestamp - b.timestamp);

    for (const trade of sortedTrades) {
      const buyTrade = buyTrades.find(b => b.tokenAddress === trade.tokenAddress);
      if (buyTrade) {
        const pnl = trade.amount - buyTrade.amount;
        runningBalance += pnl;
        
        if (runningBalance > peak) {
          peak = runningBalance;
        }
        
        const drawdown = peak - runningBalance;
        const drawdownPercent = (drawdown / peak) * 100;
        
        if (drawdown > maxDrawdown) {
          maxDrawdown = drawdown;
          maxDrawdownPercent = drawdownPercent;
        }
      }
    }

    const avgHoldTime = tradeDurations.length > 0 ? 
      tradeDurations.reduce((a, b) => a + b, 0) / tradeDurations.length : 0;

    return {
      totalTrades: tradeReturns.length,
      winningTrades,
      losingTrades,
      winRate,
      totalReturn,
      totalReturnPercent,
      bestTrade,
      worstTrade,
      avgTradeReturn,
      profitFactor,
      sharpeRatio,
      maxDrawdown,
      maxDrawdownPercent,
      avgHoldTime,
      tradingVolume: totalVolume
    };
  }

  analyzeTokenPerformance(trades: Trade[]): TokenAnalytics[] {
    const tokenMap = new Map<string, {
      symbol: string;
      trades: Trade[];
      buyTrades: Trade[];
      sellTrades: Trade[];
    }>();

    // Group trades by token
    trades.filter(t => t.status === 'success').forEach(trade => {
      if (!tokenMap.has(trade.tokenAddress)) {
        tokenMap.set(trade.tokenAddress, {
          symbol: trade.tokenSymbol,
          trades: [],
          buyTrades: [],
          sellTrades: []
        });
      }
      
      const tokenData = tokenMap.get(trade.tokenAddress)!;
      tokenData.trades.push(trade);
      
      if (trade.type === 'buy') {
        tokenData.buyTrades.push(trade);
      } else {
        tokenData.sellTrades.push(trade);
      }
    });

    const analytics: TokenAnalytics[] = [];

    for (const [address, data] of tokenMap) {
      let totalPnL = 0;
      let completedTrades = 0;
      let wins = 0;
      let bestTrade = 0;
      let worstTrade = 0;
      let lastTraded = 0;

      // Calculate PnL for completed trades
      data.buyTrades.forEach(buyTrade => {
        const sellTrade = data.sellTrades.find(s => s.timestamp > buyTrade.timestamp);
        if (sellTrade) {
          const pnl = sellTrade.amount - buyTrade.amount;
          const returnPercent = (pnl / buyTrade.amount) * 100;
          
          totalPnL += pnl;
          completedTrades++;
          
          if (pnl > 0) wins++;
          if (returnPercent > bestTrade) bestTrade = returnPercent;
          if (returnPercent < worstTrade) worstTrade = returnPercent;
          if (sellTrade.timestamp > lastTraded) lastTraded = sellTrade.timestamp;
        }
      });

      if (data.trades.length > 0) {
        analytics.push({
          symbol: data.symbol,
          address,
          timesTraded: completedTrades,
          totalPnL,
          winRate: completedTrades > 0 ? wins / completedTrades : 0,
          avgReturn: completedTrades > 0 ? (totalPnL / completedTrades) : 0,
          bestTrade,
          worstTrade,
          lastTraded: lastTraded || Math.max(...data.trades.map(t => t.timestamp))
        });
      }
    }

    return analytics.sort((a, b) => b.totalPnL - a.totalPnL);
  }

  getTradingSessionStats(
    startTime: number,
    endTime: number,
    trades: Trade[],
    tokensDetected: number
  ): TradingSession {
    const sessionTrades = trades.filter(t => 
      t.timestamp >= startTime && t.timestamp <= endTime
    );
    
    const successfulTrades = sessionTrades.filter(t => t.status === 'success');
    const buyTrades = successfulTrades.filter(t => t.type === 'buy');
    const sellTrades = successfulTrades.filter(t => t.type === 'sell');
    
    let totalPnL = 0;
    let maxDrawdown = 0;
    let peak = 0;
    let runningPnL = 0;

    // Calculate session PnL
    buyTrades.forEach(buyTrade => {
      const sellTrade = sellTrades.find(s => 
        s.tokenAddress === buyTrade.tokenAddress && s.timestamp > buyTrade.timestamp
      );
      
      if (sellTrade) {
        const pnl = sellTrade.amount - buyTrade.amount;
        totalPnL += pnl;
        runningPnL += pnl;
        
        if (runningPnL > peak) peak = runningPnL;
        const drawdown = peak - runningPnL;
        if (drawdown > maxDrawdown) maxDrawdown = drawdown;
      }
    });

    const totalInvested = buyTrades.reduce((sum, t) => sum + t.amount, 0);
    const pnlPercent = totalInvested > 0 ? (totalPnL / totalInvested) * 100 : 0;

    return {
      startTime,
      endTime,
      duration: endTime - startTime,
      tokensDetected,
      tradesExecuted: sessionTrades.length,
      successfulTrades: successfulTrades.length,
      totalPnL,
      pnlPercent,
      maxDrawdown
    };
  }

  calculateDailyReturns(trades: Trade[]): { date: string; return: number }[] {
    const dailyReturns = new Map<string, number>();
    
    const successfulTrades = trades.filter(t => t.status === 'success');
    const buyTrades = successfulTrades.filter(t => t.type === 'buy');
    const sellTrades = successfulTrades.filter(t => t.type === 'sell');

    sellTrades.forEach(sellTrade => {
      const buyTrade = buyTrades.find(b => 
        b.tokenAddress === sellTrade.tokenAddress && b.timestamp < sellTrade.timestamp
      );
      
      if (buyTrade) {
        const date = new Date(sellTrade.timestamp).toISOString().split('T')[0];
        const pnl = sellTrade.amount - buyTrade.amount;
        const returnPercent = (pnl / buyTrade.amount) * 100;
        
        dailyReturns.set(date, (dailyReturns.get(date) || 0) + returnPercent);
      }
    });

    return Array.from(dailyReturns.entries())
      .map(([date, returnValue]) => ({ date, return: returnValue }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  getTopPerformingTokens(trades: Trade[], limit = 10): TokenAnalytics[] {
    return this.analyzeTokenPerformance(trades)
      .filter(t => t.timesTraded > 0)
      .sort((a, b) => b.totalPnL - a.totalPnL)
      .slice(0, limit);
  }

  getWorstPerformingTokens(trades: Trade[], limit = 10): TokenAnalytics[] {
    return this.analyzeTokenPerformance(trades)
      .filter(t => t.timesTraded > 0)
      .sort((a, b) => a.totalPnL - b.totalPnL)
      .slice(0, limit);
  }

  calculateHourlyActivity(trades: Trade[]): { hour: number; trades: number; volume: number }[] {
    const hourlyData = new Array(24).fill(0).map((_, hour) => ({
      hour,
      trades: 0,
      volume: 0
    }));

    trades.filter(t => t.status === 'success').forEach(trade => {
      const hour = new Date(trade.timestamp).getHours();
      hourlyData[hour].trades++;
      hourlyData[hour].volume += trade.amount;
    });

    return hourlyData;
  }

  exportTradingData(trades: Trade[], positions: Position[]): string {
    const data = {
      trades: trades.map(t => ({
        ...t,
        timestamp: new Date(t.timestamp).toISOString()
      })),
      positions: positions.map(p => ({
        ...p,
        timestamp: new Date(p.openedAt).toISOString()
      })),
      exportedAt: new Date().toISOString(),
      version: '1.0'
    };

    return JSON.stringify(data, null, 2);
  }
}
