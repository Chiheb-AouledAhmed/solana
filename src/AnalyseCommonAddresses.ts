import { Connection, PublicKey, Keypair, ParsedInstruction, TransactionInstruction, ParsedTransactionWithMeta, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { SOLANA_RPC_URL, CENTRAL_WALLET_PRIVATE_KEY, YOUR_PRIVATE_KEY, ACCOUNTS_FILE, ACCOUNT_TO_WATCH, POLLING_INTERVAL, KNOWN_TOKENS, ACCOUNTS_TO_WATCH } from './_config';
import { checkTransactionStatus, getParsedTransactionWithRetry, sendTelegramNotification, transferAllSOLToRandomAccount } from './_utils';
import { TOKEN_PROGRAM_ID, getMint } from '@solana/spl-token';
import { decodePumpFunTradev2, decodePumpFunTrade, processTransferTransaction, processTransferSolanaTransaction, isSwapTransaction, processSwapTransaction, parseSwapInfo, determineInOutTokens, logTypeToStruct } from './swapUtils';
import { buyNewToken } from './_transactionUtils';
import { startMonitoring } from './_tokenWatcher'; // Import startTokenWatcher
import { TokenData, AccountData } from './_types';
import { watchTokenTxs } from './TokenCreatorFinder';
import bs58 from 'bs58';
import * as fs from 'fs';

let TRANSACTION_INTERVAL = 1000; // 10 seconds
let stopWatching = false;
let lastSignature = '';
let knownTokens = KNOWN_TOKENS;
let Processing = false;
let stopcurrWatch = false;
const COOL_DOWN_PERIOD = 3 * 30 * 60 * 1000;
let firstRun = true;

export function setNotProcessing() {
    Processing = false;
    firstRun = true;
    console.log("watching another token ->>>")
}


let monitoredAccounts: { [publicKey: string]: { lastActive: number | null, keypair: Keypair } } = {};



function loadAccounts(filename: string): AccountData[] {
    try {
        const data = fs.readFileSync(filename, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading accounts file:', error);
        return [];
    }
}
let ignoredAddresses = new Set<string>();

function loadIgnoredAddresses(filePath: string ) {
    try {
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        const addresses = fileContent.split('\n').map(line => line).filter(line => line !== '');
        addresses.forEach(addr => ignoredAddresses.add(addr));
        console.log(`Loaded ${ignoredAddresses.size} addresses to ignore.`);
    } catch (error) {
        console.warn(`Could not read addresses from ${filePath}. All addresses will be processed. Error:`, error);
    }
}



export async function AnalyseCommonAddressesTransactions(tokenAddress: string, lastSignature: string, filename: string): Promise<void> {
    console.log('Monitoring Raydium transactions...');
    const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
    loadIgnoredAddresses(filename);

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
    const centralWalletPrivateKeyUint8Array = bs58.decode(CENTRAL_WALLET_PRIVATE_KEY);
    const centralWalletKeypair = Keypair.fromSecretKey(centralWalletPrivateKeyUint8Array);

    // Transfer SOL to a random account before starting the loop
    /*const recipientPublicKey = await transferAllSOLToRandomAccount(connection, centralWalletKeypair, accounts); // Transfer 1 SOL
    if (!recipientPublicKey) {
        console.error('Failed to transfer SOL to a random account.');
        return;
    }*/
    //const watchedAccount = new PublicKey(ACCOUNT_TO_WATCH);
    let watchedAccounts: PublicKey[] = [];
    if (ACCOUNTS_TO_WATCH && Array.isArray(ACCOUNTS_TO_WATCH)) {
        watchedAccounts = ACCOUNTS_TO_WATCH.map(account => new PublicKey(account));
    }
    else {
        console.log("ACCOUNTS_TO_WATCH", ACCOUNTS_TO_WATCH);
        console.warn("ACCOUNTS_TO_WATCH is not properly configured.  Ensure it's a comma-separated list of public keys.");
        return; // Stop execution if ACCOUNTS_TO_WATCH is not valid
    }

    const privateKey = process.env.PRIVATE_KEY;

    let allsum = 0;
    let cacheSignature = new Set<string>();

    // Data structure to hold address specific information
    const addressData: { [address: string]: { buys: number, sells: number, signatures: string[] } } = {};


    try {
        //console.log("New Loop");
        /*if(Processing){
            console.log("Processing another token");
            await new Promise(resolve => setTimeout(resolve, POLLING_INTERVAL));
            continue;
        }*/
        const signatures = [];
        let watchedAccounts: PublicKey[] = [];
        for (const account of ignoredAddresses) {
            watchedAccounts.push(new PublicKey(account));
        }
        for (const account of watchedAccounts) {
            const publicKey = new PublicKey(account);


            const signaturesAccount = await connection.getSignaturesForAddress(
                account,
                {
                    limit: 100
                },
                'confirmed'
            );
            for (const signature of signaturesAccount) {
                signatures.push({ signature: signature, account: publicKey });
            }
        }
        let cnt = 0
        for (const signatureInfo of signatures) {
            cnt++;
            if (cnt % 100 == 0)
                console.log("Processed ", cnt, " signatures");
            const signature = signatureInfo.signature.signature;
            const publicKey = signatureInfo.account;
            if (signature && !cacheSignature.has(signature)) {
                cacheSignature.add(signature);
                {
                    /*console.log(`New transaction detected: ${signature}`);
                    const message = `
                    New Token Transfer Detected!
                    Signature: ${signature}
                    `;
                    await sendTelegramNotification(message);*/
                    try {
                        const transaction = await getParsedTransactionWithRetry(
                            connection,
                            signature,
                            {
                                commitment: 'confirmed',
                                maxSupportedTransactionVersion: 0
                            }
                        );

                        if (checkTransactionStatus(transaction, signature)) {
                            console.log("Transaction", signature);

                            const result = await decodePumpFunTrade(signature, transaction);
                            if ((result.length > 0) && (result[0].tokenAddress == tokenAddress)) {
                                let address = transaction.transaction.message.accountKeys[0].pubkey.toBase58()
                                if (!addressData[address]) {
                                    addressData[address] = { buys: 0, sells: 0, signatures: [] };
                                }
                                addressData[address].signatures.push(signature);
                                
                                console.log("Transaction", signature, "is a pump fun transaction for token", tokenAddress);

                            }

                            else {
                                //console.log('This transaction does not appear to be a pump fun transaction');
                            }
                        }
                    }
                    catch (error) {
                        console.error("Error processing transaction:", error);
                    }
                }
            }
        }
    } catch (error) {
        console.error("Error fetching signatures:", error);
    }
    console.log("Total Amount: ", allsum);

    // Convert addressData to an array for sorting
    const addressArray = Object.entries(addressData).map(([address, data]) => ({
        address,
        ...data,
        netValue: data.buys - data.sells // Calculate net buy/sell amount
    }));

    // Sort the array by net buy/sell amount in descending order
    addressArray.sort((a, b) => b.netValue - a.netValue);
    let output_file = 'address_data_sorted_' + tokenAddress + '.json';
    // Save the sorted address data to a JSON file
    fs.writeFileSync(output_file, JSON.stringify(addressArray, null, 2));
    console.log('Sorted address data saved to address_data_sorted.json');
}

// Call this function to stop watching transactions
export function stopAccountWatcher(): void {
    stopWatching = true;
}

async function processDetails(tokenAddress: string, firstRun: boolean, signature: string, connection: Connection, recipientPublicKey: Keypair, watchedAccount: PublicKey): Promise<boolean> {
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
                await sendTelegramNotification(message);
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

            } catch (buyError) {
                console.error(`Failed to buy token ${tokenAddress}:`, buyError);
            }
        }
        return false;
    }
}
