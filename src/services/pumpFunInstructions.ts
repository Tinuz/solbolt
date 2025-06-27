import {
  PublicKey,
  TransactionInstruction,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
} from '@solana/spl-token';
import { BN } from 'bn.js';

// Pump.fun program constants
export const PUMP_FUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
export const PUMP_FUN_AUTHORITY = new PublicKey('Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1');
export const PUMP_FUN_GLOBAL = new PublicKey('4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf');
export const PUMP_FUN_FEE_RECIPIENT = new PublicKey('CebN5NNx3gF9c3kFvpJC3qhCZdvGZPp8KzBzB7hS6Xbw');
export const PUMP_FUN_EVENT_AUTHORITY = new PublicKey('Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1');

// Discriminators for pump.fun instructions
const BUY_DISCRIMINATOR = Buffer.from([0x66, 0x06, 0x3d, 0x12, 0x01, 0x65, 0xcf, 0xea]);
const SELL_DISCRIMINATOR = Buffer.from([0x33, 0x76, 0x8d, 0x7e, 0xad, 0xc9, 0x73, 0xb3]);

export interface BondingCurveAccount {
  mint: PublicKey;
  bondingCurve: PublicKey;
  associatedBondingCurve: PublicKey;
}

/**
 * Calculate derived accounts for pump.fun tokens
 */
export function calculatePumpFunAccounts(mint: PublicKey): BondingCurveAccount {
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
 * Create a pump.fun buy instruction
 */
export async function createPumpFunBuyInstruction(
  buyer: PublicKey,
  mint: PublicKey,
  amount: InstanceType<typeof BN>,
  maxSlippageAmount: InstanceType<typeof BN>
): Promise<TransactionInstruction> {
  const accounts = calculatePumpFunAccounts(mint);
  
  const buyerTokenAccount = await getAssociatedTokenAddress(
    mint,
    buyer
  );

  // Instruction data: discriminator + amount + max_slippage_amount
  const instructionData = Buffer.concat([
    BUY_DISCRIMINATOR,
    amount.toArrayLike(Buffer, 'le', 8),
    maxSlippageAmount.toArrayLike(Buffer, 'le', 8),
  ]);

  return new TransactionInstruction({
    keys: [
      { pubkey: PUMP_FUN_GLOBAL, isSigner: false, isWritable: false },
      { pubkey: PUMP_FUN_FEE_RECIPIENT, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: accounts.bondingCurve, isSigner: false, isWritable: true },
      { pubkey: accounts.associatedBondingCurve, isSigner: false, isWritable: true },
      { pubkey: buyerTokenAccount, isSigner: false, isWritable: true },
      { pubkey: buyer, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      { pubkey: PUMP_FUN_EVENT_AUTHORITY, isSigner: false, isWritable: false },
      { pubkey: PUMP_FUN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    programId: PUMP_FUN_PROGRAM_ID,
    data: instructionData,
  });
}

/**
 * Create a pump.fun sell instruction
 */
export async function createPumpFunSellInstruction(
  seller: PublicKey,
  mint: PublicKey,
  amount: InstanceType<typeof BN>,
  minSlippageAmount: InstanceType<typeof BN>
): Promise<TransactionInstruction> {
  const accounts = calculatePumpFunAccounts(mint);
  
  const sellerTokenAccount = await getAssociatedTokenAddress(
    mint,
    seller
  );

  // Instruction data: discriminator + amount + min_slippage_amount
  const instructionData = Buffer.concat([
    SELL_DISCRIMINATOR,
    amount.toArrayLike(Buffer, 'le', 8),
    minSlippageAmount.toArrayLike(Buffer, 'le', 8),
  ]);

  return new TransactionInstruction({
    keys: [
      { pubkey: PUMP_FUN_GLOBAL, isSigner: false, isWritable: false },
      { pubkey: PUMP_FUN_FEE_RECIPIENT, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: accounts.bondingCurve, isSigner: false, isWritable: true },
      { pubkey: accounts.associatedBondingCurve, isSigner: false, isWritable: true },
      { pubkey: sellerTokenAccount, isSigner: false, isWritable: true },
      { pubkey: seller, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: PUMP_FUN_EVENT_AUTHORITY, isSigner: false, isWritable: false },
      { pubkey: PUMP_FUN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    programId: PUMP_FUN_PROGRAM_ID,
    data: instructionData,
  });
}

/**
 * Create associated token account instruction if needed
 */
export function createAssociatedTokenAccountInstruction(
  payer: PublicKey,
  associatedToken: PublicKey,
  owner: PublicKey,
  mint: PublicKey
): TransactionInstruction {
  return new TransactionInstruction({
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: associatedToken, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ],
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    data: Buffer.alloc(0),
  });
}
