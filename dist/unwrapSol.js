"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const web3_js_1 = require("@solana/web3.js");
const spl_token_1 = require("@solana/spl-token");
const bs58_1 = __importDefault(require("bs58"));
const SOLANA_RPC_URL = "https://shy-thrilling-putty.solana-mainnet.quiknode.pro/16cb32988e78aca562112a0066e5779a413346cc";
const YOUR_PRIVATE_KEY = "3NjEBhqBn1vGmpUWMYs2fvHxPMnAYqhfhAzatz2gPb9NRnoJ19nhKk8tyrDogC3zdkzovrCiW6EvswbpMAcGKNF5";
const connection = new web3_js_1.Connection(SOLANA_RPC_URL, 'confirmed');
async function unwrapWSOL(keyPair) {
    const wSOLTokenAccount = await (0, spl_token_1.getAssociatedTokenAddress)(spl_token_1.NATIVE_MINT, keyPair.publicKey, false, // allowOwnerOffCurve
    spl_token_1.TOKEN_PROGRAM_ID);
    try {
        await (0, spl_token_1.closeAccount)(connection, keyPair, wSOLTokenAccount, keyPair.publicKey, keyPair);
        console.log("wSOL unwrapped successfully.");
    }
    catch (error) {
        console.error("Error unwrapping wSOL:", error);
    }
}
// Example usage
(async () => {
    const privateKeyUint8Array = bs58_1.default.decode(YOUR_PRIVATE_KEY);
    const keyPair = web3_js_1.Keypair.fromSecretKey(privateKeyUint8Array);
    await unwrapWSOL(keyPair);
})();
//# sourceMappingURL=unwrapSol.js.map