// src/config.ts
import dotenv from 'dotenv';
dotenv.config();

export const TELEGRAM_BOT_TOKEN = '7621406584:AAGdf5x4E6PwOimKHIWJt7zAzE2h7RgnqJ8'; // Replace
export const TELEGRAM_CHAT_ID = '6414626849';   // Replace
export const SOLANA_RPC_URL = "https://mainnet.helius-rpc.com/?api-key=0999048a-e70c-4269-8c2a-456ceee2c969"; // Replace
export const ACCOUNT_TO_WATCH = "4oJSHyviDy1dJus8nc2bqmxH8avBNiPSrPuzvvsaC2r7";
export const ACCOUNTS_TO_WATCH = process.env.ACCOUNTS_TO_WATCH?.split(','); //["4oJSHyviDy1dJus8nc2bqmxH8avBNiPSrPuzvvsaC2r7"]
export const YOUR_PRIVATE_KEY = "3NjEBhqBn1vGmpUWMYs2fvHxPMnAYqhfhAzatz2gPb9NRnoJ19nhKk8tyrDogC3zdkzovrCiW6EvswbpMAcGKNF5"; // Replace
export const PROFIT_THRESHOLD = 1.5; //Sell if price is 1.5x the purchase price
export const SOL_BALANCE_THRESHOLD = 1.2; // Sell if total SOL balance exceeds this multiple of initial balance
export const BUY_AMOUNT_PERCENTAGE = 0.5; // Buy with 50% of SOL balance
export const POLLING_INTERVAL = 10000; // Milliseconds
export const MAX_RETRIES = 7;
export const INITIAL_RETRY_DELAY = 2000;
export const CENTRAL_WALLET_PRIVATE_KEY ="3NjEBhqBn1vGmpUWMYs2fvHxPMnAYqhfhAzatz2gPb9NRnoJ19nhKk8tyrDogC3zdkzovrCiW6EvswbpMAcGKNF5";
export const ACCOUNTS_FILE = "accounts.json";
export const TIMEOUT = 15 * 60 * 1000; // 45 minutes
export const SLIPPAGE_BASIS_POINTS = 100n;
export const KNOWN_TOKENS: Set<string> = new Set([
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
    "So11111111111111111111111111111111111111112", // SOL
    // Add more tokens here...
]);

