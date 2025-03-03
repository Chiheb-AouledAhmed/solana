"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSOLBalance = getSOLBalance;
exports.sendTelegramNotification = sendTelegramNotification;
exports.getParsedTransactionWithRetry = getParsedTransactionWithRetry;
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
//# sourceMappingURL=_utils.js.map