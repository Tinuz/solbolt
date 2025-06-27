/**
 * Bonding Curve Manager
 * Central manager for bonding curve operations like Python implementation
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { BondingCurveState, BondingCurveData } from './types';
import { BondingCurveStateParser } from './parser';

export class BondingCurveManager {
  private connection: Connection;

  constructor(connection: Connection) {
    this.connection = connection;
  }

  /**
   * Get bonding curve state from on-chain account
   * Mirrors Python get_curve_state method
   */
  async getCurveState(curveAddress: PublicKey): Promise<BondingCurveState> {
    try {
      console.log(`🔍 Fetching bonding curve state: ${curveAddress.toString()}`);
      
      const accountInfo = await this.connection.getAccountInfo(curveAddress);
      
      if (!accountInfo || !accountInfo.data) {
        throw new Error(`No data in bonding curve account ${curveAddress.toString()}`);
      }

      if (accountInfo.data.length === 0) {
        throw new Error(`Empty bonding curve account ${curveAddress.toString()}`);
      }

      const state = BondingCurveStateParser.parse(accountInfo.data);
      
      console.log(`✅ Bonding curve parsed successfully:`, {
        virtualSolReserves: BondingCurveStateParser.getSolReserves(state).toFixed(6),
        virtualTokenReserves: BondingCurveStateParser.getTokenReserves(state).toFixed(0),
        price: BondingCurveStateParser.calculatePrice(state).toFixed(8),
        complete: state.complete
      });

      return state;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Only log warnings for unexpected errors, not for common cases
      if (errorMessage.includes('No data in bonding curve account')) {
        // Expected for migrated tokens - don't spam logs
      } else if (errorMessage.includes('Invalid bonding curve discriminator')) {
        // Expected for non-pump.fun tokens - don't spam logs  
      } else {
        console.warn(`⚠️ Unexpected bonding curve error for ${curveAddress.toString()}: ${errorMessage}`);
      }
      
      // Don't re-throw, let caller handle gracefully
      throw error;
    }
  }

  /**
   * Get complete bonding curve data with calculations
   */
  async getBondingCurveData(curveAddress: PublicKey): Promise<BondingCurveData> {
    const state = await this.getCurveState(curveAddress);
    
    return {
      state,
      price: BondingCurveStateParser.calculatePrice(state),
      tokenReserves: BondingCurveStateParser.getTokenReserves(state),
      solReserves: BondingCurveStateParser.getSolReserves(state),
      marketCap: BondingCurveStateParser.calculateMarketCap(state),
      progress: BondingCurveStateParser.calculateProgress(state)
    };
  }

  /**
   * Calculate current token price
   * Mirrors Python calculate_price method
   */
  async calculatePrice(curveAddress: PublicKey): Promise<number> {
    const state = await this.getCurveState(curveAddress);
    return BondingCurveStateParser.calculatePrice(state);
  }

  /**
   * Calculate expected tokens for SOL input
   * Mirrors Python calculate_expected_tokens method
   */
  async calculateExpectedTokens(curveAddress: PublicKey, solAmount: number): Promise<number> {
    const state = await this.getCurveState(curveAddress);
    return BondingCurveStateParser.calculateExpectedTokens(state, solAmount);
  }

  /**
   * Check if bonding curve has graduated to Raydium
   */
  async isGraduated(curveAddress: PublicKey): Promise<boolean> {
    try {
      const state = await this.getCurveState(curveAddress);
      return state.complete;
    } catch (error) {
      console.warn(`⚠️ Could not check graduation status for ${curveAddress.toString()}:`, error);
      return false;
    }
  }

  /**
   * Get multiple bonding curve states in parallel
   */
  async getMultipleCurveStates(curveAddresses: PublicKey[]): Promise<Map<string, BondingCurveData>> {
    const results = new Map<string, BondingCurveData>();
    
    const promises = curveAddresses.map(async (address) => {
      try {
        const data = await this.getBondingCurveData(address);
        results.set(address.toString(), data);
      } catch (error) {
        console.warn(`⚠️ Failed to get curve data for ${address.toString()}:`, error);
      }
    });

    await Promise.allSettled(promises);
    return results;
  }
}
