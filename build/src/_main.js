"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const signature_1 = require("./signature");
const web3_js_1 = require("@solana/web3.js");
const _config_1 = require("./_config");
const bs58_1 = __importDefault(require("bs58"));
let stopAccountWatcher = false;
let tokenToWatch = null;
async function main() {
    console.log('Starting Solana Trader Bot...');
    try {
        const connection = new web3_js_1.Connection(_config_1.SOLANA_RPC_URL, 'processed');
        const privateKeyUint8Array = bs58_1.default.decode(_config_1.YOUR_PRIVATE_KEY);
        const keyPair = web3_js_1.Keypair.fromSecretKey(privateKeyUint8Array);
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
        setInterval(signature_1.monitorTransactions, 200);
        //await watchTransactions();
    }
    catch (error) {
        console.error("An error occurred:", error);
    }
}
main()
    .catch(error => {
    console.error("An error occurred:", error);
});
//# sourceMappingURL=_main.js.map