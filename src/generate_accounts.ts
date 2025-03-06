// generate_accounts.ts
import { Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import * as fs from 'fs';

const NUM_ACCOUNTS = 34; // Number of accounts to generate
const ACCOUNTS_FILE = 'accounts.json';

function generateAccounts(numAccounts: number): Keypair[] {
    const accounts: Keypair[] = [];
    for (let i = 0; i < numAccounts; i++) {
        accounts.push(Keypair.generate());
    }
    return accounts;
}

function storeAccounts(accounts: Keypair[], filename: string): void {
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

