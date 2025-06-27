/**
 * Bonding Curve Types and Constants
 * Based on Python pump.fun implementation
 */

import { PublicKey } from '@solana/web3.js';

// Constants from Python implementation
export const LAMPORTS_PER_SOL = 1_000_000_000;
export const TOKEN_DECIMALS = 6;

// Discriminator for bonding curve account (from Python)
export const BONDING_CURVE_DISCRIMINATOR = Buffer.from([
  0x17, 0xb7, 0xd1, 0x36, 0x28, 0x18, 0x5a, 0x60
]); // 6966180631402821399 as little-endian bytes

export interface BondingCurveState {
  virtualTokenReserves: bigint;
  virtualSolReserves: bigint;
  realTokenReserves: bigint;
  realSolReserves: bigint;
  tokenTotalSupply: bigint;
  complete: boolean;
  creator: PublicKey;
}

export interface BondingCurveData {
  state: BondingCurveState;
  price: number;
  tokenReserves: number;
  solReserves: number;
  marketCap: number;
  progress: number;
}
