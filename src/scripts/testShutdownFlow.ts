/**
 * Test script om de shutdown flow te testen
 * Dit script controleert of er nog tokens in de wallet zitten na shutdown
 */

import { PublicKey, Connection } from '@solana/web3.js';
import { AutonomousWallet } from '../services/autonomousWallet';

async function testShutdownFlow() {
  console.log('🧪 Checking wallet for remaining tokens after shutdown...');
  
  try {
    // 1. Create connection
    const rpcEndpoint = process.env.NEXT_PUBLIC_SOLANA_RPC_ENDPOINT || 'https://solana-mainnet.core.chainstack.com/69600811e0e036c9e11cecaecc1f1843';
    const connection = new Connection(rpcEndpoint, 'confirmed');
    
    // 2. Initialize autonomous wallet
    const autonomousWallet = AutonomousWallet.fromEnvironment(connection);
    if (!autonomousWallet) {
      console.log('❌ No autonomous wallet configured');
      return;
    }
    
    const walletPubkey = autonomousWallet.publicKey;
    console.log(`💰 Wallet: ${walletPubkey.toString()}`);
    
    // 3. Check SOL balance
    const balance = await connection.getBalance(walletPubkey);
    console.log(`💰 SOL balance: ${balance / 1e9} SOL`);
    
    // 4. Get all token accounts
    const tokenAccounts = await connection.getTokenAccountsByOwner(
      walletPubkey,
      { programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') }
    );
    console.log(`🪙 Total token accounts: ${tokenAccounts.value.length}`);
    
    // 5. Check balances of all token accounts
    let hasTokens = false;
    let pinkTokens = 0;
    let pinkMint = '';
    
    for (const account of tokenAccounts.value) {
      try {
        const balance = await connection.getTokenAccountBalance(account.pubkey);
        const amount = parseFloat(balance.value.amount);
        
        if (amount > 0) {
          const tokenAmount = amount / Math.pow(10, balance.value.decimals);
          console.log(`🪙 Token balance: ${account.pubkey.toString()} - ${tokenAmount.toFixed(6)} tokens`);
          
          // Get mint address to identify the token
          const accountInfo = await connection.getAccountInfo(account.pubkey);
          if (accountInfo?.data) {
            const mintPubkey = new PublicKey(accountInfo.data.slice(0, 32));
            console.log(`   Mint: ${mintPubkey.toString()}`);
            
            // Check if this might be PINK tokens (you'll need to replace this with actual PINK mint)
            if (tokenAmount > 30000 && tokenAmount < 35000) {
              console.log(`   🎯 This looks like PINK tokens (${tokenAmount.toFixed(6)})`);
              pinkTokens = tokenAmount;
              pinkMint = mintPubkey.toString();
            }
          }
          
          hasTokens = true;
        }
      } catch (error) {
        console.warn(`⚠️ Error checking token account ${account.pubkey.toString()}:`, error);
      }
    }
    
    // 6. Report results
    if (!hasTokens) {
      console.log('✅ SUCCESS: No tokens remaining in wallet');
    } else {
      console.log('❌ ISSUE: Tokens still remain in wallet after shutdown');
      
      if (pinkTokens > 0) {
        console.log(`🎯 Found ${pinkTokens.toFixed(6)} PINK tokens in wallet`);
        console.log(`💡 You can manually sell these using: npm run sell-tokens ${pinkMint}`);
      }
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
if (require.main === module) {
  testShutdownFlow().catch(console.error);
}

export { testShutdownFlow };
