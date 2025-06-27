/**
 * Fixed Priority Fee Plugin
 * Provides static fallback fees
 */

import { PublicKey } from '@solana/web3.js';
import { PriorityFeePlugin } from './types';

export class FixedPriorityFee implements PriorityFeePlugin {
  private fixedFee: number;

  constructor(fixedFee: number) {
    this.fixedFee = fixedFee;
  }

  async getPriorityFee(_accounts?: PublicKey[]): Promise<number | null> {
    if (this.fixedFee === 0) {
      return null;
    }
    
    console.log(`💰 Using fixed priority fee: ${this.fixedFee} micro-lamports`);
    return this.fixedFee;
  }
}
