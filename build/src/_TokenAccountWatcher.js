"use strict";
// src/accountWatcher.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.setNotProcessing = setNotProcessing;
exports.watchTokenTransactions = watchTokenTransactions;
exports.stopAccountWatcher = stopAccountWatcher;
const web3_js_1 = require("@solana/web3.js");
const _config_1 = require("./_config");
const _utils_1 = require("./_utils");
const swapUtils_1 = require("./swapUtils");
const _transactionUtils_1 = require("./_transactionUtils");
const _tokenWatcher_1 = require("./_tokenWatcher"); // Import startTokenWatcher
const pumpFunAccountWatcher_1 = require("./pumpFunAccountWatcher");
let stopWatching = false;
let lastSignature = '';
let knownTokens = _config_1.KNOWN_TOKENS;
let Processing = false;
let stopcurrWatch = false;
const COOL_DOWN_PERIOD = 3 * 30 * 60 * 1000;
let firstRun = true;
let TRANSACTION_INTERVAL = 2000;
function setNotProcessing() {
    Processing = false;
    firstRun = true;
    console.log("watching another token ->>>");
}
async function watchTokenTransactions(accountaddress, tokenAccountAddress) {
    console.log('Monitoring Raydium transactions...');
    const connection = new web3_js_1.Connection(_config_1.SOLANA_RPC_URL, 'confirmed');
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
    const COOLDOWN_PERIOD = 15 * 60 * 1000;
    let lastCheckTime = 100000000000000;
    /*const centralWalletPrivateKeyUint8Array = bs58.decode(CENTRAL_WALLET_PRIVATE_KEY);
    const centralWalletKeypair = Keypair.fromSecretKey(centralWalletPrivateKeyUint8Array);

    // Transfer SOL to a random account before starting the loop
    const recipientPublicKey = await transferAllSOLToRandomAccount(connection, centralWalletKeypair, accounts); // Transfer 1 SOL
    if (!recipientPublicKey) {
        console.error('Failed to transfer SOL to a random account.');
        return;
    }*/
    //const watchedAccount = new PublicKey(ACCOUNT_TO_WATCH);
    let watchedAccounts = [new web3_js_1.PublicKey(accountaddress)];
    let cacheSignature = new Set();
    while (!stopWatching) {
        try {
            console.log("New Loop");
            /*if(Processing){
                console.log("Processing another token");
                await new Promise(resolve => setTimeout(resolve, POLLING_INTERVAL));
                continue;
            }*/
            const currentTime = Date.now();
            if ((currentTime - lastCheckTime) > COOLDOWN_PERIOD) {
                console.log(`Cooldown period over. Checking for new transactions...`);
                return (0, pumpFunAccountWatcher_1.watchPumpFunTransactions)();
            }
            const signatures = [];
            for (const account of watchedAccounts) {
                const publicKey = new web3_js_1.PublicKey(account);
                const signaturesAccount = await connection.getSignaturesForAddress(account, {
                    limit: 300
                }, 'confirmed');
                for (const signature of signaturesAccount) {
                    signatures.push({ signature: signature, account: publicKey });
                }
            }
            signatures.reverse();
            for (const signatureInfo of signatures) {
                const signature = signatureInfo.signature.signature;
                if (signature && !cacheSignature.has(signature)) {
                    cacheSignature.add(signature);
                    console.log("adding signature to cache", signature);
                    lastCheckTime = Date.now();
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
                            console.log("Transaction", signature);
                            const result = await (0, swapUtils_1.decodePumpFunTrade)(signature, transaction);
                            if (result.length == 1 && result[0].tokenAddress == tokenAccountAddress) {
                                for (const res of result) {
                                    let amount = res.tokenAmount;
                                    if (res.direction == 'buy') {
                                        allsum += amount;
                                        console.log("bought token");
                                        console.log(`Total bought amount: ${allsum}`);
                                    }
                                    else if (res.direction == 'sell') {
                                        allsum -= amount;
                                        console.log("sold token");
                                        console.log(`Total bought amount: ${allsum}`);
                                    }
                                    if (allsum < 1e5) {
                                        console.log(`All tokens sold. Exiting...`);
                                        console.log(`New pump fun token detected: ${signature}`);
                                        const message = `
                                    Buying new token
                                    Token: ${tokenAccountAddress}
                                    Signature: ${signature}
                                    `;
                                        await (0, _utils_1.sendTelegramNotification)(message);
                                        return (0, pumpFunAccountWatcher_1.watchPumpFunTransactions)();
                                    }
                                }
                            }
                            else {
                                console.log('This transaction is not a pump fun transaction of the chosen token');
                            }
                        }
                        else {
                            console.log("Transaction not correctly loaded");
                        }
                    }
                    catch (error) {
                        console.error("Error processing transaction:", error);
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
//# sourceMappingURL=_TokenAccountWatcher.js.map