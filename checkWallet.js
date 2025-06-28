/**
 * Quick check for remaining tokens in wallet
 */

require('dotenv').config({ path: '.env.local' });

const { Connection, PublicKey } = require('@solana/web3.js');
const bs58 = require('bs58');

async function checkWallet() {
  try {
    // Create connection
    const rpcEndpoint = 'https://mainnet.helius-rpc.com/?api-key=a360743f-773d-430c-afcd-70370fd20b87';
    const connection = new Connection(rpcEndpoint, 'confirmed');
    
    // Get wallet from env
    const privateKey = process.env.NEXT_PUBLIC_AUTONOMOUS_PRIVATE_KEY;
    if (!privateKey) {
      console.log('❌ No NEXT_PUBLIC_AUTONOMOUS_PRIVATE_KEY found');
      return;
    }
    
    const keypair = require('@solana/web3.js').Keypair.fromSecretKey(new Uint8Array(bs58.default.decode(privateKey)));
    const walletPubkey = keypair.publicKey;
    
    console.log(`💰 Wallet: ${walletPubkey.toString()}`);
    
    // Check SOL balance
    const balance = await connection.getBalance(walletPubkey);
    console.log(`💰 SOL balance: ${balance / 1e9} SOL`);
    
    // Get all token accounts
    const tokenAccounts = await connection.getTokenAccountsByOwner(
      walletPubkey,
      { programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') }
    );
    console.log(`🪙 Total token accounts: ${tokenAccounts.value.length}`);
    
    // Check balances
    let hasTokens = false;
    for (const account of tokenAccounts.value) {
      try {
        const balance = await connection.getTokenAccountBalance(account.pubkey);
        const amount = parseFloat(balance.value.amount);
        
        if (amount > 0) {
          const tokenAmount = amount / Math.pow(10, balance.value.decimals);
          console.log(`🪙 Token: ${account.pubkey.toString()} - ${tokenAmount.toFixed(6)} tokens`);
          
          // Get mint address
          const accountInfo = await connection.getAccountInfo(account.pubkey);
          if (accountInfo?.data) {
            const mintPubkey = new PublicKey(accountInfo.data.slice(0, 32));
            console.log(`   Mint: ${mintPubkey.toString()}`);
            
            // Check if this might be PINK tokens
            if (tokenAmount > 30000 && tokenAmount < 35000) {
              console.log(`   🎯 This looks like PINK tokens (${tokenAmount.toFixed(6)})`);
            }
          }
          
          hasTokens = true;
        }
      } catch (error) {
        console.warn(`⚠️ Error checking token account:`, error.message);
      }
    }
    
    if (!hasTokens) {
      console.log('✅ No tokens found in wallet');
    } else {
      console.log('❌ Tokens still present in wallet');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkWallet().catch(console.error);
