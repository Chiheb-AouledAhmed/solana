// src/main.ts
import { watchTransactions } from './_accountWatcher';
import { watchTokenTransactions } from './_TokenAccountWatcher';
import { watchPumpFunTransactions } from './pumpFunAccountWatcher';
import { watchTokenTxs } from './TokenCreatorFinder';
import { compareFiles } from './extract';

//import { startMonitoring,startTokenWatcher, stopTokenWatcher } from './_tokenWatcher';
import { buyNewToken ,makeAndExecuteSwap,findOrCreateWrappedSolAccount,unwrapWrappedSol,findWrappedSolAccount,closeTokenAta} from './_transactionUtils';
import { isPumpFunCreation,pollTransactionsForSwap,getPoolKeysFromParsedInstruction,processTransferSolanaTransaction,isSwapTransaction,processSwapTransaction,decodePumpFunTrade}  from './swapUtils';
import { startMonitoring } from './radiumRugMonitor';
import { monitorTransactions } from './signature';
import dotenv from 'dotenv';
import { Connection, Keypair, PublicKey, Transaction, SystemProgram, sendAndConfirmTransaction } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, MINT_SIZE, ACCOUNT_SIZE ,getAssociatedTokenAddress, closeAccount, ASSOCIATED_TOKEN_PROGRAM_ID} from '@solana/spl-token';
import { NATIVE_MINT ,createCloseAccountInstruction ,createInitializeAccountInstruction,getAccount} from '@solana/spl-token';
//import { getAssociatedTokenAddress } from '@solana/spl-token/extension';
//import { Connection, Keypair,PublicKey } from '@solana/web3.js';
import { SOLANA_RPC_URL, YOUR_PRIVATE_KEY, KNOWN_TOKENS ,CENTRAL_WALLET_PRIVATE_KEY} from './_config';
import bs58 from 'bs58';
import express from 'express';
let stopAccountWatcher = false;
let tokenToWatch: string | null = null;

import { transferAllSOL,getParsedTransactionWithRetry,sendTelegramNotification} from './_utils';

async function main() {
    console.log('Starting Solana Trader Bot...');
    try {
        const connection = new Connection(SOLANA_RPC_URL, 'processed');
        const privateKeyUint8Array = bs58.decode(CENTRAL_WALLET_PRIVATE_KEY);
        const keyPair = Keypair.fromSecretKey(privateKeyUint8Array);
        dotenv.config();

        const PORT = process.env.PORT || 3000;
        const app = express();
        app.get('/', (req, res) => {
            res.send('Radium Swap Monitor is running!');
        });

        app.get('/health', (req, res) => {
            res.sendStatus(200);
            console.log("service running");
          });

        app.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`);
        });
        /*let signature =  "428meFyUbrENa4Ryy2Mrc2x6dyn6RKAoLxqnoS3emMo6SZJkRUMTLpYqf7UNEUwkuepttgnBxbT4ULGk3uVuVh6j"
        const transaction = await connection.getParsedTransaction(signature, {
            maxSupportedTransactionVersion: 0,
            commitment: 'confirmed'
        });
        let program_id = "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8";
        let instructions = transaction?.transaction.message.instructions;
        instructions?.forEach(instruction => {
            if(instruction.programId.toBase58() ==program_id)
            console.log(instruction)});
        
        let pool = "3em8kgr3kJHnshetbWyWK88wdbq4J3HhvPV7yDBUcrh3";
        let token = "9eXC6W3ZKnkNnCr9iENExRLJDYfPGLbc4m6qfJzJpump"
        const instruction = await pollTransactionsForSwap(token,program_id,connection);
        if(!instruction){
            console.log("No instruction found for token ",token);
            return;
        }
        let ammId = await getPoolKeysFromParsedInstruction(instruction, connection);
        

        await makeAndExecuteSwap(connection, keyPair,
            "So11111111111111111111111111111111111111112",
            token,
            0.01,
            ammId
        );*/
        /*let token = "31RanJGYZbqxN23c6hYV5tb4dewjLVsYTPkaRPCBWh7r"
        await startMonitoring(connection,keyPair,0,
            {
                mint: new PublicKey(token),
                decimals: 9,
                buyPrice : 100000000000000000,
                "amm" : ""
            });*/
        //setInterval(monitorTransactions, 200);
        //let token = "HFGtT4CT2Wnh2FbXVtEKiB9DT864VpR7N2nzvaH5iMEw"
        //buyNewToken(connection, token);
        /*let privateKey = "tZ+VdkXsTevrNeIsJ+EPMnbP4JSXyZT+7nYS+/tzKmMOJMZ7sC+6W2dN+atfIM81p+oKzbTKlmD43k9D2s7X2A==" //Central wallet private key
        const privateKeyUint8Arrayender = Buffer.from(privateKey, 'base64');
        const senderKeypair = Keypair.fromSecretKey(new Uint8Array(privateKeyUint8Arrayender));*/

        //await transferAllSOL(connection, senderKeypair, keyPair.publicKey);
        //await transferAllSOL(connection, keyPair, senderKeypair.publicKey);
        /*try {
            let walletAddress = "xDETdCgweb7ywmMAmfRNfNNPBmuJioyuwXn9kS5eZgT";
            //await closeTokenAta(connection, walletAddress, privateKeyUint8Arrayender,"9HijEDM1Hfcocua1V7XY2YNLJp7gtf3cnDxyFUEX9HHd");
            await transferAllSOL(connection, senderKeypair, keyPair.publicKey);
        } catch (error) {
            console.error("Error:", error);
            
        }*/
       /*const signature = "2JBCxDFdALp3fyENxnDFFsHgvhm7vkUiEkAFGS8oaFVDsgK6ZVWtPd1WKTre5KRYJ9dVMeG8t9wy5AF4ywW5qYKt"
       const transaction = await getParsedTransactionWithRetry(
        connection,
        signature,
        {
            commitment: 'confirmed',
            maxSupportedTransactionVersion: 0
        }
        );
       const transferDetails = await processTransferSolanaTransaction(transaction);

       if (transferDetails) {
        for(const transferDetail of transferDetails){
            console.log(transferDetails)
            console.log(`Transfer Details: ${JSON.stringify(transferDetails)}`);
            let amount = transferDetail.amount
            if((amount>90 * 1e9) && (transferDetail.destination == '69dQZMdXizk5N9PbK7fppTspbuG6VbsVxLD6hu4BvKBt')){
                const message = `
                New Token Transfer Detected!
                Signature: ${signature}
                `;
                await sendTelegramNotification(message);
            }
        } 
       }*/
      const accountaddress = "267KLVeSw2FBCcEYsLwnV8gxHh84BCK9JoSXgyqGaPBJ"
      const tokenaddress = "8MSMWUw113qmQbasc3ip9VWN5MrqXLFP4cL28txbpump"
      compareFiles();
      await watchTokenTransactions(accountaddress,tokenaddress);
        //await watchPumpFunTransactions();
        //await watchTokenTransactions(accountaddress,tokenaddress);
        /*const transaction = await getParsedTransactionWithRetry(
                                    connection,
                                    signature,
                                    {
                                        commitment: 'confirmed',
                                        maxSupportedTransactionVersion: 0
                                    }
                                );
        
        if (transaction) {
            console.log("Transaction", transaction);
            console.log(isPumpFunCreation(signature,transaction));
            if (isSwapTransaction(transaction)) {
                const result = await decodePumpFunTrade(signature,transaction);
                if(result.length>0){
                    for(const res of result)
                    {
                    let tokenAddress = result.tokenAddress;
                    if(res.direction == "buy"){
                        allsum += res.tokenAmount;
                    }
                    else 
                        allsum -= res.tokenAmount;
                    if(allsum <1e5){
                            const message = `
                            All tokens have been sold
                            Signature: ${signature}
                            Token: ${tokenAddress}
                            `;

                            // Send Telegram notification
                            await sendTelegramNotification(message);
                            console.log(`All tokens have been sold. Exiting...`);}   
                    
                }
            }
        }}
        
        console.log("All sum",allsum);*/
        const watchedAccountsUsage: { [publicKey: string]: number } = {};
        //await watchPumpFunTransactions(watchedAccountsUsage);
        console.log('awaited');
    } catch (error) {
        console.error("An error occurred:", error);
       if (error instanceof Error) {
        console.error(error.message); // Now it's safe to access .message
    } else {
        console.error("Unknown error:", error);
    }
        return null;
    }
}

main()
    .catch(error => {
        console.error("An error occurred:", error);
    });
