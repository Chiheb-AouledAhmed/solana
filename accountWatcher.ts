import { Connection, PublicKey, ParsedTransactionWithMeta } from '@solana/web3.js';
import { Keypair } from '@solana/web3.js';
import { makeAndExecuteSwap } from './main';
import bs58 from 'bs58';

const SOLANA_RPC_URL = "https://shy-thrilling-putty.solana-mainnet.quiknode.pro/16cb32988e78aca562112a0066e5779a413346cc";
const ACCOUNT_TO_WATCH = "YOUR_ACCOUNT_PUBLIC_KEY_HERE";
const YOUR_PRIVATE_KEY = "3NjEBhqBn1vGmpUWMYs2fvHxPMnAYqhfhAzatz2gPb9NRnoJ19nhKk8tyrDogC3zdkzovrCiW6EvswbpMAcGKNF5";

const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
const watchedAccount = new PublicKey(ACCOUNT_TO_WATCH);

async function getSOLBalance(publicKey: PublicKey): Promise<number> {
    const balance = await connection.getBalance(publicKey);
    return balance / 1e9; // Convert lamports to SOL
}

async function buyNewToken(tokenAddress: string) {
    const privateKeyUint8Array = bs58.decode(YOUR_PRIVATE_KEY);
    const keyPair = Keypair.fromSecretKey(privateKeyUint8Array);
    
    const solBalance = await getSOLBalance(keyPair.publicKey);
    const amountToBuy = solBalance * 0.02; // 50% of SOL balance

    console.log(`Buying token ${tokenAddress} with ${amountToBuy} SOL`);
    
    await makeAndExecuteSwap(
        "So11111111111111111111111111111111111111112", // SOL address
        tokenAddress,
        amountToBuy
    );
}

async function watchTransactions() {
    console.log(`Watching transactions for account: ${ACCOUNT_TO_WATCH}`);

    connection.onLogs(watchedAccount, async (logs, context) => {
        if (logs.err) {
            console.error("Transaction failed:", logs.err);
            return;
        }

        const signature = logs.signature;
        console.log(`New transaction detected: ${signature}`);

        try {
            const transaction = await connection.getParsedTransaction(signature, 'confirmed');
            if (transaction && transaction.meta && transaction.meta.innerInstructions) {
                const solAddress = "So11111111111111111111111111111111111111112";
                for (let ix of transaction.meta.innerInstructions[0].instructions) {
                    if ('parsed' in ix && ix.parsed && ix.programId.toString() === 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') {
                        const tokenAddress = ix.parsed.info?.destination;
                        if (tokenAddress && knownTokens[tokenAddress as keyof typeof knownTokens]) {
                            console.log(`Token ${tokenAddress} is in database. Buying...`);
                            await buyNewToken(tokenAddress);
                        }
                    }
                }
            }
        } catch (error) {
            console.error("Error processing transaction:", error);
        }
    });
}

const knownTokens = {
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v": true, // USDC
    // Add more tokens here...
};

watchTransactions();
