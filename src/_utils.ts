// src/utils.ts
import { Connection, PublicKey } from '@solana/web3.js';
import { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, SOLANA_RPC_URL, MAX_RETRIES, INITIAL_RETRY_DELAY } from './_config';
import TelegramBot from 'node-telegram-bot-api';

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: false });

export async function getSOLBalance(connection: Connection, publicKey: PublicKey): Promise<number> {
    const balance = await connection.getBalance(publicKey);
    return balance / 1e9; // Convert lamports to SOL
}

export async function sendTelegramNotification(message: string): Promise<void> {
    try {
        await bot.sendMessage(TELEGRAM_CHAT_ID, message);
        console.log('Telegram notification sent successfully.');
    } catch (error) {
        console.error('Error sending Telegram notification:', error);
    }
}

export async function getParsedTransactionWithRetry(
    connection: Connection,
    signature: string,
    options: any,
    maxRetries: number = MAX_RETRIES,
): Promise<any> {
    let retries = 0;
    while (retries < maxRetries) {
        try {
            return await connection.getParsedTransaction(signature, options);
        } catch (error: any) {
            if (error.message && error.message.includes('429 Too Many Requests')) {
                retries++;
                const delay = Math.pow(2, retries) * INITIAL_RETRY_DELAY; // Exponential backoff
                console.log(`Rate limited. Retrying transaction ${signature} in ${delay / 1000} seconds... (Attempt ${retries}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, delay));
            } else if (error.message && error.message.includes('Transaction version (0) is not supported')) {
                console.warn(`Transaction version 0 not supported for ${signature}. Skipping.`);
                return null; // Skip this transaction, don't retry.
            } else {
                console.error(`Error fetching transaction ${signature}:`, error); // Log other errors
                throw error; // Re-throw other errors to potentially stop the process
            }
        }
    }
    console.error(`Failed to get transaction ${signature} after ${maxRetries} retries.`);
    return null; // Indicate failure after all retries
}
