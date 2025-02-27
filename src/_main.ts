// src/main.ts
import { watchTransactions } from './_accountWatcher';
import { startMonitoring,startTokenWatcher, stopTokenWatcher } from './_tokenWatcher';
import { buyNewToken ,makeAndExecuteSwap} from './_transactionUtils';
import { Connection, Keypair,PublicKey } from '@solana/web3.js';
import { SOLANA_RPC_URL, YOUR_PRIVATE_KEY, KNOWN_TOKENS } from './_config';
import bs58 from 'bs58';

let stopAccountWatcher = false;
let tokenToWatch: string | null = null;

async function main() {
    console.log('Starting Solana Trader Bot...');
    try {
        /*const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
        const privateKeyUint8Array = bs58.decode(YOUR_PRIVATE_KEY);
        const keyPair = Keypair.fromSecretKey(privateKeyUint8Array);
        
        await makeAndExecuteSwap(connection, keyPair,
            "So11111111111111111111111111111111111111112",
            "GvjehsRY6DEhLyL7ALFADD6QV34pmerMyzfX27owinpY",
            0.02
        );
        await startMonitoring(connection,keyPair,0,
            {
                mint: new PublicKey('GvjehsRY6DEhLyL7ALFADD6QV34pmerMyzfX27owinpY'),
                decimals: 9,
                buyPrice : 100000000000000000
            });*/
        await watchTransactions();
    } catch (error) {
        console.error("An error occurred:", error);
    }
}

main()
    .catch(error => {
        console.error("An error occurred:", error);
    });
