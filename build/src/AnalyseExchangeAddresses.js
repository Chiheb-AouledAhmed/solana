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
exports.AnalyseExchangeAddresses = AnalyseExchangeAddresses;
exports.stopAccountWatcher = stopAccountWatcher;
const web3_js_1 = require("@solana/web3.js");
const _config_1 = require("./_config");
const _utils_1 = require("./_utils");
const swapUtils_1 = require("./swapUtils");
const bs58_1 = __importDefault(require("bs58"));
const fs = __importStar(require("fs"));
let TRANSACTION_INTERVAL = 1000; // 10 seconds
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
async function parseCsvTwoColumns(filePath, column1, column2, delimiter = ",") {
    return new Promise((resolve, reject) => {
        fs.readFile(filePath, 'utf-8', (err, data) => {
            if (err) {
                return reject(err);
            }
            const lines = data.trim().split("\n"); // Split by newlines and trim extra spaces
            if (lines.length < 2) {
                return reject(new Error("CSV must have at least one header row and one data row."));
            }
            const headers = lines[0].split(delimiter).map(header => header.trim()); // Extract headers
            const rows = lines.slice(1); // Extract rows (excluding the header)
            // Find indices of the specified columns
            const column1Index = headers.indexOf(column1);
            const column2Index = headers.indexOf(column2);
            if (column1Index === -1 || column2Index === -1) {
                return reject(new Error(`Columns "${column1}" or "${column2}" not found in CSV headers.`));
            }
            const result = rows.map(row => {
                const values = row.split(delimiter).map(value => value.trim()); // Split row by delimiter
                return {
                    [column1]: values[column1Index] || "",
                    [column2]: values[column2Index] || "",
                };
            });
            resolve(result);
        });
    });
}
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
function loadIgnoredAddresses(filePath) {
    try {
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        const addresses = fileContent.split('\n').map(line => line).filter(line => line !== '');
        addresses.forEach(addr => ignoredAddresses.add(addr));
        console.log(`Loaded ${ignoredAddresses.size} addresses to ignore.`);
    }
    catch (error) {
        console.warn(`Could not read addresses from ${filePath}. All addresses will be processed. Error:`, error);
    }
}
async function AnalyseExchangeAddresses(filename) {
    console.log('Monitoring Raydium transactions...');
    const connection = new web3_js_1.Connection(_config_1.SOLANA_RPC_URL, 'confirmed');
    const extractedData = await parseCsvTwoColumns(filename, 'Signature', 'To');
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
    const privateKey = process.env.PRIVATE_KEY;
    let allsum = 0;
    let cacheSignature = new Set();
    // Data structure to hold address specific information
    const addressData = {};
    let res = [];
    try {
        for (const accountData of extractedData) {
            let signature = accountData['Signature'];
            let account = new web3_js_1.PublicKey(accountData['To']);
            const signaturesAccount = await connection.getSignaturesForAddress(account, {
                limit: 300
            }, 'confirmed');
            signaturesAccount.reverse();
            if ((signaturesAccount.length < 300) && (signaturesAccount[0].signature == signature)) {
                for (let i = 0; i < Math.min(signaturesAccount.length, 10); i++) {
                    const transaction = await (0, _utils_1.getParsedTransactionWithRetry)(connection, signaturesAccount[i].signature, {
                        commitment: 'confirmed',
                        maxSupportedTransactionVersion: 0
                    });
                    if ((0, swapUtils_1.isPumpFunCreation)(signature, transaction))
                        res.push({ signature: signature, account: account });
                }
            }
        }
    }
    catch (error) {
        console.error("Error fetching signatures:", error);
    }
    console.log("res", res);
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
//# sourceMappingURL=AnalyseExchangeAddresses.js.map