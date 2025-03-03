// src/tokenWatcher.ts

import { Connection, PublicKey ,VersionedTransactionResponse,AddressLookupTableAccount,ParsedTransactionWithMeta} from '@solana/web3.js';
import { struct, u8, nu64 } from '@solana/buffer-layout';
import { getSOLBalance, sendTelegramNotification } from './_utils';
import { sellToken ,getTransactionWithRetry} from './_transactionUtils';
import { SOLANA_RPC_URL, PROFIT_THRESHOLD, SOL_BALANCE_THRESHOLD, POLLING_INTERVAL, YOUR_PRIVATE_KEY,TIMEOUT } from './_config';
import { TokenData } from './_types';
import * as fs from 'fs';
import bs58 from 'bs58';
import { isSwapTransaction, parseSwapInfo, determineInOutTokens, processSwapTransaction,logTypeToStruct } from './swapUtils';
import { Keypair } from '@solana/web3.js';

// Constants
const RAYDIUM_PROGRAM_ID = new PublicKey('GvjehsRY6DEhLyL7ALFADD6QV34pmerMyzfX27owinpY');
const RPC_ENDPOINT = 'https://shy-thrilling-putty.solana-mainnet.quiknode.pro/16cb32988e78aca562112a0066e5779a413346cc';
const LOG_FILE = 'raydium_swaps.log';
const UNIFORM_DELAY = 0; // 5 seconds delay between each execution
const BASE_RETRY_DELAY = 10000; // 10 seconds base delay for retries
const GET_TRANSACTION_DELAY = 0; // 1 second delay before getTransactionWithRetry
const WSOL_ADDRESS = 'So11111111111111111111111111111111111111112'; // WSOL Mint Address

// Global variable to track total WSOL change
let totalWSOLChange = 0;

// Set to store ignored addresses
const ignoredAddresses = new Set<string>();

// Load ignored addresses from file
function loadIgnoredAddresses(filePath: string = 'addresses.txt') {
    try {
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        const addresses = fileContent.split('\n').map(line => line.trim().toLowerCase()).filter(line => line !== '');
        addresses.forEach(addr => ignoredAddresses.add(addr));
        console.log(`Loaded ${ignoredAddresses.size} addresses to ignore.`);
    } catch (error) {
        console.warn(`Could not read addresses from ${filePath}. All addresses will be processed. Error:`, error);
    }
}

// Helper functions

/*async function getSignerAccount(connection: Connection, transaction: ParsedTransactionWithMeta): Promise<string> {
    let allAccs: PublicKey[];
  
    if (transaction.transaction.message.addressTableLookups && transaction.transaction.message.addressTableLookups.length > 0) {
      // Resolve Address Lookup Tables
      const LUTs = (await Promise.all(transaction.transaction.message.addressTableLookups
        .map((lookup) => connection.getAddressLookupTable(lookup.accountKey))))
        .map((result) => result.value).filter((val): val is AddressLookupTableAccount => val !== null);
  
      // Get all account keys including those from LUTs
      allAccs = transaction.transaction.message.getAccountKeys({ addressLookupTableAccounts: LUTs })
        .keySegments().reduce((acc, cur) => acc.concat(cur), []);
    } else {
      // If no LUTs, just get the account keys directly
      allAccs = transaction.transaction.message.getAccountKeys().keySegments().flat();
    }
  
    // If there are loaded addresses in meta, add them
    if (transaction.meta && transaction.meta.loadedAddresses) {
      const { writable, readonly } = transaction.meta.loadedAddresses;
      allAccs = allAccs.concat(writable || []).concat(readonly || []);
    }
  
    const signerIndex = transaction.transaction.message.header.numRequiredSignatures - 1;
    return allAccs[signerIndex]?.toBase58() ?? 'Unknown';
  }*/

/*async function getSignerAccount2(connection:Connection,transaction: ParsedTransactionWithMeta): Promise<string> {
    let allAccs: PublicKey[];

    if (transaction.transaction.message.addressTableLookups && transaction.transaction.message.addressTableLookups.length > 0) {
        // Resolve Address Lookup Tables
        const LUTs = (await Promise.all(transaction.transaction.message.addressTableLookups
            .map((lookup) => connection.getAddressLookupTable(lookup.accountKey))))
            .map((result) => result.value).filter((val): val is AddressLookupTableAccount => val !== null);

        // Get all account keys including those from LUTs
        allAccs = transaction.transaction.message.accountKeys.map(account => account.pubkey);
        
        LUTs.forEach((lut) => {
            if (lut) {
                allAccs.push(...lut.addresses);
            }
        });
    } else {
        // If no LUTs, just get the account keys directly
        allAccs = transaction.transaction.message.accountKeys.map(account => account.pubkey);
    }

    // If there are loaded addresses in meta, add them
    if (transaction.meta && transaction.meta.loadedAddresses) {
        const { writable, readonly } = transaction.meta.loadedAddresses;
        allAccs = allAccs.concat(writable || []).concat(readonly || []);
    }

    const signerIndex = transaction.transaction.message.accountKeys.length - 1;
    return allAccs[signerIndex]?.toBase58() ?? 'Unknown';
}*/

async function getSignerAccount2(connection: Connection, transaction: ParsedTransactionWithMeta): Promise<string> {
    let allAccs: PublicKey[];

    // ParsedTransactionWithMeta doesn't have addressTableLookups directly
    // We assume no LUTs for simplicity; handling LUTs would require additional logic
    allAccs = transaction.transaction.message.accountKeys.map((key) => key.pubkey);

    // If there are loaded addresses in meta, add them
    if (transaction.meta && transaction.meta.loadedAddresses) {
        const { writable, readonly } = transaction.meta.loadedAddresses;
        allAccs = allAccs.concat(writable || []).concat(readonly || []);
    }

    // Determine the signer index based on the transaction's instructions
    // For simplicity, assume the first signer is the one we're interested in
    // Adjust this logic based on your specific requirements
    const signerIndex = 0; // Adjust based on transaction structure

    return allAccs[signerIndex]?.toBase58() ?? 'Unknown';
}

// Queue management
const queue: any[] = [];
let isProcessing = false;
let subscriptionId: number | null = null; // To hold the subscription ID

async function processQueue(
    connection: Connection,
    logStream: fs.WriteStream,
    keyPair: Keypair,
    initialSolBalance: number,
    newTokenData: TokenData
){
    if (isProcessing || queue.length === 0 || stopWatching) return;

    isProcessing = true;
    const logsInfo = queue.shift();

    try {
        // Add delay before calling getTransactionWithRetry
        await new Promise(resolve => setTimeout(resolve, GET_TRANSACTION_DELAY));
        await processLogEvent(connection, logsInfo, logStream, keyPair, initialSolBalance, newTokenData);
        if(stopWatching) // Pass keyPair
            return;
    } catch (error) {
        console.error('Error processing log event:', error);
    } finally {
        isProcessing = false;
        // Add uniform delay after each execution
        await new Promise(resolve => setTimeout(resolve, UNIFORM_DELAY));
        processQueue(connection, logStream, keyPair, initialSolBalance, newTokenData); // Pass keyPair
    }
}

// To manage subscription status
let isMonitoring = false;
let Timestart =0;
// Function to start monitoring Raydium transactions
export async function startMonitoring(
    connection: Connection,
    keyPair: Keypair,
    initialSolBalance: number,
    newTokenData: TokenData
){

    const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });
    if (isMonitoring) {
        console.log("Already monitoring Raydium transactions.");
        return;
    }
    Timestart = Date.now();
    console.log('Starting to monitor Raydium transactions...');
    isMonitoring = true;

    subscriptionId = connection.onLogs(
        newTokenData.mint,
        (logsInfo) => {
            queue.push(logsInfo);
            processQueue(connection, logStream, keyPair, initialSolBalance, newTokenData); // Pass keyPair
        },
        'processed'
    );
}

// Function to stop monitoring Raydium transactions
function stopMonitoring(connection: Connection) {
    if (!isMonitoring || subscriptionId === null) {
        console.log("Not currently monitoring Raydium transactions.");
        return;
    }

    console.log('Stopping monitoring Raydium transactions...');
    isMonitoring = false;

    connection.removeOnLogsListener(subscriptionId)
        .then(() => {
            console.log("Successfully removed the onLogs listener.");
            subscriptionId = null;
        })
        .catch(error => {
            console.error("Error removing the onLogs listener:", error);
        });
}

let tokenData: TokenData | undefined;
let stopWatching = false;

// Updated startTokenWatcher function
export async function startTokenWatcher(connection: Connection, keyPair: Keypair, newTokenData: TokenData): Promise<void> {
    if (tokenData) {
        stopTokenWatcher(); // Stop any existing watcher
    }

    tokenData = newTokenData;
    stopWatching = false;

    // Get initial SOL balance
    const solBalance = await getSOLBalance(connection, keyPair.publicKey);
    const initialSolBalance = solBalance;

    console.log(`Starting token watcher for ${tokenData.mint.toBase58()}...`);

    // Load ignored addresses
    loadIgnoredAddresses();

    // Create a log stream
    const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });

    // Start monitoring Raydium transactions
    await startMonitoring(connection, keyPair, initialSolBalance, newTokenData); // Pass keyPair

    // Main loop for price checking (you can adjust the interval)
    while (!stopWatching) {
        try {
            if (!tokenData) {
                console.warn("Token data is no longer available. Stopping token watcher.");
                stopMonitoring(connection);
                stopTokenWatcher();
                break;
            }

            // Monitor Raydium transactions to calculate remaining SOL (if needed)
            const remainingSol = await getSOLBalance(connection, keyPair.publicKey);

            // Get current price

            // Check profit threshold
            /*if (currentPrice > tokenData.buyPrice * PROFIT_THRESHOLD || remainingSol > initialSolBalance + 7) {
                console.log(`Condition met! Selling token ${tokenData.mint.toBase58()}`);
                await sellAndStop(connection, keyPair, tokenData.mint.toBase58());
                break;
            }*/

            console.log(`Token ${tokenData.mint.toBase58()} - Current Balance: ${remainingSol}, Buy Price: ${tokenData.buyPrice}`);
        } catch (error) {
            console.error("Error in token watcher:", error);
        }

        await new Promise(resolve => setTimeout(resolve, POLLING_INTERVAL));
    }
}


async function sellAndStop(connection: Connection, tokenAddress: string,amm : string) {
    try {
        // Sell all of the token
        await sellToken(connection, tokenAddress,amm);
        const message = `Token ${tokenAddress} sold!`;
        await sendTelegramNotification(message);
    } catch (error) {
        console.error(`Failed to sell token ${tokenAddress}:`, error);
    } finally {
        stopMonitoring(connection); // Stop monitoring Raydium transactions
        stopTokenWatcher();
    }
}

export function stopTokenWatcher(): void {
    stopWatching = true;
    tokenData = undefined;
    console.log('Token watching stopped.');
}

let currentPrice = 0;
async function processLogEvent(
    connection: Connection,
    logsInfo: any,
    logStream: fs.WriteStream,
    keyPair: Keypair,
    initialSolBalance: number,
    newTokenData: TokenData
){
    const { signature, err, logs } = logsInfo;

    //console.log(`\nProcessing transaction: ${signature}`);

    if (err) {
        console.log(`Transaction failed with error: ${JSON.stringify(err)}`);
        return;
    }
    try {
        
        
        /*console.log(Timestart + TIMEOUT, Date.now());
        if (currentPrice > newTokenData.buyPrice * PROFIT_THRESHOLD || Timestart + TIMEOUT < Date.now()) //|| totalWSOLChange > initialSolBalance + 7 
            {
            console.log(`Condition met! Selling token ${newTokenData.mint.toBase58()}`);
            await sellAndStop(connection, newTokenData.mint.toBase58(),newTokenData.amm);
            return;
        }*/
       console.log(`Fetching transaction ${signature}...`);
       const transaction = await getTransactionWithRetry(connection, signature);

        /*console.log('This transaction appears to be a swap.');
        const swapInfo = parseSwapInfo(logs);

        if (!swapInfo) {
            console.log(`Could not find swap info for transaction ${signature}`);
            //return;
        }
        if (!transaction) {
            console.log(`Transaction ${signature} not found`);
            //return;
        }*/
        console.log('Transaction fetched successfully');

        /*const signerAccount = await getSignerAccount2(connection, transaction);

        // Check if the signer is in the ignored addresses list
        if (ignoredAddresses.has(signerAccount.toLowerCase())) {
            console.log(`Skipping transaction ${signature} because signer ${signerAccount} is in the ignore list.`);
            return;
        }*/

        const swapDetails = await processSwapTransaction(connection, transaction, signature);
        if (!swapDetails) {
            console.log(`Could not process swap details for transaction ${signature}`);
            return;
        }

        if (swapDetails.outToken.toLowerCase() === WSOL_ADDRESS.toLowerCase() && swapDetails.amountIn > 400*1e9) {
            console.log(`Condition met! Selling token ${newTokenData.mint.toBase58()} Date: ${new Date().toLocaleString()}`);
            //await sellAndStop(connection, newTokenData.mint.toBase58(),newTokenData.amm);
            stopTokenWatcher();
            return;
        }
        // Update WSOL balance
        /*if (swapDetails.inToken.toLowerCase() === WSOL_ADDRESS.toLowerCase()) {
            totalWSOLChange -= swapDetails.amountIn;
            console.log("totalWSOLChange - = ", swapDetails.amountIn);
        } else if (swapDetails.outToken.toLowerCase() === WSOL_ADDRESS.toLowerCase()) {
            totalWSOLChange += swapDetails.amountOut;
            console.log("totalWSOLChange + = ", swapDetails.amountOut);
        } else {
            console.log("No WSOL change in this transaction");
        }
        console.log(`Current WSOL Balance Change: ${totalWSOLChange}`);

        // Check for conditions to sell and stop

        if (swapDetails.outToken.toLowerCase() === WSOL_ADDRESS.toLowerCase())
            currentPrice = swapDetails.amountIn / swapDetails.amountOut;
        else
            currentPrice = swapDetails.amountOut / swapDetails.amountIn*/

        

    } catch (error) {
        console.error(`Error processing swap transaction ${signature}:`, error);
    }
}
