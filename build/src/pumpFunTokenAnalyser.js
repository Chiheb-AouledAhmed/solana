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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setNotProcessing = setNotProcessing;
exports.AnalysePumpFunTransactions = AnalysePumpFunTransactions;
exports.stopAccountWatcher = stopAccountWatcher;
const web3_js_1 = require("@solana/web3.js");
const _config_1 = require("./_config");
const _utils_1 = require("./_utils");
const swapUtils_1 = require("./swapUtils");
const bs58_1 = __importDefault(require("bs58"));
const fs = __importStar(require("fs"));
let TRANSACTION_INTERVAL = 50; // 10 seconds
let stopWatching = false;
let lastSignature = '';
let knownTokens = _config_1.KNOWN_TOKENS;
let Processing = false;
let stopcurrWatch = false;
const COOL_DOWN_PERIOD = 3 * 30 * 60 * 1000;
let firstRun = true;
function setNotProcessing() {
    Processing = false;
    firstRun = true;
    console.log("watching another token ->>>");
}
let monitoredAccounts = {};
function loadAccounts(filename) {
    try {
        const data = fs.readFileSync(filename, 'utf-8');
        return JSON.parse(data);
    }
    catch (error) {
        console.error('Error reading accounts file:', error);
        return [];
    }
}
let ignoredAddresses = new Set();
async function AnalysePumpFunTransactions(tokenAddress, lastSignature, filename) {
    console.log('Monitoring Raydium transactions...');
    const connection = new web3_js_1.Connection(_config_1.SOLANA_RPC_URL, 'confirmed');
    ignoredAddresses = (0, _utils_1.loadIgnoredAddresses)(filename);
    // Initialize monitored accounts (accounts that will be buying tokens)
    /*accounts.forEach(accountData => {
        try {
            const privateKeyUint8Array = Buffer.from(accountData.privateKey, 'base64');
            const keypair = Keypair.fromSecretKey(new Uint8Array(privateKeyUint8Array));
            monitoredAccounts[accountData.publicKey] = { lastActive: null, keypair: keypair };
        } catch (error) {
            console.error(`Error loading account ${accountData.publicKey}:`, error);
        }
    });*/
    firstRun = true;
    const centralWalletPrivateKeyUint8Array = bs58_1.default.decode(_config_1.CENTRAL_WALLET_PRIVATE_KEY);
    const centralWalletKeypair = web3_js_1.Keypair.fromSecretKey(centralWalletPrivateKeyUint8Array);
    // Transfer SOL to a random account before starting the loop
    /*const recipientPublicKey = await transferAllSOLToRandomAccount(connection, centralWalletKeypair, accounts); // Transfer 1 SOL
    if (!recipientPublicKey) {
        console.error('Failed to transfer SOL to a random account.');
        return;
    }*/
    //const watchedAccount = new PublicKey(ACCOUNT_TO_WATCH);
    let watchedAccounts = [];
    if (_config_1.ACCOUNTS_TO_WATCH && Array.isArray(_config_1.ACCOUNTS_TO_WATCH)) {
        watchedAccounts = _config_1.ACCOUNTS_TO_WATCH.map(account => new web3_js_1.PublicKey(account));
    }
    else {
        console.log("ACCOUNTS_TO_WATCH", _config_1.ACCOUNTS_TO_WATCH);
        console.warn("ACCOUNTS_TO_WATCH is not properly configured.  Ensure it's a comma-separated list of public keys.");
        return; // Stop execution if ACCOUNTS_TO_WATCH is not valid
    }
    const privateKey = process.env.PRIVATE_KEY;
    let allsum = 0;
    let cacheSignature = new Set();
    // Data structure to hold address specific information
    const addressData = {};
    try {
        //console.log("New Loop");
        /*if(Processing){
            console.log("Processing another token");
            await new Promise(resolve => setTimeout(resolve, POLLING_INTERVAL));
            continue;
        }*/
        const signatures = [];
        let watchedAccounts = [new web3_js_1.PublicKey(tokenAddress)];
        for (const account of watchedAccounts) {
            const publicKey = new web3_js_1.PublicKey(account);
            const signaturesAccount = await connection.getSignaturesForAddress(account, {
                before: lastSignature,
                limit: 1000
            }, 'confirmed');
            for (const signature of signaturesAccount) {
                signatures.push({ signature: signature, account: publicKey });
            }
        }
        let cnt = 0;
        for (const signatureInfo of signatures) {
            cnt++;
            if (cnt % 100 == 0)
                console.log("Processed ", cnt, " signatures");
            const signature = signatureInfo.signature.signature;
            const publicKey = signatureInfo.account;
            if (signature && !cacheSignature.has(signature)) {
                cacheSignature.add(signature);
                {
                    /*console.log(`New transaction detected: ${signature}`);
                    const message = `
                    New Token Transfer Detected!
                    Signature: ${signature}
                    `;
                    await sendTelegramNotification(message);*/
                    try {
                        const transaction = await (0, _utils_1.getParsedTransactionWithRetry)(connection, signature, {
                            commitment: 'confirmed',
                            maxSupportedTransactionVersion: 0
                        });
                        if ((0, _utils_1.checkTransactionStatus)(transaction, signature)) {
                            console.log("Transaction", signature);
                            const result = await (0, swapUtils_1.decodePumpFunTradev2)(signature, transaction);
                            if (result.length > 0) {
                                let address = transaction.transaction.message.accountKeys[0].pubkey.toBase58();
                                for (const res of result) {
                                    console.log("Result: ", res);
                                    {
                                        if (res.direction == "buy") {
                                            let solAmount = (res.solAmount / web3_js_1.LAMPORTS_PER_SOL);
                                            console.log("Buy Amount: ", solAmount);
                                            if (!ignoredAddresses.has(address.trim().toLowerCase()))
                                                allsum += solAmount;
                                            // Update addressData for buy
                                            if (!addressData[address]) {
                                                addressData[address] = { buys: 0, sells: 0, signatures: [] };
                                            }
                                            addressData[address].buys += solAmount;
                                            addressData[address].signatures.push(signature);
                                        }
                                        else if (res.direction == "sell") {
                                            let solAmount = (res.solAmount / web3_js_1.LAMPORTS_PER_SOL);
                                            if (!ignoredAddresses.has(address.trim().toLowerCase()))
                                                allsum -= solAmount;
                                            console.log("Sell Amount: ", solAmount);
                                            // Update addressData for sell
                                            if (!addressData[address]) {
                                                addressData[address] = { buys: 0, sells: 0, signatures: [] };
                                            }
                                            addressData[address].sells += solAmount;
                                            addressData[address].signatures.push(signature);
                                        }
                                    }
                                }
                            }
                            else {
                                console.log('This transaction does not appear to be a pump fun transaction');
                            }
                        }
                    }
                    catch (error) {
                        console.error("Error processing transaction:", error);
                    }
                }
            }
            await new Promise(resolve => setTimeout(resolve, TRANSACTION_INTERVAL)); // Wait 5 seconds before polling again
        }
    }
    catch (error) {
        console.error("Error fetching signatures:", error);
    }
    console.log("Total Amount: ", allsum);
    // Convert addressData to an array for sorting
    const addressArray = Object.entries(addressData).map(([address, data]) => ({
        address,
        ...data,
        netValue: data.buys - data.sells // Calculate net buy/sell amount
    }));
    // Sort the array by net buy/sell amount in descending order
    addressArray.sort((a, b) => b.netValue - a.netValue);
    let output_file = 'address_data_sorted_' + tokenAddress + '.json';
    // Save the sorted address data to a JSON file
    fs.writeFileSync(output_file, JSON.stringify(addressArray, null, 2));
    console.log('Sorted address data saved to address_data_sorted.json');
}
// Call this function to stop watching transactions
function stopAccountWatcher() {
    stopWatching = true;
}
async function processDetails(tokenAddress, firstRun, signature, connection, recipientPublicKey, watchedAccount) {
    {
        if (firstRun)
            knownTokens.add(tokenAddress);
        if (!knownTokens.has(tokenAddress)) {
            knownTokens.add(tokenAddress);
            console.log(`Token ${tokenAddress} is NOT in database. Buying...`);
            try {
                // BUY THE TOKEN
                console.log(`New pump fun token detected: ${signature}`);
                const message = `
                    New Pump fun token!
                    Token: ${tokenAddress}
                    Signature: ${signature}
                    `;
                await (0, _utils_1.sendTelegramNotification)(message);
                /*let amm = await buyNewToken(connection, tokenAddress,recipientPublicKey);

                //GET THE PRICE
                const solBalance = await connection.getBalance(new PublicKey(tokenAddress));
                const buyPrice = solBalance / 1e9; // Convert lamports to SOL

                // Start watching the token
                const tokenData: TokenData = {
                    mint: new PublicKey(tokenAddress),
                    decimals: 9,
                    buyPrice: buyPrice,
                    amm : amm,
                    watchedAccountsUsage: watchedAccountsUsage,
                    watchedAccount : watchedAccount
                };
                watchedAccountsUsage[watchedAccount.toBase58()] = Date.now();
                await startMonitoring(connection,recipientPublicKey,0,tokenData);*/
                return true;
            }
            catch (buyError) {
                console.error(`Failed to buy token ${tokenAddress}:`, buyError);
            }
        }
        return false;
    }
}
//# sourceMappingURL=pumpFunTokenAnalyser.js.map