"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.monitorTransactions = monitorTransactions;
const { Connection, PublicKey } = require("@solana/web3.js");
const _config_1 = require("./_config");
const dotenv_1 = __importDefault(require("dotenv"));
const connection = new Connection(_config_1.SOLANA_RPC_URL);
let lastSignature = "";
async function monitorTransactions() {
    dotenv_1.default.config();
    const address = new PublicKey(process.env.TOKEN);
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