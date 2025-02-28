"use strict";
// src/tokenWatcher.ts
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
exports.startMonitoring = startMonitoring;
exports.startTokenWatcher = startTokenWatcher;
exports.stopTokenWatcher = stopTokenWatcher;
const web3_js_1 = require("@solana/web3.js");
const _utils_1 = require("./_utils");
const _transactionUtils_1 = require("./_transactionUtils");
const _config_1 = require("./_config");
const fs = __importStar(require("fs"));
const swapUtils_1 = require("./swapUtils");
// Constants
const RAYDIUM_PROGRAM_ID = new web3_js_1.PublicKey('GvjehsRY6DEhLyL7ALFADD6QV34pmerMyzfX27owinpY');
const RPC_ENDPOINT = 'https://shy-thrilling-putty.solana-mainnet.quiknode.pro/16cb32988e78aca562112a0066e5779a413346cc';
const LOG_FILE = 'raydium_swaps.log';
const UNIFORM_DELAY = 500; // 5 seconds delay between each execution
const BASE_RETRY_DELAY = 10000; // 10 seconds base delay for retries
const GET_TRANSACTION_DELAY = 1000; // 1 second delay before getTransactionWithRetry
const WSOL_ADDRESS = 'So11111111111111111111111111111111111111112'; // WSOL Mint Address
// Global variable to track total WSOL change
let totalWSOLChange = 0;
// Set to store ignored addresses
const ignoredAddresses = new Set();
// Load ignored addresses from file
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
// Queue management
const queue = [];
let isProcessing = false;
let subscriptionId = null; // To hold the subscription ID
async function processQueue(connection, logStream, keyPair, initialSolBalance, newTokenData) {
    if (isProcessing || queue.length === 0)
        return;
    isProcessing = true;
    const logsInfo = queue.shift();
    try {
        // Add delay before calling getTransactionWithRetry
        await new Promise(resolve => setTimeout(resolve, GET_TRANSACTION_DELAY));
        await processLogEvent(connection, logsInfo, logStream, keyPair, initialSolBalance, newTokenData); // Pass keyPair
    }
    catch (error) {
        console.error('Error processing log event:', error);
    }
    finally {
        isProcessing = false;
        // Add uniform delay after each execution
        await new Promise(resolve => setTimeout(resolve, UNIFORM_DELAY));
        processQueue(connection, logStream, keyPair, initialSolBalance, newTokenData); // Pass keyPair
    }
}
// To manage subscription status
let isMonitoring = false;
let Timestart = 0;
// Function to start monitoring Raydium transactions
async function startMonitoring(connection, keyPair, initialSolBalance, newTokenData) {
    const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });
    if (isMonitoring) {
        console.log("Already monitoring Raydium transactions.");
        return;
    }
    Timestart = Date.now();
    console.log('Starting to monitor Raydium transactions...');
    isMonitoring = true;
    subscriptionId = connection.onLogs(newTokenData.mint, (logsInfo) => {
        queue.push(logsInfo);
        processQueue(connection, logStream, keyPair, initialSolBalance, newTokenData); // Pass keyPair
    }, 'confirmed');
}
// Function to stop monitoring Raydium transactions
function stopMonitoring(connection) {
    if (!isMonitoring || subscriptionId === null) {
        console.log("Not currently monitoring Raydium transactions.");
        return;
    }
    console.log('Stopping monitoring Raydium transactions...');
    isMonitoring = false;
    connection.removeOnLogsListener(subscriptionId)
        .then(() => {
        console.log("Successfully removed the onLogs listener.");
        subscriptionId = null;
    })
        .catch(error => {
        console.error("Error removing the onLogs listener:", error);
    });
}
let tokenData;
let stopWatching = false;
// Updated startTokenWatcher function
async function startTokenWatcher(connection, keyPair, newTokenData) {
    if (tokenData) {
        stopTokenWatcher(); // Stop any existing watcher
    }
    tokenData = newTokenData;
    stopWatching = false;
    // Get initial SOL balance
    const solBalance = await (0, _utils_1.getSOLBalance)(connection, keyPair.publicKey);
    const initialSolBalance = solBalance;
    console.log(`Starting token watcher for ${tokenData.mint.toBase58()}...`);
    // Load ignored addresses
    loadIgnoredAddresses();
    // Create a log stream
    const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });
    // Start monitoring Raydium transactions
    await startMonitoring(connection, keyPair, initialSolBalance, newTokenData); // Pass keyPair
    // Main loop for price checking (you can adjust the interval)
    while (!stopWatching) {
        try {
            if (!tokenData) {
                console.warn("Token data is no longer available. Stopping token watcher.");
                stopMonitoring(connection);
                stopTokenWatcher();
                break;
            }
            // Monitor Raydium transactions to calculate remaining SOL (if needed)
            const remainingSol = await (0, _utils_1.getSOLBalance)(connection, keyPair.publicKey);
            // Get current price
            // Check profit threshold
            /*if (currentPrice > tokenData.buyPrice * PROFIT_THRESHOLD || remainingSol > initialSolBalance + 7) {
                console.log(`Condition met! Selling token ${tokenData.mint.toBase58()}`);
                await sellAndStop(connection, keyPair, tokenData.mint.toBase58());
                break;
            }*/
            console.log(`Token ${tokenData.mint.toBase58()} - Current Balance: ${remainingSol}, Buy Price: ${tokenData.buyPrice}`);
        }
        catch (error) {
            console.error("Error in token watcher:", error);
        }
        await new Promise(resolve => setTimeout(resolve, _config_1.POLLING_INTERVAL));
    }
}
async function sellAndStop(connection, tokenAddress, amm) {
    try {
        // Sell all of the token
        await (0, _transactionUtils_1.sellToken)(connection, tokenAddress, amm);
        const message = `Token ${tokenAddress} sold!`;
        await (0, _utils_1.sendTelegramNotification)(message);
    }
    catch (error) {
        console.error(`Failed to sell token ${tokenAddress}:`, error);
    }
    finally {
        stopMonitoring(connection); // Stop monitoring Raydium transactions
        stopTokenWatcher();
    }
}
function stopTokenWatcher() {
    stopWatching = true;
    tokenData = undefined;
    console.log('Token watching stopped.');
}
let currentPrice = 0;
async function processLogEvent(connection, logsInfo, logStream, keyPair, initialSolBalance, newTokenData) {
    const { signature, err, logs } = logsInfo;
    console.log(`\nProcessing transaction: ${signature}`);
    if (err) {
        console.log(`Transaction failed with error: ${JSON.stringify(err)}`);
        return;
    }
    try {
        console.log(`Fetching transaction ${signature}...`);
        const transaction = await (0, _transactionUtils_1.getTransactionWithRetry)(connection, signature);
        console.log(Timestart + _config_1.TIMEOUT, Date.now());
        if (currentPrice > newTokenData.buyPrice * _config_1.PROFIT_THRESHOLD || Timestart + _config_1.TIMEOUT < Date.now()) //|| totalWSOLChange > initialSolBalance + 7 
         {
            console.log(`Condition met! Selling token ${newTokenData.mint.toBase58()}`);
            await sellAndStop(connection, newTokenData.mint.toBase58(), newTokenData.amm);
        }
        if (!(0, swapUtils_1.isSwapTransaction)(transaction)) {
            console.log('This transaction does not appear to be a swap.');
            //return;
        }
        console.log('This transaction appears to be a swap.');
        const swapInfo = (0, swapUtils_1.parseSwapInfo)(logs);
        if (!swapInfo) {
            console.log(`Could not find swap info for transaction ${signature}`);
            //return;
        }
        if (!transaction) {
            console.log(`Transaction ${signature} not found`);
            //return;
        }
        console.log('Transaction fetched successfully');
        const { inToken, outToken } = (0, swapUtils_1.determineInOutTokens)(transaction, swapInfo);
        const signerAccount = await getSignerAccount(connection, transaction);
        // Check if the signer is in the ignored addresses list
        if (ignoredAddresses.has(signerAccount.toLowerCase())) {
            console.log(`Skipping transaction ${signature} because signer ${signerAccount} is in the ignore list.`);
            return;
        }
        const swapDetails = await (0, swapUtils_1.processSwapTransaction)(connection, transaction, signature);
        if (!swapDetails) {
            console.log(`Could not process swap details for transaction ${signature}`);
            return;
        }
        // Update WSOL balance
        if (swapDetails.inToken.toLowerCase() === WSOL_ADDRESS.toLowerCase()) {
            totalWSOLChange -= swapDetails.amountIn;
            console.log("totalWSOLChange - = ", swapDetails.amountIn);
        }
        else if (swapDetails.outToken.toLowerCase() === WSOL_ADDRESS.toLowerCase()) {
            totalWSOLChange += swapDetails.amountOut;
            console.log("totalWSOLChange + = ", swapDetails.amountOut);
        }
        else {
            console.log("No WSOL change in this transaction");
        }
        console.log(`Current WSOL Balance Change: ${totalWSOLChange}`);
        // Check for conditions to sell and stop
        if (swapDetails.outToken.toLowerCase() === WSOL_ADDRESS.toLowerCase())
            currentPrice = swapDetails.amountIn / swapDetails.amountOut;
        else
            currentPrice = swapDetails.amountOut / swapDetails.amountIn;
    }
    catch (error) {
        console.error(`Error processing swap transaction ${signature}:`, error);
    }
}
//# sourceMappingURL=_tokenWatcher.js.map