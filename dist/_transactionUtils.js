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
    let curAmmId = "";
    const privateKeyUint8Array = bs58_1.default.decode(_config_1.YOUR_PRIVATE_KEY);
    const keyPair = web3_js_1.Keypair.fromSecretKey(privateKeyUint8Array);
    const solBalance = await (0, _utils_1.getSOLBalance)(connection, keyPair.publicKey);
    const amountToBuy = solBalance * _config_1.BUY_AMOUNT_PERCENTAGE; // Use percentage from config
    console.log(`Buying token ${tokenAddress} with ${amountToBuy} SOL`);
    let program_id = "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8";
    const instruction = await (0, swapUtils_1.pollTransactionsForSwap)(tokenAddress, program_id, connection);
    if (!instruction) {
        console.log("No instruction found for token ", tokenAddress);
        return "";
    }
    curAmmId = await (0, swapUtils_1.getPoolKeysFromParsedInstruction)(instruction, connection);
    try {
        await makeAndExecuteSwap(connection, keyPair, "So11111111111111111111111111111111111111112", // SOL address
        tokenAddress, amountToBuy, curAmmId);
    }
    catch (error) {
        console.error(`Error buying token ${tokenAddress}:`, error);
        throw error; // Re-throw so the calling function knows it failed
    }
    return curAmmId;
}
async function sellToken(connection, tokenAddress, amm) {
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
        await executeTradeBasedOnBalance(connection, keyPair, tokenAddress, "So11111111111111111111111111111111111111112", 100, false, amm // isBuy = false (sell)
        );
    }
    catch (error) {
        console.error(`Error selling token ${tokenAddress}:`, error);
        throw error; // Re-throw so the calling function knows it failed
    }
}
async function makeAndExecuteSwap(connection, keyPair, tokenInAddress, tokenOutAddress, swapAmountIn, poolId) {
    const MAX_ATTEMPTS = 20; // Maximum number of attempts to find the pool
    //const DELAY_BETWEEN_ATTEMPTS = 5000; // Delay in milliseconds between attempts
    let attempts = 0;
    let ammId = "";
    let poolKeys = null;
    /*if(signature.length>0){
        const transaction = await connection.getParsedTransaction(signature, {
            maxSupportedTransactionVersion: 0,
            commitment: 'confirmed'
        });
        let program_id = "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8";
        let instructions = transaction?.transaction.message.instructions;
        if (instructions !== undefined) {
        for (let i = 0; i < instructions.length; i++) {
            const instruction = instructions[i];
            if (instruction.programId.toBase58() === program_id) {
                ammId = await getPoolKeysFromParsedInstruction(instruction, connection);
            }
          }
        }
          
    }
    else*/
    if (poolId.length > 0) {
        ammId = poolId;
    }
    else {
        ammId = await (0, swapUtils_1.getPoolId)(connection, tokenInAddress, tokenOutAddress);
        if (!ammId) {
            console.error(`Failed to find pool for ${tokenInAddress}-${tokenOutAddress} after ${MAX_ATTEMPTS} attempts.`);
            return;
        }
        console.log(`Using AMM ID: ${ammId}`);
        //poolKeys = await getPoolKeys(ammId, connection);
    }
    poolKeys = await (0, swapUtils_1.getPoolKeys)(ammId, connection);
    const slippage = 2; // 2% slippage tolerance
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
function extractPoolKeysFromLogs(instruction) {
    // Logic to extract pool keys from logs
    // This might involve regular expressions or string manipulation
    // For simplicity, assume we can directly extract the necessary details
    const poolKeys = {
        id: new web3_js_1.PublicKey('pool_id_from_logs'),
        authority: new web3_js_1.PublicKey('authority_from_logs'),
        openOrders: new web3_js_1.PublicKey('open_orders_from_logs'),
        baseVault: new web3_js_1.PublicKey('base_vault_from_logs'),
        quoteVault: new web3_js_1.PublicKey('quote_vault_from_logs'),
        marketProgramId: new web3_js_1.PublicKey('market_program_id_from_logs'),
        marketId: new web3_js_1.PublicKey('market_id_from_logs'),
        marketBids: new web3_js_1.PublicKey('market_bids_from_logs'),
        marketAsks: new web3_js_1.PublicKey('market_asks_from_logs'),
        marketEventQueue: new web3_js_1.PublicKey('market_event_queue_from_logs'),
        marketBaseVault: new web3_js_1.PublicKey('market_base_vault_from_logs'),
        marketQuoteVault: new web3_js_1.PublicKey('market_quote_vault_from_logs'),
        marketAuthority: new web3_js_1.PublicKey('market_authority_from_logs'),
        programId: new web3_js_1.PublicKey('program_id_from_logs'),
        baseMint: new web3_js_1.PublicKey('base_mint_from_logs'),
        quoteMint: new web3_js_1.PublicKey('quote_mint_from_logs'),
        baseDecimals: 9, // Example decimals
        quoteDecimals: 9, // Example decimals
    };
    return poolKeys;
}
async function executeTradeBasedOnBalance(connection, keyPair, fromTokenAddress, toTokenAddress, percentageToTrade, isBuy, amm) {
    const balance = await getTokenBalance(connection, fromTokenAddress, keyPair.publicKey);
    const amountToTrade = balance * (percentageToTrade / 100);
    console.log(`Current ${fromTokenAddress} balance: ${balance}`);
    console.log(`Amount to ${isBuy ? 'buy' : 'sell'} (${percentageToTrade}%): ${amountToTrade}`);
    if (amountToTrade > 0) {
        await makeAndExecuteSwap(connection, keyPair, fromTokenAddress, toTokenAddress, amountToTrade, amm);
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