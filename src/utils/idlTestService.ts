import { Connection, PublicKey } from '@solana/web3.js';
import { PumpFunIdlService } from '../services/pumpFunIdl';

/**
 * Utility class to test and demonstrate IDL service functionality
 */
export class IdlTestService {
  private idlService: PumpFunIdlService;
  private connection: Connection;

  constructor(connection: Connection) {
    this.connection = connection;
    this.idlService = new PumpFunIdlService(connection);
  }

  /**
   * Test fetching global state
   */
  async testGlobalState() {
    console.log('🔍 Testing Global State...');
    
    try {
      const globalState = await this.idlService.getGlobalState();
      
      if (globalState) {
        console.log('✅ Global State found:');
        console.log('  - Initialized:', globalState.initialized);
        console.log('  - Authority:', globalState.authority.toString());
        console.log('  - Fee Recipient:', globalState.feeRecipient.toString());
        console.log('  - Fee Basis Points:', globalState.feeBasisPoints.toString());
        console.log('  - Initial Virtual SOL:', globalState.initialVirtualSolReserves.toString());
        console.log('  - Initial Virtual Token:', globalState.initialVirtualTokenReserves.toString());
      } else {
        console.log('❌ Global State not found');
      }
    } catch (error) {
      console.error('❌ Error testing global state:', error);
    }
  }

  /**
   * Test fetching bonding curve for a specific token
   */
  async testBondingCurve(mintAddress: string) {
    console.log(`🔍 Testing Bonding Curve for ${mintAddress}...`);
    
    try {
      const mint = new PublicKey(mintAddress);
      const bondingCurveState = await this.idlService.getBondingCurveState(mint);
      
      if (bondingCurveState) {
        console.log('✅ Bonding Curve found:');
        console.log('  - Virtual SOL Reserves:', bondingCurveState.virtualSolReserves.toString());
        console.log('  - Virtual Token Reserves:', bondingCurveState.virtualTokenReserves.toString());
        console.log('  - Real SOL Reserves:', bondingCurveState.realSolReserves.toString());
        console.log('  - Real Token Reserves:', bondingCurveState.realTokenReserves.toString());
        console.log('  - Token Total Supply:', bondingCurveState.tokenTotalSupply.toString());
        console.log('  - Complete:', bondingCurveState.complete);
        
        // Calculate derived values
        const price = this.idlService.calculateTokenPrice(bondingCurveState);
        const marketCap = this.idlService.calculateMarketCap(bondingCurveState);
        
        console.log('📊 Calculated Values:');
        console.log('  - Price:', price);
        console.log('  - Market Cap:', marketCap);
        
        // Get global state for progress calculation
        const globalState = await this.idlService.getGlobalState();
        if (globalState) {
          const progress = this.idlService.calculateProgress(bondingCurveState, globalState);
          console.log('  - Progress to Raydium:', `${progress.toFixed(2)}%`);
        }
      } else {
        console.log('❌ Bonding Curve not found');
      }
    } catch (error) {
      console.error('❌ Error testing bonding curve:', error);
    }
  }

  /**
   * Test account derivation
   */
  async testAccountDerivation(mintAddress: string) {
    console.log(`🔍 Testing Account Derivation for ${mintAddress}...`);
    
    try {
      const mint = new PublicKey(mintAddress);
      const accounts = this.idlService.calculateAccounts(mint);
      
      console.log('✅ Derived Accounts:');
      console.log('  - Mint:', accounts.mint.toString());
      console.log('  - Bonding Curve:', accounts.bondingCurve.toString());
      console.log('  - Associated Bonding Curve:', accounts.associatedBondingCurve.toString());
      
      // Check if accounts exist
      const [bondingCurveInfo, associatedBondingCurveInfo] = await Promise.all([
        this.connection.getAccountInfo(accounts.bondingCurve),
        this.connection.getAccountInfo(accounts.associatedBondingCurve)
      ]);
      
      console.log('📋 Account Status:');
      console.log('  - Bonding Curve exists:', bondingCurveInfo !== null);
      console.log('  - Associated Bonding Curve exists:', associatedBondingCurveInfo !== null);
      
      if (bondingCurveInfo) {
        console.log('  - Bonding Curve Owner:', bondingCurveInfo.owner.toString());
        console.log('  - Bonding Curve Data Length:', bondingCurveInfo.data.length);
      }
      
      if (associatedBondingCurveInfo) {
        console.log('  - Associated BC Owner:', associatedBondingCurveInfo.owner.toString());
        console.log('  - Associated BC Data Length:', associatedBondingCurveInfo.data.length);
      }
    } catch (error) {
      console.error('❌ Error testing account derivation:', error);
    }
  }

  /**
   * Run comprehensive IDL tests
   */
  async runTests(testMintAddress?: string) {
    console.log('🚀 Starting IDL Service Tests...\n');
    
    // Test 1: Global State
    await this.testGlobalState();
    console.log('\n' + '─'.repeat(50) + '\n');
    
    // Test 2: Account Derivation
    if (testMintAddress) {
      await this.testAccountDerivation(testMintAddress);
      console.log('\n' + '─'.repeat(50) + '\n');
      
      // Test 3: Bonding Curve
      await this.testBondingCurve(testMintAddress);
    } else {
      console.log('⚠️  No test mint address provided, skipping token-specific tests');
    }
    
    console.log('\n✅ IDL Service Tests Complete!');
  }
}
