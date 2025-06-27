import { 
  Connection, 
  PublicKey, 
  Transaction, 
  TransactionInstruction,
  ComputeBudgetProgram,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { 
  getAssociatedTokenAddress,
} from '@solana/spl-token';
import type { WalletContextState } from '@solana/wallet-adapter-react';
import type { Token, Trade, BotConfig } from '@/types';
import { SolanaService, PUMP_FUN_PROGRAM_ID } from './solana';
import { PumpFunIdlService } from './pumpFunIdl';
import { 
  createPumpFunBuyInstruction, 
  createPumpFunSellInstruction,
  createAssociatedTokenAccountInstruction,
  calculatePumpFunAccounts
} from './pumpFunInstructions';
import { BN } from 'bn.js';

export class TradingService {
  private solanaService: SolanaService;
  private connection: Connection;
  private idlService: PumpFunIdlService;
  private useIdlService: boolean;

  constructor(connection: Connection, useIdlService: boolean = true) {
    this.connection = connection;
    // Use the same connection endpoint to ensure consistency
    const endpoint = connection.rpcEndpoint;
    console.log(`🔗 TradingService: Using RPC endpoint from connection: ${endpoint}`);
    this.solanaService = new SolanaService(endpoint);
    this.idlService = new PumpFunIdlService(connection);
    this.useIdlService = useIdlService;
  }

  async buyToken(
    token: Token, 
    wallet: WalletContextState,
    amount: number,
    slippage: number = 5
  ): Promise<Trade | null> {
    console.log(`🔌 TradingService: Wallet status check:`, {
      publicKey: wallet.publicKey?.toString(),
      connected: wallet.connected,
      signTransaction: !!wallet.signTransaction,
      wallet: wallet.wallet?.adapter?.name
    });
    
    if (!wallet.publicKey || !wallet.signTransaction) {
      console.error('❌ TradingService: Wallet not connected properly');
      console.error('Full wallet state:', wallet);
      throw new Error('Wallet not connected');
    }

    try {
      console.log(`🚀 PRODUCTION BUY: ${token.symbol} for ${amount} SOL`);
      
      // Get production-grade priority fee with relevant accounts
      const mintPubkey = new PublicKey(token.address);
      let bondingCurve: PublicKey;
      let associatedBondingCurve: PublicKey;
      
      if (token.bondingCurve && token.associatedBondingCurve) {
        bondingCurve = new PublicKey(token.bondingCurve);
        associatedBondingCurve = new PublicKey(token.associatedBondingCurve);
      } else {
        console.log(`🔧 Calculating bonding curve addresses for ${token.symbol}`);
        const accounts = calculatePumpFunAccounts(mintPubkey);
        bondingCurve = accounts.bondingCurve;
        associatedBondingCurve = accounts.associatedBondingCurve;
      }
      
      // Get priority fee with relevant accounts for better accuracy
      const relevantAccounts = [bondingCurve, associatedBondingCurve, mintPubkey];
      const priorityFee = await this.solanaService.getPriorityFee(relevantAccounts);
      
      // Create buy transaction
      const transaction = new Transaction();
      
      // Add compute budget instructions with production-grade priority fee
      transaction.add(
        ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priorityFee })
      );
      
      // Calculate bonding curve addresses if not provided (already done above)
      
      // Add buy instructions
      const buyInstructions = await this.createBuyInstruction(
        wallet.publicKey,
        mintPubkey,
        bondingCurve,
        associatedBondingCurve,
        amount,
        slippage
      );
      
      buyInstructions.forEach(instruction => transaction.add(instruction));
      
      // Get recent blockhash
      const { blockhash } = await this.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = wallet.publicKey;

      // Simulate transaction first
      const simulation = await this.connection.simulateTransaction(transaction);
      
      if (simulation.value.err) {
        console.error('Transaction simulation failed:', simulation.value.err);
        throw new Error('Transaction simulation failed');
      }

      // Sign transaction
      const signedTransaction = await wallet.signTransaction(transaction);
      
      // Send transaction
      const signature = await this.connection.sendRawTransaction(
        signedTransaction.serialize(),
        {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
        }
      );

      // Wait for confirmation
      const confirmation = await this.connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight: (await this.connection.getLatestBlockhash()).lastValidBlockHeight,
      });

      const status = confirmation.value.err ? 'failed' : 'success';

      const trade: Trade = {
        id: signature,
        tokenAddress: token.address,
        tokenSymbol: token.symbol,
        type: 'buy',
        amount,
        price: token.price,
        timestamp: Date.now(),
        signature: signature,
        status
      };

      console.log(`${status === 'success' ? 'Successfully bought' : 'Failed to buy'} ${token.symbol}:`, signature);
      return trade;

    } catch (error) {
      console.error(`Error buying ${token.symbol}:`, error);
      
      // Return failed trade for tracking
      const trade: Trade = {
        id: Date.now().toString(),
        tokenAddress: token.address,
        tokenSymbol: token.symbol,
        type: 'buy',
        amount,
        price: token.price,
        timestamp: Date.now(),
        signature: '',
        status: 'failed'
      };
      
      return trade;
    }
  }

  async sellToken(
    token: Token,
    wallet: WalletContextState,
    percentage: number = 100,
    slippage: number = 5
  ): Promise<Trade | null> {
    if (!wallet.publicKey || !wallet.signTransaction) {
      throw new Error('Wallet not connected');
    }

    try {
      console.log(`🚀 PRODUCTION SELL: ${percentage}% of ${token.symbol}`);
      
      // Get token account balance
      const sellMintPubkey = new PublicKey(token.address);
      const tokenAccount = await getAssociatedTokenAddress(sellMintPubkey, wallet.publicKey);
      
      const tokenAccountInfo = await this.connection.getTokenAccountBalance(tokenAccount);
      const tokenBalance = tokenAccountInfo.value.uiAmount || 0;
      
      if (tokenBalance === 0) {
        throw new Error('No tokens to sell');
      }
      
      const sellAmount = (tokenBalance * percentage) / 100;
      
      // Calculate bonding curve addresses
      let sellBondingCurve: PublicKey;
      let sellAssociatedBondingCurve: PublicKey;
      
      if (token.bondingCurve && token.associatedBondingCurve) {
        sellBondingCurve = new PublicKey(token.bondingCurve);
        sellAssociatedBondingCurve = new PublicKey(token.associatedBondingCurve);
      } else {
        console.log(`🔧 Calculating bonding curve addresses for ${token.symbol}`);
        const accounts = calculatePumpFunAccounts(sellMintPubkey);
        sellBondingCurve = accounts.bondingCurve;
        sellAssociatedBondingCurve = accounts.associatedBondingCurve;
      }
      
      // Get production-grade priority fee with relevant accounts
      const sellRelevantAccounts = [sellBondingCurve, sellAssociatedBondingCurve, sellMintPubkey];
      const priorityFee = await this.solanaService.getPriorityFee(sellRelevantAccounts);
      
      // Create sell transaction
      const transaction = new Transaction();
      
      // Add compute budget instructions with production-grade priority fee
      transaction.add(
        ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priorityFee })
      );
      
      // Add sell instruction
      const sellInstruction = await this.createSellInstruction(
        wallet.publicKey,
        sellMintPubkey,
        sellBondingCurve,
        sellAssociatedBondingCurve,
        sellAmount,
        slippage
      );
      
      transaction.add(sellInstruction);
      
      // Get recent blockhash
      const { blockhash } = await this.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = wallet.publicKey;

      // Simulate transaction first
      const simulation = await this.connection.simulateTransaction(transaction);
      
      if (simulation.value.err) {
        console.error('Transaction simulation failed:', simulation.value.err);
        throw new Error('Transaction simulation failed');
      }

      // Sign transaction
      const signedTransaction = await wallet.signTransaction(transaction);
      
      // Send transaction
      const signature = await this.connection.sendRawTransaction(
        signedTransaction.serialize(),
        {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
        }
      );

      // Wait for confirmation
      const confirmation = await this.connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight: (await this.connection.getLatestBlockhash()).lastValidBlockHeight,
      });

      const status = confirmation.value.err ? 'failed' : 'success';

      const trade: Trade = {
        id: signature,
        tokenAddress: token.address,
        tokenSymbol: token.symbol,
        type: 'sell',
        amount: sellAmount,
        price: token.price,
        timestamp: Date.now(),
        signature: signature,
        status
      };

      console.log(`${status === 'success' ? 'Successfully sold' : 'Failed to sell'} ${token.symbol}:`, signature);
      return trade;

    } catch (error) {
      console.error(`Error selling ${token.symbol}:`, error);
      
      // Return failed trade for tracking
      const trade: Trade = {
        id: Date.now().toString(),
        tokenAddress: token.address,
        tokenSymbol: token.symbol,
        type: 'sell',
        amount: 0,
        price: token.price,
        timestamp: Date.now(),
        signature: '',
        status: 'failed'
      };
      
      return trade;
    }
  }

  async shouldBuyToken(token: Token, config: BotConfig): Promise<boolean> {
    try {
      // Token age check
      const tokenAge = (Date.now() - token.createdOn) / 1000; // seconds
      if (tokenAge > config.maxTokenAge) {
        console.log(`Token ${token.symbol} too old: ${tokenAge}s > ${config.maxTokenAge}s`);
        return false;
      }

      // Market cap check
      if (token.marketCap > 1000000) { // $1M max
        console.log(`Token ${token.symbol} market cap too high: $${token.marketCap}`);
        return false;
      }

      // Progress check (not graduated to Raydium yet)
      if (token.progress >= 100 || token.raydiumPool) {
        console.log(`Token ${token.symbol} already graduated`);
        return false;
      }

      // Basic token validation
      if (!token.name || !token.symbol || token.name.length > 50 || token.symbol.length > 10) {
        console.log(`Token ${token.symbol} failed basic validation`);
        return false;
      }

      // Check for suspicious patterns
      if (this.isSuspiciousToken(token)) {
        console.log(`Token ${token.symbol} appears suspicious`);
        return false;
      }

      console.log(`Token ${token.symbol} passed all buy criteria`);
      return true;

    } catch (error) {
      console.error(`Error evaluating token ${token.symbol}:`, error);
      return false;
    }
  }

  async shouldSellToken(
    token: Token, 
    entryPrice: number, 
    config: BotConfig
  ): Promise<boolean> {
    try {
      const currentPrice = await this.solanaService.getTokenPrice(token.address);
      const priceChange = ((currentPrice - entryPrice) / entryPrice) * 100;

      // Take profit
      if (priceChange >= config.takeProfit) {
        console.log(`Take profit triggered for ${token.symbol}: ${priceChange.toFixed(2)}%`);
        return true;
      }

      // Stop loss
      if (priceChange <= -config.stopLoss) {
        console.log(`Stop loss triggered for ${token.symbol}: ${priceChange.toFixed(2)}%`);
        return true;
      }

      // Check if token graduated (should sell immediately)
      if (token.progress >= 100 || token.raydiumPool) {
        console.log(`Token ${token.symbol} graduated - selling`);
        return true;
      }

      return false;

    } catch (error) {
      console.error(`Error evaluating sell for ${token.symbol}:`, error);
      return false;
    }
  }

  private isSuspiciousToken(token: Token): boolean {
    // Check for suspicious patterns
    const suspiciousPatterns = [
      /scam/i,
      /rugpull/i,
      /honeypot/i,
      /test/i,
      /fake/i,
    ];

    const text = `${token.name} ${token.symbol} ${token.description}`.toLowerCase();
    
    return suspiciousPatterns.some(pattern => pattern.test(text));
  }

  private async createBuyInstruction(
    buyer: PublicKey,
    tokenMint: PublicKey,
    bondingCurve: PublicKey,
    associatedBondingCurve: PublicKey,
    amount: number,
    slippage: number
  ): Promise<TransactionInstruction[]> {
    const instructions: TransactionInstruction[] = [];
    
    // Convert amount to lamports and BN
    const lamports = new BN(amount * LAMPORTS_PER_SOL);
    const maxSlippageLamports = new BN(Math.floor(amount * LAMPORTS_PER_SOL * (1 + slippage / 100)));
    
    // Check if we need to create the associated token account
    const buyerTokenAccount = await getAssociatedTokenAddress(tokenMint, buyer);
    
    try {
      await this.connection.getAccountInfo(buyerTokenAccount);
    } catch (error) {
      // Account doesn't exist, create it
      instructions.push(
        createAssociatedTokenAccountInstruction(
          buyer,
          buyerTokenAccount,
          buyer,
          tokenMint
        )
      );
    }
    
    // Create the buy instruction
    const buyInstruction = await createPumpFunBuyInstruction(
      buyer,
      tokenMint,
      lamports,
      maxSlippageLamports
    );
    
    instructions.push(buyInstruction);
    
    return instructions;
  }

  private async createSellInstruction(
    seller: PublicKey,
    tokenMint: PublicKey,
    bondingCurve: PublicKey,
    associatedBondingCurve: PublicKey,
    amount: number,
    slippage: number
  ): Promise<TransactionInstruction> {
    // Get the actual token balance to sell
    const sellerTokenAccount = await getAssociatedTokenAddress(tokenMint, seller);
    const tokenAccountInfo = await this.connection.getTokenAccountBalance(sellerTokenAccount);
    const tokenBalance = new BN(tokenAccountInfo.value.amount);
    
    // Calculate amount to sell (in token units, not SOL)
    const sellAmount = tokenBalance.muln(amount).divn(100); // amount is percentage
    const minSolOutput = new BN(Math.floor(amount * (1 - slippage / 100) * LAMPORTS_PER_SOL));
    
    // Create the sell instruction
    return createPumpFunSellInstruction(
      seller,
      tokenMint,
      sellAmount,
      minSolOutput
    );
  }

  /**
   * Get real-time token data using IDL service
   */
  async getTokenData(mint: string): Promise<{
    price: number;
    marketCap: number;
    progress: number;
    virtualSolReserves: number;
    virtualTokenReserves: number;
  } | null> {
    if (!this.useIdlService) {
      return null;
    }

    try {
      const mintPubkey = new PublicKey(mint);
      const [bondingCurveState, globalState] = await Promise.all([
        this.idlService.getBondingCurveState(mintPubkey),
        this.idlService.getGlobalState()
      ]);

      if (!bondingCurveState || !globalState) {
        return null;
      }

      const price = this.idlService.calculateTokenPrice(bondingCurveState);
      const marketCap = this.idlService.calculateMarketCap(bondingCurveState);
      const progress = this.idlService.calculateProgress(bondingCurveState, globalState);

      return {
        price,
        marketCap,
        progress,
        virtualSolReserves: bondingCurveState.virtualSolReserves.toNumber(),
        virtualTokenReserves: bondingCurveState.virtualTokenReserves.toNumber(),
      };
    } catch (error) {
      console.error('Error fetching token data from IDL service:', error);
      return null;
    }
  }

  /**
   * Enhanced buy method that uses IDL service for better price calculation
   */
  async buyTokenWithIdl(
    token: Token, 
    wallet: WalletContextState,
    amount: number,
    slippage: number = 5
  ): Promise<Trade> {
    if (!wallet.publicKey || !wallet.signTransaction) {
      throw new Error('Wallet not connected');
    }

    try {
      // Get real-time token data for better price calculation
      const tokenData = await this.getTokenData(token.address);
      const currentPrice = tokenData?.price || token.price;

      // Create buy instruction using IDL service if enabled
      const amountBN = new BN(amount * LAMPORTS_PER_SOL);
      const maxSlippageAmount = new BN(amount * LAMPORTS_PER_SOL * (1 + slippage / 100));

      let buyInstruction: TransactionInstruction;
      
      if (this.useIdlService) {
        buyInstruction = await this.idlService.createBuyInstruction(
          wallet.publicKey,
          new PublicKey(token.address),
          amountBN,
          maxSlippageAmount
        );
      } else {
        buyInstruction = await createPumpFunBuyInstruction(
          wallet.publicKey,
          new PublicKey(token.address),
          amountBN,
          maxSlippageAmount
        );
      }

      // Check if we need to create associated token account
      const associatedTokenAddress = await getAssociatedTokenAddress(
        new PublicKey(token.address),
        wallet.publicKey
      );

      const accountInfo = await this.connection.getAccountInfo(associatedTokenAddress);
      const instructions: TransactionInstruction[] = [];

      if (!accountInfo) {
        const createATAInstruction = createAssociatedTokenAccountInstruction(
          wallet.publicKey,
          associatedTokenAddress,
          wallet.publicKey,
          new PublicKey(token.address)
        );
        instructions.push(createATAInstruction);
      }

      instructions.push(buyInstruction);

      // Add compute budget for better transaction success rate
      const computeBudgetInstruction = ComputeBudgetProgram.setComputeUnitLimit({
        units: 200_000,
      });
      instructions.unshift(computeBudgetInstruction);

      const transaction = new Transaction().add(...instructions);
      const { blockhash } = await this.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = wallet.publicKey;

      // Sign and send transaction
      const signedTransaction = await wallet.signTransaction(transaction);
      const signature = await this.connection.sendRawTransaction(signedTransaction.serialize());
      
      await this.connection.confirmTransaction(signature, 'confirmed');

      const trade: Trade = {
        id: signature,
        tokenAddress: token.address,
        tokenSymbol: token.symbol,
        type: 'buy',
        amount: amount,
        price: currentPrice,
        timestamp: Date.now(),
        signature: signature,
        status: 'success'
      };

      return trade;
    } catch (error) {
      console.error('Buy transaction failed:', error);
      
      const trade: Trade = {
        id: Date.now().toString(),
        tokenAddress: token.address,
        tokenSymbol: token.symbol,
        type: 'buy',
        amount: amount,
        price: token.price,
        timestamp: Date.now(),
        signature: '',
        status: 'failed'
      };

      return trade;
    }
  }

  // Calculate potential profit/loss
  calculatePnL(entryPrice: number, currentPrice: number, amount: number): { pnl: number; pnlPercent: number } {
    const pnlPercent = ((currentPrice - entryPrice) / entryPrice) * 100;
    const pnl = (currentPrice - entryPrice) * amount;
    
    return { pnl, pnlPercent };
  }

  // Get current token balance
  async getTokenBalance(wallet: PublicKey, tokenMint: PublicKey): Promise<number> {
    try {
      const associatedTokenAccount = await getAssociatedTokenAddress(tokenMint, wallet);
      const tokenAccountInfo = await this.connection.getTokenAccountBalance(associatedTokenAccount);
      return tokenAccountInfo.value.uiAmount || 0;
    } catch (error) {
      console.error('Error getting token balance:', error);
      return 0;
    }
  }
}
