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
import { rpcRateLimiter } from './rpcRateLimiter';
import { AutonomousWallet, AutonomousWalletAdapter } from './autonomousWallet';
import { PositionManager } from './position/PositionManager';
import { BondingCurveManager } from './bondingCurve/manager';
import { ExitReason } from './position/types';
import { BN } from 'bn.js';

// Extended wallet interface that supports both browser wallets and autonomous wallet
type ExtendedWalletState = WalletContextState | AutonomousWalletAdapter;

export class TradingService {
  private solanaService: SolanaService;
  private connection: Connection;
  private idlService: PumpFunIdlService;
  private useIdlService: boolean;
  private autonomousWallet: AutonomousWallet | null = null;
  private positionManager: PositionManager | null = null;
  private onPriceUpdateCallback?: (priceUpdate: any) => void;

  constructor(connection: Connection, useIdlService: boolean = true) {
    this.connection = connection;
    const endpoint = connection.rpcEndpoint;
    console.log(`🔗 TradingService: Using RPC endpoint from connection: ${endpoint}`);
    this.solanaService = new SolanaService(endpoint);
    this.idlService = new PumpFunIdlService(connection);
    this.useIdlService = useIdlService;
    
    // Initialize autonomous wallet if configured
    this.autonomousWallet = AutonomousWallet.fromEnvironment(connection);
    if (this.autonomousWallet) {
      console.log(`🤖 Autonomous trading wallet available: ${this.autonomousWallet.publicKey.toString()}`);
      this.autonomousWallet.testConnection().then(success => {
        if (success) {
          console.log(`✅ Autonomous wallet test successful - ready for programmatic trading`);
        } else {
          console.log(`❌ Autonomous wallet test failed - may have connection issues`);
        }
      }).catch(error => {
        console.log(`❌ Autonomous wallet test error:`, error);
      });
    } else {
      console.log(`⚠️ Autonomous wallet not configured - browser wallet will be used (requires manual approval)`);
    }

    // Initialize position manager if autonomous wallet is available
    this.initializePositionManager();
  }

  private initializePositionManager(): void {
    if (!this.autonomousWallet) {
      console.log(`⚠️ Position management disabled - requires autonomous wallet`);
      return;
    }

    try {
      const bondingCurveManager = new BondingCurveManager(this.connection);
      
      this.positionManager = new PositionManager(
        this.connection,
        this.solanaService,
        bondingCurveManager,
        {
          priceCheckInterval: 10, // Check every 10 seconds like Python
          enableLogging: true
        }
      );

      // Listen for position exit signals
      this.positionManager.on('positionExit', async (data) => {
        await this.handlePositionExit(data);
      });

      // Listen for price update signals to forward to UI
      this.positionManager.on('priceUpdate', (priceUpdate) => {
        if (this.onPriceUpdateCallback) {
          this.onPriceUpdateCallback(priceUpdate);
        }
      });

      console.log(`📊 Position management enabled with 10s monitoring interval`);
    } catch (error) {
      console.error(`❌ Failed to initialize position manager:`, error);
    }
  }

  /**
   * Handle position exit signal from PositionManager
   * Mirrors Python's sell execution in monitoring loop
   */
  private async handlePositionExit(data: {
    position: any;
    token: Token;
    currentPrice: number;
    exitReason: ExitReason;
    urgency: string;
  }): Promise<void> {
    const { position, token, currentPrice, exitReason, urgency } = data;
    
    console.log(`🚨 Executing position exit: ${token.symbol} (${exitReason}, ${urgency} urgency)`);
    
    try {
      // Execute sell transaction with better error handling
      console.log(`🚀 Attempting autonomous sell for ${token.symbol}...`);
      const sellResult = await this.sellTokenAutonomous(token);
      
      if (sellResult) {
        // Close position with actual exit price
        this.positionManager?.closePosition(
          token.address,
          sellResult.price,
          exitReason,
          sellResult.signature
        );
        
        console.log(`✅ Successfully exited position: ${token.symbol} - ${exitReason}`);
        console.log(`💰 Exit price: ${sellResult.price} SOL, Transaction: ${sellResult.signature}`);
      } else {
        console.error(`❌ Failed to exit position: ${token.symbol} - sellResult is null`);
        console.log(`⚠️ Position will remain open for retry or manual closure`);
        // Position manager will continue monitoring for retry
      }
    } catch (error) {
      console.error(`❌ Error executing position exit for ${token.symbol}:`, error);
      console.log(`💡 Possible reasons:`);
      console.log(`   - Network connectivity issues`);
      console.log(`   - Token already migrated to Raydium`);
      console.log(`   - Insufficient bonding curve liquidity`);
      console.log(`   - Missing creator information`);
      console.log(`⚠️ Position will remain open for retry or manual closure`);
    }
  }

  private getAutonomousWallet(): AutonomousWalletAdapter | null {
    if (!this.autonomousWallet) return null;
    return new AutonomousWalletAdapter(this.autonomousWallet);
  }

  async buyTokenAutonomous(
    token: Token,
    amount: number,
    slippage: number = 5
  ): Promise<Trade | null> {
    const autonomousWallet = this.getAutonomousWallet();
    if (!autonomousWallet) {
      throw new Error('Autonomous wallet not configured. Set NEXT_PUBLIC_AUTONOMOUS_PRIVATE_KEY environment variable.');
    }

    console.log(`🤖 AUTONOMOUS BUY: ${token.symbol} for ${amount} SOL`);
    const trade = await this.executeBuy(token, autonomousWallet, amount, slippage);
    
    // Create position if trade was successful and position manager is available
    if (trade && trade.status === 'success' && this.positionManager) {
      // Get position config from environment or defaults
      const positionConfig = this.getPositionConfig();
      
      // Calculate quantity and entry price
      const curveData = await this.solanaService.getBondingCurveData(token.bondingCurve);
      const entryPrice = curveData?.price || trade.price;
      const quantity = amount / entryPrice;
      
      const position = this.positionManager.createPosition(
        token,
        entryPrice,
        quantity,
        amount, // SOL invested
        positionConfig,
        trade.signature
      );
      
      console.log(`📊 Position created and monitoring started: ${position.toString()}`);
    }
    
    return trade;
  }

  async sellTokenAutonomous(
    token: Token,
    slippage: number = 5
  ): Promise<Trade | null> {
    const autonomousWallet = this.getAutonomousWallet();
    if (!autonomousWallet) {
      throw new Error('Autonomous wallet not configured. Set NEXT_PUBLIC_AUTONOMOUS_PRIVATE_KEY environment variable.');
    }

    console.log(`🤖 AUTONOMOUS SELL: ${token.symbol}`);
    return this.executeSell(token, autonomousWallet, slippage);
  }

  /**
   * Get position configuration from environment variables or defaults
   */
  private getPositionConfig() {
    return {
      takeProfitPercentage: parseFloat(process.env.NEXT_PUBLIC_TAKE_PROFIT_PERCENTAGE || '0.2'), // 20%
      stopLossPercentage: parseFloat(process.env.NEXT_PUBLIC_STOP_LOSS_PERCENTAGE || '0.1'),   // 10%
      maxHoldTime: parseInt(process.env.NEXT_PUBLIC_MAX_HOLD_TIME || '300'), // 5 minutes default
    };
  }

  /**
   * Shutdown trading service and close all positions
   * Enhanced with actual token selling - DIRECT APPROACH
   */
  async shutdown(): Promise<void> {
    console.log(`🔌 TradingService shutdown initiated...`);
    
    if (this.positionManager) {
      // Get all active positions BEFORE any shutdown actions
      const activePositions = this.positionManager.getActivePositions();
      
      if (activePositions.length > 0) {
        console.log(`💰 Found ${activePositions.length} active position(s) to sell during shutdown`);
        
        // DIRECT SELLING APPROACH - bypass event system during shutdown
        for (const position of activePositions) {
          try {
            console.log(`🔄 DIRECT SELLING: ${position.symbol} (${position.quantity} tokens)...`);
            
            // Create basic token object for selling
            const token = {
              address: position.mint.toString(),
              symbol: position.symbol,
              name: position.name,
              bondingCurve: '', // Will be calculated by executeSell
              price: position.entryPrice,
              marketCap: 0,
              volume24h: 0,
              priceChange24h: 0,
              liquidity: 0,
              holders: 0,
              timestamp: Date.now(),
              description: '',
              image: '',
              showName: false,
              createdOn: Date.now(),
              twitter: '',
              telegram: '',
              website: '',
              usdMarketCap: 0,
              complete: false,
              nsfw: false,
              mint: position.mint.toString(),
              creator: '',
              virtual_sol_reserves: 0,
              virtual_token_reserves: 0,
              sol_reserves: 0,
              token_reserves: 0,
              associatedBondingCurve: '',
              progress: 0,
              virtualSolReserves: 0,
              virtualTokenReserves: 0
            } as Token;
            
            // DIRECT SELL - no events, no delays
            if (this.autonomousWallet) {
              console.log(`🤖 Executing DIRECT autonomous sell for ${position.symbol}...`);
              
              const autonomousWalletAdapter = this.getAutonomousWallet();
              if (autonomousWalletAdapter) {
                try {
                  // Execute sell directly with detailed error handling
                  console.log(`🚀 Attempting to sell ${position.symbol}...`);
                  const sellResult = await this.executeSell(token, autonomousWalletAdapter, 5);
                  
                  if (sellResult) {
                    console.log(`✅ DIRECT SELL SUCCESS: ${position.symbol} - ${sellResult.signature}`);
                    console.log(`💰 Sold ${sellResult.amount} tokens for ${sellResult.price} SOL`);
                    console.log(`🔗 Transaction: https://solscan.io/tx/${sellResult.signature}`);
                    
                    // Close position tracking AFTER successful sell
                    this.positionManager.closePosition(
                      token.address,
                      sellResult.price,
                      ExitReason.MANUAL,
                      sellResult.signature
                    );
                  } else {
                    console.log(`❌ DIRECT SELL FAILED: ${position.symbol} - transaction returned null`);
                    console.log(`⚠️ You may need to manually sell these tokens via pump.fun website`);
                    console.log(`🔗 Token: https://pump.fun/${token.address}`);
                    
                    // Close position tracking anyway to prevent hanging
                    position.closePosition(position.entryPrice, ExitReason.MANUAL);
                  }
                } catch (sellError) {
                  console.error(`❌ Error during sell of ${position.symbol}:`, sellError);
                  console.log(`⚠️ ${position.symbol} tokens may still be in your wallet`);
                  console.log(`💡 Manual sell option: https://pump.fun/${token.address}`);
                  
                  // Close position tracking anyway to prevent hanging
                  position.closePosition(position.entryPrice, ExitReason.MANUAL);
                }
              } else {
                console.log(`❌ No autonomous wallet adapter available for ${position.symbol}`);
              }
            } else {
              console.log(`⚠️ Cannot sell ${position.symbol} - no autonomous wallet configured`);
              
              // Force close position tracking anyway
              position.closePosition(position.entryPrice, ExitReason.MANUAL);
            }
            
          } catch (error) {
            console.error(`❌ Error during DIRECT SELL of ${position.symbol}:`, error);
            console.log(`⚠️ ${position.symbol} tokens may still be in your wallet`);
            console.log(`💡 Manual sell options:`);
            console.log(`   - Via pump.fun: https://pump.fun/${position.mint.toString()}`);
            console.log(`   - Check token in wallet and sell manually`);
            
            // Force close position tracking anyway
            if (position) {
              position.closePosition(position.entryPrice, ExitReason.MANUAL);
            }
          }
        }
        
        // Give time for any pending transactions to complete
        console.log(`⏳ Waiting 3 seconds for sell transactions to complete...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
      
      // Now shutdown position manager (this will stop monitoring)
      console.log(`📊 Shutting down position manager...`);
      await this.positionManager.shutdown(false); // Don't emergency close, we already sold
    }
    
    console.log(`🔌 TradingService shutdown complete`);
  }

  /**
   * Get position manager (for external access)
   */
  getPositionManager(): PositionManager | null {
    return this.positionManager;
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

    return this.executeBuy(token, wallet, amount, slippage);
  }

  private async executeBuy(
    token: Token,
    wallet: ExtendedWalletState,
    amount: number,
    slippage: number
  ): Promise<Trade | null> {
    try {
      console.log(`🚀 PRODUCTION BUY: ${token.symbol} for ${amount} SOL`);
      
      // Calculate accounts
      console.log(`🔧 Calculating bonding curve addresses for ${token.symbol}`);
      const mintPubkey = new PublicKey(token.address);
      const accounts = calculatePumpFunAccounts(mintPubkey);
      const bondingCurve = accounts.bondingCurve;
      const associatedBondingCurve = accounts.associatedBondingCurve;

      // Get priority fee
      console.log(`🔍 Fetching priority fees with production-grade manager...`);
      const priorityFeeResult = await this.solanaService.getPriorityFeeManager().calculatePriorityFee();
      const priorityFee = priorityFeeResult.fee;
      console.log(`💰 Priority fee result:`, priorityFeeResult);

      // Create transaction
      const transaction = new Transaction();
      
      // Add compute budget instructions with production-grade priority fee
      transaction.add(
        ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priorityFee })
      );
      
      // Get creator and create buy instructions
      let creatorPubkey: PublicKey | undefined;
      
      if (token.creator) {
        creatorPubkey = new PublicKey(token.creator);
        console.log(`🔑 Using creator from token data: ${creatorPubkey.toString()}`);
      } else {
        try {
          const curveData = await this.solanaService.getBondingCurveData(bondingCurve.toString());
          if (curveData && curveData.state.creator) {
            creatorPubkey = curveData.state.creator;
            console.log(`🔑 Retrieved creator from bonding curve: ${creatorPubkey.toString()}`);
          } else {
            console.warn(`⚠️ No creator found in bonding curve data`);
          }
        } catch (error) {
          console.warn(`⚠️ Could not get creator from bonding curve:`, error);
        }
      }
      
      const buyInstructions = await this.createBuyInstruction(
        wallet.publicKey!,
        mintPubkey,
        bondingCurve,
        associatedBondingCurve,
        amount,
        slippage,
        creatorPubkey
      );
      
      buyInstructions.forEach(instruction => transaction.add(instruction));
      
      // Get recent blockhash
      const { blockhash } = await rpcRateLimiter.executeRPCCall(
        () => this.connection.getLatestBlockhash(),
        'getLatestBlockhash'
      );
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = wallet.publicKey!;

      // Execute transaction based on wallet type
      let signature: string;
      
      if (wallet instanceof AutonomousWalletAdapter && this.autonomousWallet) {
        console.log(`🤖 Using autonomous wallet transaction sending`);
        signature = await this.autonomousWallet.sendTransaction(transaction);
        console.log(`✅ Autonomous transaction sent: ${signature}`);
        
        // Confirm transaction
        const success = await this.autonomousWallet.confirmTransaction(signature);
        const status = success ? 'success' : 'failed';
        
        if (!success) {
          console.error(`❌ Failed to buy ${token.symbol}: ${signature}`);
          throw new Error(`Transaction failed: ${signature}`);
        }
        
        console.log(`✅ Successfully bought ${token.symbol}: ${signature}`);
      } else {
        console.log(`📱 Using browser wallet (requires manual approval)`);
        console.log(`📝 Skipping simulation, signing transaction directly (like Python bot)`);
        
        const signedTransaction = await wallet.signTransaction!(transaction);
        signature = await rpcRateLimiter.executeRPCCall(
          () => this.connection.sendRawTransaction(signedTransaction.serialize(), {
            skipPreflight: true,
            preflightCommitment: 'confirmed'
          }),
          'sendRawTransaction'
        );

        // Wait for confirmation using robust polling (avoids WebSocket issues)
        console.log(`⏳ Confirming transaction with robust polling method...`);
        const success = await this.solanaService.confirmTransactionRobust(signature);
        const status = success ? 'success' : 'failed';
      }

      const trade: Trade = {
        id: signature,
        tokenAddress: token.address,
        tokenSymbol: token.symbol,
        type: 'buy',
        amount: amount,
        price: token.price,
        timestamp: Date.now(),
        signature: signature,
        status: 'success'
      };

      return trade;

    } catch (error) {
      console.error(`Error buying ${token.symbol}:`, error);
      throw error;
    }
  }

  private async createBuyInstruction(
    buyer: PublicKey,
    tokenMint: PublicKey,
    bondingCurve: PublicKey,
    associatedBondingCurve: PublicKey,
    amount: number,
    slippage: number,
    creator?: PublicKey
  ): Promise<TransactionInstruction[]> {
    const instructions: TransactionInstruction[] = [];
    
    console.log(`🔧 Creating buy instruction for:`, {
      buyer: buyer.toString(),
      tokenMint: tokenMint.toString(),
      bondingCurve: bondingCurve.toString(),
      associatedBondingCurve: associatedBondingCurve.toString(),
      creator: creator?.toString(),
      amount,
      slippage
    });
    
    // Get bonding curve data to calculate token price (like Python bot)
    const curveData = await this.solanaService.getBondingCurveData(bondingCurve.toString());
    if (!curveData) {
      throw new Error('Failed to get bonding curve data for price calculation');
    }
    
    const tokenPriceSol = curveData.price;
    const tokenAmount = amount / tokenPriceSol; // Calculate tokens to buy
    
    console.log(`🔢 Price calculation: ${tokenPriceSol} SOL per token, buying ${tokenAmount.toFixed(6)} tokens for ${amount} SOL`);
    
    // Convert to proper format for instruction
    const maxAmountLamports = new BN(Math.floor(amount * LAMPORTS_PER_SOL * (1 + slippage / 100)));
    const tokenAmountWithDecimals = new BN(Math.floor(tokenAmount * 1_000_000)); // 6 decimals like Python
    
    console.log(`📊 Instruction parameters:`, {
      tokenAmount: tokenAmountWithDecimals.toString(),
      maxSolAmount: maxAmountLamports.toString(),
      creator: creator?.toString()
    });
    
    // Check if we need to create the associated token account
    const buyerTokenAccount = await getAssociatedTokenAddress(tokenMint, buyer);
    
    console.log(`🔍 Checking ATA: ${buyerTokenAccount.toString()}`);
    
    try {
      const accountInfo = await rpcRateLimiter.executeRPCCall(
        () => this.connection.getAccountInfo(buyerTokenAccount),
        `getAccountInfo(ATA-${tokenMint.toString().substring(0, 8)}...)`
      );
      
      if (!accountInfo) {
        console.log(`📝 Creating ATA for buyer: ${buyerTokenAccount.toString()}`);
        instructions.push(
          createAssociatedTokenAccountInstruction(
            buyer,
            buyerTokenAccount,
            buyer,
            tokenMint
          )
        );
      } else {
        console.log(`✅ ATA already exists: ${buyerTokenAccount.toString()}`);
      }
    } catch (error) {
      console.log(`📝 ATA check failed, assuming it needs creation: ${buyerTokenAccount.toString()}`);
      instructions.push(
        createAssociatedTokenAccountInstruction(
          buyer,
          buyerTokenAccount,
          buyer,
          tokenMint
        )
      );
    }
    
    // Verify all required accounts exist before creating instruction
    await this.verifyAccountsExist({
      buyer,
      tokenMint,
      bondingCurve,
      associatedBondingCurve,
      creator
    });
    
    // Create the buy instruction
    const buyInstruction = await createPumpFunBuyInstruction(
      buyer,
      tokenMint,
      tokenAmountWithDecimals,
      maxAmountLamports,
      creator
    );

    instructions.push(buyInstruction);
    return instructions;
  }
  
  /**
   * Verify that all required accounts exist and are properly initialized
   */
  private async verifyAccountsExist(accounts: {
    buyer: PublicKey;
    tokenMint: PublicKey;
    bondingCurve: PublicKey;
    associatedBondingCurve: PublicKey;
    creator?: PublicKey;
  }): Promise<void> {
    const { buyer, tokenMint, bondingCurve, associatedBondingCurve, creator } = accounts;
    
    console.log(`🔍 Verifying account existence...`);
    
    // Check bonding curve account
    try {
      const bondingCurveInfo = await rpcRateLimiter.executeRPCCall(
        () => this.connection.getAccountInfo(bondingCurve),
        `verifyAccount(bondingCurve)`
      );
      
      if (!bondingCurveInfo) {
        throw new Error(`Bonding curve account does not exist: ${bondingCurve.toString()}`);
      }
      console.log(`✅ Bonding curve exists and has ${bondingCurveInfo.data.length} bytes of data`);
    } catch (error) {
      console.error(`❌ Bonding curve verification failed:`, error);
      throw error;
    }
    
    // Check associated bonding curve account
    try {
      const abcInfo = await rpcRateLimiter.executeRPCCall(
        () => this.connection.getAccountInfo(associatedBondingCurve),
        `verifyAccount(associatedBondingCurve)`
      );
      
      if (!abcInfo) {
        throw new Error(`Associated bonding curve account does not exist: ${associatedBondingCurve.toString()}`);
      }
      console.log(`✅ Associated bonding curve exists and has ${abcInfo.data.length} bytes of data`);
    } catch (error) {
      console.error(`❌ Associated bonding curve verification failed:`, error);
      throw error;
    }
    
    // Check mint account
    try {
      const mintInfo = await rpcRateLimiter.executeRPCCall(
        () => this.connection.getAccountInfo(tokenMint),
        `verifyAccount(tokenMint)`
      );
      
      if (!mintInfo) {
        throw new Error(`Token mint account does not exist: ${tokenMint.toString()}`);
      }
      console.log(`✅ Token mint exists and has ${mintInfo.data.length} bytes of data`);
    } catch (error) {
      console.error(`❌ Token mint verification failed:`, error);
      throw error;
    }
    
    console.log(`✅ All required accounts verified successfully`);
  }

  // Placeholder methods for compatibility
  async sellToken(): Promise<Trade | null> {
    throw new Error('Sell functionality not implemented yet for browser wallet');
  }

  /**
   * Execute sell transaction (autonomous version)
   */
  private async executeSell(
    token: Token,
    wallet: ExtendedWalletState,
    slippage: number
  ): Promise<Trade | null> {
    try {
      console.log(`🚀 PRODUCTION SELL: ${token.symbol}`);
      
      // Get current position if available
      const position = this.positionManager?.getPosition(token.address);
      if (!position) {
        console.warn(`⚠️ No position found for ${token.symbol}, creating minimal sell order`);
      }

      // Calculate accounts - Handle missing bondingCurve by calculating it
      const mintPubkey = new PublicKey(token.address);
      const accounts = calculatePumpFunAccounts(mintPubkey);
      const bondingCurve = accounts.bondingCurve;
      const associatedBondingCurve = accounts.associatedBondingCurve;

      console.log(`🔧 Calculated bonding curve for ${token.symbol}: ${bondingCurve.toString()}`);

      // Get current price and token balance
      const curveData = await this.solanaService.getBondingCurveData(bondingCurve.toString());
      if (!curveData) {
        throw new Error(`Failed to get bonding curve data for sell: ${bondingCurve.toString()}`);
      }

      // Get token account balance
      const buyerTokenAccount = await getAssociatedTokenAddress(mintPubkey, wallet.publicKey!);
      const tokenAccountInfo = await rpcRateLimiter.executeRPCCall(
        () => this.connection.getTokenAccountBalance(buyerTokenAccount),
        'getTokenAccountBalance'
      );

      const tokenBalance = parseFloat(tokenAccountInfo.value.amount) / Math.pow(10, tokenAccountInfo.value.decimals);
      
      if (tokenBalance <= 0) {
        throw new Error(`No tokens to sell for ${token.symbol}`);
      }

      console.log(`💰 Selling ${tokenBalance.toFixed(6)} ${token.symbol} tokens`);

      // Get priority fee
      const priorityFeeResult = await this.solanaService.getPriorityFeeManager().calculatePriorityFee();
      const priorityFee = priorityFeeResult.fee;

      // Create sell transaction
      const transaction = new Transaction();
      
      transaction.add(
        ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priorityFee })
      );

      // Create sell instruction
      const tokenAmountToSell = new BN(Math.floor(tokenBalance * 1_000_000)); // 6 decimals
      const minSolAmount = new BN(Math.floor(curveData.price * tokenBalance * (1 - slippage / 100) * LAMPORTS_PER_SOL));

      // Get creator if available - CRITICAL for sell instruction
      let creatorPubkey: PublicKey | undefined;
      try {
        if (token.creator) {
          creatorPubkey = new PublicKey(token.creator);
          console.log(`🔧 Using token.creator: ${creatorPubkey.toString()}`);
        } else if (curveData.state.creator) {
          creatorPubkey = curveData.state.creator;
          console.log(`🔧 Using curveData.state.creator: ${creatorPubkey.toString()}`);
        } else {
          // Fallback: try to fetch creator from bonding curve account data
          console.log(`⚠️ No creator found, attempting to fetch from bonding curve...`);
          const bondingCurveAccountInfo = await rpcRateLimiter.executeRPCCall(
            () => this.connection.getAccountInfo(bondingCurve),
            'getAccountInfo'
          );
          
          if (bondingCurveAccountInfo?.data) {
            // Parse creator from bonding curve data (creator is at offset 8-40)
            const creatorBytes = bondingCurveAccountInfo.data.slice(8, 40);
            creatorPubkey = new PublicKey(creatorBytes);
            console.log(`🔧 Extracted creator from bonding curve: ${creatorPubkey.toString()}`);
          }
        }
      } catch (error) {
        console.error(`❌ Error getting creator for ${token.symbol}:`, error);
      }

      if (!creatorPubkey) {
        console.error(`❌ CRITICAL: Creator not found for ${token.symbol}. Cannot create sell instruction.`);
        console.log(`🔍 Debug info:`, {
          tokenCreator: token.creator,
          curveDataState: curveData.state,
          bondingCurve: bondingCurve.toString()
        });
        throw new Error(`Creator not found for ${token.symbol}. Cannot create sell instruction.`);
      }

      console.log(`🔧 Using creator: ${creatorPubkey.toString()}`);

      let sellInstruction;
      try {
        sellInstruction = await createPumpFunSellInstruction(
          wallet.publicKey!,
          mintPubkey,
          tokenAmountToSell,
          minSolAmount,
          creatorPubkey  // CRITICAL: Pass creator for vault calculation
        );
        console.log(`✅ Successfully created sell instruction for ${token.symbol}`);
      } catch (error) {
        console.error(`❌ Error creating sell instruction for ${token.symbol}:`, error);
        console.log(`🔍 Sell instruction debug:`, {
          wallet: wallet.publicKey?.toString(),
          mint: mintPubkey.toString(),
          tokenAmount: tokenAmountToSell.toString(),
          minSolAmount: minSolAmount.toString(),
          creator: creatorPubkey.toString()
        });
        throw error;
      }

      transaction.add(sellInstruction);

      // Get recent blockhash
      const { blockhash } = await rpcRateLimiter.executeRPCCall(
        () => this.connection.getLatestBlockhash(),
        'getLatestBlockhash'
      );
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = wallet.publicKey!;

      // Execute transaction
      let signature: string;
      
      if (wallet instanceof AutonomousWalletAdapter && this.autonomousWallet) {
        console.log(`🤖 Using autonomous wallet for sell transaction`);
        signature = await this.autonomousWallet.sendTransaction(transaction);
        
        const success = await this.autonomousWallet.confirmTransaction(signature);
        if (!success) {
          console.log(`❌ Sell transaction failed for ${token.symbol}: ${signature}`);
          console.log(`🔗 Check transaction: https://solscan.io/tx/${signature}`);
          console.log(`💡 This might be due to:`);
          console.log(`   - Token migration to Raydium`);
          console.log(`   - Insufficient liquidity`);
          console.log(`   - Slippage tolerance too low`);
          console.log(`   - Network congestion`);
          throw new Error(`Sell transaction failed: ${signature}`);
        }
      } else {
        console.log(`📱 Using browser wallet for sell (requires manual approval)`);
        const signedTransaction = await wallet.signTransaction!(transaction);
        signature = await rpcRateLimiter.executeRPCCall(
          () => this.connection.sendRawTransaction(signedTransaction.serialize(), {
            skipPreflight: true,
            preflightCommitment: 'confirmed'
          }),
          'sendRawTransaction'
        );

        const success = await this.solanaService.confirmTransactionRobust(signature);
        if (!success) {
          throw new Error(`Sell transaction failed: ${signature}`);
        }
      }

      const trade: Trade = {
        id: signature,
        tokenAddress: token.address,
        tokenSymbol: token.symbol,
        type: 'sell',
        amount: tokenBalance,
        price: curveData.price,
        timestamp: Date.now(),
        signature: signature,
        status: 'success'
      };

      console.log(`✅ Successfully sold ${token.symbol}: ${signature}`);
      return trade;

    } catch (error) {
      console.error(`Error selling ${token.symbol}:`, error);
      throw error;
    }
  }

  async shouldBuyToken(): Promise<boolean> {
    return false;
  }

  async shouldSellToken(): Promise<boolean> {
    return false;
  }

  /**
   * Set callback for price update events from PositionManager
   */
  setOnPriceUpdateCallback(callback: (priceUpdate: any) => void): void {
    this.onPriceUpdateCallback = callback;
  }
}
