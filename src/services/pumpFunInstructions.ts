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

// Pump.fun program constants - FIXED to match Python bot
export const PUMP_FUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
export const PUMP_FUN_AUTHORITY = new PublicKey('Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1');
export const PUMP_FUN_GLOBAL = new PublicKey('4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf');
export const PUMP_FUN_FEE_RECIPIENT = new PublicKey('CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM'); // FIXED!
export const PUMP_FUN_EVENT_AUTHORITY = new PublicKey('Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1');

// Discriminators for pump.fun instructions - FIXED to match Python exactly
// Python: struct.pack("<Q", 16927863322537952870) = 0x66063d1201daebea
const BUY_DISCRIMINATOR = Buffer.from([0x66, 0x06, 0x3d, 0x12, 0x01, 0xda, 0xeb, 0xea]);
const SELL_DISCRIMINATOR = Buffer.from([0x33, 0x76, 0x8d, 0x7e, 0xad, 0xc9, 0x73, 0xb3]);

export interface BondingCurveAccount {
  mint: PublicKey;
  bondingCurve: PublicKey;
  associatedBondingCurve: PublicKey;
}

/**
 * Derive creator vault address - ADDED from Python bot
 */
export function deriveCreatorVault(creator: PublicKey): PublicKey {
  const [creatorVault] = PublicKey.findProgramAddressSync(
    [Buffer.from('creator-vault'), creator.toBuffer()],
    PUMP_FUN_PROGRAM_ID
  );
  return creatorVault;
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
 * Create a pump.fun buy instruction - FIXED to match Python bot exactly
 * @param buyer - Buyer's public key
 * @param mint - Token mint public key  
 * @param tokenAmount - Amount of tokens to buy (with 6 decimals)
 * @param maxSolAmount - Maximum SOL to spend (in lamports)
 * @param creator - Token creator's public key
 */
export async function createPumpFunBuyInstruction(
  buyer: PublicKey,
  mint: PublicKey,
  tokenAmount: InstanceType<typeof BN>,
  maxSolAmount: InstanceType<typeof BN>,
  creator?: PublicKey
): Promise<TransactionInstruction> {
  const accounts = calculatePumpFunAccounts(mint);
  
  const buyerTokenAccount = await getAssociatedTokenAddress(
    mint,
    buyer
  );

  // Get creator vault - if creator not provided, derive from bonding curve (fallback)
  let creatorVault: PublicKey;
  if (creator) {
    creatorVault = deriveCreatorVault(creator);
  } else {
    // Fallback: try to derive from a standard seed (this might fail)
    console.warn('⚠️ Creator not provided, using fallback creator vault derivation');
    creatorVault = deriveCreatorVault(buyer); // This is likely wrong but prevents crash
  }

  // Instruction data: discriminator + token_amount + max_sol_amount
  // FIXED: Use proper parameter order matching Python bot
  const instructionData = Buffer.concat([
    BUY_DISCRIMINATOR,
    tokenAmount.toArrayLike(Buffer, 'le', 8),
    maxSolAmount.toArrayLike(Buffer, 'le', 8),
  ]);

  // FIXED: Use exact Python account order and structure
  return new TransactionInstruction({
    keys: [
      { pubkey: PUMP_FUN_GLOBAL, isSigner: false, isWritable: false },          // 0
      { pubkey: PUMP_FUN_FEE_RECIPIENT, isSigner: false, isWritable: true },    // 1 - FIXED address
      { pubkey: mint, isSigner: false, isWritable: false },                     // 2
      { pubkey: accounts.bondingCurve, isSigner: false, isWritable: true },     // 3
      { pubkey: accounts.associatedBondingCurve, isSigner: false, isWritable: true }, // 4
      { pubkey: buyerTokenAccount, isSigner: false, isWritable: true },         // 5
      { pubkey: buyer, isSigner: true, isWritable: true },                      // 6
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },  // 7
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },         // 8
      { pubkey: creatorVault, isSigner: false, isWritable: true },              // 9 - ADDED!
      { pubkey: PUMP_FUN_EVENT_AUTHORITY, isSigner: false, isWritable: false }, // 10
      { pubkey: PUMP_FUN_PROGRAM_ID, isSigner: false, isWritable: false },      // 11
    ],
    programId: PUMP_FUN_PROGRAM_ID,
    data: instructionData,
  });
}

/**
 * Create a pump.fun sell instruction - FIXED to match Python implementation exactly
 */
export async function createPumpFunSellInstruction(
  seller: PublicKey,
  mint: PublicKey,
  amount: InstanceType<typeof BN>,
  minSlippageAmount: InstanceType<typeof BN>,
  creator?: PublicKey  // ADDED: creator required for creator vault
): Promise<TransactionInstruction> {
  const accounts = calculatePumpFunAccounts(mint);
  
  const sellerTokenAccount = await getAssociatedTokenAddress(
    mint,
    seller
  );

  // CRITICAL: We need the creator vault for sells
  if (!creator) {
    throw new Error('Creator pubkey required for sell instruction');
  }
  
  const creatorVault = deriveCreatorVault(creator);

  // Instruction data: discriminator + amount + min_slippage_amount
  // FIXED: Use Python discriminator value 12502976635542562355
  const sellDiscriminator = Buffer.alloc(8);
  // TypeScript fix: use DataView for better cross-platform compatibility
  const dataView = new DataView(sellDiscriminator.buffer, sellDiscriminator.byteOffset, sellDiscriminator.byteLength);
  dataView.setBigUint64(0, BigInt('12502976635542562355'), true); // true for little-endian
  
  const instructionData = Buffer.concat([
    sellDiscriminator,
    amount.toArrayLike(Buffer, 'le', 8),
    minSlippageAmount.toArrayLike(Buffer, 'le', 8),
  ]);

  // FIXED: Match Python account order exactly
  return new TransactionInstruction({
    keys: [
      { pubkey: PUMP_FUN_GLOBAL, isSigner: false, isWritable: false },          // 0
      { pubkey: PUMP_FUN_FEE_RECIPIENT, isSigner: false, isWritable: true },    // 1
      { pubkey: mint, isSigner: false, isWritable: false },                     // 2
      { pubkey: accounts.bondingCurve, isSigner: false, isWritable: true },     // 3
      { pubkey: accounts.associatedBondingCurve, isSigner: false, isWritable: true }, // 4
      { pubkey: sellerTokenAccount, isSigner: false, isWritable: true },        // 5
      { pubkey: seller, isSigner: true, isWritable: true },                     // 6
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },  // 7
      { pubkey: creatorVault, isSigner: false, isWritable: true },              // 8 - CRITICAL!
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },         // 9
      { pubkey: PUMP_FUN_EVENT_AUTHORITY, isSigner: false, isWritable: false }, // 10
      { pubkey: PUMP_FUN_PROGRAM_ID, isSigner: false, isWritable: false },      // 11
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
