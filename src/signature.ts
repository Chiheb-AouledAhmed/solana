const { Connection, PublicKey } = require("@solana/web3.js");
import { SOLANA_RPC_URL, YOUR_PRIVATE_KEY, KNOWN_TOKENS } from './_config';
const connection = new Connection(SOLANA_RPC_URL);
const address = new PublicKey("xRtY78fi17CXMrEXzwAf7hEzkAdYhCUkhVTkZWjUgHv");
let lastSignature = "";

export async function monitorTransactions() {
    const signatures = await connection.getSignaturesForAddress(address, { limit: 1 });
    
    if (signatures.length > 0) {
        const signature = signatures[0].signature;
        if (signature !== lastSignature) {
            console.log(`New transaction detected: ${signature} ,Date: ${new Date().toISOString()}`);
            lastSignature = signature;
            // Handle the new transaction here
        }
    }
}

// Poll every second
//setInterval(monitorTransactions, 1000);
