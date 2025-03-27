"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const fs_1 = __importDefault(require("fs"));
const web3_js_1 = require("@solana/web3.js");
const src_1 = require("../../src");
const nodewallet_1 = __importDefault(require("@coral-xyz/anchor/dist/cjs/nodewallet"));
const anchor_1 = require("@coral-xyz/anchor");
const util_1 = require("../util");
const KEYS_FOLDER = __dirname + "/.keys";
const SLIPPAGE_BASIS_POINTS = 100n;
const main = async () => {
    dotenv_1.default.config();
    if (!process.env.HELIUS_RPC_URL) {
        console.error("Please set HELIUS_RPC_URL in .env file");
        console.error("Example: HELIUS_RPC_URL=https://mainnet.helius-rpc.com/?api-key=<your api key>");
        console.error("Get one at: https://www.helius.dev");
        return;
    }
    const connection = new web3_js_1.Connection(process.env.HELIUS_RPC_URL);
    const wallet = new nodewallet_1.default(new web3_js_1.Keypair()); // Note: Replace with actual wallet
    const provider = new anchor_1.AnchorProvider(connection, wallet, {
        commitment: "finalized",
    });
    const testAccount = (0, util_1.getOrCreateKeypair)(KEYS_FOLDER, "test-account");
    const mint = (0, util_1.getOrCreateKeypair)(KEYS_FOLDER, "mint");
    await (0, util_1.printSOLBalance)(connection, testAccount.publicKey, "Test Account");
    const sdk = new src_1.PumpFunSDK(provider);
    const globalAccount = await sdk.getGlobalAccount();
    console.log("Global Account:", globalAccount);
    const currentSolBalance = await connection.getBalance(testAccount.publicKey);
    if (currentSolBalance === 0) {
        console.log("Please send some SOL to the test account:", testAccount.publicKey.toBase58());
        return;
    }
    // Check if mint already exists
    let boundingCurveAccount = await sdk.getBondingCurveAccount(mint.publicKey);
    if (!boundingCurveAccount) {
        const imagePath = __dirname + "/random.png";
        const imageBuffer = fs_1.default.readFileSync(imagePath);
        const tokenMetadata = {
            name: "TST-7",
            symbol: "TST-7",
            description: "TST-7: This is a test token",
            file: new Blob([imageBuffer], { type: "image/png" }),
        };
        const createResults = await sdk.createAndBuy(testAccount, mint, tokenMetadata, BigInt(Math.floor(0.0001 * web3_js_1.LAMPORTS_PER_SOL)), SLIPPAGE_BASIS_POINTS, {
            unitLimit: 250000,
            unitPrice: 250000,
        });
        if (createResults.success) {
            console.log("Success:", `https://pump.fun/${mint.publicKey.toBase58()}`);
            boundingCurveAccount = await sdk.getBondingCurveAccount(mint.publicKey);
            console.log("Updated Bonding Curve:", boundingCurveAccount);
            await (0, util_1.printSPLBalance)(connection, mint.publicKey, testAccount.publicKey);
        }
    }
    else {
        console.log("Existing Bonding Curve:", boundingCurveAccount);
        console.log("Token Exists:", `https://pump.fun/${mint.publicKey.toBase58()}`);
        await (0, util_1.printSPLBalance)(connection, mint.publicKey, testAccount.publicKey);
    }
    if (boundingCurveAccount) {
        // Buy tokens
        const buyResults = await sdk.buy(testAccount, mint.publicKey, BigInt(Math.floor(0.0001 * web3_js_1.LAMPORTS_PER_SOL)), SLIPPAGE_BASIS_POINTS, {
            unitLimit: 250000,
            unitPrice: 250000,
        });
        if (buyResults.success) {
            await (0, util_1.printSPLBalance)(connection, mint.publicKey, testAccount.publicKey);
            console.log("Post-Buy Bonding Curve:", await sdk.getBondingCurveAccount(mint.publicKey));
        }
        // Sell tokens
        const currentSPLBalance = await (0, util_1.getSPLBalance)(connection, mint.publicKey, testAccount.publicKey);
        if (currentSPLBalance && currentSPLBalance > 0) {
            const sellAmount = BigInt(currentSPLBalance * 10 ** src_1.DEFAULT_DECIMALS);
            const sellResults = await sdk.sell(testAccount, mint.publicKey, sellAmount, SLIPPAGE_BASIS_POINTS, {
                unitLimit: 250000,
                unitPrice: 250000,
            });
            if (sellResults.success) {
                await (0, util_1.printSOLBalance)(connection, testAccount.publicKey, "Post-Sell Balance");
                await (0, util_1.printSPLBalance)(connection, mint.publicKey, testAccount.publicKey, "Post-Sell SPL Balance");
            }
        }
    }
};
main().catch(console.error);
//# sourceMappingURL=index.js.map