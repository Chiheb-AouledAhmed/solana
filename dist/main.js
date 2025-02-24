"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const raydium_sdk_1 = require("@raydium-io/raydium-sdk");
const web3_js_1 = require("@solana/web3.js");
const spl_token_1 = require("@solana/spl-token");
const bn_js_1 = __importDefault(require("bn.js"));
const raydium_sdk_v2_1 = require("@raydium-io/raydium-sdk-v2");
const bs58_1 = __importDefault(require("bs58"));
async function getOrCreateAssociatedTokenAccountWithRetry(connection, payer, mint, owner, maxRetries = 3, delay = 1000) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const account = await (0, spl_token_1.getOrCreateAssociatedTokenAccount)(connection, payer, mint, owner);
            return account;
        }
        catch (error) {
            console.error(`Attempt ${attempt + 1} failed: ${error instanceof Error ? error.message : String(error)}`);
            if (attempt === maxRetries - 1)
                throw error;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    throw new Error("Failed to get or create associated token account after max retries");
}
async function getPoolId(connection, tokenAddress) {
    const raydium = await raydium_sdk_v2_1.Raydium.load({
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
const getPoolKeys = async (ammId, connection) => {
    try {
        const ammAccount = await connection.getAccountInfo(new web3_js_1.PublicKey(ammId));
        if (ammAccount) {
            const poolState = raydium_sdk_1.LIQUIDITY_STATE_LAYOUT_V4.decode(ammAccount.data);
            const marketAccount = await connection.getAccountInfo(poolState.marketId);
            if (marketAccount) {
                const marketState = raydium_sdk_1.MARKET_STATE_LAYOUT_V3.decode(marketAccount.data);
                const marketAuthority = web3_js_1.PublicKey.createProgramAddressSync([
                    marketState.ownAddress.toBuffer(),
                    marketState.vaultSignerNonce.toArrayLike(Buffer, "le", 8),
                ], raydium_sdk_1.MAINNET_PROGRAM_ID.OPENBOOK_MARKET);
                return {
                    id: new web3_js_1.PublicKey(ammId),
                    programId: raydium_sdk_1.MAINNET_PROGRAM_ID.AmmV4,
                    status: poolState.status,
                    baseDecimals: poolState.baseDecimal.toNumber(),
                    quoteDecimals: poolState.quoteDecimal.toNumber(),
                    lpDecimals: 9,
                    baseMint: poolState.baseMint,
                    quoteMint: poolState.quoteMint,
                    version: 4,
                    authority: new web3_js_1.PublicKey("5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1"),
                    openOrders: poolState.openOrders,
                    baseVault: poolState.baseVault,
                    quoteVault: poolState.quoteVault,
                    marketProgramId: raydium_sdk_1.MAINNET_PROGRAM_ID.OPENBOOK_MARKET,
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
                    lookupTableAccount: web3_js_1.PublicKey.default
                };
            }
        }
    }
    catch (error) {
        console.error("getPoolKeys error:", error);
    }
    return undefined;
};
const calculateAmountOut = async (poolKeys, poolInfo, tokenToBuy, amountIn, rawSlippage) => {
    let tokenOutMint = new web3_js_1.PublicKey(tokenToBuy);
    let tokenOutDecimals = poolKeys.baseMint.equals(tokenOutMint)
        ? poolInfo.baseDecimals
        : poolInfo.quoteDecimals;
    let tokenInMint = poolKeys.baseMint.equals(tokenOutMint)
        ? poolKeys.quoteMint
        : poolKeys.baseMint;
    let tokenInDecimals = poolKeys.baseMint.equals(tokenOutMint)
        ? poolInfo.quoteDecimals
        : poolInfo.baseDecimals;
    const amountInRaw = new bn_js_1.default(amountIn * (10 ** tokenInDecimals));
    const slippage = rawSlippage / 100;
    const amountOutParams = raydium_sdk_1.Liquidity.computeAmountOut({
        poolKeys,
        poolInfo,
        amountIn: new raydium_sdk_1.TokenAmount(new raydium_sdk_1.Token(spl_token_1.TOKEN_PROGRAM_ID, tokenInMint, tokenInDecimals), amountInRaw),
        currencyOut: new raydium_sdk_1.Token(spl_token_1.TOKEN_PROGRAM_ID, tokenOutMint, tokenOutDecimals),
        slippage: new raydium_sdk_1.Percent(slippage * 100, 100),
    });
    return {
        amountIn: amountInRaw,
        tokenIn: tokenInMint,
        tokenOut: tokenOutMint,
        ...amountOutParams,
    };
};
const makeSwapInstruction = async (connection, tokenToBuy, rawAmountIn, slippage, poolKeys, poolInfo, keyPair) => {
    const { amountIn, tokenIn, tokenOut, minAmountOut } = await calculateAmountOut(poolKeys, poolInfo, tokenToBuy, rawAmountIn, slippage);
    let tokenInAccount;
    let tokenOutAccount;
    if (tokenIn.equals(spl_token_1.NATIVE_MINT)) {
        tokenInAccount = (await getOrCreateAssociatedTokenAccountWithRetry(connection, keyPair, spl_token_1.NATIVE_MINT, keyPair.publicKey)).address;
        tokenOutAccount = (await getOrCreateAssociatedTokenAccountWithRetry(connection, keyPair, new web3_js_1.PublicKey(tokenToBuy), keyPair.publicKey)).address;
    }
    else {
        tokenOutAccount = (await getOrCreateAssociatedTokenAccountWithRetry(connection, keyPair, spl_token_1.NATIVE_MINT, keyPair.publicKey)).address;
        tokenInAccount = (await getOrCreateAssociatedTokenAccountWithRetry(connection, keyPair, tokenIn, keyPair.publicKey)).address;
    }
    const ix = new web3_js_1.TransactionInstruction({
        programId: new web3_js_1.PublicKey(poolKeys.programId),
        keys: [
            { pubkey: spl_token_1.TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
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
        data: Buffer.from(Uint8Array.of(9, ...amountIn.toArray("le", 8), ...minAmountOut.raw.toArray("le", 8))),
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
async function executeVersionedTransaction(connection, transaction, signers) {
    const MAX_RETRIES = 5;
    const INITIAL_BACKOFF = 1000; // 1 second
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            // Get a fresh blockhash for each attempt
            const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
            transaction.message.recentBlockhash = blockhash;
            // Sign the transaction with the fresh blockhash
            transaction.sign(signers);
            const rawTransaction = transaction.serialize();
            console.log(`Attempt ${attempt + 1}: Sending transaction...`);
            const signature = await connection.sendRawTransaction(rawTransaction, {
                skipPreflight: true,
                preflightCommitment: 'confirmed',
            });
            console.log(`Transaction sent. Signature: ${signature}`);
            console.log(`Waiting for transaction confirmation...`);
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
        }
        catch (error) {
            console.error(`Attempt ${attempt + 1} failed:`);
            if (error instanceof web3_js_1.SendTransactionError) {
                console.error('SendTransactionError:', error.message);
                console.error('Logs:', error.logs);
                // You can add more specific error handling here based on error.logs content
            }
            else {
                console.error('Error:', error);
            }
            if (attempt === MAX_RETRIES - 1) {
                console.error("Transaction failed after maximum retries");
                return false;
            }
            // Exponential backoff
            const delay = INITIAL_BACKOFF * Math.pow(2, attempt);
            console.log(`Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    return false;
}
const makeAndExecuteSwap = async (swapAmountIn, tokenToBuy) => {
    const connection = new web3_js_1.Connection("https://shy-thrilling-putty.solana-mainnet.quiknode.pro/16cb32988e78aca562112a0066e5779a413346cc", {
        httpAgent: false,
    });
    const secret = "3NjEBhqBn1vGmpUWMYs2fvHxPMnAYqhfhAzatz2gPb9NRnoJ19nhKk8tyrDogC3zdkzovrCiW6EvswbpMAcGKNF5";
    const privateKeyUint8Array = bs58_1.default.decode(secret);
    const keyPair = web3_js_1.Keypair.fromSecretKey(privateKeyUint8Array);
    const ammId = await getPoolId(connection, tokenToBuy);
    if (!ammId) {
        console.log(`Could not find pool for SOL-${tokenToBuy}`);
        return;
    }
    console.log(`Using AMM ID: ${ammId}`);
    const slippage = 2; // 2% slippage tolerance
    const poolKeys = await getPoolKeys(ammId, connection);
    if (poolKeys) {
        const poolInfo = await raydium_sdk_1.Liquidity.fetchInfo({ connection, poolKeys });
        const { swapIX, tokenInAccount, tokenIn, amountIn } = await makeSwapInstruction(connection, tokenToBuy, swapAmountIn, slippage, poolKeys, poolInfo, keyPair);
        const latestBlockhash = await connection.getLatestBlockhash('confirmed');
        const instructions = [
            web3_js_1.ComputeBudgetProgram.setComputeUnitLimit({ units: 1000000 }),
            web3_js_1.ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1000 }),
            ...(tokenIn.equals(spl_token_1.NATIVE_MINT) ? [
                web3_js_1.SystemProgram.transfer({
                    fromPubkey: keyPair.publicKey,
                    toPubkey: tokenInAccount,
                    lamports: amountIn.toNumber(),
                }),
                (0, spl_token_1.createSyncNativeInstruction)(tokenInAccount, spl_token_1.TOKEN_PROGRAM_ID),
            ] : []),
            swapIX
        ];
        const message = new web3_js_1.TransactionMessage({
            payerKey: keyPair.publicKey,
            recentBlockhash: latestBlockhash.blockhash,
            instructions,
        }).compileToV0Message();
        const transaction = new web3_js_1.VersionedTransaction(message);
        try {
            const signature = await executeVersionedTransaction(connection, transaction, [keyPair]);
            if (signature) {
                console.log("Transaction Completed Successfully 🎉🚀.");
                console.log(`Explorer URL: https://solscan.io/tx/${signature}`);
            }
            else {
                console.error("Versioned Transaction failed");
            }
        }
        catch (error) {
            console.error("Transaction failed:", error);
        }
    }
    else {
        console.log(`Could not get PoolKeys for AMM: ${ammId}`);
    }
};
// Main execution
(async () => {
    try {
        await makeAndExecuteSwap(0.02, "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
        console.log("Swap process completed!");
    }
    catch (error) {
        console.error("An error occurred during the swap process:", error);
    }
})();
//# sourceMappingURL=main.js.map