"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSOLBalance = getSOLBalance;
exports.sendTelegramNotification = sendTelegramNotification;
exports.getParsedTransactionWithRetry = getParsedTransactionWithRetry;
exports.transferSOL = transferSOL;
exports.transferAllSOL = transferAllSOL;
exports.transferSOLToRandomAccount = transferSOLToRandomAccount;
exports.transferAllSOLToRandomAccount = transferAllSOLToRandomAccount;
// src/utils.ts
const web3_js_1 = require("@solana/web3.js");
const _config_1 = require("./_config");
const node_telegram_bot_api_1 = __importDefault(require("node-telegram-bot-api"));
const bot = new node_telegram_bot_api_1.default(_config_1.TELEGRAM_BOT_TOKEN, { polling: false });
async function getSOLBalance(connection, publicKey) {
    const balance = await connection.getBalance(publicKey);
    return balance / 1e9; // Convert lamports to SOL
}
async function sendTelegramNotification(message) {
    try {
        await bot.sendMessage(_config_1.TELEGRAM_CHAT_ID, message);
        console.log('Telegram notification sent successfully.');
    }
    catch (error) {
        console.error('Error sending Telegram notification:', error);
    }
}
async function getParsedTransactionWithRetry(connection, signature, options, maxRetries = _config_1.MAX_RETRIES) {
    let retries = 0;
    while (retries < maxRetries) {
        try {
            return await connection.getParsedTransaction(signature, options);
        }
        catch (error) {
            if (error.message && error.message.includes('429 Too Many Requests')) {
                retries++;
                const delay = Math.pow(2, retries) * _config_1.INITIAL_RETRY_DELAY; // Exponential backoff
                console.log(`Rate limited. Retrying transaction ${signature} in ${delay / 1000} seconds... (Attempt ${retries}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
            else if (error.message && error.message.includes('Transaction version (0) is not supported')) {
                console.warn(`Transaction version 0 not supported for ${signature}. Skipping.`);
                return null; // Skip this transaction, don't retry.
            }
            else {
                console.error(`Error fetching transaction ${signature}:`, error); // Log other errors
                throw error; // Re-throw other errors to potentially stop the process
            }
        }
    }
    console.error(`Failed to get transaction ${signature} after ${maxRetries} retries.`);
    return null; // Indicate failure after all retries
}
async function transferSOL(connection, fromAccount, toAccount) {
    const balance = await connection.getBalance(fromAccount.publicKey);
    const transaction = new web3_js_1.Transaction().add(web3_js_1.SystemProgram.transfer({
        fromPubkey: fromAccount.publicKey,
        toPubkey: toAccount,
        lamports: balance - 5000, // Leave some lamports for fees (adjust as needed)
    }));
    try {
        const signature = await (0, web3_js_1.sendAndConfirmTransaction)(connection, transaction, [fromAccount]);
        console.log('SOL transfer transaction signature:', signature);
    }
    catch (error) {
        console.error('Error transferring SOL:', error);
        throw error;
    }
}
async function transferAllSOL(connection, fromAccount, toAccount) {
    const balance = await connection.getBalance(fromAccount.publicKey);
    const transaction = new web3_js_1.Transaction().add(web3_js_1.SystemProgram.transfer({
        fromPubkey: fromAccount.publicKey,
        toPubkey: toAccount,
        lamports: balance - 5000, // Leave some lamports for fees (adjust as needed)
    }));
    try {
        const signature = await (0, web3_js_1.sendAndConfirmTransaction)(connection, transaction, [fromAccount]);
        console.log('SOL transfer transaction signature:', signature);
    }
    catch (error) {
        console.error('Error transferring SOL:', error);
        throw error;
    }
}
async function transferSOLToRandomAccount(connection, centralWalletKeypair, accounts, amount) {
    const availableAccounts = accounts.filter(account => {
        return account.publicKey !== centralWalletKeypair.publicKey.toBase58();
    });
    if (availableAccounts.length === 0) {
        console.error('No accounts available for transfer.');
        return null;
    }
    const randomAccount = availableAccounts[Math.floor(Math.random() * availableAccounts.length)];
    const recipientPublicKey = new web3_js_1.PublicKey(randomAccount.publicKey);
    const transaction = new web3_js_1.Transaction().add(web3_js_1.SystemProgram.transfer({
        fromPubkey: centralWalletKeypair.publicKey,
        toPubkey: recipientPublicKey,
        lamports: amount
    }));
    try {
        const signature = await (0, web3_js_1.sendAndConfirmTransaction)(connection, transaction, [centralWalletKeypair]);
        console.log(`SOL transfer transaction signature: ${signature}`);
        // Load the private key and create a Keypair
        const privateKeyUint8Array = Buffer.from(randomAccount.privateKey, 'base64');
        const recipientKeypair = web3_js_1.Keypair.fromSecretKey(new Uint8Array(privateKeyUint8Array));
        return recipientKeypair;
    }
    catch (error) {
        console.error('Error transferring SOL:', error);
        return null;
    }
}
async function transferAllSOLToRandomAccount(connection, centralWalletKeypair, accounts) {
    const availableAccounts = accounts.filter(account => {
        return account.publicKey !== centralWalletKeypair.publicKey.toBase58();
    });
    if (availableAccounts.length === 0) {
        console.error('No accounts available for transfer.');
        return null;
    }
    const randomAccount = availableAccounts[Math.floor(Math.random() * availableAccounts.length)];
    const recipientPublicKey = new web3_js_1.PublicKey(randomAccount.publicKey);
    const balance = await connection.getBalance(centralWalletKeypair.publicKey);
    const transaction = new web3_js_1.Transaction().add(web3_js_1.SystemProgram.transfer({
        fromPubkey: centralWalletKeypair.publicKey,
        toPubkey: recipientPublicKey,
        lamports: balance - 5000, // Leave some lamports for fees (adjust as needed)
    }));
    try {
        const signature = await (0, web3_js_1.sendAndConfirmTransaction)(connection, transaction, [centralWalletKeypair]);
        console.log(`SOL transfer transaction signature: ${signature}`);
        // Load the private key and create a Keypair
        const privateKeyUint8Array = Buffer.from(randomAccount.privateKey, 'base64');
        const recipientKeypair = web3_js_1.Keypair.fromSecretKey(new Uint8Array(privateKeyUint8Array));
        return recipientKeypair;
    }
    catch (error) {
        console.error('Error transferring SOL:', error);
        return null;
    }
}
//# sourceMappingURL=_utils.js.map