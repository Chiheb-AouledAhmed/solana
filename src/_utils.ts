// src/utils.ts
import { Connection, 
    PublicKey ,
    Keypair,
    Transaction,
    SystemProgram,
    sendAndConfirmTransaction } from '@solana/web3.js';
import { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, SOLANA_RPC_URL, MAX_RETRIES, INITIAL_RETRY_DELAY } from './_config';
import TelegramBot from 'node-telegram-bot-api';
// src/accountWatcher.ts
import { AccountData } from './_types';

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
            if (error.message ) {
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


export async function transferSOL(connection: Connection, fromAccount: Keypair, toAccount: PublicKey): Promise<void> {
    const balance = await connection.getBalance(fromAccount.publicKey);
    const transaction = new Transaction().add(
        SystemProgram.transfer({
            fromPubkey: fromAccount.publicKey,
            toPubkey: toAccount,
            lamports: balance - 5000, // Leave some lamports for fees (adjust as needed)
        })
    );

    try {
        const signature = await sendAndConfirmTransaction(connection, transaction, [fromAccount]);
        console.log('SOL transfer transaction signature:', signature);
    } catch (error) {
        console.error('Error transferring SOL:', error);
        throw error;
    }
}

export async function transferAllSOL(connection: Connection, fromAccount: Keypair, toAccount: PublicKey): Promise<void> {
    const balance = await connection.getBalance(fromAccount.publicKey);
    const transaction = new Transaction().add(
        SystemProgram.transfer({
            fromPubkey: fromAccount.publicKey,
            toPubkey: toAccount,
            lamports: balance -5000 , // Leave some lamports for fees (adjust as needed)
        })
    );

    try {
        const signature = await sendAndConfirmTransaction(connection, transaction, [fromAccount]);
        console.log('SOL transfer transaction signature:', signature);
    } catch (error) {
        console.error('Error transferring SOL:', error);
        throw error;
    }
}
export async function transferSOLToRandomAccount(connection: Connection, centralWalletKeypair: Keypair, accounts: AccountData[], amount: number): Promise<Keypair | null> {
    const availableAccounts = accounts.filter(account => {
        return account.publicKey !== centralWalletKeypair.publicKey.toBase58();
    });

    if (availableAccounts.length === 0) {
        console.error('No accounts available for transfer.');
        return null;
    }

    const randomAccount = availableAccounts[Math.floor(Math.random() * availableAccounts.length)];
    const recipientPublicKey = new PublicKey(randomAccount.publicKey);

    const transaction = new Transaction().add(
        SystemProgram.transfer({
            fromPubkey: centralWalletKeypair.publicKey,
            toPubkey: recipientPublicKey,
            lamports: amount
        })
    );

    try {
        const signature = await sendAndConfirmTransaction(connection, transaction, [centralWalletKeypair]);
        console.log(`SOL transfer transaction signature: ${signature}`);

        // Load the private key and create a Keypair
        const privateKeyUint8Array = Buffer.from(randomAccount.privateKey, 'base64');
        const recipientKeypair = Keypair.fromSecretKey(new Uint8Array(privateKeyUint8Array));

        return recipientKeypair;
    } catch (error) {
        console.error('Error transferring SOL:', error);
        return null;
    }
}


export async function transferAllSOLToRandomAccount(connection: Connection, centralWalletKeypair: Keypair, accounts: AccountData[]): Promise<Keypair | null> {
    const availableAccounts = accounts.filter(account => {
        return account.publicKey !== centralWalletKeypair.publicKey.toBase58();
    });

    if (availableAccounts.length === 0) {
        console.error('No accounts available for transfer.');
        return null;
    }

    const randomAccount = availableAccounts[Math.floor(Math.random() * availableAccounts.length)];
    const recipientPublicKey = new PublicKey(randomAccount.publicKey);

    const balance = await connection.getBalance(centralWalletKeypair.publicKey);
    const transaction = new Transaction().add(
        SystemProgram.transfer({
            fromPubkey: centralWalletKeypair.publicKey,
            toPubkey: recipientPublicKey,
            lamports: balance - 5000, // Leave some lamports for fees (adjust as needed)
        })
    );

    try {
        const signature = await sendAndConfirmTransaction(connection, transaction, [centralWalletKeypair]);
        console.log(`SOL transfer transaction signature: ${signature}`);

        // Load the private key and create a Keypair
        const privateKeyUint8Array = Buffer.from(randomAccount.privateKey, 'base64');
        const recipientKeypair = Keypair.fromSecretKey(new Uint8Array(privateKeyUint8Array));

        return recipientKeypair;
    } catch (error) {
        console.error('Error transferring SOL:', error);
        return null;
    }
}

