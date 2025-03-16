// src/accountWatcher.ts

import { Connection, PublicKey, Keypair,ParsedInstruction,TransactionInstruction,ParsedTransactionWithMeta } from '@solana/web3.js';
import { SOLANA_RPC_URL,CENTRAL_WALLET_PRIVATE_KEY,YOUR_PRIVATE_KEY, ACCOUNTS_FILE,ACCOUNT_TO_WATCH, POLLING_INTERVAL, KNOWN_TOKENS , ACCOUNTS_TO_WATCH } from './_config';
import { getParsedTransactionWithRetry, sendTelegramNotification ,transferAllSOLToRandomAccount} from './_utils';
import { TOKEN_PROGRAM_ID, getMint } from '@solana/spl-token';
import { processTransferTransaction, processTransferSolanaTransaction,isSwapTransaction, processSwapTransaction,parseSwapInfo, determineInOutTokens, logTypeToStruct } from './swapUtils';
import { buyNewToken } from './_transactionUtils';
import { startMonitoring } from './_tokenWatcher'; // Import startTokenWatcher
import { TokenData,AccountData } from './_types';
import bs58 from 'bs58';
import * as fs from 'fs';

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



function loadAccounts(filename: string): AccountData[] {
    try {
        const data = fs.readFileSync(filename, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading accounts file:', error);
        return [];
    }
}

export async function watchTransactions(watchedAccountsUsage:{ [publicKey: string]: number }): Promise<void> {
    console.log('Monitoring Raydium transactions...');
    const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
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
    /*const centralWalletPrivateKeyUint8Array = bs58.decode(CENTRAL_WALLET_PRIVATE_KEY);
    const centralWalletKeypair = Keypair.fromSecretKey(centralWalletPrivateKeyUint8Array);

    // Transfer SOL to a random account before starting the loop
    const recipientPublicKey = await transferAllSOLToRandomAccount(connection, centralWalletKeypair, accounts); // Transfer 1 SOL
    if (!recipientPublicKey) {
        console.error('Failed to transfer SOL to a random account.');
        return;
    }*/
    //const watchedAccount = new PublicKey(ACCOUNT_TO_WATCH);
    let watchedAccounts: PublicKey[] = [];
    let ACCOUNTS_TO_WATCH_v2= ["69dQZMdXizk5N9PbK7fppTspbuG6VbsVxLD6hu4BvKBt"]
    if (ACCOUNTS_TO_WATCH_v2 && Array.isArray(ACCOUNTS_TO_WATCH_v2)) {
        watchedAccounts = ACCOUNTS_TO_WATCH_v2.map(account => new PublicKey(account));
    }
    else{
        console.log("ACCOUNTS_TO_WATCH",ACCOUNTS_TO_WATCH_v2);
        console.warn("ACCOUNTS_TO_WATCH is not properly configured.  Ensure it's a comma-separated list of public keys.");
        return; // Stop execution if ACCOUNTS_TO_WATCH is not valid
    }
    watchedAccounts.forEach(account => {
        // Initialize the account in watchedAccountsUsage to 0 only if it doesn't exist
        watchedAccountsUsage[account.toBase58()] ??= 0;
    });

    const privateKey = process.env.PRIVATE_KEY;

    
    let cacheSignature = new Set<string>();
    
    
    while (!stopWatching) {
        try {
            //console.log("New Loop");
            /*if(Processing){
                console.log("Processing another token");
                await new Promise(resolve => setTimeout(resolve, POLLING_INTERVAL));
                continue;
            }*/
            const signatures = [];
            for (const account of watchedAccounts) {
                const publicKey = new PublicKey(account);
                

                const signaturesAccount = await connection.getSignaturesForAddress(
                    account,
                    {
                        limit: 10
                    },
                    'confirmed'
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

                                const transferDetails = await processTransferSolanaTransaction(transaction);

                                if ((transferDetails) && (!firstRun)){
                                    console.log(`Transfer Details: ${JSON.stringify(transferDetails)}`);
                                    for(const transferDetail of transferDetails){
                                        let amount = transferDetail.amount
                                        if((amount>90 * 1e9) && (transferDetail.source == '69dQZMdXizk5N9PbK7fppTspbuG6VbsVxLD6hu4BvKBt')){
                                            const message = `
                                            New Token Transfer Detected!
                                            Signature: ${signature}
                                            `;
                                            await sendTelegramNotification(message);
                                        }
                                    } 
                                }
                            /*if (isSwapTransaction(transaction)) {
                                const swapDetails = await processSwapTransaction(connection, transaction, signature);
                                if(swapDetails){
                                    let tokenAddress = "";
                                    if(!knownTokens.has(swapDetails.inToken)){
                                        tokenAddress = swapDetails.inToken;
                                    }
                                    else
                                        tokenAddress = swapDetails.outToken;
                                try{
                                        let processed = await processDetails(tokenAddress,firstRun,signature,connection,recipientPublicKey,watchedAccountsUsage,publicKey);
                                        if (processed)
                                            return 
                                        //await startMonitoring(connection,keyPair,0,
                                            //{
                                              //  mint: new PublicKey('GvjehsRY6DEhLyL7ALFADD6QV34pmerMyzfX27owinpY'),
                                               // decimals: 9,
                                               // buyPrice : 100000000000000000
                                            //});
                                        // startMonitoring(tokenData);
                                    
                                } catch (buyError) {
                                        console.error(`Failed to buy token ${tokenAddress}:`, buyError);
                                }
                                }else{
                                    console.log("failed to fetch Swap details");
                                }
                            }
                            else{
                                const transferDetails = await processTransferTransaction(transaction);

                                if (transferDetails) {
                                    console.log(`Transfer Details: ${JSON.stringify(transferDetails)}`);
                                    for(const transferDetail of transferDetails){
                                
                                        const tokenAddress = transferDetail.tokenAddress;
                                        try{
                                            let processsed = await processDetails(tokenAddress,firstRun,signature,connection,recipientPublicKey,watchedAccountsUsage,publicKey);
                                            if(processsed)
                                                return ;
                                                //startMonitoring(tokenData);// Exit the loop after buying
                                        } catch (buyError) {
                                                console.error(`Failed to buy token ${tokenAddress}:`, buyError);
                                        }
                                    } 
                                }
                             else {
                                console.log('This transaction does not appear to be a transfer.');
                            }
                        }*/
                    } else {
                            console.log(`Transaction ${signature} could not be fetched or was skipped.`);
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
        firstRun = false;
        await new Promise(resolve => setTimeout(resolve, POLLING_INTERVAL));
    }
}

// Call this function to stop watching transactions
export function stopAccountWatcher(): void {
    stopWatching = true;
}

async function processDetails(tokenAddress:string,firstRun:boolean,signature:string,connection:Connection,recipientPublicKey:Keypair,watchedAccountsUsage:{ [publicKey: string]: number },watchedAccount:PublicKey):Promise<boolean>{
    {
    
        if(firstRun)
            knownTokens.add(tokenAddress);
        
        if (!knownTokens.has(tokenAddress)) {
            knownTokens.add(tokenAddress);
            if (!((watchedAccountsUsage[watchedAccount.toBase58()] === 0 || Date.now() - watchedAccountsUsage[watchedAccount.toBase58()] > COOL_DOWN_PERIOD) ))
                {
                    console.log(`Ignoring token as it is not in database and cool down of {watchedAccount.toBase58()} period is not over`);
                    return false;
                }
            
            console.log(`Token ${tokenAddress} is NOT in database. Buying...`);
            try {
                // BUY THE TOKEN
                
                let amm = await buyNewToken(connection, tokenAddress,recipientPublicKey);

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
                await startMonitoring(connection,recipientPublicKey,0,tokenData);
                return true;

            } catch (buyError) {
                console.error(`Failed to buy token ${tokenAddress}:`, buyError);
            }
        }
        return false;
    }
} 