import { EventEmitter } from 'events';
import { Connection, PublicKey } from '@solana/web3.js';
import { Token } from '@/types';
import { SolanaService } from './solana';

export interface PriceUpdate {
  token: Token;
  currentPrice: number;
  previousPrice: number;
  priceChange: number;
  priceChangePercent: number;
  timestamp: number;
  trend: 'up' | 'down' | 'stable';
}

export interface PriceHistory {
  timestamp: number;
  price: number;
}

export class PriceMonitoringService extends EventEmitter {
  private monitoredTokens = new Map<string, Token>();
  private priceHistory = new Map<string, PriceHistory[]>();
  private currentPrices = new Map<string, number>();
  private intervals = new Map<string, NodeJS.Timeout>();
  private solanaService: SolanaService;
  private isRunning = false;
  
  // Configuration
  private readonly UPDATE_INTERVAL = 10000; // 10 seconds
  private readonly HISTORY_LENGTH = 100; // Keep last 100 price points
  private readonly SIGNIFICANT_CHANGE_THRESHOLD = 2; // 2% change

  constructor(connection: Connection) {
    super();
    this.solanaService = new SolanaService();
  }

  /**
   * Start monitoring a token's price
   */
  startMonitoring(token: Token): void {
    const address = token.address;
    
    if (this.intervals.has(address)) {
      console.log(`📊 Already monitoring ${token.symbol}`);
      return;
    }

    console.log(`📊 Starting price monitoring for ${token.symbol}`);
    
    this.monitoredTokens.set(address, token);
    this.priceHistory.set(address, []);
    
    // Initial price fetch
    this.fetchPrice(token);
    
    // Set up interval for continuous monitoring
    const interval = setInterval(() => {
      this.fetchPrice(token);
    }, this.UPDATE_INTERVAL);
    
    this.intervals.set(address, interval);
  }

  /**
   * Stop monitoring a token's price
   */
  stopMonitoring(tokenAddress: string): void {
    const interval = this.intervals.get(tokenAddress);
    if (interval) {
      clearInterval(interval);
      this.intervals.delete(tokenAddress);
    }
    
    const token = this.monitoredTokens.get(tokenAddress);
    if (token) {
      console.log(`📊 Stopped price monitoring for ${token.symbol}`);
      this.monitoredTokens.delete(tokenAddress);
      this.priceHistory.delete(tokenAddress);
      this.currentPrices.delete(tokenAddress);
    }
  }

  /**
   * Stop monitoring all tokens
   */
  stopAllMonitoring(): void {
    this.intervals.forEach((interval, address) => {
      clearInterval(interval);
      const token = this.monitoredTokens.get(address);
      if (token) {
        console.log(`📊 Stopped price monitoring for ${token.symbol}`);
      }
    });
    
    this.intervals.clear();
    this.monitoredTokens.clear();
    this.priceHistory.clear();
    this.currentPrices.clear();
    this.isRunning = false;
  }

  /**
   * Fetch current price for a token
   */
  private async fetchPrice(token: Token): Promise<void> {
    try {
      const mintPubkey = new PublicKey(token.address);
      
      // Get bonding curve data for accurate price
      const curveData = await this.solanaService.getBondingCurveData(token.bondingCurve);
      
      if (!curveData) {
        console.warn(`⚠️ Could not get price for ${token.symbol}`);
        return;
      }

      const currentPrice = curveData.price;
      const previousPrice = this.currentPrices.get(token.address) || currentPrice;
      const timestamp = Date.now();

      // Calculate price change
      const priceChange = currentPrice - previousPrice;
      const priceChangePercent = previousPrice > 0 ? (priceChange / previousPrice) * 100 : 0;
      
      // Determine trend
      let trend: 'up' | 'down' | 'stable' = 'stable';
      if (Math.abs(priceChangePercent) > 0.1) { // 0.1% threshold for noise filtering
        trend = priceChangePercent > 0 ? 'up' : 'down';
      }

      // Update current price
      this.currentPrices.set(token.address, currentPrice);

      // Add to price history
      const history = this.priceHistory.get(token.address) || [];
      history.push({ timestamp, price: currentPrice });
      
      // Keep only recent history
      if (history.length > this.HISTORY_LENGTH) {
        history.shift();
      }
      
      this.priceHistory.set(token.address, history);

      // Create price update object
      const priceUpdate: PriceUpdate = {
        token,
        currentPrice,
        previousPrice,
        priceChange,
        priceChangePercent,
        timestamp,
        trend
      };

      // Emit events for different scenarios
      this.emit('priceUpdate', priceUpdate);

      // Emit significant changes
      if (Math.abs(priceChangePercent) >= this.SIGNIFICANT_CHANGE_THRESHOLD) {
        this.emit('significantPriceChange', priceUpdate);
        
        if (trend === 'up') {
          this.emit('priceIncrease', priceUpdate);
          console.log(`📈 ${token.symbol}: +${priceChangePercent.toFixed(2)}% (${currentPrice.toFixed(8)} SOL)`);
        } else if (trend === 'down') {
          this.emit('priceDecrease', priceUpdate);
          console.log(`📉 ${token.symbol}: ${priceChangePercent.toFixed(2)}% (${currentPrice.toFixed(8)} SOL)`);
        }
      }

      // Update token object with latest price
      token.price = currentPrice;
      token.priceChange24h = priceChangePercent;

    } catch (error) {
      console.error(`❌ Error fetching price for ${token.symbol}:`, error);
    }
  }

  /**
   * Get current price for a token
   */
  getCurrentPrice(tokenAddress: string): number | null {
    return this.currentPrices.get(tokenAddress) || null;
  }

  /**
   * Get price history for a token
   */
  getPriceHistory(tokenAddress: string): PriceHistory[] {
    return this.priceHistory.get(tokenAddress) || [];
  }

  /**
   * Get all monitored tokens
   */
  getMonitoredTokens(): Token[] {
    return Array.from(this.monitoredTokens.values());
  }

  /**
   * Get monitoring statistics
   */
  getStats() {
    return {
      monitoredTokens: this.monitoredTokens.size,
      isRunning: this.isRunning,
      updateInterval: this.UPDATE_INTERVAL,
      historyLength: this.HISTORY_LENGTH
    };
  }

  /**
   * Calculate price trend over a period
   */
  getTrend(tokenAddress: string, periodMinutes: number = 10): 'bullish' | 'bearish' | 'sideways' {
    const history = this.priceHistory.get(tokenAddress) || [];
    if (history.length < 2) return 'sideways';

    const cutoffTime = Date.now() - (periodMinutes * 60 * 1000);
    const relevantHistory = history.filter(h => h.timestamp >= cutoffTime);
    
    if (relevantHistory.length < 2) return 'sideways';

    const startPrice = relevantHistory[0].price;
    const endPrice = relevantHistory[relevantHistory.length - 1].price;
    const changePercent = ((endPrice - startPrice) / startPrice) * 100;

    if (changePercent > 1) return 'bullish';
    if (changePercent < -1) return 'bearish';
    return 'sideways';
  }

  /**
   * Get price change over a specific period
   */
  getPriceChange(tokenAddress: string, periodMinutes: number = 5): {
    change: number;
    changePercent: number;
    trend: 'up' | 'down' | 'stable';
  } {
    const history = this.priceHistory.get(tokenAddress) || [];
    if (history.length < 2) {
      return { change: 0, changePercent: 0, trend: 'stable' };
    }

    const cutoffTime = Date.now() - (periodMinutes * 60 * 1000);
    const relevantHistory = history.filter(h => h.timestamp >= cutoffTime);
    
    if (relevantHistory.length < 2) {
      return { change: 0, changePercent: 0, trend: 'stable' };
    }

    const startPrice = relevantHistory[0].price;
    const endPrice = relevantHistory[relevantHistory.length - 1].price;
    const change = endPrice - startPrice;
    const changePercent = (change / startPrice) * 100;

    let trend: 'up' | 'down' | 'stable' = 'stable';
    if (Math.abs(changePercent) > 0.5) {
      trend = changePercent > 0 ? 'up' : 'down';
    }

    return { change, changePercent, trend };
  }
}
