import { Connection, PublicKey, ParsedTransactionWithMeta } from '@solana/web3.js';
import { Keypair } from '@solana/web3.js';
import { struct, u8, nu64 } from '@solana/buffer-layout';
import { makeAndExecuteSwap } from './main';
import bs58 from 'bs58';

const SOLANA_RPC_URL = "https://shy-thrilling-putty.solana-mainnet.quiknode.pro/16cb32988e78aca562112a0066e5779a413346cc";
const ACCOUNT_TO_WATCH = "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8";
const YOUR_PRIVATE_KEY = "3NjEBhqBn1vGmpUWMYs2fvHxPMnAYqhfhAzatz2gPb9NRnoJ19nhKk8tyrDogC3zdkzovrCiW6EvswbpMAcGKNF5";

let stopWatching = false; // Flag to stop watching transactions

const knownTokens = {
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v": true, // USDC
    // Add more tokens here...
};

async function getSOLBalance(connection: Connection, publicKey: PublicKey): Promise<number> {
    const balance = await connection.getBalance(publicKey);
    return balance / 1e9; // Convert lamports to SOL
}

async function buyNewToken(connection: Connection, tokenAddress: string) {
    const privateKeyUint8Array = bs58.decode(YOUR_PRIVATE_KEY);
    const keyPair = Keypair.fromSecretKey(privateKeyUint8Array);

    const solBalance = await getSOLBalance(connection, keyPair.publicKey);
    const amountToBuy = solBalance * 1; // 50% of SOL balance

    console.log(`Buying token ${tokenAddress} with ${amountToBuy} SOL`);

    /*await makeAndExecuteSwap(
        "So11111111111111111111111111111111111111112", // SOL address
        tokenAddress,
        amountToBuy
    );*/
}

async function getParsedTransactionWithRetry(
    connection: Connection,
    signature: string,
    options: any,
    maxRetries: number = 5
): Promise<ParsedTransactionWithMeta | null> {
    let retries = 0;
    while (retries < maxRetries) {
        try {
            return await connection.getParsedTransaction(signature, options);
        } catch (error: any) {
            if (error.message && error.message.includes('429 Too Many Requests')) {
                retries++;
                const delay = Math.pow(2, retries) * 1000; // Exponential backoff (1s, 2s, 4s, 8s, 16s)
                console.log(`Rate limited. Retrying transaction ${signature} in ${delay / 1000} seconds... (Attempt ${retries}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, delay));
            } else if (error.message && error.message.includes('Transaction version (0) is not supported')) {
                console.warn(`Transaction version 0 not supported for ${signature}. Skipping.`);
                return null; // Skip this transaction, don't retry.
            } else {
                console.error(`Error fetching transaction ${signature}:`, error); // Log other errors
                throw error; // Re-throw other errors to potentially stop the process
            }
        }
    }
    console.error(`Failed to get transaction ${signature} after ${maxRetries} retries.`);
    return null; // Indicate failure after all retries
}

// Enhanced Swap Verification Function
function isSwapTransaction(transaction: ParsedTransactionWithMeta): boolean {
    if (!transaction || !transaction.meta || !transaction.meta.logMessages) {
        return false;
    }

    const logs = transaction.meta.logMessages;

    // Basic check: look for "program log: ray_log" in logs
    const rayLogPresent = logs.some(log => log.includes('Program log: ray_log'));
    if (!rayLogPresent) {
        return false;
    }

    // More detailed check: Look for specific program IDs and instructions known to Raydium swaps
    const programIds = transaction.transaction.message.instructions.map(ix => ix.programId.toBase58());
    const raydiumProgramIds = [
        '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', // Raydium AMM Program ID
        '2UcZYxtqz6uJZnWmXAaAcig5jVzVvHzNu19Ds3qNap2V'  // Raydium CLMM Program ID
    ];

    const isRaydiumSwap = programIds.some(programId => raydiumProgramIds.includes(programId));

    return isRaydiumSwap;
}

async function processSwapTransaction(connection: Connection, transaction: ParsedTransactionWithMeta, signature: string): Promise<any | null> {
    try {
        if (!transaction.meta?.logMessages) {
            console.log(`No logs found for transaction ${signature}`);
            return null;
        }

        const logs = transaction.meta.logMessages;

        if (!isSwapTransaction(transaction)) {
            console.log('This transaction does not appear to be a swap.');
            return null;
        }

        console.log('This transaction appears to be a swap.');

        // Extract swap details from logs
        const swapInfo = parseSwapInfo(logs);

        if (!swapInfo) {
            console.log(`Could not find swap info for transaction ${signature}`);
            return null;
        }

        const { inToken, outToken } = determineInOutTokens(transaction, swapInfo);

        // Check if inToken and outToken are defined before using them
        if (!inToken || !outToken) {
            console.log("Could not determine inToken or outToken for this swap.");
            return null;
        }

        const swapDetails = {
            inToken: inToken.toBase58(),
            outToken: outToken.toBase58(),
            amountIn: swapInfo.amount_in,
            amountOut: swapInfo.out_amount
        };

        console.log(`Swap Details for ${signature}:`, swapDetails);

        return swapDetails;

    } catch (error) {
        console.error(`Error processing transaction ${signature}:`, error);
        return null;
    }
}

// Helper function to parse swap info from logs
function parseSwapInfo(logs: string[]): any {
    for (const log of logs) {
        if (log.includes('ray_log')) {
            const parts = log.split('ray_log:');
            if (parts.length > 1) {
                const logData = Buffer.from(parts[1].trim(), 'base64');
                if (logData.length > 0) {
                    const logType = logData[0];
                    const logStruct = logTypeToStruct.get(logType);

                    if (logStruct && typeof logStruct.decode === 'function') {
                        return logStruct.decode(logData);
                    }
                }
            }
        }
    }
    return null;
}

// Helper function to determine in and out tokens
function determineInOutTokens(transaction: ParsedTransactionWithMeta, swapInfo: any): { inToken: PublicKey, outToken: PublicKey } {
    const preBalances = new Map<string, Map<number, bigint>>();
    const postBalances = new Map<string, Map<number, bigint>>();
    const netChanges = new Map<string, Map<number, bigint>>();

    transaction.meta?.preTokenBalances?.forEach(balance => {
        if (!preBalances.has(balance.mint)) {
            preBalances.set(balance.mint, new Map<number, bigint>());
        }
        preBalances.get(balance.mint)!.set(balance.accountIndex, BigInt(balance.uiTokenAmount.amount));
    });

    transaction.meta?.postTokenBalances?.forEach(balance => {
        if (!postBalances.has(balance.mint)) {
            postBalances.set(balance.mint, new Map<number, bigint>());
        }
        postBalances.get(balance.mint)!.set(balance.accountIndex, BigInt(balance.uiTokenAmount.amount));

        if (!netChanges.has(balance.mint)) {
            netChanges.set(balance.mint, new Map<number, bigint>());
        }
        const preBalance = preBalances.get(balance.mint)?.get(balance.accountIndex) || BigInt(0);
        const change = postBalances.get(balance.mint)!.get(balance.accountIndex)! - preBalance;
        netChanges.get(balance.mint)!.set(balance.accountIndex, change);
    });

    let inToken: string | null = null;
    let outToken: string | null = null;

    for (const [mint, changes] of netChanges) {
        for (const change of changes.values()) {
            if (Math.abs(Number(change)) === swapInfo.amount_in) {
                inToken = mint;
            } else if (Math.abs(Number(change)) === swapInfo.out_amount) {
                outToken = mint;
            }
        }
    }

    if (!inToken || !outToken) {
        throw new Error('Could not determine in and out tokens');
    }

    return {
        inToken: new PublicKey(inToken),
        outToken: new PublicKey(outToken)
    };
}

const swapBaseInLog  = struct<{
    log_type: number,
    amount_in: bigint,
    minimum_out: bigint,
    direction: bigint,
    user_source: bigint,
    pool_coin: bigint,
    pool_pc: bigint,
    out_amount: bigint
}>([
    u8('log_type'),
    nu64('amount_in'),
    nu64('minimum_out'),
    nu64('direction'),
    nu64('user_source'),
    nu64('pool_coin'),
    nu64('pool_pc'),
    nu64('out_amount'),
]);

const swapBaseOutLog = struct<{
    log_type: number,
    max_in: bigint,
    amount_out: bigint,
    direction: bigint,
    user_source: bigint,
    pool_coin: bigint,
    pool_pc: bigint,
    deduct_in: bigint
}>([
    u8('log_type'),
    nu64('max_in'),
    nu64('amount_out'),
    nu64('direction'),
    nu64('user_source'),
    nu64('pool_coin'),
    nu64('pool_pc'),
    nu64('deduct_in'),
]);
const logTypeToStruct = new Map<number, any>([
    [3, swapBaseInLog],
    [4, swapBaseOutLog],
]);


async function watchTransactions() {
    console.log('Monitoring Raydium transactions...');
    const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
    const watchedAccount = new PublicKey(ACCOUNT_TO_WATCH);
    let lastSignature = ''; // Keep track of the last processed signature

    while (!stopWatching) {
        try {
            const signatures = await connection.getSignaturesForAddress(
                watchedAccount,
                {
                    limit: 10 // Fetch up to 10 signatures
                },
                'confirmed'
            );

            for (const signatureInfo of signatures) {
                const signature = signatureInfo.signature;
                if (signature !== lastSignature) {
                    lastSignature = signature;
                    console.log(`New transaction detected: ${signature}`);

                    try {
                        const transaction = await getParsedTransactionWithRetry(
                            connection,
                            signature,
                            {
                                commitment: 'confirmed',
                                maxSupportedTransactionVersion: 0
                            }
                        );

                        if (transaction) {
                            const swapDetails = await processSwapTransaction(connection, transaction, signature);
                            if (swapDetails) {
                                console.log(`Swap Details: ${JSON.stringify(swapDetails)}`);
                                // Process the swap details further if needed
                                const tokenAddress = swapDetails.outToken;
                                if (tokenAddress && !knownTokens[tokenAddress as keyof typeof knownTokens]) {
                                    console.log(`Token ${tokenAddress} is NOT in database. Buying...`);
                                    await buyNewToken(connection, tokenAddress);
                                    stopWatching = true;
                                    console.log('Transaction watching stopped.');
                                    break; // Exit the loop after buying
                                } else {
                                    console.log(`Token ${tokenAddress} is already known.`);
                                }
                            }
                        } else {
                            console.log(`Transaction ${signature} could not be fetched or was skipped.`);
                        }
                    } catch (error) {
                        console.error("Error processing transaction:", error);
                    }
                }
            }
        } catch (error) {
            console.error("Error fetching signatures:", error);
        }

        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds before polling again
    }
}

watchTransactions();
