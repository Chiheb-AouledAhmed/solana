"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.KNOWN_TOKENS = exports.TIMEOUT = exports.INITIAL_RETRY_DELAY = exports.MAX_RETRIES = exports.POLLING_INTERVAL = exports.BUY_AMOUNT_PERCENTAGE = exports.SOL_BALANCE_THRESHOLD = exports.PROFIT_THRESHOLD = exports.YOUR_PRIVATE_KEY = exports.ACCOUNTS_TO_WATCH = exports.ACCOUNT_TO_WATCH = exports.SOLANA_RPC_URL = exports.TELEGRAM_CHAT_ID = exports.TELEGRAM_BOT_TOKEN = void 0;
// src/config.ts
exports.TELEGRAM_BOT_TOKEN = '7621406584:AAGdf5x4E6PwOimKHIWJt7zAzE2h7RgnqJ8'; // Replace
exports.TELEGRAM_CHAT_ID = '6414626849'; // Replace
exports.SOLANA_RPC_URL = "https://shy-thrilling-putty.solana-mainnet.quiknode.pro/16cb32988e78aca562112a0066e5779a413346cc"; // Replace
exports.ACCOUNT_TO_WATCH = "4oJSHyviDy1dJus8nc2bqmxH8avBNiPSrPuzvvsaC2r7";
exports.ACCOUNTS_TO_WATCH = ["4oJSHyviDy1dJus8nc2bqmxH8avBNiPSrPuzvvsaC2r7"];
exports.YOUR_PRIVATE_KEY = "3NjEBhqBn1vGmpUWMYs2fvHxPMnAYqhfhAzatz2gPb9NRnoJ19nhKk8tyrDogC3zdkzovrCiW6EvswbpMAcGKNF5"; // Replace
exports.PROFIT_THRESHOLD = 1.5; //Sell if price is 1.5x the purchase price
exports.SOL_BALANCE_THRESHOLD = 1.2; // Sell if total SOL balance exceeds this multiple of initial balance
exports.BUY_AMOUNT_PERCENTAGE = 0.95; // Buy with 50% of SOL balance
exports.POLLING_INTERVAL = 10000; // Milliseconds
exports.MAX_RETRIES = 5;
exports.INITIAL_RETRY_DELAY = 2000;
exports.TIMEOUT = 45 * 60 * 1000; // 45 minutes
exports.KNOWN_TOKENS = new Set([
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
    "So11111111111111111111111111111111111111112", // SOL
    // Add more tokens here...
]);
//# sourceMappingURL=_config.js.map