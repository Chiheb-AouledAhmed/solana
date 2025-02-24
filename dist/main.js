"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const web3_js_1 = require("@solana/web3.js");
const spl_token_1 = require("@solana/spl-token");
const raydium_sdk_1 = require("@raydium-io/raydium-sdk");
const raydium_sdk_v2_1 = require("@raydium-io/raydium-sdk-v2");
const bn_js_1 = __importDefault(require("bn.js"));
const bs58_1 = __importDefault(require("bs58"));
//import { JitoTipInstruction } from 'jito-ts/dist/sdk';
// ... (rest of your transaction sending code)
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
async function getPoolId(connection, tokenAAddress, tokenBAddress) {
    const raydium = await raydium_sdk_v2_1.Raydium.load({
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
const makeSwapInstruction = async (connection, tokenInAddress, tokenOutAddress, rawAmountIn, slippage, poolKeys, poolInfo, keyPair) => {
    const tokenInMint = new web3_js_1.PublicKey(tokenInAddress);
    const tokenOutMint = new web3_js_1.PublicKey(tokenOutAddress);
    const tokenInDecimals = poolKeys.baseMint.equals(tokenInMint) ? poolInfo.baseDecimals : poolInfo.quoteDecimals;
    const tokenOutDecimals = poolKeys.baseMint.equals(tokenOutMint) ? poolInfo.baseDecimals : poolInfo.quoteDecimals;
    const amountInRaw = new bn_js_1.default(rawAmountIn * (10 ** tokenInDecimals));
    const amountOutParams = raydium_sdk_1.Liquidity.computeAmountOut({
        poolKeys,
        poolInfo,
        amountIn: new raydium_sdk_1.TokenAmount(new raydium_sdk_1.Token(spl_token_1.TOKEN_PROGRAM_ID, tokenInMint, tokenInDecimals), amountInRaw),
        currencyOut: new raydium_sdk_1.Token(spl_token_1.TOKEN_PROGRAM_ID, tokenOutMint, tokenOutDecimals),
        slippage: new raydium_sdk_1.Percent(slippage, 100),
    });
    let tokenInAccount;
    let tokenOutAccount;
    if (tokenInMint.equals(spl_token_1.NATIVE_MINT)) {
        tokenInAccount = (await getOrCreateAssociatedTokenAccountWithRetry(connection, keyPair, spl_token_1.NATIVE_MINT, keyPair.publicKey)).address;
    }
    else {
        tokenInAccount = (await getOrCreateAssociatedTokenAccountWithRetry(connection, keyPair, tokenInMint, keyPair.publicKey)).address;
    }
    if (tokenOutMint.equals(spl_token_1.NATIVE_MINT)) {
        tokenOutAccount = (await getOrCreateAssociatedTokenAccountWithRetry(connection, keyPair, spl_token_1.NATIVE_MINT, keyPair.publicKey)).address;
    }
    else {
        tokenOutAccount = (await getOrCreateAssociatedTokenAccountWithRetry(connection, keyPair, tokenOutMint, keyPair.publicKey)).address;
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
        data: Buffer.from(Uint8Array.of(9, ...amountInRaw.toArray("le", 8), ...amountOutParams.minAmountOut.raw.toArray("le", 8))),
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
async function executeVersionedTransaction(connection, transaction, signers) {
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
        }
        catch (error) {
            console.error(`Attempt ${attempt + 1} failed:`, error);
            if (error instanceof web3_js_1.SendTransactionError) {
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
const makeAndExecuteSwap = async (tokenInAddress, tokenOutAddress, swapAmountIn) => {
    const connection = new web3_js_1.Connection("https://shy-thrilling-putty.solana-mainnet.quiknode.pro/16cb32988e78aca562112a0066e5779a413346cc", {
        httpAgent: false,
    });
    const secret = "3NjEBhqBn1vGmpUWMYs2fvHxPMnAYqhfhAzatz2gPb9NRnoJ19nhKk8tyrDogC3zdkzovrCiW6EvswbpMAcGKNF5";
    const privateKeyUint8Array = bs58_1.default.decode(secret);
    const keyPair = web3_js_1.Keypair.fromSecretKey(privateKeyUint8Array);
    const ammId = await getPoolId(connection, tokenInAddress, tokenOutAddress);
    if (!ammId) {
        console.log(`Could not find pool for ${tokenInAddress}-${tokenOutAddress}`);
        return;
    }
    console.log(`Using AMM ID: ${ammId}`);
    const slippage = 2; // 2% slippage tolerance
    const poolKeys = await getPoolKeys(ammId, connection);
    if (poolKeys) {
        const poolInfo = await raydium_sdk_1.Liquidity.fetchInfo({ connection, poolKeys });
        const { swapIX, tokenInAccount, tokenInMint, amountIn } = await makeSwapInstruction(connection, tokenInAddress, tokenOutAddress, swapAmountIn, slippage, poolKeys, poolInfo, keyPair);
        const latestBlockhash = await connection.getLatestBlockhash('confirmed');
        // Create the Jito tip instruction
        /*const jitoTipInstruction = JitoTipInstruction.create({
            payer: keyPair.publicKey,
            tipAmount: 10000, // Amount in lamports, adjust as needed
        });*/
        const instructions = [
            web3_js_1.ComputeBudgetProgram.setComputeUnitLimit({ units: 1000000 }),
            web3_js_1.ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1000 }),
            //jitoTipInstruction, // Add the Jito tip instruction here
            ...(tokenInMint.equals(spl_token_1.NATIVE_MINT) ? [
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
// ... [Previous imports and functions remain the same]
async function getTokenBalance(connection, tokenAddress, owner) {
    if (tokenAddress === "So11111111111111111111111111111111111111112") {
        // For SOL
        const balance = await connection.getBalance(owner);
        return balance / 1e9; // Convert lamports to SOL
    }
    else {
        // For other tokens
        const tokenMint = new web3_js_1.PublicKey(tokenAddress);
        const tokenAccount = await (0, spl_token_1.getOrCreateAssociatedTokenAccount)(connection, owner, // Assuming owner is a Keypair
        tokenMint, owner);
        const balance = await connection.getTokenAccountBalance(tokenAccount.address);
        return parseFloat(balance.value.amount) / Math.pow(10, balance.value.decimals);
    }
}
async function executeTradeBasedOnBalance(connection, keyPair, fromTokenAddress, toTokenAddress, percentageToTrade, isBuy) {
    const balance = await getTokenBalance(connection, fromTokenAddress, keyPair.publicKey);
    const amountToTrade = balance * (percentageToTrade / 100);
    console.log(`Current ${fromTokenAddress} balance: ${balance}`);
    console.log(`Amount to ${isBuy ? 'buy' : 'sell'} (${percentageToTrade}%): ${amountToTrade}`);
    if (amountToTrade > 0) {
        if (isBuy) {
            await makeAndExecuteSwap(fromTokenAddress, toTokenAddress, amountToTrade);
        }
        else {
            await makeAndExecuteSwap(fromTokenAddress, toTokenAddress, amountToTrade);
        }
    }
    else {
        console.log("Not enough balance to execute trade.");
    }
}
// Main execution
(async () => {
    try {
        const connection = new web3_js_1.Connection("https://shy-thrilling-putty.solana-mainnet.quiknode.pro/16cb32988e78aca562112a0066e5779a413346cc", {
            httpAgent: false,
        });
        const secret = "3NjEBhqBn1vGmpUWMYs2fvHxPMnAYqhfhAzatz2gPb9NRnoJ19nhKk8tyrDogC3zdkzovrCiW6EvswbpMAcGKNF5";
        const privateKeyUint8Array = bs58_1.default.decode(secret);
        const keyPair = web3_js_1.Keypair.fromSecretKey(privateKeyUint8Array);
        const SOL_ADDRESS = "So11111111111111111111111111111111111111112";
        const USDC_ADDRESS = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
        // Sell 50% of SOL for USDC
        console.log("Executing sell: 50% of SOL to USDC");
        await executeTradeBasedOnBalance(connection, keyPair, USDC_ADDRESS, SOL_ADDRESS, 100, false // isBuy = false (sell)
        );
        // Buy SOL with 30% of USDC balance
        console.log("Executing buy: 30% of USDC to SOL");
        await executeTradeBasedOnBalance(connection, keyPair, USDC_ADDRESS, SOL_ADDRESS, 30, true // isBuy = true (buy)
        );
        console.log("All processes completed!");
    }
    catch (error) {
        console.error("An error occurred during the process:", error);
    }
})();
//# sourceMappingURL=main.js.map