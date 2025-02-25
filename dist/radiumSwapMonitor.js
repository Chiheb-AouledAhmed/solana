"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const web3_js_1 = require("@solana/web3.js");
const spl_token_1 = require("@solana/spl-token");
const fs = __importStar(require("fs"));
const buffer_layout_1 = require("@solana/buffer-layout");
// Constants
const RAYDIUM_PROGRAM_ID = new web3_js_1.PublicKey('9kkWuiwg8iZxwJP1R6fCkwdVeXaiKdPXMmV9kP7GuHHP');
const RPC_ENDPOINT = 'https://shy-thrilling-putty.solana-mainnet.quiknode.pro/16cb32988e78aca562112a0066e5779a413346cc';
const LOG_FILE = 'raydium_swaps.log';
const UNIFORM_DELAY = 5000; // 5 seconds delay between each execution
const BASE_RETRY_DELAY = 10000; // 10 seconds base delay for retries
const GET_TRANSACTION_DELAY = 1000; // 1 second delay before getTransactionWithRetry
const WSOL_ADDRESS = 'So11111111111111111111111111111111111111112'; // WSOL Mint Address
// Global variable to track total WSOL change
let totalWSOLChange = 0;
// Set to store ignored addresses
const ignoredAddresses = new Set();
// Struct definitions
const swapBaseInLog = (0, buffer_layout_1.struct)([
    (0, buffer_layout_1.u8)('log_type'),
    (0, buffer_layout_1.nu64)('amount_in'),
    (0, buffer_layout_1.nu64)('minimum_out'),
    (0, buffer_layout_1.nu64)('direction'),
    (0, buffer_layout_1.nu64)('user_source'),
    (0, buffer_layout_1.nu64)('pool_coin'),
    (0, buffer_layout_1.nu64)('pool_pc'),
    (0, buffer_layout_1.nu64)('out_amount'),
]);
const swapBaseOutLog = (0, buffer_layout_1.struct)([
    (0, buffer_layout_1.u8)('log_type'),
    (0, buffer_layout_1.nu64)('max_in'),
    (0, buffer_layout_1.nu64)('amount_out'),
    (0, buffer_layout_1.nu64)('direction'),
    (0, buffer_layout_1.nu64)('user_source'),
    (0, buffer_layout_1.nu64)('pool_coin'),
    (0, buffer_layout_1.nu64)('pool_pc'),
    (0, buffer_layout_1.nu64)('deduct_in'),
]);
const logTypeToStruct = new Map([
    [3, swapBaseInLog],
    [4, swapBaseOutLog],
]);
// Function to load ignored addresses from file
function loadIgnoredAddresses(filePath = 'addresses.txt') {
    try {
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        const addresses = fileContent.split('\n').map(line => line.trim().toLowerCase()).filter(line => line !== '');
        addresses.forEach(addr => ignoredAddresses.add(addr));
        console.log(`Loaded ${ignoredAddresses.size} addresses to ignore.`);
    }
    catch (error) {
        console.warn(`Could not read addresses from ${filePath}. All addresses will be processed. Error:`, error);
    }
}
// Helper functions
async function getTransactionWithRetry(connection, signature, maxRetries = 3) {
    const initialDelay = 2000; // 2 seconds initial delay
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const transaction = await connection.getTransaction(signature, {
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
function isSwapTransaction(logs) {
    return logs.some(log => log.toLowerCase().includes('swap') ||
        log.toLowerCase().includes('transfer') ||
        log.toLowerCase().includes('amount_in') ||
        log.toLowerCase().includes('amount_out'));
}
function parseSwapInfo(logs) {
    for (const log of logs) {
        if (log.includes('ray_log')) {
            const parts = log.split('ray_log:');
            if (parts.length > 1) {
                const logData = Buffer.from(parts[1].trim(), 'base64');
                if (logData.length > 0) {
                    //console.log(logData)
                    const logType = logData[0];
                    const logStruct = logTypeToStruct.get(logType);
                    if (logStruct && typeof logStruct.decode === 'function') {
                        //console.log(logStruct.decode(logData));
                        return logStruct.decode(logData);
                    }
                }
            }
        }
    }
    return null;
}
async function getMintDecimals(connection, mintAddress) {
    try {
        const mintInfo = await (0, spl_token_1.getMint)(connection, mintAddress);
        return mintInfo.decimals;
    }
    catch (error) {
        console.error(`Error fetching mint info for ${mintAddress.toBase58()}:`, error);
        return null;
    }
}
function determineInOutTokens(transaction, swapInfo) {
    const preBalances = new Map();
    const postBalances = new Map();
    const netChanges = new Map();
    transaction.meta?.preTokenBalances?.forEach(balance => {
        if (!preBalances.has(balance.mint)) {
            preBalances.set(balance.mint, new Map());
        }
        preBalances.get(balance.mint).set(balance.accountIndex, BigInt(balance.uiTokenAmount.amount));
    });
    transaction.meta?.postTokenBalances?.forEach(balance => {
        if (!postBalances.has(balance.mint)) {
            postBalances.set(balance.mint, new Map());
        }
        postBalances.get(balance.mint).set(balance.accountIndex, BigInt(balance.uiTokenAmount.amount));
        if (!netChanges.has(balance.mint)) {
            netChanges.set(balance.mint, new Map());
        }
        const preBalance = preBalances.get(balance.mint)?.get(balance.accountIndex) || BigInt(0);
        const change = postBalances.get(balance.mint).get(balance.accountIndex) - preBalance;
        netChanges.get(balance.mint).set(balance.accountIndex, change);
    });
    let inToken = null;
    let outToken = null;
    for (const [mint, changes] of netChanges) {
        for (const change of changes.values()) {
            if (Math.abs(Number(change)) === swapInfo.amount_in) {
                inToken = mint;
            }
            else if (Math.abs(Number(change)) === swapInfo.out_amount) {
                outToken = mint;
            }
        }
    }
    if (!inToken || !outToken) {
        throw new Error('Could not determine in and out tokens');
    }
    return {
        inToken: new web3_js_1.PublicKey(inToken),
        outToken: new web3_js_1.PublicKey(outToken)
    };
}
async function getSignerAccount(connection, transaction) {
    let allAccs;
    if (transaction.transaction.message.addressTableLookups && transaction.transaction.message.addressTableLookups.length > 0) {
        // Resolve Address Lookup Tables
        const LUTs = (await Promise.all(transaction.transaction.message.addressTableLookups
            .map((lookup) => connection.getAddressLookupTable(lookup.accountKey))))
            .map((result) => result.value).filter((val) => val !== null);
        // Get all account keys including those from LUTs
        allAccs = transaction.transaction.message.getAccountKeys({ addressLookupTableAccounts: LUTs })
            .keySegments().reduce((acc, cur) => acc.concat(cur), []);
    }
    else {
        // If no LUTs, just get the account keys directly
        allAccs = transaction.transaction.message.getAccountKeys().keySegments().flat();
    }
    // If there are loaded addresses in meta, add them
    if (transaction.meta && transaction.meta.loadedAddresses) {
        const { writable, readonly } = transaction.meta.loadedAddresses;
        allAccs = allAccs.concat(writable || []).concat(readonly || []);
    }
    const signerIndex = transaction.transaction.message.header.numRequiredSignatures - 1;
    return allAccs[signerIndex]?.toBase58() ?? 'Unknown';
}
async function processLogEvent(connection, logsInfo, logStream) {
    const { signature, err, logs } = logsInfo;
    console.log(`\nProcessing transaction: ${signature}`);
    if (err) {
        console.log(`Transaction failed with error: ${JSON.stringify(err)}`);
        return;
    }
    if (!isSwapTransaction(logs)) {
        console.log('This transaction does not appear to be a swap.');
        return;
    }
    console.log('This transaction appears to be a swap.');
    const swapInfo = parseSwapInfo(logs);
    if (!swapInfo) {
        console.log(`Could not find swap info for transaction ${signature}`);
        return;
    }
    try {
        console.log(`Fetching transaction ${signature}...`);
        const transaction = await getTransactionWithRetry(connection, signature);
        if (!transaction) {
            console.log(`Transaction ${signature} not found`);
            return;
        }
        console.log('Transaction fetched successfully');
        const { inToken, outToken } = determineInOutTokens(transaction, swapInfo);
        const signerAccount = await getSignerAccount(connection, transaction);
        // Check if the signer is in the ignored addresses list
        if (ignoredAddresses.has(signerAccount.toLowerCase())) {
            console.log(`Skipping transaction ${signature} because signer ${signerAccount} is in the ignore list.`);
            return;
        }
        const inTokenDecimals = await getMintDecimals(connection, inToken);
        const outTokenDecimals = await getMintDecimals(connection, outToken);
        let adjustedAmountIn, adjustedAmountOut;
        if ('amount_in' in swapInfo) {
            adjustedAmountIn = inTokenDecimals !== null ? Number(swapInfo.amount_in) / Math.pow(10, inTokenDecimals) : Number(swapInfo.amount_in);
            adjustedAmountOut = outTokenDecimals !== null ? Number(swapInfo.out_amount) / Math.pow(10, outTokenDecimals) : Number(swapInfo.out_amount);
        }
        else if ('max_in' in swapInfo) {
            adjustedAmountIn = inTokenDecimals !== null ? Number(swapInfo.deduct_in) / Math.pow(10, inTokenDecimals) : Number(swapInfo.deduct_in);
            adjustedAmountOut = outTokenDecimals !== null ? Number(swapInfo.amount_out) / Math.pow(10, outTokenDecimals) : Number(swapInfo.amount_out);
        }
        const adjustedSwapInfo = {
            ...swapInfo,
            adjustedAmountIn,
            adjustedAmountOut,
            inToken: inToken.toBase58(),
            outToken: outToken.toBase58(),
            inTokenDecimals,
            outTokenDecimals,
            signerAccount
        };
        console.log('Swap processed successfully');
        logStream.write(`${JSON.stringify({ signature, swapInfo: adjustedSwapInfo })}\n`);
        console.log(`Transaction processed successfully`);
        console.log(`${JSON.stringify({ signature, swapInfo: adjustedSwapInfo })}\n`);
        // Update WSOL balance
        if (adjustedSwapInfo.inToken.toLowerCase() === WSOL_ADDRESS.toLowerCase()) {
            totalWSOLChange -= adjustedSwapInfo.adjustedAmountIn;
            console.log("totalWSOLChange - = ", adjustedSwapInfo.adjustedAmountIn);
        }
        else if (adjustedSwapInfo.outToken.toLowerCase() === WSOL_ADDRESS.toLowerCase()) {
            totalWSOLChange += adjustedSwapInfo.adjustedAmountOut;
            console.log("totalWSOLChange + = ", adjustedSwapInfo.adjustedAmountOut);
        }
        else {
            console.log("No WSOL change in this transaction");
        }
        console.log(`Current WSOL Balance Change: ${totalWSOLChange}`);
    }
    catch (error) {
        console.error(`Error processing swap transaction ${signature}:`, error);
    }
}
// Queue management
const queue = [];
let isProcessing = false;
async function processQueue(connection, logStream) {
    if (isProcessing || queue.length === 0)
        return;
    isProcessing = true;
    const logsInfo = queue.shift();
    try {
        // Add delay before calling getTransactionWithRetry
        await new Promise(resolve => setTimeout(resolve, GET_TRANSACTION_DELAY));
        await processLogEvent(connection, logsInfo, logStream);
    }
    catch (error) {
        console.error('Error processing log event:', error);
    }
    finally {
        isProcessing = false;
        // Add uniform delay after each execution
        await new Promise(resolve => setTimeout(resolve, UNIFORM_DELAY));
        processQueue(connection, logStream);
    }
}
// Main function
async function monitorRaydiumTransactions() {
    console.log('Monitoring Raydium transactions...');
    // Load ignored addresses
    loadIgnoredAddresses();
    const connection = new web3_js_1.Connection(RPC_ENDPOINT, 'confirmed');
    const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });
    console.log(`Initial WSOL balance: ${totalWSOLChange}`);
    connection.onLogs(RAYDIUM_PROGRAM_ID, (logsInfo) => {
        queue.push(logsInfo);
        processQueue(connection, logStream);
    }, 'confirmed');
}
// Run the monitor
monitorRaydiumTransactions().catch(console.error);
//# sourceMappingURL=radiumSwapMonitor.js.map