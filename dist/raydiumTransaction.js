"use strict";
/*import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js';
import { Market } from '@project-serum/serum'; // or the appropriate
import {
  Token,
  TokenAmount,
  Percent,
  WSOL,
  Liquidity,
  LIQUIDITY_STATE_LAYOUT_V4,LiquidityPoolKeysV4
} from '@raydium-io/raydium-sdk';
import { Raydium } from '@raydium-io/raydium-sdk-v2';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import bs58 from 'bs58';
const quoteTokenMint = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const inputMint = new PublicKey('So11111111111111111111111111111111111111112');
async function getPoolKey(
  connection: Connection,
  tokenAMint: PublicKey,
  tokenBMint: PublicKey
): Promise<PublicKey | null> {
  const filters = [
    {
      memcmp: {
        offset: LIQUIDITY_STATE_LAYOUT_V4.offsetOf('baseMint'),
        bytes: inputMint.toBase58(),
      },
    },
    {
      memcmp: {
        offset: LIQUIDITY_STATE_LAYOUT_V4.offsetOf('quoteMint'),
        bytes: quoteTokenMint.toBase58(),
      },
    },
    {
      dataSize: LIQUIDITY_STATE_LAYOUT_V4.span,
    },
  ];
  

  const accounts = await connection.getProgramAccounts(
    new PublicKey('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8'),
    { filters }
  );

  for (const account of accounts) {
    const poolState = LIQUIDITY_STATE_LAYOUT_V4.decode(account.account.data);
    if (
      (poolState.baseMint.equals(tokenAMint) && poolState.quoteMint.equals(tokenBMint)) ||
      (poolState.baseMint.equals(tokenBMint) && poolState.quoteMint.equals(tokenAMint))
    ) {
      return account.pubkey;
    }
  }

  return null;
}

async function swapWSOLForToken(
  connection: Connection,
  wallet: Keypair,
  tokenAddress: string,
  amountInSOL: number
) {
  // Get the POOL_KEY
  const tokenAMint = new PublicKey(WSOL.mint);
  const tokenBMint = new PublicKey(tokenAddress);
  const poolKey = await getPoolKey(connection, tokenAMint, tokenBMint);

  if (!poolKey) {
    console.error('Could not find a suitable pool for the given token pair');
    return;
  }

  console.log(`Using POOL_KEY: ${poolKey.toBase58()}`);

  // Create token instances
  const tokenA = new Token(TOKEN_PROGRAM_ID, tokenAMint, WSOL.decimals, WSOL.symbol, WSOL.name);
  const tokenB = new Token(TOKEN_PROGRAM_ID, tokenBMint, 9, 'Unknown', 'Unknown');

  // Set up pool keys
  const poolKeys = await Liquidity.fetchAllPoolKeys(connection, { 4: poolKey, 5: poolKey });
  const specificPoolKeys = poolKeys.find(key => key.id.equals(poolKey));

  if (!specificPoolKeys) {
    console.error('Could not find specific pool keys');
    return;
  }

  // Convert SOL amount to WSOL amount
  const amountIn = new TokenAmount(tokenA, amountInSOL * Math.pow(10, WSOL.decimals));

  // Set slippage tolerance (0.5% in this example)
  const slippage = new Percent(50, 10000);
  // Fetch the pool account info
const poolAccountInfo = await connection.getAccountInfo(poolKey);

if (!poolAccountInfo) {
  console.error('Could not fetch pool account info');
  return;
}

// Decode the pool state
const poolState = LIQUIDITY_STATE_LAYOUT_V4.decode(poolAccountInfo.data);

const marketInfo = await Market.load(
  connection,
  poolState.marketId,
  {},
  poolState.marketProgramId
);
// Construct the full poolKeys object
const poolKeys: LiquidityPoolKeysV4 = {
  id: poolKey,
  baseMint: poolState.baseMint,
  quoteMint: poolState.quoteMint,
  lpMint: poolState.lpMint,
  baseDecimals: poolState.baseDecimal.toNumber(),
  quoteDecimals: poolState.quoteDecimal.toNumber(),
  lpDecimals: 6, // You may need to adjust this value
  version: 4,
  programId: poolAccountInfo.owner,
  authority: PublicKey.findProgramAddressSync([poolKey.toBuffer()], poolAccountInfo.owner)[0],
  openOrders: poolState.openOrders,
  targetOrders: poolState.targetOrders,
  baseVault: poolState.baseVault,
  quoteVault: poolState.quoteVault,
  withdrawQueue: poolState.withdrawQueue,
  lpVault: poolState.lpVault,
  marketVersion: 3,
  marketProgramId: poolState.marketProgramId,
  marketId: poolState.marketId,
  marketAuthority: PublicKey.findProgramAddressSync([poolState.marketId.toBuffer()], poolState.marketProgramId)[0],
  marketBaseVault: poolState.baseVault,
  marketQuoteVault: poolState.quoteVault,
  marketBids: marketInfo.bids,
  marketAsks: marketInfo.asks,
  marketEventQueue: poolState.eventQueue,
  lookupTableAccount: PublicKey.default.toString()
};


// Now you can use this poolKeys object in fetchInfo

  try {
    // Fetch pool info
    const poolInfo = await Liquidity.fetchInfo({ connection, poolKeys });


    // Compute the minimum amount out based on slippage
    const { amountOut, minAmountOut } = Liquidity.computeAmountOut({
      poolKeys: poolKeys,
      poolInfo,
      amountIn,
      currencyOut: tokenB,
      slippage
    });

    // Create the swap instruction
    const { innerTransactions } = await Liquidity.makeSwapInstructionSimple({
      connection,
      poolKeys: poolKeys,
      userKeys: {
        tokenAccounts: [], // Add user token accounts here
        owner: wallet.publicKey,
      },
      amountIn,
      amountOut: minAmountOut,
      fixedSide: 'in',
      makeTxVersion: 0, // or 1 for v0 transactions
    });

    // Sign and send the transaction
    for (const innerTransaction of innerTransactions) {
      let transaction: Transaction;

      if ('instructions' in innerTransaction && Array.isArray(innerTransaction.instructions)) {
        transaction = new Transaction().add(...innerTransaction.instructions);
      } else if (Array.isArray(innerTransaction) && innerTransaction.length > 0 && 'instructions' in innerTransaction[0]) {
        transaction = new Transaction().add(...innerTransaction[0].instructions);
      } else {
        console.error('Unexpected innerTransaction structure:', innerTransaction);
        throw new Error('Invalid innerTransaction structure');
      }

      const signature = await connection.sendTransaction(transaction, [wallet]);
      console.log(`Swap transaction sent: ${signature}`);
      await connection.confirmTransaction(signature);
      console.log(`Swap transaction confirmed: ${signature}`);
    }

  } catch (error) {
    console.error('Error during swap:', error);
  }
}

// Usage example
async function main() {
  const connection = new Connection('https://shy-thrilling-putty.solana-mainnet.quiknode.pro/16cb32988e78aca562112a0066e5779a413346cc', 'confirmed');
  const base58SecretKey = '67rGZqVxUxtkBdTm9imwvY8PRpN8PndQdMARCSmgRZzYZU8smTXgktHAxveFNccdJdnyurQgcvQUHNGxtBCJfCti'; // Replace with your actual Base58 secret key
  const secretKeyUint8Array = bs58.decode(base58SecretKey);
  const wallet = Keypair.fromSecretKey(secretKeyUint8Array);
  const tokenAddress = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'; // USDC token address
  const amountInSOL = 0.1;

  await swapWSOLForToken(connection, wallet, tokenAddress, amountInSOL);
}

main().catch(console.error);*/
//# sourceMappingURL=raydiumTransaction.js.map