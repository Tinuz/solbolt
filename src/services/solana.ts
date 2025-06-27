import { Connection, PublicKey, clusterApiUrl } from '@solana/web3.js';

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

  constructor(rpcUrl?: string) {
    this.connection = new Connection(
      rpcUrl || clusterApiUrl('mainnet-beta'),
      'confirmed'
    );
  }

  getConnection(): Connection {
    return this.connection;
  }

  async getTokenPrice(tokenAddress: string): Promise<number> {
    try {
      console.log(`🔍 Fetching REAL price for token: ${tokenAddress}`);
      
      // Try to get price from pump.fun curve (for pump.fun tokens)
      const pumpPrice = await this.getPumpFunPrice(tokenAddress);
      if (pumpPrice > 0) {
        console.log(`💰 Got pump.fun price: ${pumpPrice}`);
        return pumpPrice;
      }

      // Fallback: Try Jupiter API for other tokens
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

  async getBondingCurveData(bondingCurveAddress: string): Promise<any> {
    try {
      const bondingCurvePubkey = new PublicKey(bondingCurveAddress);
      const accountInfo = await this.connection.getAccountInfo(bondingCurvePubkey);
      
      if (!accountInfo) {
        return null;
      }

      // Parse bonding curve data (simplified)
      // In a real implementation, you'd decode the account data properly
      return {
        virtualSolReserves: 0,
        virtualTokenReserves: 0,
        realSolReserves: 0,
        realTokenReserves: 0,
        tokenTotalSupply: 0,
        complete: false,
      };
    } catch (error) {
      console.error('Error fetching bonding curve data:', error);
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

  async getPriorityFee(): Promise<number> {
    try {
      // Get recent priority fees
      const recentPriorityFees = await this.connection.getRecentPrioritizationFees();
      if (recentPriorityFees.length === 0) {
        return 0;
      }

      // Calculate average priority fee
      const avgFee = recentPriorityFees.reduce((sum, fee) => sum + fee.prioritizationFee, 0) / recentPriorityFees.length;
      return Math.max(avgFee, 1000); // Minimum 1000 micro-lamports
    } catch (error) {
      console.error('Error getting priority fee:', error);
      return 1000; // Default fallback
    }
  }
}
