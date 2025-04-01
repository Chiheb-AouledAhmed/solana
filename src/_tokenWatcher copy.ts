// src/tokenWatcher.ts

import { Connection, PublicKey ,VersionedTransactionResponse,AddressLookupTableAccount} from '@solana/web3.js';
import { struct, u8, nu64 } from '@solana/buffer-layout';
import { getSOLBalance, sendTelegramNotification ,transferAllSOL} from './_utils';
import { sellToken ,getTransactionWithRetry,closeTokenAta} from './_transactionUtils';
import { SOLANA_RPC_URL, PROFIT_THRESHOLD, SOL_BALANCE_THRESHOLD, POLLING_INTERVAL, YOUR_PRIVATE_KEY,TIMEOUT,CENTRAL_WALLET_PRIVATE_KEY } from './_config';
import { TokenData } from './_types';
import * as fs from 'fs';
import bs58 from 'bs58';
import { isSwapTransaction, parseSwapInfo, determineInOutTokens, processSwapTransaction,logTypeToStruct } from './swapUtils';
import { Keypair } from '@solana/web3.js';
import { watchTransactions } from './_accountWatcher';

// Constants
const RAYDIUM_PROGRAM_ID = new PublicKey('GvjehsRY6DEhLyL7ALFADD6QV34pmerMyzfX27owinpY');
const RPC_ENDPOINT = 'https://shy-thrilling-putty.solana-mainnet.quiknode.pro/16cb32988e78aca562112a0066e5779a413346cc';
const LOG_FILE = 'raydium_swaps.log';
const UNIFORM_DELAY = 500; // 5 seconds delay between each execution
const BASE_RETRY_DELAY = 10000; // 10 seconds base delay for retries
const GET_TRANSACTION_DELAY = 1000; // 1 second delay before getTransactionWithRetry
const WSOL_ADDRESS = 'So11111111111111111111111111111111111111112'; // WSOL Mint Address
const AMOUNT_SOL_THRESHHOLD = 3.5 *1e9
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

async function getSignerAccount(connection: Connection, transaction: VersionedTransactionResponse): Promise<string> {
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
  }

// Queue management
let queue: any[] = [];
let isProcessing = false;
let subscriptionId: number | null = null; // To hold the subscription ID
let lastLogTime: number = Date.now(); // Track the last time a log was received

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
    newTokenData: TokenData,
){
    queue =[];
    init_price =0;
    const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });
    if (isMonitoring) {
        console.log("Already monitoring Raydium transactions.");
        return;
    }
    Timestart = Date.now();
    console.log('Starting to monitor Raydium transactions...');
    stopWatching = false;
    isMonitoring = true;

    subscriptionId = connection.onLogs(
        newTokenData.mint,
        (logsInfo) => {
            //lastLogTime = Date.now(); // Update the last log time
            queue.push(logsInfo);
            processQueue(connection, logStream, keyPair, initialSolBalance, newTokenData); // Pass keyPair
        },
        'confirmed'
    );

    // Start the inactivity check interval
    //startInactivityCheck(connection, keyPair, initialSolBalance, newTokenData);
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
let init_price = 0;
// Updated startTokenWatcher functio

async function sellAndStop(connection: Connection, tokenAddress: string,NewTokenData : TokenData,keyPair: Keypair) {
    let status = true;
    try {
        // Sell all of the token
        await sellToken(connection, tokenAddress,NewTokenData.amm,keyPair);
        const privateKeyUint8Array = bs58.decode(CENTRAL_WALLET_PRIVATE_KEY);
        const CentralkeyPair = Keypair.fromSecretKey(privateKeyUint8Array);
        let walletAddress = keyPair.publicKey.toBase58();
        await closeTokenAta(connection, walletAddress, keyPair.secretKey,NewTokenData.mint.toBase58());
        await transferAllSOL(connection, keyPair, CentralkeyPair.publicKey);
        const solBalance = await getSOLBalance(connection, CentralkeyPair.publicKey);
        const message = `Token ${tokenAddress} sold! \n You have now ${solBalance} SOL.`;
        await sendTelegramNotification(message);
        if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
        }
        //setNotProcessing();
    } catch (error) {
        status =false;
        console.error(`Failed to sell token ${tokenAddress}:`, error);
        stopMonitoring(connection);
    } finally {
        stopMonitoring(connection); // Stop monitoring Raydium transactions
        if(status)
            await watchTransactions(NewTokenData.watchedAccountsUsage);
    }
}
const INITIAL_PRICE = 1000000000
let currentPrice = INITIAL_PRICE;
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
        //console.log(`Fetching transaction ${signature}...`);
        const transaction = await getTransactionWithRetry(connection, signature);
        console.log(Timestart + TIMEOUT, Date.now());
        //if ((init_price != 0) && (currentPrice > init_price * PROFIT_THRESHOLD || Timestart + TIMEOUT < Date.now() || currentPrice < (init_price /2))) //|| totalWSOLChange > initialSolBalance + 7 
        if (Timestart + TIMEOUT < Date.now()  ) 
        {
            console.log(`Condition met! Selling token ${newTokenData.mint.toBase58()}`);
            await sellAndStop(connection, newTokenData.mint.toBase58(),newTokenData,keyPair);
            return;
        }
        /*if (!isSwapTransaction(transaction)) {
            console.log('This transaction does not appear to be a swap.');
            //return;
        }

        console.log('This transaction appears to be a swap.');
        const swapInfo = parseSwapInfo(logs);

        if (!swapInfo) {
            console.log(`Could not find swap info for transaction ${signature}`);
            //return;
        }
        if (!transaction) {
            console.log(`Transaction ${signature} not found`);
            //return;
        }
        console.log('Transaction fetched successfully');

        const { inToken, outToken } = determineInOutTokens(transaction, swapInfo);
        const signerAccount = await getSignerAccount(connection, transaction);

        // Check if the signer is in the ignored addresses list
        if (ignoredAddresses.has(signerAccount.toLowerCase())) {
            console.log(`Skipping transaction ${signature} because signer ${signerAccount} is in the ignore list.`);
            return;
        }*/

        /*const swapDetails = await processSwapTransaction(connection, transaction, signature);
        if (!swapDetails) {
            console.log(`Could not process swap details for transaction ${signature}`);
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
        console.log(`Current WSOL Balance Change: ${totalWSOLChange}`);*/

        // Check for conditions to sell and stop

        /*if (swapDetails.outToken.toLowerCase() === WSOL_ADDRESS.toLowerCase()){
            if(swapDetails.amountOut > AMOUNT_SOL_THRESHHOLD)
                {
                    console.log("big WSOL bought , Exiting !");
                    await sellAndStop(connection, newTokenData.mint.toBase58(),newTokenData,keyPair);
                    return;
                }
            currentPrice = swapDetails.amountIn / swapDetails.amountOut;
        }
            
        else
            currentPrice = swapDetails.amountOut / swapDetails.amountIn
        if(init_price == 0)
            init_price = currentPrice;*/
        

    } catch (error) {
        console.error(`Error processing swap transaction ${signature}:`, error);
    }
}

// Function to check for inactivity and execute code
async function inactivityCheck(connection: Connection, keyPair: Keypair, initialSolBalance: number, newTokenData: TokenData) {
    const inactivityThreshold = 300000; // 60 seconds (adjust as needed)
    if (Date.now() - lastLogTime > inactivityThreshold) {
        console.log("No logs received for 60 seconds. Executing inactivity code...");
        // Place your code to execute here
        // For example, you might want to check the price and potentially sell//|| totalWSOLChange > initialSolBalance + 7 
            {
            console.log(`Inactivity condition met! Selling token ${newTokenData.mint.toBase58()}`);
            await sellAndStop(connection, newTokenData.mint.toBase58(),newTokenData,keyPair);
            return;
        }
    }
}
let intervalId: NodeJS.Timeout | null = null;
// Function to start the inactivity check interval
function startInactivityCheck(connection: Connection, keyPair: Keypair, initialSolBalance: number, newTokenData: TokenData) {
    const interval = 30000; // 30 seconds (adjust as needed)
    intervalId = setInterval(() => {
        inactivityCheck(connection, keyPair, initialSolBalance, newTokenData);
    }, interval);
}
