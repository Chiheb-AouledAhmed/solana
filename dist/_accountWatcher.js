"use strict";
// src/accountWatcher.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.watchTransactions = watchTransactions;
exports.stopAccountWatcher = stopAccountWatcher;
const web3_js_1 = require("@solana/web3.js");
const _config_1 = require("./_config");
const _utils_1 = require("./_utils");
const swapUtils_1 = require("./swapUtils");
const _transactionUtils_1 = require("./_transactionUtils");
const _tokenWatcher_1 = require("./_tokenWatcher"); // Import startTokenWatcher
const bs58_1 = __importDefault(require("bs58"));
let stopWatching = false;
let lastSignature = '';
let knownTokens = _config_1.KNOWN_TOKENS;
async function watchTransactions() {
    console.log('Monitoring Raydium transactions...');
    const connection = new web3_js_1.Connection(_config_1.SOLANA_RPC_URL, 'confirmed');
    //const watchedAccount = new PublicKey(ACCOUNT_TO_WATCH);
    const watchedAccounts = _config_1.ACCOUNTS_TO_WATCH.map(account => new web3_js_1.PublicKey(account));
    const privateKey = process.env.PRIVATE_KEY;
    let cacheSignature = new Set();
    let firstRun = true;
    let stopcurrWatch = false;
    while (!stopWatching) {
        try {
            if (stopcurrWatch) {
                stopcurrWatch = false;
                firstRun = true;
                break;
            }
            const signatures = [];
            for (const account of watchedAccounts) {
                const signaturesAccount = await connection.getSignaturesForAddress(account, {
                    limit: 10
                }, 'confirmed');
                signatures.push(...signaturesAccount);
            }
            for (const signatureInfo of signatures) {
                const signature = signatureInfo.signature;
                if (signature && !cacheSignature.has(signature)) {
                    cacheSignature.add(signature);
                    if (signature !== lastSignature) {
                        lastSignature = signature;
                        console.log(`New transaction detected: ${signature}`);
                        try {
                            const transaction = await (0, _utils_1.getParsedTransactionWithRetry)(connection, signature, {
                                commitment: 'confirmed',
                                maxSupportedTransactionVersion: 0
                            });
                            if (transaction) {
                                console.log("Transaction", transaction);
                                if ((0, swapUtils_1.isSwapTransaction)(transaction)) {
                                    const swapDetails = await (0, swapUtils_1.processSwapTransaction)(connection, transaction, signature);
                                    if (swapDetails) {
                                        let tokenAddress = "";
                                        if (!knownTokens.has(swapDetails.inToken)) {
                                            tokenAddress = swapDetails.inToken;
                                        }
                                        else
                                            tokenAddress = swapDetails.outToken;
                                        try {
                                            stopcurrWatch = await processDetails(tokenAddress, firstRun, signature, connection);
                                            /*await startMonitoring(connection,keyPair,0,
                                                {
                                                    mint: new PublicKey('GvjehsRY6DEhLyL7ALFADD6QV34pmerMyzfX27owinpY'),
                                                    decimals: 9,
                                                    buyPrice : 100000000000000000
                                                });*/
                                            // startMonitoring(tokenData);
                                            break;
                                        }
                                        catch (buyError) {
                                            console.error(`Failed to buy token ${tokenAddress}:`, buyError);
                                        }
                                        if (stopcurrWatch)
                                            break;
                                    }
                                    else {
                                        console.log("failed to fetch Swap details");
                                    }
                                }
                                else {
                                    const transferDetails = await (0, swapUtils_1.processTransferTransaction)(transaction);
                                    if (transferDetails) {
                                        console.log(`Transfer Details: ${JSON.stringify(transferDetails)}`);
                                        for (const transferDetail of transferDetails) {
                                            const tokenAddress = transferDetail.tokenAddress;
                                            try {
                                                stopWatching = await processDetails(tokenAddress, firstRun, signature, connection);
                                                //startMonitoring(tokenData);
                                                break; // Exit the loop after buying
                                            }
                                            catch (buyError) {
                                                console.error(`Failed to buy token ${tokenAddress}:`, buyError);
                                            }
                                        }
                                        if (stopWatching)
                                            break;
                                    }
                                    else {
                                        console.log('This transaction does not appear to be a transfer.');
                                    }
                                }
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
async function processDetails(tokenAddress, firstRun, signature, connection) {
    {
        if (firstRun)
            knownTokens.add(tokenAddress);
        if (!knownTokens.has(tokenAddress)) {
            const message = `
                New Token Transfer Detected!
                Signature: ${signature}
                Token: ${tokenAddress}
            `;
            await (0, _utils_1.sendTelegramNotification)(message);
            console.log(`Token ${tokenAddress} is NOT in database. Buying...`);
            try {
                // BUY THE TOKEN
                let amm = await (0, _transactionUtils_1.buyNewToken)(connection, tokenAddress);
                //GET THE PRICE
                const solBalance = await connection.getBalance(new web3_js_1.PublicKey(tokenAddress));
                const buyPrice = solBalance / 1e9; // Convert lamports to SOL
                // Start watching the token
                const tokenData = {
                    mint: new web3_js_1.PublicKey(tokenAddress),
                    decimals: 9,
                    buyPrice: buyPrice,
                    amm: amm
                };
                const privateKeyUint8Array = bs58_1.default.decode(_config_1.YOUR_PRIVATE_KEY);
                const keyPair = web3_js_1.Keypair.fromSecretKey(privateKeyUint8Array);
                await (0, _tokenWatcher_1.startMonitoring)(connection, keyPair, 0, tokenData);
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