// src/accountWatcher.ts

import { Connection, PublicKey, Keypair,ParsedInstruction,TransactionInstruction,ParsedTransactionWithMeta } from '@solana/web3.js';
import { SOLANA_RPC_URL,CENTRAL_WALLET_PRIVATE_KEY,YOUR_PRIVATE_KEY, ACCOUNTS_FILE,ACCOUNT_TO_WATCH, POLLING_INTERVAL, KNOWN_TOKENS , ACCOUNTS_TO_WATCH } from './_config';
import { getParsedTransactionWithRetry, sendTelegramNotification ,transferAllSOLToRandomAccount} from './_utils';
import { TOKEN_PROGRAM_ID, getMint } from '@solana/spl-token';
import { decodePumpFunTrade,processTransferTransaction, processTransferSolanaTransaction,isSwapTransaction, processSwapTransaction,parseSwapInfo, determineInOutTokens, logTypeToStruct } from './swapUtils';
import { buyNewToken } from './_transactionUtils';
import { startMonitoring } from './_tokenWatcher'; // Import startTokenWatcher
import { TokenData,AccountData } from './_types';
import { watchPumpFunTransactions } from './pumpFunAccountWatcher';
import bs58 from 'bs58';
import * as fs from 'fs';

let stopWatching = false;
let lastSignature = '';
let knownTokens = KNOWN_TOKENS;
let Processing = false;
let stopcurrWatch = false;
const COOL_DOWN_PERIOD = 3 * 30 * 60 * 1000;
let firstRun = true;
let TRANSACTION_INTERVAL = 2000;

export function setNotProcessing(){
    Processing = false;
    firstRun = true;
    console.log("watching another token ->>>")
}


export async function watchTokenTransactions(accountaddress:String,tokenAccountAddress : String): Promise<void> {
    console.log('Monitoring Raydium transactions...');
    const connection = new Connection(SOLANA_RPC_URL, 'confirmed');


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
    let firstBuy = true;
    let allsum = 0;
    /*const centralWalletPrivateKeyUint8Array = bs58.decode(CENTRAL_WALLET_PRIVATE_KEY);
    const centralWalletKeypair = Keypair.fromSecretKey(centralWalletPrivateKeyUint8Array);

    // Transfer SOL to a random account before starting the loop
    const recipientPublicKey = await transferAllSOLToRandomAccount(connection, centralWalletKeypair, accounts); // Transfer 1 SOL
    if (!recipientPublicKey) {
        console.error('Failed to transfer SOL to a random account.');
        return;
    }*/
    //const watchedAccount = new PublicKey(ACCOUNT_TO_WATCH);
    let watchedAccounts: PublicKey[] = [new PublicKey(accountaddress)];
    
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
                        limit: 300
                    },
                    'confirmed'
                );
                for(const signature of signaturesAccount){
                    signatures.push({signature:signature,account:publicKey});
                }
            }
            signatures.reverse();
            for (const signatureInfo of signatures) {
                const signature = signatureInfo.signature.signature;
                const publicKey = signatureInfo.account;
                if(signature && !cacheSignature.has(signature)){
                    cacheSignature.add(signature);
                    
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
                            if(result.length==1 && result[0].tokenAddress==tokenAccountAddress){ 
                                for(const res of result){
                                let amount = res.tokenAmount;
                                if(res.direction == 'buy'){
                                    allsum += amount;
                                    console.log("bought token")
                                    console.log(`Total bought amount: ${allsum}`);
                                }
                                else if(res.direction == 'sell'){
                                    allsum -= amount;   
                                    console.log("sold token")
                                    console.log(`Total bought amount: ${allsum}`);
                                }
                                if(allsum <1e5){
                                    console.log(`All tokens sold. Exiting...`);
                                    console.log(`New pump fun token detected: ${signature}`);
                                    const message = `
                                    Buying new token
                                    Token: ${tokenAccountAddress}
                                    Signature: ${signature}
                                    `;
                                    await sendTelegramNotification(message);
                                    return watchPumpFunTransactions();
                                    
                                }
                            }
                        }
                            else {
                                console.log('This transaction is not a pump fun transaction of the chosen token');
                            }
                        }
                    }catch (error) {    
                        console.error("Error processing transaction:", error);
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