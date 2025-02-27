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
const WSOL_TOKEN_ACCOUNT = new web3_js_1.PublicKey('Ad3ebKYgcmC9tsvADyhksKs1Cm2mbXgsuiZvoSN6kZGE'); // Your WSOL Token Account Address
const DESTINATION_TOKEN_ACCOUNT = new web3_js_1.PublicKey('6XYUiKWDkRTdU81K8sXdGERRB15gesXmikGiaxLbX723'); // Destination Token Account Address
const OWNER = web3_js_1.Keypair.fromSecretKey(bs58_1.default.decode('3NjEBhqBn1vGmpUWMYs2fvHxPMnAYqhfhAzatz2gPb9NRnoJ19nhKk8tyrDogC3zdkzovrCiW6EvswbpMAcGKNF5')); // Your Base58-encoded Private Key
const FEE_PAYER = OWNER; // Use the same keypair as the fee payer for simplicity
// Connection setup
const connection = new web3_js_1.Connection('https://api.mainnet-beta.solana.com', 'confirmed'); // Use mainnet or devnet as needed
// Function to transfer tokens
async function transferTokens() {
    try {
        const balance = await connection.getTokenAccountBalance(WSOL_TOKEN_ACCOUNT);
        if (balance.value.uiAmount === null || balance.value.uiAmount === 0) {
            console.log('Account is already empty.');
            return;
        }
        let decimals = balance.value.decimals ?? 0;
        let amount = ((balance.value.uiAmount ?? 0) * Math.pow(10, decimals));
        const transaction = new web3_js_1.Transaction().add((0, spl_token_1.createTransferInstruction)(WSOL_TOKEN_ACCOUNT, // Source token account // Mint of the token to transfer
        DESTINATION_TOKEN_ACCOUNT, // Destination token account
        OWNER.publicKey, // Authority (owner of the source token account)
        amount));
        const txHash = await (0, web3_js_1.sendAndConfirmTransaction)(connection, transaction, [FEE_PAYER]);
        console.log(`Transfer transaction hash: ${txHash}`);
    }
    catch (error) {
        console.error('Error transferring tokens:', error);
    }
}
// Function to close account
async function closeAccountAfterTransfer() {
    try {
        const balance = await connection.getTokenAccountBalance(WSOL_TOKEN_ACCOUNT);
        if (balance.value.uiAmount !== null && balance.value.uiAmount > 0) {
            console.error('Account is not empty. Transfer tokens first.');
            return;
        }
        const transaction = new web3_js_1.Transaction().add((0, spl_token_1.createCloseAccountInstruction)(WSOL_TOKEN_ACCOUNT, // Token account to close
        OWNER.publicKey, // Destination to receive the rent
        OWNER.publicKey));
        const txHash = await (0, web3_js_1.sendAndConfirmTransaction)(connection, transaction, [FEE_PAYER]);
        console.log(`Close account transaction hash: ${txHash}`);
    }
    catch (error) {
        console.error('Error closing account:', error);
    }
}
// Execute both steps sequentially
async function main() {
    await transferTokens();
    await closeAccountAfterTransfer();
}
main().catch(console.error);
//# sourceMappingURL=_main.js.map