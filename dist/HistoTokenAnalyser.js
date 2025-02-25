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
const fs = __importStar(require("fs"));
// Constants
const RPC_ENDPOINT = 'https://shy-thrilling-putty.solana-mainnet.quiknode.pro/16cb32988e78aca562112a0066e5779a413346cc';
const WSOL_ADDRESS = 'So11111111111111111111111111111111111111112'; // WSOL Mint Address
const TOKEN_MINT_ADDRESS = 'YourTokenMintAddressHere'; // Replace with your token mint address
// Global variable to track total WSOL change
let totalWSOLChange = 0;
// Set to store ignored addresses
const ignoredAddresses = new Set();
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
// Helper function to get transaction with retry
async function getTransactionWithRetry(connection, signature, maxRetries = 3) {
    const initialDelay = 2000; // 2 seconds initial delay
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const transaction = await connection.getTransaction(signature, {
                maxSupportedTransactionVersion: 0,
                commitment: 'confirmed'
            });
            if (transaction) {
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
// Function to process transaction
async function processTransaction(connection, signature, logStream) {
    console.log(`\nProcessing transaction: ${signature}`);
    try {
        const transaction = await getTransactionWithRetry(connection, signature);
        if (!transaction) {
            console.log(`Transaction ${signature} not found`);
            return;
        }
        if (!transaction.meta?.logMessages) {
            console.log(`No logs found for transaction ${signature}`);
            return;
        }
        const logs = transaction.meta.logMessages;
        // Check if the transaction is a swap transaction
        if (!isSwapTransaction(logs)) {
            console.log('This transaction is not a swap transaction. Skipping.');
            return;
        }
        // Process transaction logic here...
        console.log('Processing swap transaction...');
        // Update WSOL balance
        // This part remains similar to your original code
    }
    catch (error) {
        console.error(`Error processing transaction ${signature}:`, error);
    }
}
// Main function to process historical transactions
async function processHistoricalTransactions() {
    console.log('Processing historical Raydium transactions...');
    // Load ignored addresses
    loadIgnoredAddresses();
    const connection = new web3_js_1.Connection(RPC_ENDPOINT);
    const logStream = fs.createWriteStream('raydium_swaps_historical.log', { flags: 'a' });
    console.log(`Initial WSOL balance: ${totalWSOLChange}`);
    // Replace 'YourTransactionSignaturesHere' with your list of transaction signatures
    const transactionSignatures = [
        'ExampleTransactionSignature1',
        'ExampleTransactionSignature2',
        'ExampleTransactionSignature3'
    ];
    for (const signature of transactionSignatures) {
        try {
            await processTransaction(connection, signature, logStream);
        }
        catch (error) {
            console.error(`Error processing transaction ${signature}:`, error);
        }
    }
    console.log(`\nFinished processing historical transactions.`);
    console.log(`Total WSOL Balance Change: ${totalWSOLChange}`);
    logStream.write(`\nTotal WSOL Balance Change: ${totalWSOLChange}`);
    logStream.end();
}
processHistoricalTransactions().catch(console.error);
//# sourceMappingURL=HistoTokenAnalyser.js.map