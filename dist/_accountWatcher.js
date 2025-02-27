"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const web3_js_1 = require("@solana/web3.js");
const spl_token_1 = require("@solana/spl-token");
const bs58_1 = __importDefault(require("bs58"));
// Replace these values with your own
const WSOL_MINT = new web3_js_1.PublicKey('So11111111111111111111111111111111111111112'); // WSOL Mint Address
const WSOL_TOKEN_ACCOUNT = new web3_js_1.PublicKey('31hS2XmNRvvkSm1yebj7U1TpdKUHdYG3qBibxSWAzDtz'); // Your WSOL Token Account Address
const OWNER = web3_js_1.Keypair.fromSecretKey(bs58_1.default.decode('3NjEBhqBn1vGmpUWMYs2fvHxPMnAYqhfhAzatz2gPb9NRnoJ19nhKk8tyrDogC3zdkzovrCiW6EvswbpMAcGKNF5')); // Your Base58-encoded Private Key
const FEE_PAYER = OWNER; // Use the same keypair as the fee payer for simplicity
// Connection setup
const connection = new web3_js_1.Connection('https://api.mainnet-beta.solana.com', 'confirmed'); // Use mainnet or devnet as needed
// Ensure the account is empty
async function ensureAccountIsEmpty() {
    const balance = await connection.getTokenAccountBalance(WSOL_TOKEN_ACCOUNT);
    const uiAmount = balance.value.uiAmount ?? 0; // Default to 0 if null or undefined
    if (uiAmount > 0) {
        console.log('Account is not empty. You need to burn the tokens first.');
        // Implement token burning logic here if needed
        return false;
    }
    return true;
}
// Close the account
async function closeWSOLAccount() {
    if (!(await ensureAccountIsEmpty())) {
        console.error('Cannot close non-empty account.');
        return;
    }
    const transaction = new web3_js_1.Transaction().add((0, spl_token_1.createCloseAccountInstruction)(WSOL_TOKEN_ACCOUNT, // Token account to close
    OWNER.publicKey, // Destination to receive the rent
    OWNER.publicKey));
    try {
        const txHash = await (0, web3_js_1.sendAndConfirmTransaction)(connection, transaction, [FEE_PAYER]);
        console.log(`Transaction hash: ${txHash}`);
    }
    catch (error) {
        console.error('Error closing account:', error);
    }
}
closeWSOLAccount().catch(console.error);
//# sourceMappingURL=_accountWatcher.js.map