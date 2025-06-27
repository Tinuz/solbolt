/**
 * Priority Fee Management Types
 * Based on Python implementation for production trading
 */

import { Connection, PublicKey } from '@solana/web3.js';

export interface PriorityFeeConfig {
  enableDynamicFee: boolean;
  enableFixedFee: boolean;
  fixedFee: number; // microlamports
  extraFeePercentage: number; // e.g., 0.1 for 10% increase
  hardCap: number; // maximum fee in microlamports
}

export interface PriorityFeePlugin {
  getPriorityFee(accounts?: PublicKey[]): Promise<number | null>;
}

export interface PriorityFeeResult {
  fee: number;
  source: 'dynamic' | 'fixed' | 'fallback';
  percentile?: number;
  accounts?: string[];
}
