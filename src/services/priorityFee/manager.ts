/**
 * Priority Fee Manager
 * Central manager with plugin architecture based on Python implementation
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { PriorityFeeConfig, PriorityFeeResult } from './types';
import { DynamicPriorityFee } from './dynamicFee';
import { FixedPriorityFee } from './fixedFee';

export class PriorityFeeManager {
  private connection: Connection;
  private config: PriorityFeeConfig;
  private dynamicFeePlugin: DynamicPriorityFee;
  private fixedFeePlugin: FixedPriorityFee;

  constructor(connection: Connection, config: PriorityFeeConfig) {
    this.connection = connection;
    this.config = config;
    this.dynamicFeePlugin = new DynamicPriorityFee(connection);
    this.fixedFeePlugin = new FixedPriorityFee(config.fixedFee);
  }

  /**
   * Calculate priority fee based on configuration
   * Mirrors Python implementation logic
   */
  async calculatePriorityFee(accounts?: PublicKey[]): Promise<PriorityFeeResult> {
    try {
      const baseFee = await this.getBaseFee(accounts);
      
      if (baseFee === null) {
        // No fee configured
        return {
          fee: 0,
          source: 'fallback'
        };
      }

      // Apply extra fee percentage (like Python extra_fee)
      const feeWithMultiplier = Math.round(baseFee * (1 + this.config.extraFeePercentage));
      
      // Enforce hard cap
      const finalFee = Math.min(feeWithMultiplier, this.config.hardCap);
      
      if (finalFee !== feeWithMultiplier) {
        console.warn(
          `⚠️ Priority fee ${feeWithMultiplier} exceeds hard cap ${this.config.hardCap}. Using capped value: ${finalFee}`
        );
      }

      return {
        fee: finalFee,
        source: this.config.enableDynamicFee ? 'dynamic' : 'fixed',
        accounts: accounts?.map(acc => acc.toString())
      };

    } catch (error) {
      console.error('❌ Priority fee calculation failed:', error);
      
      // Ultimate fallback
      const fallbackFee = Math.min(20000, this.config.hardCap); // 20k micro-lamports
      return {
        fee: fallbackFee,
        source: 'fallback'
      };
    }
  }

  /**
   * Get base fee from enabled plugins
   * FIXED: Better fallback logic when dynamic returns 0
   */
  private async getBaseFee(accounts?: PublicKey[]): Promise<number | null> {
    // Prefer dynamic fee if enabled
    if (this.config.enableDynamicFee) {
      const dynamicFee = await this.dynamicFeePlugin.getPriorityFee(accounts);
      if (dynamicFee !== null && dynamicFee > 0) {
        return dynamicFee;
      }
      
      // FIXED: If dynamic fee is 0, use a reasonable minimum for pump.fun
      if (dynamicFee === 0) {
        console.warn('⚠️ Dynamic fee returned 0, using minimum pump.fun fee');
        return 100000; // 100k micro-lamports minimum for pump.fun trades
      }
      
      console.warn('⚠️ Dynamic fee failed, trying fixed fee fallback');
    }

    // Fall back to fixed fee if enabled
    if (this.config.enableFixedFee) {
      const fixedFee = await this.fixedFeePlugin.getPriorityFee();
      if (fixedFee && fixedFee > 0) {
        return fixedFee;
      }
    }

    // FIXED: Ultimate fallback - never return null for pump.fun
    console.warn('⚠️ All priority fee methods failed, using emergency fallback');
    return 200000; // 200k micro-lamports emergency fallback
  }

  /**
   * Update configuration at runtime
   */
  updateConfig(config: Partial<PriorityFeeConfig>): void {
    this.config = { ...this.config, ...config };
    
    // Update plugins if needed
    if (config.fixedFee !== undefined) {
      this.fixedFeePlugin = new FixedPriorityFee(config.fixedFee);
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): PriorityFeeConfig {
    return { ...this.config };
  }
}
