"use strict";
// src/accountWatcher.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.setNotProcessing = setNotProcessing;
exports.watchTokenTxs = watchTokenTxs;
exports.stopAccountWatcher = stopAccountWatcher;
const web3_js_1 = require("@solana/web3.js");
const _config_1 = require("./_config");
const _utils_1 = require("./_utils");
const swapUtils_1 = require("./swapUtils");
const _transactionUtils_1 = require("./_transactionUtils");
const _tokenWatcher_1 = require("./_tokenWatcher"); // Import startTokenWatcher
const _TokenAccountWatcher_1 = require("./_TokenAccountWatcher");
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
async function watchTokenTxs(tokenAccountAddress, signatureBefore) {
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
    let cacheSignature = new Set();
    const signatures = [];
    for (const account of watchedAccounts) {
        const publicKey = new web3_js_1.PublicKey(account);
        const signaturesAccount = await connection.getSignaturesForAddress(account, {
            before: signatureBefore,
            limit: 1000
        }, 'confirmed');
        for (const signature of signaturesAccount) {
            signatures.push({ signature: signature, account: publicKey });
        }
    }
    signatures.reverse();
    let cnt = 0;
    for (const signatureInfo of signatures) {
        cnt++;
        const signature = signatureInfo.signature.signature;
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
            if (transaction) {
                const result = await (0, swapUtils_1.decodePumpFunTrade)(signature, transaction);
                if ((0, swapUtils_1.isPumpFunCreation)(signature, transaction)) {
                    console.log("Signautre Found: ", signature);
                    let address = transaction.transaction.message.accountKeys[0].pubkey.toBase58();
                    console.log("Address : ", address);
                    return (0, _TokenAccountWatcher_1.watchTokenTransactions)(address, tokenAccountAddress);
                }
            }
            else {
                console.log('This transaction is not a pump fun transaction of the chosen token');
            }
        }
        catch (error) {
            console.error("Error processing transaction:", error);
        }
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
//# sourceMappingURL=TokenCreatorFinder.js.map