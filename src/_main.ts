// src/main.ts
import { watchTransactions } from './_accountWatcher';
//import { startMonitoring,startTokenWatcher, stopTokenWatcher } from './_tokenWatcher';
import { buyNewToken ,makeAndExecuteSwap,findOrCreateWrappedSolAccount,unwrapWrappedSol,findWrappedSolAccount,closeTokenAta} from './_transactionUtils';
import { pollTransactionsForSwap,getPoolKeysFromParsedInstruction}  from './swapUtils';
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

import { transferAllSOL} from './_utils';

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
        /*let privateKey = "m7Hd9O3hlsZonp1FB/swsKhqkHZftKSZxP4GqCPIS9moR3Eov6wIFvrtMQbET8Vy59k8ZmNdn5EMHVOm+v4AYg==" //Central wallet private key
        const privateKeyUint8Arrayender = Buffer.from(privateKey, 'base64');
        const senderKeypair = Keypair.fromSecretKey(new Uint8Array(privateKeyUint8Arrayender));

        await transferAllSOL(connection, senderKeypair, keyPair.publicKey);*/
        /*await transferAllSOL(connection, keyPair, senderKeypair.publicKey);
        try {
            let walletAddress = "8sqhtS5bp1cxZCemNtZQMRCJXeKXJdWcoNfBPZYQkWdc";
            await closeTokenAta(connection, walletAddress, privateKeyUint8Arrayender,"DVMCxbFAZuxdD1s5Ts4DZp2pbEgxYGNCETb6k72F84rs");
            await transferAllSOL(connection, senderKeypair, keyPair.publicKey);
        } catch (error) {
            console.error("Error:", error);
            
        }*/


        const watchedAccountsUsage: { [publicKey: string]: number } = {};
        await watchTransactions(watchedAccountsUsage);
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

  
// Step 1: Find the Associated Token Account Address


