/**
 * Autonomous Wallet Service
 * Provides programmatic transaction signing for autonomous trading
 * Similar to Python bot's private key approach
 */

import { 
  Connection, 
  Keypair, 
  PublicKey, 
  Transaction, 
  VersionedTransaction,
  SendOptions
} from '@solana/web3.js';
import { rpcRateLimiter } from './rpcRateLimiter';
import bs58 from 'bs58';

export interface AutonomousWalletInterface {
  publicKey: PublicKey;
  signTransaction(transaction: Transaction): Promise<Transaction>;
  signAllTransactions(transactions: Transaction[]): Promise<Transaction[]>;
  sendTransaction(transaction: Transaction, options?: SendOptions): Promise<string>;
}

export class AutonomousWallet implements AutonomousWalletInterface {
  private keypair: Keypair;
  private connection: Connection;

  constructor(privateKeyBase58: string, connection: Connection) {
    try {
      const privateKeyBytes = bs58.decode(privateKeyBase58);
      this.keypair = Keypair.fromSecretKey(privateKeyBytes);
      this.connection = connection;
      
      console.log(`🔑 Autonomous wallet initialized: ${this.publicKey.toString()}`);
    } catch (error) {
      throw new Error(`Failed to initialize autonomous wallet: ${error}`);
    }
  }

  get publicKey(): PublicKey {
    return this.keypair.publicKey;
  }

  async signTransaction(transaction: Transaction): Promise<Transaction> {
    try {
      console.log(`🔐 Programmatically signing transaction`);
      transaction.sign(this.keypair);
      return transaction;
    } catch (error) {
      console.error('❌ Failed to sign transaction:', error);
      throw new Error(`Transaction signing failed: ${error}`);
    }
  }

  async signAllTransactions(transactions: Transaction[]): Promise<Transaction[]> {
    try {
      console.log(`🔐 Programmatically signing ${transactions.length} transactions`);
      return transactions.map(tx => {
        tx.sign(this.keypair);
        return tx;
      });
    } catch (error) {
      console.error('❌ Failed to sign transactions:', error);
      throw new Error(`Batch transaction signing failed: ${error}`);
    }
  }

  async sendTransaction(
    transaction: Transaction, 
    options: SendOptions = {}
  ): Promise<string> {
    try {
      // Sign the transaction
      await this.signTransaction(transaction);

      // Send with rate limiting (like Python bot approach)
      const signature = await rpcRateLimiter.executeRPCCall(
        () => this.connection.sendRawTransaction(
          transaction.serialize(),
          {
            skipPreflight: true, // Like Python bot
            preflightCommitment: 'confirmed',
            ...options
          }
        ),
        'sendRawTransaction(autonomous)'
      );

      console.log(`✅ Transaction sent autonomously: ${signature}`);
      return signature;

    } catch (error) {
      console.error('❌ Failed to send transaction:', error);
      throw new Error(`Transaction sending failed: ${error}`);
    }
  }

  async confirmTransaction(signature: string): Promise<boolean> {
    try {
      console.log(`🔍 Confirming transaction: ${signature}`);
      
      // Use polling instead of WebSocket (more reliable for Chainstack)
      const maxAttempts = 30; // 30 attempts
      const pollInterval = 2000; // 2 seconds between checks
      
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const response = await rpcRateLimiter.executeRPCCall(
            () => this.connection.getSignatureStatus(signature, {
              searchTransactionHistory: true
            }),
            `getSignatureStatus(attempt ${attempt})`
          );

          if (response.value) {
            const status = response.value;
            
            if (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized') {
              const success = !status.err;
              console.log(`${success ? '✅' : '❌'} Transaction ${success ? 'confirmed' : 'failed'}: ${signature}`);
              if (status.err) {
                console.error(`Transaction error:`, status.err);
              }
              return success;
            }
            
            console.log(`⏳ Transaction status (attempt ${attempt}/${maxAttempts}): ${status.confirmationStatus || 'pending'}`);
          } else {
            console.log(`⏳ Transaction not found yet (attempt ${attempt}/${maxAttempts})`);
          }
          
          // Wait before next attempt (except on last attempt)
          if (attempt < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, pollInterval));
          }
          
        } catch (pollError) {
          console.warn(`⚠️ Polling attempt ${attempt} failed:`, pollError);
          
          // Wait before retry
          if (attempt < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, pollInterval));
          }
        }
      }
      
      console.warn(`⚠️ Transaction confirmation timeout after ${maxAttempts} attempts: ${signature}`);
      return false;

    } catch (error) {
      console.error('❌ Failed to confirm transaction:', error);
      return false;
    }
  }

  /**
   * Get SOL balance
   */
  async getBalance(): Promise<number> {
    try {
      const balanceLamports = await rpcRateLimiter.executeRPCCall(
        () => this.connection.getBalance(this.publicKey),
        'getBalance(autonomous)'
      );
      
      return balanceLamports / 1_000_000_000; // Convert to SOL
    } catch (error) {
      console.error('❌ Failed to get balance:', error);
      return 0;
    }
  }

  /**
   * Test method to verify autonomous wallet functionality
   */
  async testConnection(): Promise<boolean> {
    try {
      const balance = await this.connection.getBalance(this.publicKey);
      console.log(`🔍 Autonomous wallet test: Public key ${this.publicKey.toString()}, Balance: ${balance / 1e9} SOL`);
      return true;
    } catch (error) {
      console.error(`❌ Autonomous wallet test failed:`, error);
      return false;
    }
  }

  /**
   * Static method to check if autonomous trading is configured
   */
  static isConfigured(): boolean {
    return !!process.env.NEXT_PUBLIC_AUTONOMOUS_PRIVATE_KEY;
  }

  /**
   * Static method to create autonomous wallet from environment
   */
  static fromEnvironment(connection: Connection): AutonomousWallet | null {
    const privateKey = process.env.NEXT_PUBLIC_AUTONOMOUS_PRIVATE_KEY;
    
    if (!privateKey) {
      console.warn('⚠️ No NEXT_PUBLIC_AUTONOMOUS_PRIVATE_KEY found - autonomous trading disabled');
      return null;
    }

    try {
      return new AutonomousWallet(privateKey, connection);
    } catch (error) {
      console.error('❌ Failed to create autonomous wallet:', error);
      return null;
    }
  }
}

/**
 * Mock wallet adapter for autonomous trading
 * Provides the same interface as browser wallets but with programmatic signing
 */
export class AutonomousWalletAdapter {
  private autonomousWallet: AutonomousWallet;
  
  constructor(autonomousWallet: AutonomousWallet) {
    this.autonomousWallet = autonomousWallet;
  }

  get publicKey(): PublicKey {
    return this.autonomousWallet.publicKey;
  }

  get connected(): boolean {
    return true;
  }

  get signTransaction() {
    return this.autonomousWallet.signTransaction.bind(this.autonomousWallet);
  }

  get signAllTransactions() {
    return this.autonomousWallet.signAllTransactions.bind(this.autonomousWallet);
  }

  // Additional properties to match WalletContextState
  wallet = 'Autonomous';
}
