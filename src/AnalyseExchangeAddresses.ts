import { Connection, PublicKey, Keypair, ParsedInstruction, TransactionInstruction, ParsedTransactionWithMeta, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { SOLANA_RPC_URL, CENTRAL_WALLET_PRIVATE_KEY, YOUR_PRIVATE_KEY, ACCOUNTS_FILE, ACCOUNT_TO_WATCH, POLLING_INTERVAL, KNOWN_TOKENS, ACCOUNTS_TO_WATCH } from './_config';
import { checkTransactionStatus, getParsedTransactionWithRetry, sendTelegramNotification, transferAllSOLToRandomAccount } from './_utils';
import { TOKEN_PROGRAM_ID, getMint } from '@solana/spl-token';
import { isPumpFunCreation,decodePumpFunTradev2, decodePumpFunTrade, processTransferTransaction, processTransferSolanaTransaction, isSwapTransaction, processSwapTransaction, parseSwapInfo, determineInOutTokens, logTypeToStruct } from './swapUtils';
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

import Papa, { ParseResult } from 'papaparse';

interface CsvRow {
  [key: string]: string | number | boolean | null; // Adjust based on your data
}

async function parseCsvTwoColumns(
    filePath: string,
    column1: string,
    column2: string,
    delimiter: string = ","
  ): Promise<Array<{ [key: string]: string }>> {
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
  
        const result: Array<{ [key: string]: string }> = rows.map(row => {
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



export async function AnalyseExchangeAddresses( filename: string): Promise<void> {
    console.log('Monitoring Raydium transactions...');
    const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
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
    const centralWalletPrivateKeyUint8Array = bs58.decode(CENTRAL_WALLET_PRIVATE_KEY);
    const centralWalletKeypair = Keypair.fromSecretKey(centralWalletPrivateKeyUint8Array);

    // Transfer SOL to a random account before starting the loop
    /*const recipientPublicKey = await transferAllSOLToRandomAccount(connection, centralWalletKeypair, accounts); // Transfer 1 SOL
    if (!recipientPublicKey) {
        console.error('Failed to transfer SOL to a random account.');
        return;
    }*/
    

    const privateKey = process.env.PRIVATE_KEY;

    let allsum = 0;
    let cacheSignature = new Set<string>();

    // Data structure to hold address specific information
    const addressData: { [address: string]: { buys: number, sells: number, signatures: string[] } } = {};
    let res = [];

    try {
        for (const accountData of extractedData) {
            let signature= accountData['Signature']
            let account= new PublicKey(accountData['To']);
            const signaturesAccount = await connection.getSignaturesForAddress(
                account,
                {
                    limit: 300
                },
                'confirmed'
            );
            signaturesAccount.reverse();
            if((signaturesAccount.length < 300)&&(signaturesAccount[0].signature==signature)){
                for(let i =0; i<Math.min(signaturesAccount.length,10); i++){
                    const transaction = await getParsedTransactionWithRetry(
                        connection,
                        signaturesAccount[i].signature,
                        {
                            commitment: 'confirmed',
                            maxSupportedTransactionVersion: 0
                        }
                    );
                    if(isPumpFunCreation(signature,transaction))
                        res.push({signature: signature, account: account });
                }

                
            }
        }
        
    } catch (error) {
        console.error("Error fetching signatures:", error);
    }
    console.log("res", res);
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
