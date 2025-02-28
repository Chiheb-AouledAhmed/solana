// src/accountWatcher.ts

import { Connection, PublicKey, Keypair,ParsedInstruction,TransactionInstruction,ParsedTransactionWithMeta } from '@solana/web3.js';
import { SOLANA_RPC_URL,YOUR_PRIVATE_KEY, ACCOUNT_TO_WATCH, POLLING_INTERVAL, KNOWN_TOKENS } from './_config';
import { getParsedTransactionWithRetry, sendTelegramNotification } from './_utils';
import { TOKEN_PROGRAM_ID, getMint } from '@solana/spl-token';
import { processTransferTransaction, isSwapTransaction, processSwapTransaction,parseSwapInfo, determineInOutTokens, logTypeToStruct } from './swapUtils';
import { buyNewToken } from './_transactionUtils';
import { startMonitoring,startTokenWatcher, stopTokenWatcher } from './_tokenWatcher'; // Import startTokenWatcher
import { TokenData } from './_types';
import bs58 from 'bs58';

let stopWatching = false;
let lastSignature = '';
let knownTokens = KNOWN_TOKENS;

export async function watchTransactions(): Promise<void> {
    console.log('Monitoring Raydium transactions...');
    const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
    const watchedAccount = new PublicKey(ACCOUNT_TO_WATCH);
    const privateKey = process.env.PRIVATE_KEY;

    
    let cacheSignature = new Set<string>();
    let firstRun = true;
    while (!stopWatching) {
        try {
            const signatures = await connection.getSignaturesForAddress(
                watchedAccount,
                {
                    limit: 10
                },
                'confirmed'
            );

            for (const signatureInfo of signatures) {
                const signature = signatureInfo.signature;
                if(signature && !cacheSignature.has(signature)){
                    cacheSignature.add(signature);
                if (signature !== lastSignature) {
                    lastSignature = signature;
                    console.log(`New transaction detected: ${signature}`);

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

                            if (isSwapTransaction(transaction)) {
                                const swapDetails = await processSwapTransaction(connection, transaction, signature);
                                if(swapDetails){
                                    let tokenAddress = "";
                                    if(!knownTokens.has(swapDetails.inToken)){
                                        tokenAddress = swapDetails.inToken;
                                    }
                                    else
                                        tokenAddress = swapDetails.outToken;
                                try{
                                        stopWatching = await processDetails(tokenAddress,firstRun,signature,connection);
                                        /*await startMonitoring(connection,keyPair,0,
                                            {
                                                mint: new PublicKey('GvjehsRY6DEhLyL7ALFADD6QV34pmerMyzfX27owinpY'),
                                                decimals: 9,
                                                buyPrice : 100000000000000000
                                            });*/
                                        // startMonitoring(tokenData);
                                } catch (buyError) {
                                        console.error(`Failed to buy token ${tokenAddress}:`, buyError);
                                }
                                if(stopWatching)
                                    break;
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
                                            stopWatching=await processDetails(tokenAddress,firstRun,signature,connection);

                                                //startMonitoring(tokenData);
                                                break; // Exit the loop after buying
                                        } catch (buyError) {
                                                console.error(`Failed to buy token ${tokenAddress}:`, buyError);
                                        }
                                    } 
                                    if(stopWatching)
                                        break;
                                }
                             else {
                                console.log('This transaction does not appear to be a transfer.');
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

async function processDetails(tokenAddress:string,firstRun:boolean,signature:string,connection:Connection){
    {
    
        if(firstRun)
            knownTokens.add(tokenAddress);
        if (!knownTokens.has(tokenAddress)) {
                const message = `
                New Token Transfer Detected!
                Signature: ${signature}
                Token: ${tokenAddress}
            `;
            await sendTelegramNotification(message);
            console.log(`Token ${tokenAddress} is NOT in database. Buying...`);
            try {
                // BUY THE TOKEN
                let amm = await buyNewToken(connection, tokenAddress);

                //GET THE PRICE
                const solBalance = await connection.getBalance(new PublicKey(tokenAddress));
                const buyPrice = solBalance / 1e9; // Convert lamports to SOL

                // Start watching the token
                const tokenData: TokenData = {
                    mint: new PublicKey(tokenAddress),
                    decimals: 9,
                    buyPrice: buyPrice,
                    amm : amm
                };
                const privateKeyUint8Array = bs58.decode(YOUR_PRIVATE_KEY);
                const keyPair = Keypair.fromSecretKey(privateKeyUint8Array);
                await startMonitoring(connection,keyPair,0,tokenData);
                return true;

            } catch (buyError) {
                console.error(`Failed to buy token ${tokenAddress}:`, buyError);
            }
        }
        return false;
    }
} 