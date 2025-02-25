import { Connection, PublicKey, VersionedTransactionResponse, AddressLookupTableAccount } from '@solana/web3.js';
import { struct, u8, nu64 } from '@solana/buffer-layout';
import * as fs from 'fs';
import { TOKEN_PROGRAM_ID, getMint } from '@solana/spl-token';
import * as csv from 'csv-writer';
import { createObjectCsvWriter } from 'csv-writer';
import { parse } from 'csv-parse';


// Constants
const RPC_ENDPOINT = 'https://shy-thrilling-putty.solana-mainnet.quiknode.pro/16cb32988e78aca562112a0066e5779a413346cc';
const WSOL_ADDRESS = 'So11111111111111111111111111111111111111112'; // WSOL Mint Address
const TOKEN_MINT_ADDRESS = '9kkWuiwg8iZxwJP1R6fCkwdVeXaiKdPXMmV9kP7GuHHP'; // Replace with your token mint address

// Global variable to track total WSOL change
let totalWSOLChange = 0;

// Set to store ignored addresses
const ignoredAddresses = new Set<string>();

// Function to load ignored addresses from file
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

// Helper function to get transaction with retry
async function getTransactionWithRetry(connection: Connection, signature: string, maxRetries = 3): Promise<VersionedTransactionResponse | null> {
    const initialDelay = 2000; // 2 seconds initial delay
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const transaction = await connection.getTransaction(signature, {
                maxSupportedTransactionVersion: 0,
                commitment: 'confirmed'
            });
            if (transaction) {
                return transaction;
            }
        } catch (error: any) {
            console.error(`Attempt ${attempt + 1} failed:`, error);
        }
        const delay = initialDelay * Math.pow(2, attempt);
        console.log(`Waiting ${delay}ms before next attempt...`);
        await new Promise(resolve => setTimeout(resolve, delay));
    }
    throw new Error(`Failed to fetch transaction after ${maxRetries} attempts`);
}

function isSwapTransaction(logs: string[]): boolean {
    try {
        const swapInfo = parseSwapInfo(logs);
        return swapInfo !== null;
    } catch (error) {
        console.error('Error parsing swap info:', error);
        return false;
    }
}

// Function to process transaction
async function processTransaction(connection: Connection, signature: string, writer: any) {
    console.log(`\nProcessing transaction: ${signature}`);

    try {
        const transaction = await getTransactionWithRetry(connection, signature);

        if (!transaction) {
            console.log(`Transaction ${signature} not found`);
            return;
        }

        if (!transaction.meta?.logMessages) {
            console.log(`No logs found for transaction ${signature}`);
            return;
        }

        const logs = transaction.meta.logMessages;

        // Check if the transaction is a swap transaction
        if (!isSwapTransaction(logs)) {
            console.log('This transaction is not a swap transaction. Skipping.');
            return;
        }

        // Process transaction logic here...
        console.log('Processing swap transaction...');
        // Update WSOL balance
        const adjustedSwapInfo = await processSwapTransaction(connection, transaction, signature);

        if (!adjustedSwapInfo) {
            console.log(`Could not process swap transaction ${signature}`);
            return;
        }

        // Add timestamp to adjustedSwapInfo
        adjustedSwapInfo.timestamp = transaction.blockTime ? new Date(transaction.blockTime * 1000).toISOString() : new Date().toISOString();

        // Write to CSV
        await writer.writeRecords([{
            signature: signature,
            timestamp: adjustedSwapInfo.timestamp,
            swapInfo: JSON.stringify(adjustedSwapInfo)
        }]);

    } catch (error) {
        console.error(`Error processing transaction ${signature}:`, error);
    }
}

// Main function to process historical transactions
async function processHistoricalTransactions() {
    console.log('Processing historical Raydium transactions...');

    // Load ignored addresses
    loadIgnoredAddresses();

    const connection = new Connection(RPC_ENDPOINT);

    console.log(`Initial WSOL balance: ${totalWSOLChange}`);

    // CSV writer setup
    const csvWriter = createObjectCsvWriter({
        path: 'transactions.csv',
        header: [
            { id: 'signature', title: 'Signature' },
            { id: 'timestamp', title: 'Timestamp' },
            { id: 'swapInfo', title: 'Swap Info' }
        ],
        append: false // Set to true if you want to append to an existing file
    });
    await csvWriter.writeRecords([]); // Write empty array to create or overwrite the file and write headers

    // Fetch transactions involving the token mint address
    const tokenMintAddress = new PublicKey(TOKEN_MINT_ADDRESS);
    let signatures = [];

    let options: any = {
        limit: 1000,
    };

    while (true) {
        const transactionList = await connection.getSignaturesForAddress(tokenMintAddress, options);

        if (!transactionList || transactionList.length === 0) {
            break;
        }

        signatures.push(...transactionList.map(transaction => transaction.signature));

        if (transactionList.length < 1000) {
            break;
        }

        options.before = transactionList[transactionList.length - 1].signature;
    }

    console.log(`Found ${signatures.length} transactions involving the token mint address`);

    // Process each transaction
    for (const signature of signatures) {
        try {
            await processTransaction(connection, signature, csvWriter);
        } catch (error) {
            console.error(`Error processing transaction ${signature}:`, error);
        }
    }

    console.log(`\nFinished processing historical transactions.`);
    console.log(`Total WSOL Balance Change: ${totalWSOLChange}`);

    // Analyze CSV data after processing all transactions
    await analyzeCsvData('transactions.csv');
}

processHistoricalTransactions().catch(console.error);

// Struct definitions
const swapBaseInLog = struct<{
    log_type: number,
    amount_in: bigint,
    minimum_out: bigint,
    direction: bigint,
    user_source: bigint,
    pool_coin: bigint,
    pool_pc: bigint,
    out_amount: bigint
}>([
    u8('log_type'),
    nu64('amount_in'),
    nu64('minimum_out'),
    nu64('direction'),
    nu64('user_source'),
    nu64('pool_coin'),
    nu64('pool_pc'),
    nu64('out_amount'),
]);

const swapBaseOutLog = struct<{
    log_type: number,
    max_in: bigint,
    amount_out: bigint,
    direction: bigint,
    user_source: bigint,
    pool_coin: bigint,
    pool_pc: bigint,
    deduct_in: bigint
}>([
    u8('log_type'),
    nu64('max_in'),
    nu64('amount_out'),
    nu64('direction'),
    nu64('user_source'),
    nu64('pool_coin'),
    nu64('pool_pc'),
    nu64('deduct_in'),
]);

const logTypeToStruct = new Map<number, any>([
    [3, swapBaseInLog],
    [4, swapBaseOutLog],
]);

function parseSwapInfo(logs: string[]): any {
    for (const log of logs) {
        if (log.includes('ray_log')) {
            const parts = log.split('ray_log:');
            if (parts.length > 1) {
                const logData = Buffer.from(parts[1].trim(), 'base64');
                if (logData.length > 0) {
                    const logType = logData[0];
                    const logStruct = logTypeToStruct.get(logType);

                    if (logStruct && typeof logStruct.decode === 'function') {
                        return logStruct.decode(logData);
                    }
                }
            }
        }
    }
    return null;
}

async function getMintDecimals(connection: Connection, mintAddress: PublicKey): Promise<number | null> {
    try {
        const mintInfo = await getMint(connection, mintAddress);
        return mintInfo.decimals;
    } catch (error) {
        console.error(`Error fetching mint info for ${mintAddress.toBase58()}:`, error);
        return null;
    }
}

function determineInOutTokens(transaction: VersionedTransactionResponse, swapInfo: any): { inToken: PublicKey, outToken: PublicKey } {
    const preBalances = new Map<string, Map<number, bigint>>();
    const postBalances = new Map<string, Map<number, bigint>>();
    const netChanges = new Map<string, Map<number, bigint>>();

    transaction.meta?.preTokenBalances?.forEach(balance => {
        if (!preBalances.has(balance.mint)) {
            preBalances.set(balance.mint, new Map<number, bigint>());
        }
        preBalances.get(balance.mint)!.set(balance.accountIndex, BigInt(balance.uiTokenAmount.amount));
    });

    transaction.meta?.postTokenBalances?.forEach(balance => {
        if (!postBalances.has(balance.mint)) {
            postBalances.set(balance.mint, new Map<number, bigint>());
        }
        postBalances.get(balance.mint)!.set(balance.accountIndex, BigInt(balance.uiTokenAmount.amount));

        if (!netChanges.has(balance.mint)) {
            netChanges.set(balance.mint, new Map<number, bigint>());
        }
        const preBalance = preBalances.get(balance.mint)?.get(balance.accountIndex) || BigInt(0);
        const change = postBalances.get(balance.mint)!.get(balance.accountIndex)! - preBalance;
        netChanges.get(balance.mint)!.set(balance.accountIndex, change);
    });

    let inToken: string | null = null;
    let outToken: string | null = null;

    for (const [mint, changes] of netChanges) {
        for (const change of changes.values()) {
            if (Math.abs(Number(change)) === swapInfo.amount_in) {
                inToken = mint;
            } else if (Math.abs(Number(change)) === swapInfo.out_amount) {
                outToken = mint;
            }
        }
    }

    if (!inToken || !outToken) {
        throw new Error('Could not determine in and out tokens');
    }

    return {
        inToken: new PublicKey(inToken),
        outToken: new PublicKey(outToken)
    };
}

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

// =================================================================================================================
//  Refactored Processing Function (to be used by both real-time and historical)
// =================================================================================================================
async function processSwapTransaction(connection: Connection, transaction: VersionedTransactionResponse, signature: string): Promise<any | null> {
    try {
        if (!transaction.meta?.logMessages) {
            console.log(`No logs found for transaction ${signature}`);
            return null;
        }

        const logs = transaction.meta.logMessages;

        if (!isSwapTransaction(logs)) {
            console.log('This transaction does not appear to be a swap.');
            return null;
        }

        console.log('This transaction appears to be a swap.');
        const swapInfo = parseSwapInfo(logs);

        if (!swapInfo) {
            console.log(`Could not find swap info for transaction ${signature}`);
            return null;
        }

        const { inToken, outToken } = determineInOutTokens(transaction, swapInfo);
        const signerAccount = await getSignerAccount(connection, transaction);

        // Check if the signer is in the ignored addresses list
        if (ignoredAddresses.has(signerAccount.toLowerCase())) {
            console.log(`Skipping transaction ${signature} because signer ${signerAccount} is in the ignore list.`);
            return null;
        }

        const inTokenDecimals = await getMintDecimals(connection, inToken);
        const outTokenDecimals = await getMintDecimals(connection, outToken);

        let adjustedAmountIn, adjustedAmountOut;

        if ('amount_in' in swapInfo) {
            adjustedAmountIn = inTokenDecimals !== null ? Number(swapInfo.amount_in) / Math.pow(10, inTokenDecimals) : Number(swapInfo.amount_in);
            adjustedAmountOut = outTokenDecimals !== null ? Number(swapInfo.out_amount) / Math.pow(10, outTokenDecimals) : Number(swapInfo.out_amount);
        } else if ('max_in' in swapInfo) {
            adjustedAmountIn = inTokenDecimals !== null ? Number(swapInfo.deduct_in) / Math.pow(10, inTokenDecimals) : Number(swapInfo.deduct_in);
            adjustedAmountOut = outTokenDecimals !== null ? Number(swapInfo.amount_out) / Math.pow(10, outTokenDecimals) : Number(swapInfo.amount_out);
        }

        const adjustedSwapInfo = {
            ...swapInfo,
            adjustedAmountIn,
            adjustedAmountOut,
            inToken: inToken.toBase58(),
            outToken: outToken.toBase58(),
            inTokenDecimals,
            outTokenDecimals,
            signerAccount
        };

        console.log('Swap processed successfully');

        // Update WSOL balance
        if (adjustedSwapInfo.inToken.toLowerCase() === WSOL_ADDRESS.toLowerCase()) {
            totalWSOLChange -= adjustedSwapInfo.adjustedAmountIn;
            console.log("totalWSOLChange - = ", adjustedSwapInfo.adjustedAmountIn);
        }
        else if (adjustedSwapInfo.outToken.toLowerCase() === WSOL_ADDRESS.toLowerCase()) {
            totalWSOLChange += adjustedSwapInfo.adjustedAmountOut;
            console.log("totalWSOLChange + = ", adjustedSwapInfo.adjustedAmountOut);
        }
        else {
            console.log("No WSOL change in this transaction");
        }
        console.log(`Current WSOL Balance Change: ${totalWSOLChange}`);

        return adjustedSwapInfo;

    } catch (error) {
        console.error(`Error processing swap transaction ${signature}:`, error);
        return null;
    }
}

// Function to analyze CSV data
async function analyzeCsvData(csvFilePath: string): Promise<void> {
    console.log('Analyzing CSV data...');

    const csvData: any[] = [];
    fs.createReadStream(csvFilePath)
        .pipe(parse({ delimiter: ',' })) // Use csv.csv() to parse the CSV content
        .on('data', (row: any) => {
            csvData.push(row);
        })
        .on('end', () => {
            console.log('CSV file successfully processed');

            const lpProviders = new Set<string>();
            const rugPulls = new Set<string>();
            let firstTransactionTimestamp: string | null = null;
            let lastTransactionTimestamp: string | null = null;

            if (csvData.length > 0) {
                firstTransactionTimestamp = csvData[0][1]; // Timestamp is in the second column
                lastTransactionTimestamp = csvData[csvData.length - 1][1]; // Last transaction timestamp

                // Process each row in the CSV data
                csvData.forEach(row => {
                    if (row.length < 3) {
                        console.warn('Skipping row due to insufficient columns:', row);
                        return;
                    }

                    const signature = row[0]; // Signature is in the first column
                    const timestamp = row[1]; // Timestamp is in the second column
                    const swapInfoStr = row[2]; // Swap info is in the third column

                    try {
                        const swapInfo = JSON.parse(swapInfoStr);

                        // Check if swapInfo is valid
                        if (!swapInfo || typeof swapInfo !== 'object') {
                            console.warn(`Invalid swapInfo for signature ${signature}:`, swapInfoStr);
                            return;
                        }

                        const amountIn = swapInfo.adjustedAmountIn || 0;
                        const amountOut = swapInfo.adjustedAmountOut || 0;
                        const signerAccount = swapInfo.signerAccount;

                        // Identify potential LP providers (large buys at the beginning)
                        if (amountIn > 1000) {
                            lpProviders.add(signerAccount);
                        }

                        // Identify potential rug pulls (large sells)
                        if (amountOut > 1000) {
                            rugPulls.add(signerAccount);
                        }
                    } catch (error) {
                        console.error(`Error parsing swapInfo for signature ${signature}:`, error);
                    }
                });

                console.log('Potential LP Providers:', Array.from(lpProviders));
                console.log('Potential Rug Pull Accounts:', Array.from(rugPulls));

                if (csvData.length > 0) {
                    const firstTransactionTimestamp = csvData[0]![1];
                    const lastTransactionTimestamp = csvData[csvData.length - 1]![1];
                
                    const transactionsBetween = csvData.filter((row: any) => {
                        const transactionTimestamp = row[1];
                        return transactionTimestamp > firstTransactionTimestamp && transactionTimestamp < lastTransactionTimestamp;
                    });
                    console.log(`Transactions between first and last timestamps: ${transactionsBetween.length}`);
                } else {
                    console.log('No transactions found in the CSV file.');
                }
            } else {
                console.log('No transactions found in the CSV file.');
            }
        })
        .on('error', (error: any) => {
            console.error('Error reading CSV file:', error);
        });
}
