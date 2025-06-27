/**
 * Bonding Curve State Parser
 * Exact implementation of Python BondingCurveState parsing
 */

import { PublicKey } from '@solana/web3.js';
import { 
  BondingCurveState, 
  BONDING_CURVE_DISCRIMINATOR, 
  LAMPORTS_PER_SOL, 
  TOKEN_DECIMALS 
} from './types';

export class BondingCurveStateParser {
  /**
   * Parse bonding curve account data
   * Mirrors Python struct parsing exactly
   */
  static parse(data: Buffer): BondingCurveState {
    if (data.length < 8) {
      throw new Error(`Invalid bonding curve data: too short (${data.length} bytes, need at least 8)`);
    }

    // Check discriminator (first 8 bytes)
    const discriminator = data.subarray(0, 8);
    const expectedDiscriminator = BONDING_CURVE_DISCRIMINATOR;
    
    if (!discriminator.equals(expectedDiscriminator)) {
      const actualHex = discriminator.toString('hex');
      const expectedHex = expectedDiscriminator.toString('hex');
      throw new Error(`Invalid bonding curve discriminator: got ${actualHex}, expected ${expectedHex}`);
    }

    // Check if we have enough data for the full struct
    const requiredLength = 8 + 8 + 8 + 8 + 8 + 8 + 1; // discriminator + 5 u64s + 1 bool
    if (data.length < requiredLength) {
      throw new Error(`Invalid bonding curve data: insufficient length (${data.length} bytes, need ${requiredLength})`);
    }

    // Parse struct fields (little-endian)
    let offset = 8;
    
    const virtualTokenReserves = data.readBigUInt64LE(offset);
    offset += 8;
    
    const virtualSolReserves = data.readBigUInt64LE(offset);
    offset += 8;
    
    const realTokenReserves = data.readBigUInt64LE(offset);
    offset += 8;
    
    const realSolReserves = data.readBigUInt64LE(offset);
    offset += 8;
    
    const tokenTotalSupply = data.readBigUInt64LE(offset);
    offset += 8;
    
    // Complete flag (1 byte)
    const complete = data.readUInt8(offset) !== 0;
    offset += 1;
    
    // Creator pubkey (32 bytes)
    const creatorBytes = data.subarray(offset, offset + 32);
    const creator = new PublicKey(creatorBytes);

    return {
      virtualTokenReserves,
      virtualSolReserves,
      realTokenReserves,
      realSolReserves,
      tokenTotalSupply,
      complete,
      creator
    };
  }

  /**
   * Calculate token price from curve state
   * Exact Python implementation
   */
  static calculatePrice(state: BondingCurveState): number {
    if (state.virtualTokenReserves <= BigInt(0) || state.virtualSolReserves <= BigInt(0)) {
      throw new Error('Invalid reserve state');
    }

    // Convert to float for calculation (like Python)
    const solReservesFloat = Number(state.virtualSolReserves) / LAMPORTS_PER_SOL;
    const tokenReservesFloat = Number(state.virtualTokenReserves) / Math.pow(10, TOKEN_DECIMALS);

    return solReservesFloat / tokenReservesFloat;
  }

  /**
   * Get token reserves in decimal form
   */
  static getTokenReserves(state: BondingCurveState): number {
    return Number(state.virtualTokenReserves) / Math.pow(10, TOKEN_DECIMALS);
  }

  /**
   * Get SOL reserves in decimal form
   */
  static getSolReserves(state: BondingCurveState): number {
    return Number(state.virtualSolReserves) / LAMPORTS_PER_SOL;
  }

  /**
   * Calculate expected tokens for SOL input
   */
  static calculateExpectedTokens(state: BondingCurveState, solAmount: number): number {
    const price = this.calculatePrice(state);
    return solAmount / price;
  }

  /**
   * Calculate market cap
   */
  static calculateMarketCap(state: BondingCurveState): number {
    const price = this.calculatePrice(state);
    const totalSupply = Number(state.tokenTotalSupply) / Math.pow(10, TOKEN_DECIMALS);
    return price * totalSupply;
  }

  /**
   * Calculate bonding curve progress (0-100%)
   */
  static calculateProgress(state: BondingCurveState): number {
    // This is a simplified calculation - adjust based on pump.fun specifics
    const maxSolReserves = 85; // Typical pump.fun graduation threshold
    const currentSol = this.getSolReserves(state);
    return Math.min((currentSol / maxSolReserves) * 100, 100);
  }
}
