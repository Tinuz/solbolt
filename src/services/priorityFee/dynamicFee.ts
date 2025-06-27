/**
 * Dynamic Priority Fee Plugin
 * Uses getRecentPrioritizationFees with 70th percentile like Python implementation
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { PriorityFeePlugin } from './types';

export class DynamicPriorityFee implements PriorityFeePlugin {
  private connection: Connection;

  constructor(connection: Connection) {
    this.connection = connection;
  }

  async getPriorityFee(accounts?: PublicKey[]): Promise<number | null> {
    try {
      console.log('🔍 Fetching dynamic priority fees...');
      
      // Get recent prioritization fees
      const recentFees = await this.connection.getRecentPrioritizationFees({
        lockedWritableAccounts: accounts,
      });

      if (!recentFees || recentFees.length === 0) {
        console.warn('⚠️ No prioritization fees found in response');
        return null;
      }

      // Extract fees array
      const fees = recentFees.map(fee => fee.prioritizationFee);
      
      if (fees.length === 0) {
        console.warn('⚠️ No valid fees in response');
        return null;
      }

      // Calculate 70th percentile like Python (faster processing but higher fee)
      // This means you're paying more than 70% of other transactions
      const priorityFee = this.calculatePercentile(fees, 70);
      
      console.log(`💰 Dynamic priority fee (70th percentile): ${priorityFee} micro-lamports`);
      return priorityFee;

    } catch (error) {
      console.error('❌ Failed to fetch dynamic priority fee:', error);
      return null;
    }
  }

  private calculatePercentile(fees: number[], percentile: number): number {
    // Sort fees in ascending order
    const sortedFees = [...fees].sort((a, b) => a - b);
    
    if (sortedFees.length === 0) return 0;
    if (sortedFees.length === 1) return sortedFees[0];
    
    // Calculate index for percentile
    const index = (percentile / 100) * (sortedFees.length - 1);
    
    if (Number.isInteger(index)) {
      return sortedFees[index];
    }
    
    // Interpolate between values
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;
    
    return Math.round(
      sortedFees[lower] * (1 - weight) + sortedFees[upper] * weight
    );
  }
}
