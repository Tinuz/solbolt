/**
 * Dynamic Priority Fee Calculator
 * Fetches real-time priority fees from Solana network
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { PriorityFeePlugin } from './types';

export class DynamicPriorityFee implements PriorityFeePlugin {
  private connection: Connection;

  constructor(connection: Connection) {
    this.connection = connection;
  }

  /**
   * Get dynamic priority fee based on network conditions
   * Returns fee in micro-lamports
   */
  async getPriorityFee(accounts?: PublicKey[]): Promise<number | null> {
    try {
      console.log(`🔍 Fetching dynamic priority fees...`);
      
      // Get recent priority fee statistics
      const recentPriorityFees = await this.connection.getRecentPrioritizationFees({
        lockedWritableAccounts: accounts
      });

      if (!recentPriorityFees || recentPriorityFees.length === 0) {
        console.warn('⚠️ No recent priority fee data available');
        return null;
      }

      // Calculate 70th percentile (recommended for fast confirmation)
      const fees = recentPriorityFees
        .map(fee => fee.prioritizationFee)
        .sort((a, b) => a - b);
      
      const percentileIndex = Math.floor(fees.length * 0.70);
      const dynamicFee = fees[percentileIndex] || 0;

      console.log(`💰 Dynamic priority fee (70th percentile): ${dynamicFee} micro-lamports`);
      
      return dynamicFee;

    } catch (error) {
      console.error('❌ Failed to fetch dynamic priority fee:', error);
      return null;
    }
  }

  /**
   * Get priority fee for specific accounts
   */
  async getPriorityFeeForAccounts(accounts: PublicKey[]): Promise<number | null> {
    return this.getPriorityFee(accounts);
  }

  /**
   * Get recommended priority fee based on urgency
   */
  async getRecommendedFee(urgency: 'low' | 'medium' | 'high' = 'medium'): Promise<number | null> {
    try {
      const baseFee = await this.getPriorityFee();
      if (baseFee === null) return null;

      // Apply urgency multiplier
      const multipliers = {
        low: 1.0,     // Use base fee
        medium: 1.5,  // 50% higher
        high: 2.0     // 100% higher
      };

      const recommendedFee = Math.round(baseFee * multipliers[urgency]);
      console.log(`⚡ Recommended fee for ${urgency} urgency: ${recommendedFee} micro-lamports`);
      
      return recommendedFee;

    } catch (error) {
      console.error('❌ Failed to calculate recommended fee:', error);
      return null;
    }
  }
}
