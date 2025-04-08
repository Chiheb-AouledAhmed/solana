import { Connection, PublicKey, Keypair,ParsedInstruction,TransactionInstruction,ParsedTransactionWithMeta } from '@solana/web3.js';
import { SOLANA_RPC_URL,CENTRAL_WALLET_PRIVATE_KEY,YOUR_PRIVATE_KEY, ACCOUNTS_FILE,ACCOUNT_TO_WATCH, POLLING_INTERVAL, KNOWN_TOKENS , ACCOUNTS_TO_WATCH } from './_config';
import { getSignaturesWithRetry,getParsedTransactionWithRetry, sendTelegramNotification ,transferAllSOLToRandomAccount} from './_utils';
import { TOKEN_PROGRAM_ID, getMint } from '@solana/spl-token';
import { decodePumpFunTrade,processTransferTransaction, processTransferSolanaTransaction,isSwapTransaction, processSwapTransaction,parseSwapInfo, determineInOutTokens, logTypeToStruct } from './swapUtils';
import { buyNewToken } from './_transactionUtils';
import { startMonitoring } from './_tokenWatcher'; // Import startTokenWatcher
import { TokenData,AccountData } from './_types';
import { watchTokenTxs } from './TokenCreatorFinder';
import { watchTokenTxsToBuy } from './TokenBuyer';

import bs58 from 'bs58';
import * as fs from 'fs';

let TRANSACTION_INTERVAL = 100; // 10 seconds
let stopWatching = false;
let lastSignature = '';
let knownTokens = KNOWN_TOKENS;
let Processing = false;
let stopcurrWatch = false;
const COOL_DOWN_PERIOD = 3 * 30 * 60 * 1000;
let firstRun = true;

export function setNotProcessing(){
    Processing = false;
    firstRun = true;
    console.log("watching another token ->>>")
}


let monitoredAccounts: { [publicKey: string]: { lastActive: number | null, keypair: Keypair } } = {};

const logStream = fs.createWriteStream('./logs/output.log', { flags: 'a' });

// Custom logger function to replace console.log
function logToFile(message: string): void {
  const timestamp = new Date().toISOString();
  logStream.write(`[${timestamp}] ${message}\n`);
}

// Replace console.log with logToFile
console.log = logToFile;

function loadAccounts(filename: string): AccountData[] {
    try {
        const data = fs.readFileSync(filename, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading accounts file:', error);
        return [];
    }
}

export async function watchPumpFunTransactions(): Promise<void> {
    console.log('Monitoring Raydium transactions...');
    // Add health check
    
    const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
    if (!(await checkNodeHealth(connection))) {
        await new Promise(resolve => setTimeout(resolve, 10000));
        return watchPumpFunTransactions(); // Restart
    }
    const accounts = loadAccounts(ACCOUNTS_FILE);
    if (accounts.length === 0) {
        console.warn('No accounts loaded.  Exiting.');
        return;
    }

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
    else{
        console.log("ACCOUNTS_TO_WATCH",ACCOUNTS_TO_WATCH);
        console.warn("ACCOUNTS_TO_WATCH is not properly configured.  Ensure it's a comma-separated list of public keys.");
        return; // Stop execution if ACCOUNTS_TO_WATCH is not valid
    }

    const privateKey = process.env.PRIVATE_KEY;

    
    let cacheSignature = new Set<string>();
    
    
    while (!stopWatching) {
        try {
            /*if(Processing){
                console.log("Processing another token");
                await new Promise(resolve => setTimeout(resolve, POLLING_INTERVAL));
                continue;
            }*/
            const signatures = [];
            for (const account of watchedAccounts) {
                const publicKey = new PublicKey(account);
                

                const signaturesAccount = await getSignaturesWithRetry(connection,
                    account,
                    {
                        limit: 50
                    }
                );
                for(const signature of signaturesAccount){
                    signatures.push({signature:signature,account:publicKey});
                }
            }

            for (const signatureInfo of signatures) {
                const signature = signatureInfo.signature.signature;
                const publicKey = signatureInfo.account;
                if(signature && !cacheSignature.has(signature)){
                    cacheSignature.add(signature);
                    {
                    lastSignature = signature;
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

                        if (transaction) {
                            console.log("Transaction", transaction);

                            const result = await decodePumpFunTrade(signature,transaction);
                            if(result.length>0){
                                let tokenAddress = result[0].tokenAddress;
                                let processed = await processDetails(tokenAddress,firstRun,signature,connection,centralWalletKeypair,publicKey);
                                if(processed){
                                    console.log("Finding Token Creator before signature : ",signature);
                                    return watchTokenTxsToBuy(tokenAddress,signature);
                                }
                                    
                            }
                            
                            else {
                                console.log('This transaction does not appear to be a pump fun transaction');
                            }
                        }
                        await new Promise(resolve => setTimeout(resolve, TRANSACTION_INTERVAL));
                    }
                 catch (error) {
                        console.error("Error processing transaction:", error);
                    }
                }
            }
        }
        if(firstRun){
            console.log("First run finished !");

        }
        firstRun = false;
        } catch (error) {
            console.error("Error fetching signatures:", error);
        }
        
        await new Promise(resolve => setTimeout(resolve, POLLING_INTERVAL));
    }
}

// Call this function to stop watching transactions
export function stopAccountWatcher(): void {
    stopWatching = true;
}
async function checkNodeHealth(connection: Connection) {
    try {
      const health = await getHealth(connection);
      if (health !== 'ok') throw new Error('Node unhealthy');
      const slot = await connection.getSlot('confirmed');
      return true;
    } catch (error) {
      console.error('Node health check failed:', error);
      return false;
    }
  }
  async function getHealth(connection: Connection): Promise<string> {
    const rpcUrl = connection.rpcEndpoint; // Get the RPC endpoint from the connection
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getHealth",
      }),
    });
  
    if (!response.ok) {
      throw new Error(`Failed to fetch health status: ${response.statusText}`);
    }
  
    const result = await response.json();
    return result.result; // Should return "ok" if the node is healthy
  }
async function processDetails(tokenAddress:string,firstRun:boolean,signature:string,connection:Connection,recipientPublicKey:Keypair,watchedAccount:PublicKey):Promise<boolean>{
    {
    
        if(firstRun)
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