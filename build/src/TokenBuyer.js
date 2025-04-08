"use strict";
// src/accountWatcher.ts
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
exports.watchTokenTxsToBuy = watchTokenTxsToBuy;
exports.stopAccountWatcher = stopAccountWatcher;
const web3_js_1 = require("@solana/web3.js");
const _config_1 = require("./_config");
const _utils_1 = require("./_utils");
const swapUtils_1 = require("./swapUtils");
const fs = __importStar(require("fs"));
// Create a write stream for logging
const logStream = fs.createWriteStream('./logs/output.log', { flags: 'a' });
// Custom logger function to replace console.log
function logToFile(message) {
    const timestamp = new Date().toISOString();
    logStream.write(`[${timestamp}] ${message}\n`);
}
// Replace console.log with logToFile
console.log = logToFile;
// Global variables
let stopWatching = false;
let firstRun = true;
let ignoredAddresses = new Set();
const addressData = {};
async function watchTokenTxsToBuy(tokenAccountAddress, signatureBefore, filename = 'interacting_addresses.txt') {
    console.log('Monitoring Start Token transactions...');
    const connection = new web3_js_1.Connection(_config_1.SOLANA_RPC_URL, 'confirmed');
    ignoredAddresses = (0, _utils_1.loadIgnoredAddresses)(filename);
    let watchedAccounts = [new web3_js_1.PublicKey(tokenAccountAddress)];
    let cacheSignature = new Set();
    let allSum = 0;
    while (true) {
        const signatures = [];
        for (const account of watchedAccounts) {
            const publicKey = new web3_js_1.PublicKey(account);
            let signaturesAccount;
            if (firstRun) {
                signaturesAccount = await connection.getSignaturesForAddress(account, { before: signatureBefore, limit: 1000 }, 'confirmed');
            }
            else {
                signaturesAccount = await connection.getSignaturesForAddress(account, { limit: 300 }, 'confirmed');
            }
            for (const signature of signaturesAccount) {
                signatures.push({ signature: signature, account: publicKey });
            }
        }
        signatures.reverse();
        let cnt = 0;
        for (const signatureInfo of signatures) {
            cnt++;
            const signature = signatureInfo.signature.signature;
            if (signature && !cacheSignature.has(signature)) {
                cacheSignature.add(signature);
                if (cnt % 100 === 0)
                    console.log(`Processed ${cnt} signatures`);
                try {
                    const transaction = await (0, _utils_1.getParsedTransactionWithRetry)(connection, signature, {
                        commitment: 'confirmed',
                        maxSupportedTransactionVersion: 0,
                    });
                    if ((0, _utils_1.checkTransactionStatus)(transaction, signature)) {
                        console.log(`Transaction ${signature}`);
                        const result = await (0, swapUtils_1.decodePumpFunTradev2)(signature, transaction);
                        if (result.length > 0) {
                            let address = transaction.transaction.message.accountKeys[0].pubkey.toBase58();
                            for (const res of result) {
                                if (res.direction === 'buy') {
                                    let solAmount = res.solAmount / web3_js_1.LAMPORTS_PER_SOL;
                                    console.log(`Buy Amount: ${solAmount}`);
                                    allSum += solAmount;
                                    // Update addressData for buy
                                    if (!addressData[address]) {
                                        addressData[address] = { buys: 0, sells: 0, TokenBuys: 0, TokenSells: 0, signatures: [] };
                                    }
                                    addressData[address].buys += solAmount;
                                    addressData[address].TokenBuys += res.tokenAmount;
                                    addressData[address].signatures.push(signature);
                                }
                                else if (res.direction === 'sell') {
                                    let solAmount = res.solAmount / web3_js_1.LAMPORTS_PER_SOL;
                                    console.log(`Sell Amount: ${solAmount}`);
                                    allSum -= solAmount;
                                    // Update addressData for sell
                                    if (!addressData[address]) {
                                        addressData[address] = { buys: 0, sells: 0, TokenBuys: 0, TokenSells: 0, signatures: [] };
                                    }
                                    addressData[address].sells += solAmount;
                                    addressData[address].TokenSells += res.tokenAmount;
                                    addressData[address].signatures.push(signature);
                                }
                            }
                        }
                        else {
                            console.log('This transaction does not appear to be a pump fun transaction');
                        }
                    }
                    else {
                        console.log('This transaction is not a pump fun transaction of the chosen token');
                    }
                }
                catch (error) {
                    console.error('Error processing transaction:', error);
                }
            }
        }
        firstRun = false;
    }
}
function stopAccountWatcher() {
    stopWatching = true;
}
//# sourceMappingURL=TokenBuyer.js.map