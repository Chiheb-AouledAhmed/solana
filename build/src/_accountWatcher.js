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
exports.watchTransactions = watchTransactions;
exports.stopAccountWatcher = stopAccountWatcher;
const web3_js_1 = require("@solana/web3.js");
const _config_1 = require("./_config");
const _utils_1 = require("./_utils");
const swapUtils_1 = require("./swapUtils");
const _transactionUtils_1 = require("./_transactionUtils");
const _tokenWatcher_1 = require("./_tokenWatcher"); // Import startTokenWatcher
const fs = __importStar(require("fs"));
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
async function watchTransactions(watchedAccountsUsage) {
    console.log('Monitoring Raydium transactions...');
    const connection = new web3_js_1.Connection(_config_1.SOLANA_RPC_URL, 'confirmed');
    const accounts = loadAccounts(_config_1.ACCOUNTS_FILE);
    if (accounts.length === 0) {
        console.warn('No accounts loaded.  Exiting.');
        return;
    }
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
    /*const centralWalletPrivateKeyUint8Array = bs58.decode(CENTRAL_WALLET_PRIVATE_KEY);
    const centralWalletKeypair = Keypair.fromSecretKey(centralWalletPrivateKeyUint8Array);

    // Transfer SOL to a random account before starting the loop
    const recipientPublicKey = await transferAllSOLToRandomAccount(connection, centralWalletKeypair, accounts); // Transfer 1 SOL
    if (!recipientPublicKey) {
        console.error('Failed to transfer SOL to a random account.');
        return;
    }*/
    //const watchedAccount = new PublicKey(ACCOUNT_TO_WATCH);
    let watchedAccounts = [];
    let ACCOUNTS_TO_WATCH_v2 = ["69dQZMdXizk5N9PbK7fppTspbuG6VbsVxLD6hu4BvKBt"];
    if (ACCOUNTS_TO_WATCH_v2 && Array.isArray(ACCOUNTS_TO_WATCH_v2)) {
        watchedAccounts = ACCOUNTS_TO_WATCH_v2.map(account => new web3_js_1.PublicKey(account));
    }
    else {
        console.log("ACCOUNTS_TO_WATCH", ACCOUNTS_TO_WATCH_v2);
        console.warn("ACCOUNTS_TO_WATCH is not properly configured.  Ensure it's a comma-separated list of public keys.");
        return; // Stop execution if ACCOUNTS_TO_WATCH is not valid
    }
    watchedAccounts.forEach(account => {
        var _a;
        // Initialize the account in watchedAccountsUsage to 0 only if it doesn't exist
        watchedAccountsUsage[_a = account.toBase58()] ?? (watchedAccountsUsage[_a] = 0);
    });
    const privateKey = process.env.PRIVATE_KEY;
    let cacheSignature = new Set();
    while (!stopWatching) {
        try {
            //console.log("New Loop");
            /*if(Processing){
                console.log("Processing another token");
                await new Promise(resolve => setTimeout(resolve, POLLING_INTERVAL));
                continue;
            }*/
            const signatures = [];
            for (const account of watchedAccounts) {
                const publicKey = new web3_js_1.PublicKey(account);
                const signaturesAccount = await connection.getSignaturesForAddress(account, {
                    limit: 10
                }, 'confirmed');
                for (const signature of signaturesAccount) {
                    signatures.push({ signature: signature, account: publicKey });
                }
            }
            for (const signatureInfo of signatures) {
                const signature = signatureInfo.signature.signature;
                const publicKey = signatureInfo.account;
                if (signature && !cacheSignature.has(signature)) {
                    cacheSignature.add(signature);
                    {
                        lastSignature = signature;
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
                            if (transaction) {
                                console.log("Transaction", transaction);
                                const transferDetails = await (0, swapUtils_1.processTransferSolanaTransaction)(transaction);
                                if ((transferDetails) && (!firstRun)) {
                                    console.log(`Transfer Details: ${JSON.stringify(transferDetails)}`);
                                    for (const transferDetail of transferDetails) {
                                        let amount = transferDetail.amount;
                                        if ((amount > 90 * 1e9) && (transferDetail.source == '69dQZMdXizk5N9PbK7fppTspbuG6VbsVxLD6hu4BvKBt')) {
                                            const message = `
                                            New Token Transfer Detected!
                                            Signature: ${signature}
                                            `;
                                            await (0, _utils_1.sendTelegramNotification)(message);
                                        }
                                    }
                                }
                                /*if (isSwapTransaction(transaction)) {
                                    const swapDetails = await processSwapTransaction(connection, transaction, signature);
                                    if(swapDetails){
                                        let tokenAddress = "";
                                        if(!knownTokens.has(swapDetails.inToken)){
                                            tokenAddress = swapDetails.inToken;
                                        }
                                        else
                                            tokenAddress = swapDetails.outToken;
                                    try{
                                            let processed = await processDetails(tokenAddress,firstRun,signature,connection,recipientPublicKey,watchedAccountsUsage,publicKey);
                                            if (processed)
                                                return
                                            //await startMonitoring(connection,keyPair,0,
                                                //{
                                                  //  mint: new PublicKey('GvjehsRY6DEhLyL7ALFADD6QV34pmerMyzfX27owinpY'),
                                                   // decimals: 9,
                                                   // buyPrice : 100000000000000000
                                                //});
                                            // startMonitoring(tokenData);
                                        
                                    } catch (buyError) {
                                            console.error(`Failed to buy token ${tokenAddress}:`, buyError);
                                    }
                                    }else{
                                        console.log("failed to fetch Swap details");
                                    }
                                }
                                else{
                                    const transferDetails = await processTransferTransaction(transaction);
    
                                    if (transferDetails) {
                                        console.log(`Transfer Details: ${JSON.stringify(transferDetails)}`);
                                        for(const transferDetail of transferDetails){
                                    
                                            const tokenAddress = transferDetail.tokenAddress;
                                            try{
                                                let processsed = await processDetails(tokenAddress,firstRun,signature,connection,recipientPublicKey,watchedAccountsUsage,publicKey);
                                                if(processsed)
                                                    return ;
                                                    //startMonitoring(tokenData);// Exit the loop after buying
                                            } catch (buyError) {
                                                    console.error(`Failed to buy token ${tokenAddress}:`, buyError);
                                            }
                                        }
                                    }
                                 else {
                                    console.log('This transaction does not appear to be a transfer.');
                                }
                            }*/
                            }
                            else {
                                console.log(`Transaction ${signature} could not be fetched or was skipped.`);
                            }
                        }
                        catch (error) {
                            console.error("Error processing transaction:", error);
                        }
                    }
                }
            }
        }
        catch (error) {
            console.error("Error fetching signatures:", error);
        }
        firstRun = false;
        await new Promise(resolve => setTimeout(resolve, _config_1.POLLING_INTERVAL));
    }
}
// Call this function to stop watching transactions
function stopAccountWatcher() {
    stopWatching = true;
}
async function processDetails(tokenAddress, firstRun, signature, connection, recipientPublicKey, watchedAccountsUsage, watchedAccount) {
    {
        if (firstRun)
            knownTokens.add(tokenAddress);
        if (!knownTokens.has(tokenAddress)) {
            knownTokens.add(tokenAddress);
            if (!((watchedAccountsUsage[watchedAccount.toBase58()] === 0 || Date.now() - watchedAccountsUsage[watchedAccount.toBase58()] > COOL_DOWN_PERIOD))) {
                console.log(`Ignoring token as it is not in database and cool down of {watchedAccount.toBase58()} period is not over`);
                return false;
            }
            console.log(`Token ${tokenAddress} is NOT in database. Buying...`);
            try {
                // BUY THE TOKEN
                let amm = await (0, _transactionUtils_1.buyNewToken)(connection, tokenAddress, recipientPublicKey);
                //GET THE PRICE
                const solBalance = await connection.getBalance(new web3_js_1.PublicKey(tokenAddress));
                const buyPrice = solBalance / 1e9; // Convert lamports to SOL
                // Start watching the token
                const tokenData = {
                    mint: new web3_js_1.PublicKey(tokenAddress),
                    decimals: 9,
                    buyPrice: buyPrice,
                    amm: amm,
                    watchedAccountsUsage: watchedAccountsUsage,
                    watchedAccount: watchedAccount
                };
                watchedAccountsUsage[watchedAccount.toBase58()] = Date.now();
                await (0, _tokenWatcher_1.startMonitoring)(connection, recipientPublicKey, 0, tokenData);
                return true;
            }
            catch (buyError) {
                console.error(`Failed to buy token ${tokenAddress}:`, buyError);
            }
        }
        return false;
    }
}
//# sourceMappingURL=_accountWatcher.js.map