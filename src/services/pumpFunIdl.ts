import { BN } from '@coral-xyz/anchor';
import { Connection, PublicKey, TransactionInstruction, AccountInfo } from '@solana/web3.js';
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';
import pumpFunIdl from '@/idl/pump_fun.json';

// Pump.fun program constants
export const PUMP_FUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
export const PUMP_FUN_AUTHORITY = new PublicKey('Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1');
export const PUMP_FUN_GLOBAL = new PublicKey('4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf');
export const PUMP_FUN_FEE_RECIPIENT = new PublicKey('CebN5NNx3gF9c3kFvpJC3qhCZdvGZPp8KzBzB7hS6Xbw');
export const PUMP_FUN_EVENT_AUTHORITY = new PublicKey('Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1');

// IDL-based instruction discriminators
const BUY_DISCRIMINATOR = Buffer.from([0x66, 0x06, 0x3d, 0x12, 0x01, 0x65, 0xcf, 0xea]);
const SELL_DISCRIMINATOR = Buffer.from([0x33, 0x76, 0x8d, 0x7e, 0xad, 0xc9, 0x73, 0xb3]);

export interface PumpFunAccounts {
  mint: PublicKey;
  bondingCurve: PublicKey;
  associatedBondingCurve: PublicKey;
}

export interface BondingCurveState {
  virtualTokenReserves: BN;
  virtualSolReserves: BN;
  realTokenReserves: BN;
  realSolReserves: BN;
  tokenTotalSupply: BN;
  complete: boolean;
}

export interface GlobalState {
  initialized: boolean;
  authority: PublicKey;
  feeRecipient: PublicKey;
  initialVirtualTokenReserves: BN;
  initialVirtualSolReserves: BN;
  initialRealTokenReserves: BN;
  tokenTotalSupply: BN;
  feeBasisPoints: BN;
}

export class PumpFunIdlService {
  private connection: Connection;
  private idl: typeof pumpFunIdl;

  constructor(connection: Connection) {
    this.connection = connection;
    this.idl = pumpFunIdl;
  }

  /**
   * Calculate pump.fun derived accounts
   */
  public calculateAccounts(mint: PublicKey): PumpFunAccounts {
    const [bondingCurve] = PublicKey.findProgramAddressSync(
      [Buffer.from('bonding-curve'), mint.toBuffer()],
      PUMP_FUN_PROGRAM_ID
    );

    const [associatedBondingCurve] = PublicKey.findProgramAddressSync(
      [
        bondingCurve.toBuffer(),
        TOKEN_PROGRAM_ID.toBuffer(),
        mint.toBuffer(),
      ],
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    return {
      mint,
      bondingCurve,
      associatedBondingCurve,
    };
  }

  /**
   * Create a buy instruction using IDL structure
   */
  public async createBuyInstruction(
    user: PublicKey,
    mint: PublicKey,
    amount: InstanceType<typeof BN>,
    maxSolCost: InstanceType<typeof BN>
  ): Promise<TransactionInstruction> {
    const accounts = this.calculateAccounts(mint);
    const userTokenAccount = await getAssociatedTokenAddress(mint, user);

    // Build instruction data according to IDL
    const instructionData = Buffer.concat([
      BUY_DISCRIMINATOR,
      amount.toArrayLike(Buffer, 'le', 8),
      maxSolCost.toArrayLike(Buffer, 'le', 8),
    ]);

    return new TransactionInstruction({
      keys: [
        { pubkey: PUMP_FUN_GLOBAL, isSigner: false, isWritable: false },
        { pubkey: PUMP_FUN_FEE_RECIPIENT, isSigner: false, isWritable: true },
        { pubkey: mint, isSigner: false, isWritable: false },
        { pubkey: accounts.bondingCurve, isSigner: false, isWritable: true },
        { pubkey: accounts.associatedBondingCurve, isSigner: false, isWritable: true },
        { pubkey: userTokenAccount, isSigner: false, isWritable: true },
        { pubkey: user, isSigner: true, isWritable: true },
        { pubkey: PublicKey.default, isSigner: false, isWritable: false }, // system program
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: PublicKey.default, isSigner: false, isWritable: false }, // rent
        { pubkey: PUMP_FUN_EVENT_AUTHORITY, isSigner: false, isWritable: false },
        { pubkey: PUMP_FUN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      programId: PUMP_FUN_PROGRAM_ID,
      data: instructionData,
    });
  }

  /**
   * Create a sell instruction using IDL structure
   */
  public async createSellInstruction(
    user: PublicKey,
    mint: PublicKey,
    amount: InstanceType<typeof BN>,
    minSolOutput: InstanceType<typeof BN>
  ): Promise<TransactionInstruction> {
    const accounts = this.calculateAccounts(mint);
    const userTokenAccount = await getAssociatedTokenAddress(mint, user);

    // Build instruction data according to IDL
    const instructionData = Buffer.concat([
      SELL_DISCRIMINATOR,
      amount.toArrayLike(Buffer, 'le', 8),
      minSolOutput.toArrayLike(Buffer, 'le', 8),
    ]);

    return new TransactionInstruction({
      keys: [
        { pubkey: PUMP_FUN_GLOBAL, isSigner: false, isWritable: false },
        { pubkey: PUMP_FUN_FEE_RECIPIENT, isSigner: false, isWritable: true },
        { pubkey: mint, isSigner: false, isWritable: false },
        { pubkey: accounts.bondingCurve, isSigner: false, isWritable: true },
        { pubkey: accounts.associatedBondingCurve, isSigner: false, isWritable: true },
        { pubkey: userTokenAccount, isSigner: false, isWritable: true },
        { pubkey: user, isSigner: true, isWritable: true },
        { pubkey: PublicKey.default, isSigner: false, isWritable: false }, // system program
        { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: PUMP_FUN_EVENT_AUTHORITY, isSigner: false, isWritable: false },
        { pubkey: PUMP_FUN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      programId: PUMP_FUN_PROGRAM_ID,
      data: instructionData,
    });
  }

  /**
   * Fetch bonding curve state by parsing account data
   */
  public async getBondingCurveState(mint: PublicKey): Promise<BondingCurveState | null> {
    try {
      const accounts = this.calculateAccounts(mint);
      const accountInfo = await this.connection.getAccountInfo(accounts.bondingCurve);
      
      if (!accountInfo || !accountInfo.data) {
        return null;
      }

      // Parse bonding curve data according to IDL structure
      return this.parseBondingCurveData(accountInfo.data);
    } catch (error) {
      console.error('Error fetching bonding curve state:', error);
      return null;
    }
  }

  /**
   * Fetch global state by parsing account data
   */
  public async getGlobalState(): Promise<GlobalState | null> {
    try {
      const accountInfo = await this.connection.getAccountInfo(PUMP_FUN_GLOBAL);
      
      if (!accountInfo || !accountInfo.data) {
        return null;
      }

      // Parse global state data according to IDL structure
      return this.parseGlobalData(accountInfo.data);
    } catch (error) {
      console.error('Error fetching global state:', error);
      return null;
    }
  }

  /**
   * Parse bonding curve data from raw account data
   */
  private parseBondingCurveData(data: Buffer): BondingCurveState {
    let offset = 8; // Skip discriminator
    
    const virtualTokenReserves = new BN(data.subarray(offset, offset + 8), 'le');
    offset += 8;
    
    const virtualSolReserves = new BN(data.subarray(offset, offset + 8), 'le');
    offset += 8;
    
    const realTokenReserves = new BN(data.subarray(offset, offset + 8), 'le');
    offset += 8;
    
    const realSolReserves = new BN(data.subarray(offset, offset + 8), 'le');
    offset += 8;
    
    const tokenTotalSupply = new BN(data.subarray(offset, offset + 8), 'le');
    offset += 8;
    
    const complete = data[offset] === 1;

    return {
      virtualTokenReserves,
      virtualSolReserves,
      realTokenReserves,
      realSolReserves,
      tokenTotalSupply,
      complete,
    };
  }

  /**
   * Parse global data from raw account data
   */
  private parseGlobalData(data: Buffer): GlobalState {
    let offset = 8; // Skip discriminator
    
    const initialized = data[offset] === 1;
    offset += 1;
    
    const authority = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;
    
    const feeRecipient = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;
    
    const initialVirtualTokenReserves = new BN(data.subarray(offset, offset + 8), 'le');
    offset += 8;
    
    const initialVirtualSolReserves = new BN(data.subarray(offset, offset + 8), 'le');
    offset += 8;
    
    const initialRealTokenReserves = new BN(data.subarray(offset, offset + 8), 'le');
    offset += 8;
    
    const tokenTotalSupply = new BN(data.subarray(offset, offset + 8), 'le');
    offset += 8;
    
    const feeBasisPoints = new BN(data.subarray(offset, offset + 8), 'le');

    return {
      initialized,
      authority,
      feeRecipient,
      initialVirtualTokenReserves,
      initialVirtualSolReserves,
      initialRealTokenReserves,
      tokenTotalSupply,
      feeBasisPoints,
    };
  }

  /**
   * Calculate token price based on bonding curve
   */
  public calculateTokenPrice(bondingCurveState: BondingCurveState): number {
    if (bondingCurveState.virtualTokenReserves.isZero()) {
      return 0;
    }

    // Price = virtualSolReserves / virtualTokenReserves
    const solReserves = bondingCurveState.virtualSolReserves.toNumber();
    const tokenReserves = bondingCurveState.virtualTokenReserves.toNumber();
    
    return solReserves / tokenReserves;
  }

  /**
   * Calculate bonding curve progress (percentage to completion)
   */
  public calculateProgress(bondingCurveState: BondingCurveState, globalState: GlobalState): number {
    if (bondingCurveState.complete) {
      return 100;
    }

    const currentReserves = bondingCurveState.realTokenReserves.toNumber();
    const maxReserves = globalState.initialRealTokenReserves.toNumber();
    
    if (maxReserves === 0) {
      return 0;
    }

    // Progress is based on how many real tokens have been sold
    const sold = maxReserves - currentReserves;
    return (sold / maxReserves) * 100;
  }

  /**
   * Calculate market cap
   */
  public calculateMarketCap(bondingCurveState: BondingCurveState): number {
    const price = this.calculateTokenPrice(bondingCurveState);
    const totalSupply = bondingCurveState.tokenTotalSupply.toNumber();
    
    return price * totalSupply;
  }

  /**
   * Parse trade events from transaction logs
   */
  public parseTradeEvents(logs: string[]): any[] {
    const events: any[] = [];
    
    try {
      // Parse program logs for events
      const programLogs = logs.filter(log => log.includes('Program log:'));
      
      for (const log of programLogs) {
        if (log.includes('TradeEvent')) {
          // Parse the event data from the log
          // This is a simplified version - actual implementation would need proper event parsing
          const eventData = this.parseEventFromLog(log);
          if (eventData) {
            events.push(eventData);
          }
        }
      }
    } catch (error) {
      console.error('Error parsing trade events:', error);
    }
    
    return events;
  }

  private parseEventFromLog(log: string): any | null {
    try {
      // This would need proper implementation based on actual log format
      // For now, return a mock event structure
      return {
        type: 'trade',
        timestamp: Date.now(),
        // Add other fields as needed
      };
    } catch (error) {
      console.error('Error parsing event from log:', error);
      return null;
    }
  }
}
