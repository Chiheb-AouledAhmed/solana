"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
// generate_accounts.ts
const web3_js_1 = require("@solana/web3.js");
const fs = __importStar(require("fs"));
const NUM_ACCOUNTS = 34; // Number of accounts to generate
const ACCOUNTS_FILE = 'accounts.json';
function generateAccounts(numAccounts) {
    const accounts = [];
    for (let i = 0; i < numAccounts; i++) {
        accounts.push(web3_js_1.Keypair.generate());
    }
    return accounts;
}
function storeAccounts(accounts, filename) {
    const accountData = accounts.map(account => {
        return {
            publicKey: account.publicKey.toBase58(),
            privateKey: Buffer.from(account.secretKey).toString('base64') // Store as base64 for easier handling
        };
    });
    fs.writeFileSync(filename, JSON.stringify(accountData, null, 2));
    console.log(`Generated and stored ${accounts.length} accounts in ${filename}`);
}
const accounts = generateAccounts(NUM_ACCOUNTS);
storeAccounts(accounts, ACCOUNTS_FILE);
//# sourceMappingURL=generate_accounts.js.map