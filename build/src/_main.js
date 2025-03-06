"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/main.ts
const _accountWatcher_1 = require("./_accountWatcher");
const dotenv_1 = __importDefault(require("dotenv"));
const web3_js_1 = require("@solana/web3.js");
//import { getAssociatedTokenAddress } from '@solana/spl-token/extension';
//import { Connection, Keypair,PublicKey } from '@solana/web3.js';
const _config_1 = require("./_config");
const bs58_1 = __importDefault(require("bs58"));
const express_1 = __importDefault(require("express"));
let stopAccountWatcher = false;
let tokenToWatch = null;
async function main() {
    console.log('Starting Solana Trader Bot...');
    try {
        const connection = new web3_js_1.Connection(_config_1.SOLANA_RPC_URL, 'processed');
        const privateKeyUint8Array = bs58_1.default.decode(_config_1.CENTRAL_WALLET_PRIVATE_KEY);
        const keyPair = web3_js_1.Keypair.fromSecretKey(privateKeyUint8Array);
        dotenv_1.default.config();
        const PORT = process.env.PORT || 3000;
        const app = (0, express_1.default)();
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
        const watchedAccountsUsage = {};
        await (0, _accountWatcher_1.watchTransactions)(watchedAccountsUsage);
        console.log('awaited');
    }
    catch (error) {
        console.error("An error occurred:", error);
        if (error instanceof Error) {
            console.error(error.message); // Now it's safe to access .message
        }
        else {
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
//# sourceMappingURL=_main.js.map