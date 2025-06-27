import type { Position, Token, BotConfig } from '@/types';

export interface RiskMetrics {
  totalExposure: number;
  maxDrawdown: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  sharpeRatio: number;
  maxConsecutiveLosses: number;
}

export interface PositionRisk {
  riskLevel: 'low' | 'medium' | 'high';
  riskScore: number;
  reasons: string[];
  suggestedAction: 'hold' | 'reduce' | 'close';
}

export class RiskManager {
  private maxPortfolioRisk = 0.1; // 10% of portfolio
  private maxSinglePositionRisk = 0.02; // 2% per position
  private maxDrawdown = 0.2; // 20%
  private volatilityWindow = 20; // periods for volatility calculation

  calculatePortfolioRisk(positions: Position[], totalBalance: number): number {
    const totalValue = positions.reduce((sum, pos) => 
      sum + (pos.amount * pos.currentPrice), 0
    );
    return totalValue / totalBalance;
  }

  evaluatePositionRisk(position: Position, token: Token, config: BotConfig): PositionRisk {
    const risks: string[] = [];
    let riskScore = 0;

    // Age risk
    const ageHours = (Date.now() - position.openedAt) / (1000 * 60 * 60);
    if (ageHours > 24) {
      risks.push('Position held for over 24 hours');
      riskScore += 20;
    }

    // P&L risk
    if (position.pnlPercent < -config.stopLoss * 0.8) {
      risks.push('Approaching stop loss');
      riskScore += 30;
    }

    // Token graduation risk
    if (token.progress > 90) {
      risks.push('Token close to Raydium graduation');
      riskScore += 25;
    }

    // Market cap risk
    if (token.marketCap > 500000) {
      risks.push('High market cap token');
      riskScore += 15;
    }

    // Liquidity risk
    if (token.virtualSolReserves < 10) {
      risks.push('Low liquidity');
      riskScore += 20;
    }

    // Determine risk level and suggested action
    let riskLevel: 'low' | 'medium' | 'high';
    let suggestedAction: 'hold' | 'reduce' | 'close';

    if (riskScore < 30) {
      riskLevel = 'low';
      suggestedAction = 'hold';
    } else if (riskScore < 60) {
      riskLevel = 'medium';
      suggestedAction = 'reduce';
    } else {
      riskLevel = 'high';
      suggestedAction = 'close';
    }

    return {
      riskLevel,
      riskScore,
      reasons: risks,
      suggestedAction
    };
  }

  shouldReducePosition(position: Position, portfolioRisk: number): boolean {
    // Reduce if portfolio risk is too high
    if (portfolioRisk > this.maxPortfolioRisk) {
      return true;
    }

    // Reduce if position is in significant loss
    if (position.pnlPercent < -15) {
      return true;
    }

    // Reduce if position is very old
    const ageHours = (Date.now() - position.openedAt) / (1000 * 60 * 60);
    if (ageHours > 48) {
      return true;
    }

    return false;
  }

  calculateStopLoss(entryPrice: number, volatility: number): number {
    // Dynamic stop loss based on volatility
    const baseStopLoss = 0.15; // 15%
    const volatilityAdjustment = Math.min(volatility * 2, 0.1); // Max 10% adjustment
    return baseStopLoss + volatilityAdjustment;
  }

  calculateTakeProfit(entryPrice: number, marketConditions: 'bull' | 'bear' | 'neutral'): number {
    const baseTakeProfit = 0.5; // 50%
    
    switch (marketConditions) {
      case 'bull':
        return baseTakeProfit * 1.5; // 75%
      case 'bear':
        return baseTakeProfit * 0.6; // 30%
      default:
        return baseTakeProfit;
    }
  }

  analyzePortfolioMetrics(trades: any[], positions: Position[]): RiskMetrics {
    // Calculate win rate
    const completedTrades = trades.filter(t => t.status === 'success');
    const wins = completedTrades.filter(t => t.pnl > 0);
    const winRate = completedTrades.length > 0 ? wins.length / completedTrades.length : 0;

    // Calculate average win/loss
    const avgWin = wins.length > 0 ? 
      wins.reduce((sum, t) => sum + t.pnl, 0) / wins.length : 0;
    const losses = completedTrades.filter(t => t.pnl <= 0);
    const avgLoss = losses.length > 0 ? 
      losses.reduce((sum, t) => sum + t.pnl, 0) / losses.length : 0;

    // Calculate total exposure
    const totalExposure = positions.reduce((sum, pos) => 
      sum + (pos.amount * pos.currentPrice), 0);

    // Calculate max drawdown
    let maxDrawdown = 0;
    let peak = 0;
    let runningPnL = 0;
    
    for (const trade of completedTrades) {
      runningPnL += trade.pnl;
      if (runningPnL > peak) {
        peak = runningPnL;
      }
      const drawdown = (peak - runningPnL) / Math.max(peak, 1);
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }

    // Calculate consecutive losses
    let maxConsecutiveLosses = 0;
    let currentConsecutiveLosses = 0;
    
    for (const trade of completedTrades) {
      if (trade.pnl <= 0) {
        currentConsecutiveLosses++;
        maxConsecutiveLosses = Math.max(maxConsecutiveLosses, currentConsecutiveLosses);
      } else {
        currentConsecutiveLosses = 0;
      }
    }

    // Simple Sharpe ratio calculation
    const returns = completedTrades.map(t => t.pnl);
    const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
    const variance = returns.length > 0 ? 
      returns.reduce((sum, ret) => sum + Math.pow(ret - avgReturn, 2), 0) / returns.length : 0;
    const stdDev = Math.sqrt(variance);
    const sharpeRatio = stdDev > 0 ? avgReturn / stdDev : 0;

    return {
      totalExposure,
      maxDrawdown,
      winRate,
      avgWin,
      avgLoss,
      sharpeRatio,
      maxConsecutiveLosses
    };
  }

  getPositionSizeRecommendation(
    accountBalance: number, 
    tokenVolatility: number, 
    portfolioRisk: number
  ): number {
    // Kelly criterion for position sizing
    const baseSize = accountBalance * 0.01; // 1% of account
    
    // Adjust for volatility
    const volatilityAdjustment = Math.max(0.5, 1 - tokenVolatility);
    
    // Adjust for portfolio risk
    const riskAdjustment = Math.max(0.3, 1 - portfolioRisk);
    
    return baseSize * volatilityAdjustment * riskAdjustment;
  }

  shouldSkipToken(token: Token, config: BotConfig, currentPositions: number): boolean {
    // Skip if too many positions
    if (currentPositions >= config.maxPositions) {
      return true;
    }

    // Skip if token too old
    const tokenAge = (Date.now() - token.createdOn) / 1000;
    if (tokenAge > config.maxTokenAge) {
      return true;
    }

    // Skip if already graduated
    if (token.progress >= 100 || token.raydiumPool) {
      return true;
    }

    // Skip if market cap too high
    if (token.marketCap > 1000000) {
      return true;
    }

    // Skip if liquidity too low
    if (token.virtualSolReserves < 5) {
      return true;
    }

    return false;
  }
}
