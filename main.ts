import axios from 'axios';
import {
    LIQUIDITY_STATE_LAYOUT_V4,
    LiquidityPoolKeysV4,
    MAINNET_PROGRAM_ID,
    MARKET_STATE_LAYOUT_V3,
    Liquidity,
    LiquidityPoolInfo,
    Token,
    TokenAmount,
    Percent
} from "@raydium-io/raydium-sdk";
import {
    Connection,
    PublicKey,
    TransactionInstruction,
    sendAndConfirmTransaction,
    Transaction, 
    Keypair, 
    TransactionSignature, 
    RpcResponseAndContext, 
    SignatureStatus
} from "@solana/web3.js";
import {
    TOKEN_PROGRAM_ID,
    NATIVE_MINT,
    getOrCreateAssociatedTokenAccount,
    createSyncNativeInstruction,
    Account  
} from "@solana/spl-token";
import BN from "bn.js";
import * as fs from 'fs';
import { Raydium } from '@raydium-io/raydium-sdk-v2'
import bs58 from 'bs58';


// Override Connection.prototype.getAccountInfo with axios
/*Connection.prototype.getAccountInfo = async function (publicKey, commitment) {
    const args = [publicKey.toBase58()];
    //if (commitment) args.push(commitment);
    try {
        const unsafeRes = await axios.post(this.rpcEndpoint, {
            jsonrpc: '2.0',
            id: 1,
            method: 'getAccountInfo',
            params: args,
        });
        return unsafeRes.data.result;
    } catch (error) {
        console.error("axios error:", error);
        throw error;
    }
}*/
async function getOrCreateAssociatedTokenAccountWithRetry(
    connection: Connection,
    payer: Keypair,
    mint: PublicKey,
    owner: PublicKey,
    maxRetries = 3,
    delay = 1000
  ): Promise<Account> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const account = await getOrCreateAssociatedTokenAccount(
          connection,
          payer,
          mint,
          owner
        );
        return account;
      } catch (error) {
        console.error(`Attempt ${attempt + 1} failed: ${error instanceof Error ? error.message : String(error)}`);
        if (attempt === maxRetries - 1) throw error;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    throw new Error("Failed to get or create associated token account after max retries");
  }
async function getPoolId(connection: Connection, tokenAddress: string): Promise<string | null> {
    const raydium = await Raydium.load({
        connection: connection,
        cluster: 'mainnet',
        disableFeatureCheck: true,
        disableLoadToken: true,
        blockhashCommitment: "confirmed",
    });

    const data = await raydium.api.fetchPoolByMints({
        mint1: 'So11111111111111111111111111111111111111112', // WSOL address
        mint2: tokenAddress
    });

    const pools = data.data;
    for (const obj of pools) {
        if (obj.type === "Standard") {
            return obj.id; // This is the POOL_ID
        }
    }

    return null; // Return null if no suitable pool is found
}

const getPoolKeys = async (ammId: string, connection: Connection): Promise<LiquidityPoolKeysV4 | undefined> => {
    try {
        const ammAccount = await connection.getAccountInfo(new PublicKey(ammId));
        if (ammAccount) {
            const poolState = LIQUIDITY_STATE_LAYOUT_V4.decode(ammAccount.data);
            const marketAccount = await connection.getAccountInfo(poolState.marketId);
            if (marketAccount) {
                const marketState = MARKET_STATE_LAYOUT_V3.decode(marketAccount.data);
                const marketAuthority = PublicKey.createProgramAddressSync(
                    [
                        marketState.ownAddress.toBuffer(),
                        marketState.vaultSignerNonce.toArrayLike(Buffer, "le", 8),
                    ],
                    MAINNET_PROGRAM_ID.OPENBOOK_MARKET,
                );
                return {
                    id: new PublicKey(ammId),
                    programId: MAINNET_PROGRAM_ID.AmmV4,
                    status: poolState.status,
                    baseDecimals: poolState.baseDecimal.toNumber(),
                    quoteDecimals: poolState.quoteDecimal.toNumber(),
                    lpDecimals: 9,
                    baseMint: poolState.baseMint,
                    quoteMint: poolState.quoteMint,
                    version: 4,
                    authority: new PublicKey(
                        "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1",
                    ),
                    openOrders: poolState.openOrders,
                    baseVault: poolState.baseVault,
                    quoteVault: poolState.quoteVault,
                    marketProgramId: MAINNET_PROGRAM_ID.OPENBOOK_MARKET,
                    marketId: marketState.ownAddress,
                    marketBids: marketState.bids,
                    marketAsks: marketState.asks,
                    marketEventQueue: marketState.eventQueue,
                    marketBaseVault: marketState.baseVault,
                    marketQuoteVault: marketState.quoteVault,
                    marketAuthority: marketAuthority,
                    targetOrders: poolState.targetOrders,
                    lpMint: poolState.lpMint,
                    withdrawQueue: poolState.withdrawQueue,
                    lpVault: poolState.lpVault,
                    marketVersion: 3,
                    lookupTableAccount: PublicKey.default
                } as LiquidityPoolKeysV4;
            }
        }
    } catch (error) {
        console.error("getPoolKeys error:", error);
    }
    return undefined;
};

const calculateAmountOut = async (
    poolKeys: LiquidityPoolKeysV4,
    poolInfo: LiquidityPoolInfo,
    tokenToBuy: string,
    amountIn: number,
    rawSlippage: number,
) => {
    let tokenOutMint = new PublicKey(tokenToBuy);
    let tokenOutDecimals = poolKeys.baseMint.equals(tokenOutMint)
        ? poolInfo.baseDecimals
        : poolInfo.quoteDecimals;
    let tokenInMint = poolKeys.baseMint.equals(tokenOutMint)
        ? poolKeys.quoteMint
        : poolKeys.baseMint;
    let tokenInDecimals = poolKeys.baseMint.equals(tokenOutMint)
        ? poolInfo.quoteDecimals
        : poolInfo.baseDecimals;

    const amountInRaw = new BN(amountIn * (10 ** tokenInDecimals));
    const slippage = rawSlippage / 100;

    const amountOutParams = Liquidity.computeAmountOut({
        poolKeys,
        poolInfo,
        amountIn: new TokenAmount(new Token(TOKEN_PROGRAM_ID, tokenInMint, tokenInDecimals), amountInRaw),
        currencyOut: new Token(TOKEN_PROGRAM_ID, tokenOutMint, tokenOutDecimals),
        slippage: new Percent(slippage * 100, 100),
    });

    return {
        amountIn: amountInRaw,
        tokenIn: tokenInMint,
        tokenOut: tokenOutMint,
        ...amountOutParams,
    };
};

const makeSwapInstruction = async (
    connection: Connection,
    tokenToBuy: string,
    rawAmountIn: number,
    slippage: number,
    poolKeys: LiquidityPoolKeysV4,
    poolInfo: LiquidityPoolInfo,
    keyPair: Keypair,
) => {
    const { amountIn, tokenIn, tokenOut, minAmountOut } =
        await calculateAmountOut(
            poolKeys,
            poolInfo,
            tokenToBuy,
            rawAmountIn,
            slippage,
        );
    let tokenInAccount: PublicKey;
    let tokenOutAccount: PublicKey;

    if (tokenIn.equals(NATIVE_MINT)) {
        tokenInAccount = (
            await getOrCreateAssociatedTokenAccountWithRetry(
                connection,
                keyPair,
                NATIVE_MINT,
                keyPair.publicKey,
            )
        ).address;
        tokenOutAccount = (
            await getOrCreateAssociatedTokenAccountWithRetry(
                connection,
                keyPair,
                new PublicKey(tokenToBuy),
                keyPair.publicKey,
            )
        ).address;
    } else {
        tokenOutAccount = (
            await getOrCreateAssociatedTokenAccountWithRetry(
                connection,
                keyPair,
                NATIVE_MINT,
                keyPair.publicKey
            )
        ).address;
        tokenInAccount = (
            await getOrCreateAssociatedTokenAccountWithRetry(
                connection,
                keyPair,
                tokenIn,
                keyPair.publicKey,
            )
        ).address;
    }

    const ix = new TransactionInstruction({
        programId: new PublicKey(poolKeys.programId),
        keys: [
            { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
            { pubkey: poolKeys.id, isSigner: false, isWritable: true },
            { pubkey: poolKeys.authority, isSigner: false, isWritable: false },
            { pubkey: poolKeys.openOrders, isSigner: false, isWritable: true },
            { pubkey: poolKeys.baseVault, isSigner: false, isWritable: true },
            { pubkey: poolKeys.quoteVault, isSigner: false, isWritable: true },
            { pubkey: poolKeys.marketProgramId, isSigner: false, isWritable: false },
            { pubkey: poolKeys.marketId, isSigner: false, isWritable: true },
            { pubkey: poolKeys.marketBids, isSigner: false, isWritable: true },
            { pubkey: poolKeys.marketAsks, isSigner: false, isWritable: true },
            { pubkey: poolKeys.marketEventQueue, isSigner: false, isWritable: true },
            { pubkey: poolKeys.marketBaseVault, isSigner: false, isWritable: true },
            { pubkey: poolKeys.marketQuoteVault, isSigner: false, isWritable: true },
            { pubkey: poolKeys.marketAuthority, isSigner: false, isWritable: false },
            { pubkey: tokenInAccount, isSigner: false, isWritable: true },
            { pubkey: tokenOutAccount, isSigner: false, isWritable: true },
            { pubkey: keyPair.publicKey, isSigner: true, isWritable: false },
        ],
        data: Buffer.from(
            Uint8Array.of(
                9,
                ...amountIn.toArray("le", 8),
                ...minAmountOut.raw.toArray("le", 8),
            ),
        ),
    });
    return {
        swapIX: ix,
        tokenInAccount: tokenInAccount,
        tokenOutAccount: tokenOutAccount,
        tokenIn,
        tokenOut,
        amountIn,
        minAmountOut,
    };
};

async function executeTransaction(connection: Connection, transaction: Transaction, signers: Keypair[]): Promise<TransactionSignature> {
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 1000; // 1 second
  
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        // Get a new blockhash for each attempt
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
        transaction.recentBlockhash = blockhash;
  
        const signature = await sendAndConfirmTransaction(
          connection,
          transaction,
          signers,
          {
            commitment: 'confirmed',
            maxRetries: 3,
          }
        );
  
        // Wait for confirmation
        const confirmation = await awaitTransactionConfirmation(connection, signature, lastValidBlockHeight);
        
        if (confirmation) {
          console.log(`Transaction confirmed: ${signature}`);
          return signature;
        } else {
          console.log(`Transaction not confirmed, retrying...`);
        }
      } catch (error) {
        console.error(`Attempt ${attempt + 1} failed:`, error);
        if (attempt === MAX_RETRIES - 1) throw error;
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      }
    }
  
    throw new Error('Transaction failed after maximum retries');
  }
  
  async function awaitTransactionConfirmation(
    connection: Connection,
    signature: TransactionSignature,
    lastValidBlockHeight: number
  ): Promise<boolean> {
    const MAX_CHECKS = 30;
    const CHECK_INTERVAL = 1000; // 1 second
  
    for (let i = 0; i < MAX_CHECKS; i++) {
      const response: RpcResponseAndContext<SignatureStatus | null> = await connection.getSignatureStatus(signature);
      const status = response.value;
  
      if (status) {
        if (status.err) {
          throw new Error(`Transaction ${signature} failed: ${JSON.stringify(status.err)}`);
        } else if (status.confirmations === null || status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized') {
          return true;
        }
      }
  
      if (await connection.getBlockHeight() > lastValidBlockHeight) {
        throw new Error(`Transaction ${signature} expired: block height exceeded`);
      }
  
      await new Promise(resolve => setTimeout(resolve, CHECK_INTERVAL));
    }
  
    return false;
  }

// Example usage:
try {
    const signature = await executeTransaction(connection, transaction, [keypair]);
    console.log("Transaction executed successfully:", signature);
  } catch (error) {
    console.error("Failed to execute transaction:", error);
  }
  
