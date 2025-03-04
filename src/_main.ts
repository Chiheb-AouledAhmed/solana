// src/main.ts
import { watchTransactions } from './_accountWatcher';
//import { startMonitoring,startTokenWatcher, stopTokenWatcher } from './_tokenWatcher';
import { buyNewToken ,makeAndExecuteSwap} from './_transactionUtils';
import { pollTransactionsForSwap,getPoolKeysFromParsedInstruction}  from './swapUtils';
import { startMonitoring } from './radiumRugMonitor';
import { monitorTransactions } from './signature';
import dotenv from 'dotenv';
import { Connection, Keypair, PublicKey, Transaction, SystemProgram, sendAndConfirmTransaction } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, MINT_SIZE, ACCOUNT_SIZE } from '@solana/spl-token';
import { NATIVE_MINT ,createCloseAccountInstruction ,createInitializeAccountInstruction} from '@solana/spl-token';
//import { getAssociatedTokenAddress } from '@solana/spl-token/extension';
//import { Connection, Keypair,PublicKey } from '@solana/web3.js';
import { SOLANA_RPC_URL, YOUR_PRIVATE_KEY, KNOWN_TOKENS } from './_config';
import bs58 from 'bs58';
import express from 'express';
let stopAccountWatcher = false;
let tokenToWatch: string | null = null;

async function main() {
    console.log('Starting Solana Trader Bot...');
    try {
        const connection = new Connection(SOLANA_RPC_URL, 'processed');
        const privateKeyUint8Array = bs58.decode(YOUR_PRIVATE_KEY);
        const keyPair = Keypair.fromSecretKey(privateKeyUint8Array);
        dotenv.config();

        const PORT = process.env.PORT || 3000;
        const app = express();
        app.get('/', (req, res) => {
            res.send('Radium Swap Monitor is running!');
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
        await watchTransactions();
        console.log('awaited');
    } catch (error) {
        console.error("An error occurred:", error);
    }
}

main()
    .catch(error => {
        console.error("An error occurred:", error);
    });
