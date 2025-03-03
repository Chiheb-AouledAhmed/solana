"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.monitorTransactions = monitorTransactions;
const { Connection, PublicKey } = require("@solana/web3.js");
const _config_1 = require("./_config");
const connection = new Connection(_config_1.SOLANA_RPC_URL);
const address = new PublicKey("xRtY78fi17CXMrEXzwAf7hEzkAdYhCUkhVTkZWjUgHv");
let lastSignature = "";
async function monitorTransactions() {
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
//# sourceMappingURL=signature.js.map