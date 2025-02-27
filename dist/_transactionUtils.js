"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buyNewToken = buyNewToken;
exports.sellToken = sellToken;
exports.makeAndExecuteSwap = makeAndExecuteSwap;
exports.executeTradeBasedOnBalance = executeTradeBasedOnBalance;
exports.getTransactionWithRetry = getTransactionWithRetry;
// src/transactionUtils.ts
const _config_1 = require("./_config");
const _utils_1 = require("./_utils");
const bs58_1 = __importDefault(require("bs58"));
const web3_js_1 = require("@solana/web3.js");
const spl_token_1 = require("@solana/spl-token");
const swapUtils_1 = require("./swapUtils");
const raydium_sdk_1 = require("@raydium-io/raydium-sdk");
async function buyNewToken(connection, tokenAddress) {
    const privateKeyUint8Array = bs58_1.default.decode(_config_1.YOUR_PRIVATE_KEY);
    const keyPair = web3_js_1.Keypair.fromSecretKey(privateKeyUint8Array);
    const solBalance = await (0, _utils_1.getSOLBalance)(connection, keyPair.publicKey);
    const amountToBuy = solBalance * _config_1.BUY_AMOUNT_PERCENTAGE; // Use percentage from config
    console.log(`Buying token ${tokenAddress} with ${amountToBuy} SOL`);
    try {
        await makeAndExecuteSwap(connection, keyPair, "So11111111111111111111111111111111111111112", // SOL address
        tokenAddress, amountToBuy);
    }
    catch (error) {
        console.error(`Error buying token ${tokenAddress}:`, error);
        throw error; // Re-throw so the calling function knows it failed
    }
}
async function sellToken(connection, tokenAddress) {
    const privateKeyUint8Array = bs58_1.default.decode(_config_1.YOUR_PRIVATE_KEY);
    const keyPair = web3_js_1.Keypair.fromSecretKey(privateKeyUint8Array);
    try {
        /*await makeAndExecuteSwap(
            connection,
            keyPair,
            tokenAddress, // token address
            "So11111111111111111111111111111111111111112", // SOL address
            amount
        );*/
        await executeTradeBasedOnBalance(connection, keyPair, tokenAddress, "So11111111111111111111111111111111111111112", 100, false // isBuy = false (sell)
        );
    }
    catch (error) {
        console.error(`Error selling token ${tokenAddress}:`, error);
        throw error; // Re-throw so the calling function knows it failed
    }
}
async function makeAndExecuteSwap(connection, keyPair, tokenInAddress, tokenOutAddress, swapAmountIn) {
    const MAX_ATTEMPTS = 20; // Maximum number of attempts to find the pool
    const DELAY_BETWEEN_ATTEMPTS = 5000; // Delay in milliseconds between attempts
    let attempts = 0;
    let ammId = null;
    while (attempts < MAX_ATTEMPTS && !ammId) {
        ammId = await (0, swapUtils_1.getPoolId)(connection, tokenInAddress, tokenOutAddress);
        if (!ammId) {
            console.log(`Could not find pool for ${tokenInAddress}-${tokenOutAddress}. Attempt ${attempts + 1} of ${MAX_ATTEMPTS}. Retrying in ${DELAY_BETWEEN_ATTEMPTS / 1000} seconds.`);
            await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_ATTEMPTS));
        }
        attempts++;
    }
    if (!ammId) {
        console.error(`Failed to find pool for ${tokenInAddress}-${tokenOutAddress} after ${MAX_ATTEMPTS} attempts.`);
        return;
    }
    console.log(`Using AMM ID: ${ammId}`);
    const slippage = 2; // 2% slippage tolerance
    const poolKeys = await (0, swapUtils_1.getPoolKeys)(ammId, connection);
    if (poolKeys) {
        const poolInfo = await raydium_sdk_1.Liquidity.fetchInfo({ connection, poolKeys });
        const { swapIX, tokenInAccount, tokenInMint, amountIn } = await (0, swapUtils_1.makeSwapInstruction)(connection, tokenInAddress, tokenOutAddress, swapAmountIn, slippage, poolKeys, poolInfo, keyPair);
        const latestBlockhash = await connection.getLatestBlockhash('confirmed');
        const instructions = [
            web3_js_1.ComputeBudgetProgram.setComputeUnitLimit({ units: 1000000 }),
            web3_js_1.ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1000 }),
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
            const signature = await (0, swapUtils_1.executeVersionedTransaction)(connection, transaction, [keyPair]);
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
}
async function executeTradeBasedOnBalance(connection, keyPair, fromTokenAddress, toTokenAddress, percentageToTrade, isBuy) {
    const balance = await getTokenBalance(connection, fromTokenAddress, keyPair.publicKey);
    const amountToTrade = balance * (percentageToTrade / 100);
    console.log(`Current ${fromTokenAddress} balance: ${balance}`);
    console.log(`Amount to ${isBuy ? 'buy' : 'sell'} (${percentageToTrade}%): ${amountToTrade}`);
    if (amountToTrade > 0) {
        await makeAndExecuteSwap(connection, keyPair, fromTokenAddress, toTokenAddress, amountToTrade);
    }
    else {
        console.log("Not enough balance to execute trade.");
    }
}
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
async function getTransactionWithRetry(connection, signature, maxRetries = 3) {
    const initialDelay = 2000; // 2 seconds initial delay
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const transaction = await connection.getParsedTransaction(signature, {
                maxSupportedTransactionVersion: 0,
                commitment: 'confirmed'
            });
            if (transaction) {
                if (transaction.meta && transaction.meta.loadedAddresses) {
                    //console.log(`Transaction ${signature} has loaded addresses:`, transaction.meta.loadedAddresses);
                }
                return transaction;
            }
        }
        catch (error) {
            console.error(`Attempt ${attempt + 1} failed:`, error);
        }
        const delay = initialDelay * Math.pow(2, attempt);
        console.log(`Waiting ${delay}ms before next attempt...`);
        await new Promise(resolve => setTimeout(resolve, delay));
    }
    throw new Error(`Failed to fetch transaction after ${maxRetries} attempts`);
}
//# sourceMappingURL=_transactionUtils.js.map