import {
    Connection,
    PublicKey,
    TransactionInstruction,
    Keypair,
    SystemProgram,
    VersionedTransaction,
    ComputeBudgetProgram,
    TransactionMessage,
    SendTransactionError
} from "@solana/web3.js";
import {
    TOKEN_PROGRAM_ID,
    NATIVE_MINT,
    getOrCreateAssociatedTokenAccount,
    createSyncNativeInstruction,
    Account
} from "@solana/spl-token";
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
import { Raydium } from '@raydium-io/raydium-sdk-v2'
import BN from "bn.js";
import bs58 from 'bs58';
//import { JitoTipInstruction } from 'jito-ts/dist/sdk';


// ... (rest of your transaction sending code)


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

async function getPoolId(connection: Connection, tokenAAddress: string, tokenBAddress: string): Promise<string | null> {
    const raydium = await Raydium.load({
        connection: connection,
        cluster: 'mainnet',
        disableFeatureCheck: true,
        disableLoadToken: true,
        blockhashCommitment: "confirmed",
    });

    const data = await raydium.api.fetchPoolByMints({
        mint1: tokenAAddress,
        mint2: tokenBAddress
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

const makeSwapInstruction = async (
    connection: Connection,
    tokenInAddress: string,
    tokenOutAddress: string,
    rawAmountIn: number,
    slippage: number,
    poolKeys: LiquidityPoolKeysV4,
    poolInfo: LiquidityPoolInfo,
    keyPair: Keypair,
) => {
    const tokenInMint = new PublicKey(tokenInAddress);
    const tokenOutMint = new PublicKey(tokenOutAddress);
    
    const tokenInDecimals = poolKeys.baseMint.equals(tokenInMint) ? poolInfo.baseDecimals : poolInfo.quoteDecimals;
    const tokenOutDecimals = poolKeys.baseMint.equals(tokenOutMint) ? poolInfo.baseDecimals : poolInfo.quoteDecimals;

    const amountInRaw = new BN(rawAmountIn * (10 ** tokenInDecimals));

    const amountOutParams = Liquidity.computeAmountOut({
        poolKeys,
        poolInfo,
        amountIn: new TokenAmount(new Token(TOKEN_PROGRAM_ID, tokenInMint, tokenInDecimals), amountInRaw),
        currencyOut: new Token(TOKEN_PROGRAM_ID, tokenOutMint, tokenOutDecimals),
        slippage: new Percent(slippage, 100),
    });

    let tokenInAccount: PublicKey;
    let tokenOutAccount: PublicKey;

    if (tokenInMint.equals(NATIVE_MINT)) {
        tokenInAccount = (
            await getOrCreateAssociatedTokenAccountWithRetry(
                connection,
                keyPair,
                NATIVE_MINT,
                keyPair.publicKey,
            )
        ).address;
    } else {
        tokenInAccount = (
            await getOrCreateAssociatedTokenAccountWithRetry(
                connection,
                keyPair,
                tokenInMint,
                keyPair.publicKey,
            )
        ).address;
    }

    if (tokenOutMint.equals(NATIVE_MINT)) {
        tokenOutAccount = (
            await getOrCreateAssociatedTokenAccountWithRetry(
                connection,
                keyPair,
                NATIVE_MINT,
                keyPair.publicKey
            )
        ).address;
    } else {
        tokenOutAccount = (
            await getOrCreateAssociatedTokenAccountWithRetry(
                connection,
                keyPair,
                tokenOutMint,
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
                ...amountInRaw.toArray("le", 8),
                ...amountOutParams.minAmountOut.raw.toArray("le", 8),
            ),
        ),
    });
    return {
        swapIX: ix,
        tokenInAccount: tokenInAccount,
        tokenOutAccount: tokenOutAccount,
        tokenInMint,
        tokenOutMint,
        amountIn: amountInRaw,
        minAmountOut: amountOutParams.minAmountOut,
    };
};

async function executeVersionedTransaction(connection: Connection, transaction: VersionedTransaction, signers: Keypair[]): Promise<string | false> {
    const MAX_RETRIES = 5;
    const INITIAL_BACKOFF = 1000; // 1 second

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
            transaction.message.recentBlockhash = blockhash;
            transaction.sign(signers);
            
            const signature = await connection.sendRawTransaction(transaction.serialize(), {
                skipPreflight: true,
                preflightCommitment: 'confirmed',
            });

            console.log(`Transaction sent. Signature: ${signature}`);

            const confirmation = await connection.confirmTransaction({
                signature,
                blockhash,
                lastValidBlockHeight,
            }, 'confirmed');

            if (confirmation.value.err) {
                throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
            }

            console.log(`Transaction confirmed: ${signature}`);
            return signature;
        } catch (error) {
            console.error(`Attempt ${attempt + 1} failed:`, error);
            if (error instanceof SendTransactionError) {
                console.error('SendTransactionError:', error.message);
                console.error('Logs:', error.logs);
            }
            if (attempt === MAX_RETRIES - 1) {
                console.error("Transaction failed after maximum retries");
                return false;
            }
            const delay = INITIAL_BACKOFF * Math.pow(2, attempt);
            console.log(`Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    return false;
}

const makeAndExecuteSwap = async (tokenInAddress: string, tokenOutAddress: string, swapAmountIn: number) => {
    const connection = new Connection("https://shy-thrilling-putty.solana-mainnet.quiknode.pro/16cb32988e78aca562112a0066e5779a413346cc", {
        httpAgent: false,
    });

    const secret = "3NjEBhqBn1vGmpUWMYs2fvHxPMnAYqhfhAzatz2gPb9NRnoJ19nhKk8tyrDogC3zdkzovrCiW6EvswbpMAcGKNF5";
    const privateKeyUint8Array = bs58.decode(secret);
    const keyPair = Keypair.fromSecretKey(privateKeyUint8Array);

    const ammId = await getPoolId(connection, tokenInAddress, tokenOutAddress);

    if (!ammId) {
        console.log(`Could not find pool for ${tokenInAddress}-${tokenOutAddress}`);
        return;
    }

    console.log(`Using AMM ID: ${ammId}`);

    const slippage = 2; // 2% slippage tolerance

    const poolKeys = await getPoolKeys(ammId, connection);
    
    if (poolKeys) {
        const poolInfo = await Liquidity.fetchInfo({ connection, poolKeys });
        const {
            swapIX,
            tokenInAccount,
            tokenInMint,
            amountIn
        } = await makeSwapInstruction(
            connection,
            tokenInAddress,
            tokenOutAddress,
            swapAmountIn,
            slippage,
            poolKeys,
            poolInfo,
            keyPair,
        );

        const latestBlockhash = await connection.getLatestBlockhash('confirmed');

        // Create the Jito tip instruction
        /*const jitoTipInstruction = JitoTipInstruction.create({
            payer: keyPair.publicKey,
            tipAmount: 10000, // Amount in lamports, adjust as needed
        });*/

        const instructions = [
            ComputeBudgetProgram.setComputeUnitLimit({ units: 1000000 }),
            ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1000 }),
            //jitoTipInstruction, // Add the Jito tip instruction here
            ...(tokenInMint.equals(NATIVE_MINT) ? [
                SystemProgram.transfer({
                    fromPubkey: keyPair.publicKey,
                    toPubkey: tokenInAccount,
                    lamports: amountIn.toNumber(),
                }),
                createSyncNativeInstruction(tokenInAccount, TOKEN_PROGRAM_ID),
            ] : []),
            swapIX
        ];

        const message = new TransactionMessage({
            payerKey: keyPair.publicKey,
            recentBlockhash: latestBlockhash.blockhash,
            instructions,
        }).compileToV0Message();

        const transaction = new VersionedTransaction(message);

        try {
            const signature = await executeVersionedTransaction(connection, transaction, [keyPair]);
            if (signature) {
                console.log("Transaction Completed Successfully 🎉🚀.");
                console.log(`Explorer URL: https://solscan.io/tx/${signature}`);
            } else {
                console.error("Versioned Transaction failed");
            }
        } catch (error) {
            console.error("Transaction failed:", error);
        }
    } else {
        console.log(`Could not get PoolKeys for AMM: ${ammId}`);
    }
};
    
// ... [Previous imports and functions remain the same]

async function getTokenBalance(connection: Connection, tokenAddress: string, owner: PublicKey): Promise<number> {
    if (tokenAddress === "So11111111111111111111111111111111111111112") {
        // For SOL
        const balance = await connection.getBalance(owner);
        return balance / 1e9; // Convert lamports to SOL
    } else {
        // For other tokens
        const tokenMint = new PublicKey(tokenAddress);
        const tokenAccount = await getOrCreateAssociatedTokenAccount(
            connection,
            owner as any, // Assuming owner is a Keypair
            tokenMint,
            owner
        );
        const balance = await connection.getTokenAccountBalance(tokenAccount.address);
        return parseFloat(balance.value.amount) / Math.pow(10, balance.value.decimals);
    }
}

async function executeTradeBasedOnBalance(
    connection: Connection,
    keyPair: Keypair,
    fromTokenAddress: string,
    toTokenAddress: string,
    percentageToTrade: number,
    isBuy: boolean
) {
    const balance = await getTokenBalance(connection, fromTokenAddress, keyPair.publicKey);
    const amountToTrade = balance * (percentageToTrade / 100);

    console.log(`Current ${fromTokenAddress} balance: ${balance}`);
    console.log(`Amount to ${isBuy ? 'buy' : 'sell'} (${percentageToTrade}%): ${amountToTrade}`);

    if (amountToTrade > 0) {
        if (isBuy) {
            await makeAndExecuteSwap(
                fromTokenAddress,
                toTokenAddress,
                amountToTrade
            );
        } else {
            await makeAndExecuteSwap(
                fromTokenAddress,
                toTokenAddress,
                amountToTrade
            );
        }
    } else {
        console.log("Not enough balance to execute trade.");
    }
}

// Main execution
(async () => {
    try {
        const connection = new Connection("https://shy-thrilling-putty.solana-mainnet.quiknode.pro/16cb32988e78aca562112a0066e5779a413346cc", {
            httpAgent: false,
        });

        const secret = "3NjEBhqBn1vGmpUWMYs2fvHxPMnAYqhfhAzatz2gPb9NRnoJ19nhKk8tyrDogC3zdkzovrCiW6EvswbpMAcGKNF5";
        const privateKeyUint8Array = bs58.decode(secret);
        const keyPair = Keypair.fromSecretKey(privateKeyUint8Array);

        const SOL_ADDRESS = "So11111111111111111111111111111111111111112";
        const USDC_ADDRESS = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

        // Sell 50% of SOL for USDC
        console.log("Executing sell: 50% of SOL to USDC");
        await executeTradeBasedOnBalance(
            connection,
            keyPair,
            USDC_ADDRESS,
            SOL_ADDRESS,
            100,
            false // isBuy = false (sell)
        );

        
        console.log("All processes completed!");
    } catch (error) {
        console.error("An error occurred during the process:", error);
    }
})();
