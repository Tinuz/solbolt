/**
 * RPC Rate Limiter Service
 * Prevents 429 errors by throttling RPC requests
 */

export interface RateLimiterConfig {
  requestsPerSecond: number;
  burstLimit: number;
  retryDelay: number;
  maxRetries: number;
}

export class RPCRateLimiter {
  private requestTimes: number[] = [];
  private config: RateLimiterConfig;

  constructor(config: RateLimiterConfig = {
    requestsPerSecond: parseInt(process.env.RATE_LIMIT_REQUESTS_PER_SEC || '20'), // Chainstack safe limit
    burstLimit: 5,        // Allow small bursts
    retryDelay: parseInt(process.env.RATE_LIMIT_BACKOFF || '2000'),     // 2 second retry delay
    maxRetries: parseInt(process.env.RATE_LIMIT_MAX_FAILURES || '5')    // Max 5 retries
  }) {
    this.config = config;
    console.log(`🚦 RPC Rate Limiter initialized: ${config.requestsPerSecond} requests/second (Chainstack limit: 25)`);
  }

  /**
   * Wait if necessary to respect rate limits
   */
  async waitForRateLimit(): Promise<void> {
    const now = Date.now();
    
    // Clean old requests (older than 1 second)
    this.requestTimes = this.requestTimes.filter(time => now - time < 1000);
    
    // Check if we're over the rate limit
    if (this.requestTimes.length >= this.config.requestsPerSecond) {
      const oldestRequest = Math.min(...this.requestTimes);
      const waitTime = 1000 - (now - oldestRequest);
      
      if (waitTime > 0) {
        console.log(`🐌 Rate limiting: waiting ${waitTime}ms before next RPC call`);
        await this.sleep(waitTime);
      }
    }
    
    // Record this request
    this.requestTimes.push(Date.now());
  }

  /**
   * Execute RPC call with rate limiting and retry logic
   */
  async executeRPCCall<T>(
    rpcCall: () => Promise<T>,
    operationName: string = 'RPC call'
  ): Promise<T> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        // Wait for rate limit
        await this.waitForRateLimit();
        
        // Execute the RPC call
        const result = await rpcCall();
        
        if (attempt > 1) {
          console.log(`✅ ${operationName} succeeded on attempt ${attempt}`);
        }
        
        return result;
        
      } catch (error: any) {
        lastError = error;
        
        // Check if it's a 429 error
        if (this.is429Error(error)) {
          const delay = this.config.retryDelay * Math.pow(2, attempt - 1); // Exponential backoff
          console.warn(`⚠️ 429 error on ${operationName} (attempt ${attempt}/${this.config.maxRetries}). Retrying in ${delay}ms`);
          
          if (attempt < this.config.maxRetries) {
            await this.sleep(delay);
            continue;
          }
        } else {
          // Non-429 error, throw immediately
          throw error;
        }
      }
    }
    
    // All retries failed
    console.error(`❌ ${operationName} failed after ${this.config.maxRetries} attempts`);
    throw lastError;
  }

  /**
   * Check if error is a 429 rate limit error
   */
  private is429Error(error: any): boolean {
    return (
      error?.message?.includes('429') ||
      error?.response?.status === 429 ||
      error?.status === 429 ||
      error?.toString().includes('Too Many Requests')
    );
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Update rate limiter configuration
   */
  updateConfig(newConfig: Partial<RateLimiterConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log(`🔧 Rate limiter config updated:`, this.config);
  }

  /**
   * Get current rate limit stats
   */
  getStats(): { 
    requestsInLastSecond: number; 
    config: RateLimiterConfig 
  } {
    const now = Date.now();
    const recentRequests = this.requestTimes.filter(time => now - time < 1000);
    
    return {
      requestsInLastSecond: recentRequests.length,
      config: this.config
    };
  }

  /**
   * Monitor Chainstack rate limit status
   * Log warnings when approaching the 25 requests/second limit
   */
  logRateLimitStatus(): void {
    const stats = this.getStats();
    const utilizationPercent = (stats.requestsInLastSecond / 25) * 100; // 25 = Chainstack limit
    
    if (utilizationPercent > 80) {
      console.warn(`⚠️ High RPC usage: ${stats.requestsInLastSecond}/25 requests (${utilizationPercent.toFixed(1)}% of Chainstack limit)`);
    } else if (utilizationPercent > 60) {
      console.log(`📊 Moderate RPC usage: ${stats.requestsInLastSecond}/25 requests (${utilizationPercent.toFixed(1)}% of Chainstack limit)`);
    }
  }
}

// Export singleton instance
export const rpcRateLimiter = new RPCRateLimiter();
