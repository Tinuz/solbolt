import { Connection, PublicKey } from '@solana/web3.js';
import { BondingCurveManager, BondingCurveData } from './bondingCurve';
import { PriorityFeeManager, PriorityFeeConfig } from './priorityFee';
import { configService } from './config';

export const PUMP_FUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
export const PUMP_GLOBAL_ACCOUNT = new PublicKey('4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf');
export const PUMP_EVENT_AUTHORITY = new PublicKey('Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1');
export const PUMP_FEE_RECIPIENT = new PublicKey('CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM');

export const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
export const SYSTEM_PROGRAM_ID = new PublicKey('11111111111111111111111111111112');
export const RENT_PROGRAM_ID = new PublicKey('SysvarRent111111111111111111111111111111111');

export class SolanaService {
  private connection: Connection;
  private bondingCurveManager: BondingCurveManager;
  private priorityFeeManager: PriorityFeeManager;
  private fallbackEndpoints: string[] = [
    'https://solana-mainnet.core.chainstack.com/69600811e0e036c9e11cecaecc1f1843',
    'https://mainnet.helius-rpc.com/?api-key=a360743f-773d-430c-afcd-70370fd20b87'
  ];

  constructor(rpcUrl?: string) {
    // Use config service to get the correct RPC endpoint
    const solanaConfig = configService.getSolanaConfig();
    let endpoint = rpcUrl || solanaConfig.rpcEndpoint;
    
    // Validate endpoint
    if (!endpoint || (!endpoint.startsWith('http://') && !endpoint.startsWith('https://'))) {
      console.warn(`⚠️ Invalid RPC endpoint: "${endpoint}", using fallback`);
      endpoint = this.fallbackEndpoints[0];
    }
    
    console.log(`🔗 Using RPC endpoint: ${endpoint}`);
    console.log(`🔧 Configured from: ${rpcUrl ? 'parameter' : 'config service'}`);
    console.log(`📊 Config details:`, { 
      provided: rpcUrl, 
      fromConfig: solanaConfig.rpcEndpoint,
      final: endpoint 
    });
    
    this.connection = new Connection(endpoint, 'confirmed');
    
    // Initialize managers
    this.bondingCurveManager = new BondingCurveManager(this.connection);
    
    // Configure priority fee manager for production trading
    const priorityFeeConfig: PriorityFeeConfig = {
      enableDynamicFee: true,
      enableFixedFee: true,
      fixedFee: 15000, // 15k micro-lamports fallback
      extraFeePercentage: 0.1, // 10% extra for faster execution
      hardCap: 100000 // 100k micro-lamports max
    };
    this.priorityFeeManager = new PriorityFeeManager(this.connection, priorityFeeConfig);
    
    console.log(`🔗 Connected to Solana RPC: ${endpoint}`);
    console.log(`🛠️ Initialized production-grade managers`);
  }

  getConnection(): Connection {
    return this.connection;
  }

  private async tryWithFallback<T>(
    operation: (connection: Connection) => Promise<T>,
    operationName: string
  ): Promise<T> {
    let lastError: Error | null = null;
    
    // Try current connection first
    try {
      return await operation(this.connection);
    } catch (error) {
      console.warn(`⚠️ ${operationName} failed with primary RPC:`, error);
      lastError = error as Error;
    }
    
    // Try fallback endpoints
    for (const endpoint of this.fallbackEndpoints) {
      try {
        console.log(`🔄 Trying fallback RPC: ${endpoint}`);
        const fallbackConnection = new Connection(endpoint, 'confirmed');
        const result = await operation(fallbackConnection);
        
        // If successful, update our primary connection
        this.connection = fallbackConnection;
        console.log(`✅ Switched to fallback RPC: ${endpoint}`);
        return result;
      } catch (error) {
        console.warn(`⚠️ Fallback RPC ${endpoint} failed:`, error);
        lastError = error as Error;
      }
    }
    
    // All endpoints failed
    throw lastError || new Error(`All RPC endpoints failed for ${operationName}`);
  }

  async getTokenPrice(tokenAddress: string, bondingCurveAddress?: string): Promise<number> {
    try {
      console.log(`🔍 Fetching REAL price for token: ${tokenAddress}`);
      
      // First try: Get price from bonding curve if address provided
      if (bondingCurveAddress) {
        try {
          const curveData = await this.getBondingCurveData(bondingCurveAddress);
          if (curveData && curveData.price > 0) {
            console.log(`💰 Got bonding curve price: ${curveData.price}`);
            return curveData.price;
          }
        } catch (error) {
          console.warn('⚠️ Bonding curve price failed, trying APIs:', error);
        }
      }
      
      // Second try: Get price from pump.fun API
      const pumpPrice = await this.getPumpFunPrice(tokenAddress);
      if (pumpPrice > 0) {
        console.log(`💰 Got pump.fun API price: ${pumpPrice}`);
        return pumpPrice;
      }

      // Third try: Jupiter API for other tokens
      const jupiterPrice = await this.getJupiterPrice(tokenAddress);
      if (jupiterPrice > 0) {
        console.log(`💰 Got Jupiter price: ${jupiterPrice}`);
        return jupiterPrice;
      }

      console.warn(`⚠️ No price found for token ${tokenAddress}, returning 0`);
      return 0;
    } catch (error) {
      console.error('❌ Error fetching token price:', error);
      return 0;
    }
  }

  private async getPumpFunPrice(tokenAddress: string): Promise<number> {
    try {
      // Get bonding curve account for pump.fun token
      const response = await fetch(`https://frontend-api.pump.fun/coins/${tokenAddress}`);
      if (!response.ok) return 0;
      
      const data = await response.json();
      if (data && data.usd_market_cap && data.total_supply) {
        // Calculate price from market cap and supply
        const price = (data.usd_market_cap / data.total_supply) * 0.000001; // Convert to SOL terms
        return price;
      }
      return 0;
    } catch (error) {
      console.error('❌ Error fetching pump.fun price:', error);
      return 0;
    }
  }

  private async getJupiterPrice(tokenAddress: string): Promise<number> {
    try {
      const response = await fetch(`https://price.jup.ag/v4/price?ids=${tokenAddress}`);
      if (!response.ok) return 0;
      
      const data = await response.json();
      if (data.data && data.data[tokenAddress]) {
        return data.data[tokenAddress].price || 0;
      }
      return 0;
    } catch (error) {
      console.error('❌ Error fetching Jupiter price:', error);
      return 0;
    }
  }

  async getTokenInfo(tokenAddress: string): Promise<any> {
    try {
      const tokenPubkey = new PublicKey(tokenAddress);
      const accountInfo = await this.connection.getAccountInfo(tokenPubkey);
      return accountInfo;
    } catch (error) {
      console.error('Error fetching token info:', error);
      return null;
    }
  }

  async getWalletBalance(walletAddress: string): Promise<number> {
    try {
      const publicKey = new PublicKey(walletAddress);
      const balance = await this.connection.getBalance(publicKey);
      return balance / 1e9; // Convert lamports to SOL
    } catch (error) {
      console.error('Error fetching wallet balance:', error);
      return 0;
    }
  }

  async getBondingCurveData(bondingCurveAddress: string): Promise<BondingCurveData | null> {
    try {
      console.log(`🔍 Fetching bonding curve data: ${bondingCurveAddress}`);
      const bondingCurvePubkey = new PublicKey(bondingCurveAddress);
      const curveData = await this.bondingCurveManager.getBondingCurveData(bondingCurvePubkey);
      
      console.log(`✅ Bonding curve data retrieved:`, {
        price: curveData.price.toFixed(8),
        solReserves: curveData.solReserves.toFixed(6),
        tokenReserves: curveData.tokenReserves.toFixed(0),
        marketCap: curveData.marketCap.toFixed(6),
        progress: curveData.progress.toFixed(2) + '%'
      });
      
      return curveData;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Don't spam logs for common expected errors
      if (errorMessage.includes('No data in bonding curve account')) {
        console.log(`⚠️ Bonding curve account ${bondingCurveAddress} has no data (possibly migrated to Raydium)`);
      } else if (errorMessage.includes('Invalid bonding curve discriminator')) {
        console.log(`⚠️ Bonding curve account ${bondingCurveAddress} has invalid format (not a pump.fun token)`);
      } else {
        console.warn(`⚠️ Could not fetch bonding curve data for ${bondingCurveAddress}: ${errorMessage}`);
      }
      
      return null;
    }
  }

  async simulateTransaction(transaction: any): Promise<any> {
    try {
      const simulation = await this.connection.simulateTransaction(transaction);
      return simulation;
    } catch (error) {
      console.error('Error simulating transaction:', error);
      return null;
    }
  }

  async getPriorityFee(accounts?: PublicKey[]): Promise<number> {
    try {
      console.log('🔍 Fetching priority fees with production-grade manager...');
      
      const result = await this.priorityFeeManager.calculatePriorityFee(accounts);
      
      console.log(`💰 Priority fee result:`, {
        fee: result.fee,
        source: result.source,
        accounts: result.accounts?.length || 0
      });
      
      return result.fee;
      
    } catch (error) {
      console.warn('⚠️ Priority fee manager failed, using ultimate fallback:', error);
      
      // Ultimate fallback
      const fallbackFee = 20000; // 20k micro-lamports for production
      console.log(`💰 Using ultimate fallback priority fee: ${fallbackFee} micro-lamports`);
      return fallbackFee;
    }
  }

  /**
   * Get bonding curve manager for advanced operations
   */
  getBondingCurveManager(): BondingCurveManager {
    return this.bondingCurveManager;
  }

  /**
   * Get priority fee manager for configuration
   */
  getPriorityFeeManager(): PriorityFeeManager {
    return this.priorityFeeManager;
  }
}
