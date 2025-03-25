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
let TRANSACTION_INTERVAL = 2000;

export function setNotProcessing(){
    Processing = false;
    firstRun = true;
    console.log("watching another token ->>>")
}


export async function watchTokenTransactions(tokenAccountAddress : String): Promise<void> {
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
    let watchedAccounts: PublicKey[] = [new PublicKey(tokenAccountAddress)];
    
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
                        console.log("waiting ...")
                        await new Promise(resolve => setTimeout(resolve, TRANSACTION_INTERVAL));
                        console.log("awaited")
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

                            if (isSwapTransaction(transaction)) {
                                const swapDetails = await processSwapTransaction(connection, transaction, signature);
                                if(swapDetails){
                                    let tokenAddress = "";
                                    if(!knownTokens.has(swapDetails.inToken)){
                                        tokenAddress = swapDetails.inToken;
                                        allsum += swapDetails.amountIn;
                                        const message = `
                                            Token has been bought
                                            Signature: ${signature}
                                            `;

                                            // Send Telegram notification
                                        await sendTelegramNotification(message);
                                    }
                                    else if (!knownTokens.has(swapDetails.outToken)){
                                        tokenAddress = swapDetails.outToken;
                                        allsum -= swapDetails.amountOut;
                                        if(allsum = 0){
                                            const message = `
                                            All tokens have been sold
                                            Signature: ${signature}
                                            Token: ${tokenAddress}
                                            `;

                                            // Send Telegram notification
                                            await sendTelegramNotification(message);
                                        }   
                                    }
                                        
                               
                                }else{
                                    console.log("failed to fetch Swap details");
                                }
                            }

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