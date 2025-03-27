import dotenv from "dotenv";
import fs from "fs";
import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { DEFAULT_DECIMALS, PumpFunSDK } from "../../src";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import { AnchorProvider } from "@coral-xyz/anchor";
import {
  getOrCreateKeypair,
  getSPLBalance,
  printSOLBalance,
  printSPLBalance,
} from "../util";

const KEYS_FOLDER = __dirname + "/.keys";
const SLIPPAGE_BASIS_POINTS = 100n;

const main = async () => {
  dotenv.config();

  if (!process.env.HELIUS_RPC_URL) {
    console.error("Please set HELIUS_RPC_URL in .env file");
    console.error(
      "Example: HELIUS_RPC_URL=https://mainnet.helius-rpc.com/?api-key=<your api key>"
    );
    console.error("Get one at: https://www.helius.dev");
    return;
  }

  const connection = new Connection(process.env.HELIUS_RPC_URL);
  const wallet = new NodeWallet(new Keypair()); // Note: Replace with actual wallet
  const provider = new AnchorProvider(connection, wallet, {
    commitment: "finalized",
  });

  const testAccount = getOrCreateKeypair(KEYS_FOLDER, "test-account");
  const mint = getOrCreateKeypair(KEYS_FOLDER, "mint");

  await printSOLBalance(connection, testAccount.publicKey, "Test Account");

  const sdk = new PumpFunSDK(provider);
  const globalAccount = await sdk.getGlobalAccount();
  console.log("Global Account:", globalAccount);

  const currentSolBalance = await connection.getBalance(testAccount.publicKey);
  if (currentSolBalance === 0) {
    console.log(
      "Please send some SOL to the test account:",
      testAccount.publicKey.toBase58()
    );
    return;
  }

  // Check if mint already exists
  let boundingCurveAccount = await sdk.getBondingCurveAccount(mint.publicKey);
  
  if (!boundingCurveAccount) {
    const imagePath = __dirname + "/random.png";
    const imageBuffer = fs.readFileSync(imagePath);
    
    const tokenMetadata = {
      name: "TST-7",
      symbol: "TST-7",
      description: "TST-7: This is a test token",
      file: new Blob([imageBuffer], { type: "image/png" }),
    };

    const createResults = await sdk.createAndBuy(
      testAccount,
      mint,
      tokenMetadata,
      BigInt(Math.floor(0.0001 * LAMPORTS_PER_SOL)),
      SLIPPAGE_BASIS_POINTS,
      {
        unitLimit: 250000,
        unitPrice: 250000,
      }
    );

    if (createResults.success) {
      console.log("Success:", `https://pump.fun/${mint.publicKey.toBase58()}`);
      boundingCurveAccount = await sdk.getBondingCurveAccount(mint.publicKey);
      console.log("Updated Bonding Curve:", boundingCurveAccount);
      await printSPLBalance(connection, mint.publicKey, testAccount.publicKey);
    }
  } else {
    console.log("Existing Bonding Curve:", boundingCurveAccount);
    console.log("Token Exists:", `https://pump.fun/${mint.publicKey.toBase58()}`);
    await printSPLBalance(connection, mint.publicKey, testAccount.publicKey);
  }

  if (boundingCurveAccount) {
    // Buy tokens
    const buyResults = await sdk.buy(
      testAccount,
      mint.publicKey,
      BigInt(Math.floor(0.0001 * LAMPORTS_PER_SOL)),
      SLIPPAGE_BASIS_POINTS,
      {
        unitLimit: 250000,
        unitPrice: 250000,
      }
    );

    if (buyResults.success) {
      await printSPLBalance(connection, mint.publicKey, testAccount.publicKey);
      console.log(
        "Post-Buy Bonding Curve:",
        await sdk.getBondingCurveAccount(mint.publicKey)
      );
    }

    // Sell tokens
    const currentSPLBalance = await getSPLBalance(
      connection,
      mint.publicKey,
      testAccount.publicKey
    );
    
    if (currentSPLBalance && currentSPLBalance > 0) {
      const sellAmount = BigInt(currentSPLBalance * 10 ** DEFAULT_DECIMALS);
      
      const sellResults = await sdk.sell(
        testAccount,
        mint.publicKey,
        sellAmount,
        SLIPPAGE_BASIS_POINTS,
        {
          unitLimit: 250000,
          unitPrice: 250000,
        }
      );

      if (sellResults.success) {
        await printSOLBalance(connection, testAccount.publicKey, "Post-Sell Balance");
        await printSPLBalance(
          connection,
          mint.publicKey,
          testAccount.publicKey,
          "Post-Sell SPL Balance"
        );
      }
    }
  }
};

main().catch(console.error);
