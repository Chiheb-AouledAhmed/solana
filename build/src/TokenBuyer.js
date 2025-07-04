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
exports.setNotProcessing = setNotProcessing;
exports.watchTokenTxsToBuy = watchTokenTxsToBuy;
exports.stopAccountWatcher = stopAccountWatcher;
const web3_js_1 = require("@solana/web3.js");
const _config_1 = require("./_config");
const _utils_1 = require("./_utils");
const swapUtils_1 = require("./swapUtils");
const pumpFunAccountWatcher_1 = require("./pumpFunAccountWatcher");
const fs = __importStar(require("fs"));
const logStream = fs.createWriteStream('./logs/output.log', { flags: 'a' });
const originalConsoleLog = console.log.bind(console);
const originalConsoleError = console.error.bind(console);
// Custom logger function to replace console.log
function logToFile(...args) {
    const timestamp = new Date().toISOString();
    const formattedMessage = args
        .map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg))
        .join(' ');
    logStream.write(`[${timestamp}] [INFO] TokenBuyer::${formattedMessage}\n`);
    originalConsoleLog(`[${timestamp}] [INFO] TokenBuyer::${formattedMessage}`);
}
// Custom logger function for errors
function errorToFile(...args) {
    const timestamp = new Date().toISOString();
    const formattedMessage = args
        .map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg))
        .join(' ');
    logStream.write(`[${timestamp}] [ERROR] TokenBuyer::${formattedMessage}\n`);
    originalConsoleError(`[${timestamp}] [ERROR] TokenBuyer::${formattedMessage}`);
}
// Replace console.log and console.error with custom loggers
let stopWatching = false;
let lastSignature = '';
let knownTokens = _config_1.KNOWN_TOKENS;
let Processing = false;
let stopcurrWatch = false;
const COOL_DOWN_PERIOD = 15 * 60 * 1000;
let firstRun = true;
let TRANSACTION_INTERVAL = 200;
let BUY_THRESHHOLD = 8;
function setNotProcessing() {
    Processing = false;
    firstRun = true;
    console.log("watching another token ->>>");
}
let ignoredAddresses = new Set();
async function watchTokenTxsToBuy(tokenAccountAddress, signatureBefore, server, filename = 'interacting_addresses.txt') {
    console.log('Monitoring Start Token transactions...');
    const connection = new web3_js_1.Connection(_config_1.SOLANA_RPC_URL, 'confirmed');
    ignoredAddresses = (0, _utils_1.loadIgnoredAddresses)(filename);
    function saveAddressData() {
        try {
            const filteredAddressArray = Object.entries(addressData)
                .filter(([address]) => !ignoredAddresses.has(address.trim().toLowerCase()));
            const addressArray = filteredAddressArray.map(([address, data]) => ({
                address,
                ...data,
                netValue: data.buys - data.sells, // Calculate net buy/sell amount
            }));
            const tmpsum = addressArray.reduce((acc, data) => acc + data.netValue, 0);
            console.log("SUM is:", tmpsum);
            // Sort by netValue in descending order
            addressArray.sort((a, b) => b.netValue - a.netValue);
            const output_file = `token_logs/address_data_sorted_${tokenAccountAddress}.json`;
            // Write sorted data to a file
            fs.writeFileSync(output_file, JSON.stringify(addressArray, null, 2));
            console.log(`Data saved to ${output_file}`);
        }
        catch (error) {
            console.error('Error during cleanup:', error);
        }
    }
    console.log = logToFile;
    console.error = errorToFile;
    const addressData = {};
    process.on('SIGINT', () => {
        console.log('Keyboard interrupt detected (Ctrl+C). Cleaning up...');
        try {
            const filteredAddressArray = Object.entries(addressData)
                .filter(([address]) => !ignoredAddresses.has(address.trim().toLowerCase()));
            const addressArray = filteredAddressArray.map(([address, data]) => ({
                address,
                ...data,
                netValue: data.buys - data.sells, // Calculate net buy/sell amount
            }));
            const tmpsum = addressArray.reduce((acc, data) => acc + data.netValue, 0);
            console.log("SUM is:", tmpsum);
            // Sort by netValue in descending order
            addressArray.sort((a, b) => b.netValue - a.netValue);
            const output_file = `token_logs/address_data_sorted_${tokenAccountAddress}.json`;
            // Write sorted data to a file
            fs.writeFileSync(output_file, JSON.stringify(addressArray, null, 2));
            console.log(`Data saved to ${output_file}`);
        }
        catch (error) {
            console.error('Error during cleanup:', error);
        }
        // Close the server to release the port
        server.close(() => {
            console.log('Server closed.'); // Exit the process
            // Perform any additional cleanup here
            // Call your custom cleanup function
        });
    });
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
    let firstBuy = true;
    let allsum = 0;
    let tokenCreator = null;
    /*const centralWalletPrivateKeyUint8Array = bs58.decode(CENTRAL_WALLET_PRIVATE_KEY);
    const centralWalletKeypair = Keypair.fromSecretKey(centralWalletPrivateKeyUint8Array);

    // Transfer SOL to a random account before starting the loop
    const recipientPublicKey = await transferAllSOLToRandomAccount(connection, centralWalletKeypair, accounts); // Transfer 1 SOL
    if (!recipientPublicKey) {
        console.error('Failed to transfer SOL to a random account.');
        return;
    }*/
    //const watchedAccount = new PublicKey(ACCOUNT_TO_WATCH);
    let watchedAccounts = [new web3_js_1.PublicKey(tokenAccountAddress)];
    let lastcheckTime = Date.now();
    let cacheSignature = new Set();
    let allSum = 0;
    while (true) {
        if (tokenCreator != null) {
            console.log("Token Creator: ", tokenCreator);
            console.log("Token Creator Buys: ", addressData[tokenCreator].TokenBuys);
            console.log("Token Creator Sells: ", addressData[tokenCreator].TokenSells);
        }
        const signatures = [];
        for (const account of watchedAccounts) {
            const publicKey = new web3_js_1.PublicKey(account);
            let signaturesAccount;
            if (firstRun) {
                signaturesAccount = await connection.getSignaturesForAddress(account, {
                    before: signatureBefore,
                    limit: 1000
                }, 'confirmed');
            }
            else {
                signaturesAccount = await connection.getSignaturesForAddress(account, {
                    limit: 1000
                }, 'confirmed');
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
                if (cnt % 100 == 0)
                    console.log("Processed ", cnt, " signatures");
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
                    console.log("signature: ", signature);
                    if ((0, _utils_1.checkTransactionStatus)(transaction, signature)) {
                        console.log('checkTransactionStatus succeeded for transaction: ', signature);
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
                                            addressData[address] = { buys: 0, sells: 0, TokenBuys: 0, TokenSells: 0, signatures: [] };
                                        }
                                        addressData[address].buys += solAmount;
                                        addressData[address].TokenBuys += res.tokenAmount;
                                        addressData[address].signatures.push(signature);
                                    }
                                    else if (res.direction == "sell") {
                                        let solAmount = (res.solAmount / web3_js_1.LAMPORTS_PER_SOL);
                                        if (!ignoredAddresses.has(address.trim().toLowerCase()))
                                            allsum -= solAmount;
                                        console.log("Sell Amount: ", solAmount);
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
                            if ((tokenCreator == address)) {
                                lastcheckTime = Date.now();
                                console.log("TokenCreator signature found: ", signature);
                                if (Math.abs(addressData[address].TokenBuys - addressData[address].TokenSells) < 1e13) {
                                    const filteredAddressArray = Object.entries(addressData)
                                        .filter(([address]) => !ignoredAddresses.has(address.trim().toLowerCase())); // Filter addresses based on the set
                                    const addressArray = filteredAddressArray.map(([address, data]) => ({
                                        address,
                                        ...data,
                                        netValue: data.buys - data.sells // Calculate net buy/sell amount
                                    }));
                                    const tmpsum = addressArray.reduce((acc, data) => acc + data.netValue, 0);
                                    // Sort the array by net buy/sell amount in descending order
                                    addressArray.sort((a, b) => b.netValue - a.netValue);
                                    let output_file = 'token_logs/address_data_sorted_' + tokenAccountAddress + '.json';
                                    // Save the sorted address data to a JSON file
                                    fs.writeFileSync(output_file, JSON.stringify(addressArray, null, 2));
                                    let message;
                                    if (tmpsum < BUY_THRESHHOLD)
                                        message = `
                                            Token Creator ${address} has no more transactions and sum is sufficiently low !: ${tmpsum} => supposed sum : ${allsum}
                                            Buying
                                            `;
                                    else
                                        message = `
                                                Token Creator ${address} has no more transactions and sum is above threshold ! : ${allsum} => supposed sum : ${allsum}
                                                Rejecting !!
                                                `;
                                    (0, _utils_1.sendTelegramNotification)(message);
                                    return (0, pumpFunAccountWatcher_1.watchPumpFunTransactions)(server);
                                }
                            }
                        }
                        else {
                            console.log('This transaction does not appear to be a pump fun transaction');
                        }
                        if ((0, swapUtils_1.isPumpFunCreation)(signature, transaction)) {
                            console.log("Signature Found: ", signature);
                            let address = transaction.transaction.message.accountKeys[0].pubkey.toBase58();
                            console.log("Address found : ", address);
                            tokenCreator = address;
                            ignoredAddresses.add(tokenCreator.trim().toLowerCase());
                            //return watchTokenTransactions(address,tokenAccountAddress);
                        }
                    }
                    else {
                        console.log('checkTransactionStatus failed for transaction: ', signature);
                    }
                }
                catch (error) {
                    console.error("Error processing transaction:", error);
                }
                await new Promise(resolve => setTimeout(resolve, TRANSACTION_INTERVAL));
            }
        }
        if ((tokenCreator == null) || (lastcheckTime + COOL_DOWN_PERIOD < Date.now())) {
            if ((tokenCreator == null))
                console.log("Start Token not found in the transactions");
            else
                console.log("Last check time exceeded the cooldown period");
            console.log("restarting the process");
            (0, pumpFunAccountWatcher_1.watchPumpFunTransactions)(server);
        }
        if ((firstRun) && (tokenCreator)) {
            allsum -= addressData[tokenCreator].buys;
            allsum += addressData[tokenCreator].sells;
        }
        firstRun = false;
        await new Promise(resolve => setTimeout(resolve, _config_1.POLLING_INTERVAL));
    }
}
// Call this function to stop watching transactions
function stopAccountWatcher() {
    stopWatching = true;
}
//# sourceMappingURL=TokenBuyer.js.map