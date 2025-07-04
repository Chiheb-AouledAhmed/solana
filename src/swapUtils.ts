// src/swapUtils.ts
import { struct, u8, nu64 ,seq,u48} from '@solana/buffer-layout';
import { SwapDetails, SwapBaseInLog, SwapBaseOutLog, LogTypeToStruct } from './_types';
import bs58 from 'bs58';
// src/swapUtils.ts
import {
    Connection,
    PublicKey,
    TransactionInstruction,
    Keypair,
    SystemProgram,
    VersionedTransaction,
    ComputeBudgetProgram,
    TransactionMessage,
    SendTransactionError,
    ParsedTransactionWithMeta,
    ParsedInstruction,
    PartiallyDecodedInstruction
} from "@solana/web3.js";
import {
    TOKEN_PROGRAM_ID,
    NATIVE_MINT,
    getOrCreateAssociatedTokenAccount,
    createSyncNativeInstruction,
    Account
} from "@solana/spl-token";
import {
    LIQUIDITY_STATE_LAYOUT_V4,
    LiquidityPoolKeysV4,
    MAINNET_PROGRAM_ID,
    MARKET_STATE_LAYOUT_V3,
    Liquidity,
    LiquidityPoolInfo,
    Token,
    TokenAmount,
    Percent
} from "@raydium-io/raydium-sdk";
import { Raydium } from '@raydium-io/raydium-sdk-v2'
import BN from "bn.js";
import { getParsedTransactionWithRetry} from './_utils';

export async function pollTransactionsForSwap(
  tokenAddress: string,
  programId: string,
  connection: Connection,
): Promise<ParsedInstruction | PartiallyDecodedInstruction | undefined> {
  try {
    const tokenPublicKey = new PublicKey(tokenAddress);
    const programIdPublicKey = new PublicKey(programId);
    let lastSlot = await connection.getSlot('finalized');
    while (true) {
      // Fetch the latest transactions for the account
      const signatures = await connection.getSignaturesForAddress(
        tokenPublicKey,
        {
            limit: 10
        },
        'confirmed'
    );

      // Loop through each transaction
      for (const signatureInfo of signatures)  {
        // Fetch the transaction details
        const transactionDetails = await connection.getParsedTransaction(signatureInfo.signature, {
            maxSupportedTransactionVersion: 0,
          commitment: 'confirmed',
        });

        if (transactionDetails && transactionDetails.transaction) {
          // Loop through each instruction in the transaction
          for (const instruction of transactionDetails.transaction.message.instructions) {
            // Check if the instruction's program ID matches the target program ID
            if (instruction.programId.toBase58() === programIdPublicKey.toBase58()) {
              // Found a matching swap transaction, return the instruction
              return instruction;
            }
          }
        }
      }

      // Wait for 1 second before checking again
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Update the last slot to ensure we don't miss transactions
      const currentSlot = await connection.getSlot('finalized');
      if (currentSlot > lastSlot) {
        lastSlot = currentSlot;
      }
    }
  } catch (error) {
    console.error('Error polling transactions:', error);
  }
}



// Enhanced Swap Verification Function
export function isSwapTransaction(transaction: ParsedTransactionWithMeta): boolean {
    if (!transaction || !transaction.meta || !transaction.meta.logMessages) {
        return false;
    }

    const logs = transaction.meta.logMessages;
    // Basic check: look for "program log: ray_log" in logs
    const rayLogPresent = logs.some(log => log.includes('Program log: ray_log'));
    /*if (!rayLogPresent) {
        return false;
    }*/

    // More detailed check: Look for specific program IDs and instructions known to Raydium swaps
    const programIds = transaction.transaction.message.instructions.map(ix => ix.programId.toBase58());
    const raydiumProgramIds = [
        "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
        '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', // Raydium AMM Program ID
        '2UcZYxtqz6uJZnWmXAaAcig5jVzVvHzNu19Ds3qNap2V',
        "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",
        "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"// Raydium CLMM Program ID
    ];
    const isRaydiumSwap = programIds.some(programId => raydiumProgramIds.includes(programId));
    return isRaydiumSwap;
}

export async function processSwapTransaction(connection: any, transaction: ParsedTransactionWithMeta, signature: string): Promise<SwapDetails | null> {
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

        const swapDetails: SwapDetails = {
            inToken: inToken.toBase58(),
            outToken: outToken.toBase58(),
            amountIn: swapInfo.amount_in,
            amountOut: swapInfo.out_amount
        };
        console.log(`Swap Details for ${signature}:`, swapDetails);
        console.log(`Date: ${new Date().toLocaleString()}`);
        return swapDetails;
    } catch (error) {
        console.error(`Error processing transaction ${signature}:`, error);
        return null;
    }
}

// Helper function to parse swap info from logs
export function parseSwapInfo(logs: string[]): any {
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
export function determineInOutTokens(transaction: ParsedTransactionWithMeta, swapInfo: any): { inToken: PublicKey, outToken: PublicKey } {
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
            if (Math.abs(Number(change)) === Number(swapInfo.amount_in)) {
                inToken = mint;
            } else if (Math.abs(Number(change)) === Number(swapInfo.out_amount)) {
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

export const swapBaseInLog = struct<SwapBaseInLog>([
    u8('log_type'),
    nu64('amount_in'),
    nu64('minimum_out'),
    nu64('direction'),
    nu64('user_source'),
    nu64('pool_coin'),
    nu64('pool_pc'),
    nu64('out_amount')
]);

export const swapBaseOutLog = struct<SwapBaseOutLog>([
    u8('log_type'),
    nu64('max_in'),
    nu64('amount_out'),
    nu64('direction'),
    nu64('user_source'),
    nu64('pool_coin'),
    nu64('pool_pc'),
    nu64('deduct_in')
]);

export const logTypeToStruct = new Map<number, any>([
    [3, swapBaseInLog],
    [4, swapBaseOutLog],
]);



// Raydium Pool Functions
export async function getPoolId(connection: Connection, tokenAAddress: string, tokenBAddress: string): Promise<string >  {
    const raydium = await Raydium.load({
        connection: connection,
        cluster: 'mainnet',
        disableFeatureCheck: true,
        disableLoadToken: true,
        blockhashCommitment: "confirmed",
    });
    const data = await raydium.api.fetchPoolByMints({
        mint1: tokenAAddress,
        mint2: tokenBAddress
    });
    const pools = data.data;
    for (const obj of pools) {
        if (obj.type === "Standard") {
            if(obj.id)
                return obj.id; // This is the POOL_ID
            return "";
        }
    }
    return ""; // Return null if no suitable pool is found
}







export const getPoolKeysFromParsedInstruction = async (
    instruction: ParsedInstruction | PartiallyDecodedInstruction,
    connection: Connection,
  )=> {
    //try {
      // Check if the instruction is a Raydium swap instruction
       {
        // Extract the pool ID from the instruction keys
        let poolId: PublicKey | undefined;
        if ('parsed' in instruction) {
          // For ParsedInstruction
          poolId = instruction.parsed.info.programId === MAINNET_PROGRAM_ID.AmmV4.toString()
            ? instruction.parsed.info.accounts.find((account:any) => account.account === 'pool')?.publicKey
            : "";
        } else if ('programId' in instruction) {
          // For PartiallyDecodedInstruction
          poolId = instruction.accounts[1];
          //find((account:any) => account.isWritable && account.pubkey.toString() !== TOKEN_PROGRAM_ID.toString())?.pubkey;
        } else {
          console.error('Unsupported instruction type.');
          return "";
        }
        if(poolId)
            return poolId.toBase58();
        return "";
    }}
        /*if (!poolId) {
          console.error('Could not find pool ID in instruction keys.');
          return undefined;
        }
  
        // Fetch the pool account info
        const ammAccount = await connection.getAccountInfo(poolId);
        if (!ammAccount) {
          console.error('Could not fetch pool account info.');
          return undefined;
        }
  
        /*
        // Decode the pool state
        const poolState = LIQUIDITY_STATE_LAYOUT_V4.decode(ammAccount.data);
  
        // Fetch the market account info
        const marketAccount = await connection.getAccountInfo(poolState.marketId);
        if (!marketAccount) {
          console.error('Could not fetch market account info.');
          return undefined;
        }
  
        // Decode the market state
        const marketState = MARKET_STATE_LAYOUT_V3.decode(marketAccount.data);
  
        // Compute the market authority
        const marketAuthority = PublicKey.createProgramAddressSync(
          [
            marketState.ownAddress.toBuffer(),
            marketState.vaultSignerNonce.toArrayLike(Buffer, "le", 8),
          ],
          MAINNET_PROGRAM_ID.OPENBOOK_MARKET,
        );
  
        // Construct the pool keys
        return {
          id: poolId,
          programId: MAINNET_PROGRAM_ID.AmmV4,
          status: poolState.status,
          baseDecimals: poolState.baseDecimal.toNumber(),
          quoteDecimals: poolState.quoteDecimal.toNumber(),
          lpDecimals: 9,
          baseMint: poolState.baseMint,
          quoteMint: poolState.quoteMint,
          version: 4,
          authority: new PublicKey(
            "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1",
          ),
          openOrders: poolState.openOrders,
          baseVault: poolState.baseVault,
          quoteVault: poolState.quoteVault,
          marketProgramId: MAINNET_PROGRAM_ID.OPENBOOK_MARKET,
          marketId: marketState.ownAddress,
          marketBids: marketState.bids,
          marketAsks: marketState.asks,
          marketEventQueue: marketState.eventQueue,
          marketBaseVault: marketState.baseVault,
          marketQuoteVault: marketState.quoteVault,
          marketAuthority: marketAuthority,
          targetOrders: poolState.targetOrders,
          lpMint: poolState.lpMint,
          withdrawQueue: poolState.withdrawQueue,
          lpVault: poolState.lpVault,
          marketVersion: 3,
          lookupTableAccount: PublicKey.default
        } as LiquidityPoolKeysV4;
      } 
    } catch (error) {
      console.error("getPoolKeysFromParsedInstruction error:", error);
    }
    return undefined;
    
  };*/

  


export const getPoolKeys = async (ammId: string, connection: Connection): Promise<LiquidityPoolKeysV4 | undefined> => {
    try {
        const ammAccount = await connection.getAccountInfo(new PublicKey(ammId));
        if (ammAccount) {
            const poolState = LIQUIDITY_STATE_LAYOUT_V4.decode(ammAccount.data);
            const marketAccount = await connection.getAccountInfo(poolState.marketId);
            if (marketAccount) {
                const marketState = MARKET_STATE_LAYOUT_V3.decode(marketAccount.data);
                const marketAuthority = PublicKey.createProgramAddressSync(
                    [
                        marketState.ownAddress.toBuffer(),
                        marketState.vaultSignerNonce.toArrayLike(Buffer, "le", 8),
                    ],
                    MAINNET_PROGRAM_ID.OPENBOOK_MARKET,
                );
                return {
                    id: new PublicKey(ammId),
                    programId: MAINNET_PROGRAM_ID.AmmV4,
                    status: poolState.status,
                    baseDecimals: poolState.baseDecimal.toNumber(),
                    quoteDecimals: poolState.quoteDecimal.toNumber(),
                    lpDecimals: 9,
                    baseMint: poolState.baseMint,
                    quoteMint: poolState.quoteMint,
                    version: 4,
                    authority: new PublicKey(
                        "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1",
                    ),
                    openOrders: poolState.openOrders,
                    baseVault: poolState.baseVault,
                    quoteVault: poolState.quoteVault,
                    marketProgramId: MAINNET_PROGRAM_ID.OPENBOOK_MARKET,
                    marketId: marketState.ownAddress,
                    marketBids: marketState.bids,
                    marketAsks: marketState.asks,
                    marketEventQueue: marketState.eventQueue,
                    marketBaseVault: marketState.baseVault,
                    marketQuoteVault: marketState.quoteVault,
                    marketAuthority: marketAuthority,
                    targetOrders: poolState.targetOrders,
                    lpMint: poolState.lpMint,
                    withdrawQueue: poolState.withdrawQueue,
                    lpVault: poolState.lpVault,
                    marketVersion: 3,
                    lookupTableAccount: PublicKey.default
                } as LiquidityPoolKeysV4;
            }
        }
    } catch (error) {
        console.error("getPoolKeys error:", error);
    }
    return undefined;
};

export const  makeSwapInstruction = async (
    connection: Connection,
    tokenInAddress: string,
    tokenOutAddress: string,
    rawAmountIn: number,
    slippage: number,
    poolKeys: LiquidityPoolKeysV4,
    poolInfo: LiquidityPoolInfo,
    keyPair: Keypair,
) => {
    const tokenInMint = new PublicKey(tokenInAddress);
    const tokenOutMint = new PublicKey(tokenOutAddress);
    const tokenInDecimals = poolKeys.baseMint.equals(tokenInMint) ? poolKeys.baseDecimals : poolKeys.quoteDecimals;
    const tokenOutDecimals = poolKeys.baseMint.equals(tokenOutMint) ? poolKeys.baseDecimals : poolKeys.quoteDecimals;
    const amountInRaw = new BN(rawAmountIn * (10 ** tokenInDecimals));
    const amountOutParams = Liquidity.computeAmountOut({
        poolKeys,
        poolInfo,
        amountIn: new TokenAmount(new Token(TOKEN_PROGRAM_ID, tokenInMint, tokenInDecimals), amountInRaw),
        currencyOut: new Token(TOKEN_PROGRAM_ID, tokenOutMint, tokenOutDecimals),
        slippage: new Percent(slippage, 100),
    });

    let tokenInAccount: PublicKey;
    let tokenOutAccount: PublicKey;

    if (tokenInMint.equals(NATIVE_MINT)) {
        tokenInAccount = (
            await getOrCreateAssociatedTokenAccountWithRetry(
                connection,
                keyPair,
                NATIVE_MINT,
                keyPair.publicKey,
            )
        ).address;
    } else {
        tokenInAccount = (
            await getOrCreateAssociatedTokenAccountWithRetry(
                connection,
                keyPair,
                tokenInMint,
                keyPair.publicKey,
            )
        ).address;
    }

    if (tokenOutMint.equals(NATIVE_MINT)) {
        tokenOutAccount = (
            await getOrCreateAssociatedTokenAccountWithRetry(
                connection,
                keyPair,
                NATIVE_MINT,
                keyPair.publicKey
            )
        ).address;
    } else {
        tokenOutAccount = (
            await getOrCreateAssociatedTokenAccountWithRetry(
                connection,
                keyPair,
                tokenOutMint,
                keyPair.publicKey,
            )
        ).address;
    }

    const ix = new TransactionInstruction({
        programId: new PublicKey(poolKeys.programId),
        keys: [
            { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
            { pubkey: poolKeys.id, isSigner: false, isWritable: true },
            { pubkey: poolKeys.authority, isSigner: false, isWritable: false },
            { pubkey: poolKeys.openOrders, isSigner: false, isWritable: true },
            { pubkey: poolKeys.baseVault, isSigner: false, isWritable: true },
            { pubkey: poolKeys.quoteVault, isSigner: false, isWritable: true },
            { pubkey: poolKeys.marketProgramId, isSigner: false, isWritable: false },
            { pubkey: poolKeys.marketId, isSigner: false, isWritable: true },
            { pubkey: poolKeys.marketBids, isSigner: false, isWritable: true },
            { pubkey: poolKeys.marketAsks, isSigner: false, isWritable: true },
            { pubkey: poolKeys.marketEventQueue, isSigner: false, isWritable: true },
            { pubkey: poolKeys.marketBaseVault, isSigner: false, isWritable: true },
            { pubkey: poolKeys.marketQuoteVault, isSigner: false, isWritable: true },
            { pubkey: poolKeys.marketAuthority, isSigner: false, isWritable: false },
            { pubkey: tokenInAccount, isSigner: false, isWritable: true },
            { pubkey: tokenOutAccount, isSigner: false, isWritable: true },
            { pubkey: keyPair.publicKey, isSigner: true, isWritable: false },
        ],
        data: Buffer.from(
            Uint8Array.of(
                9,
                ...amountInRaw.toArray("le", 8),
                ...amountOutParams.minAmountOut.raw.toArray("le", 8),
            ),
        ),
    });

    return {
        swapIX: ix,
        tokenInAccount: tokenInAccount,
        tokenOutAccount: tokenOutAccount,
        tokenInMint,
        tokenOutMint,
        amountIn: amountInRaw,
        minAmountOut: amountOutParams.minAmountOut,
    };
};

export async function executeVersionedTransaction(connection: Connection, transaction: VersionedTransaction, signers: Keypair[]): Promise<string | false> {
    const MAX_RETRIES = 5;
    const INITIAL_BACKOFF = 1000; // 1 second

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
            transaction.message.recentBlockhash = blockhash;
            transaction.sign(signers);

            const signature = await connection.sendRawTransaction(transaction.serialize(), {
                skipPreflight: true,
                preflightCommitment: 'confirmed',
            });

            console.log(`Transaction sent. Signature: ${signature}`);

            const confirmation = await connection.confirmTransaction({
                signature,
                blockhash,
                lastValidBlockHeight,
            }, 'confirmed');

            if (confirmation.value.err) {
                throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
            }

            console.log(`Transaction confirmed: ${signature}`);
            return signature;

        } catch (error) {
            console.error(`Attempt ${attempt + 1} failed:`, error);
            if (error instanceof SendTransactionError) {
                console.error('SendTransactionError:', error.message);
                console.error('Logs:', error.logs);
            }

            if (attempt === MAX_RETRIES - 1) {
                console.error("Transaction failed after maximum retries");
                return false;
            }

            const delay = INITIAL_BACKOFF * Math.pow(2, attempt);
            console.log(`Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    return false;
}

export async function getOrCreateAssociatedTokenAccountWithRetry(
    connection: Connection,
    payer: Keypair,
    mint: PublicKey,
    owner: PublicKey,
    maxRetries = 3,
    delay = 1000
): Promise<Account> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const account = await getOrCreateAssociatedTokenAccount(
                connection,
                payer,
                mint,
                owner
            );
            return account;
        } catch (error) {
            console.error(`Attempt ${attempt + 1} failed: ${error instanceof Error ? error.message : String(error)}`);
            if (attempt === maxRetries - 1) throw error;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    throw new Error("Failed to get or create associated token account after max retries");
}


export async function processTransferTransaction(
    transaction: ParsedTransactionWithMeta,
): Promise<Set<TransferDetails> | null> {
    try {
        const transferInstructions = transaction.transaction.message.instructions.filter((instruction) => {
            if ('programId' in instruction) {
                return instruction.programId.toBase58() === TOKEN_PROGRAM_ID.toBase58();
            }
            return false;
        });
        
        let transferDetails = new Set<TransferDetails>();
        for(const transferInstruction of transferInstructions) {
            if ('parsed' in transferInstruction && (transferInstruction.parsed.type === 'transfer' || transferInstruction.parsed.type === 'transferChecked' ) ) {
                
            const info = transferInstruction.parsed.info;

            // Assuming the first account is the source and the second is the destination
            const source = info.source;
            const destination = info.destination;
            const amount = info.lamports

            // Fetch the transaction data to get the amount transferred

            // Extract the amount from the transaction data
            const preBalances = new Set<string>();
            let tokenAddress = '';
            transaction.meta?.preTokenBalances?.forEach(balance => {
                if (!preBalances.has(balance.mint)) {
                    tokenAddress = balance.mint;
                }
            });
            

            transferDetails.add({
                tokenAddress: tokenAddress,
                amount: amount,
                source: source,
                destination: destination
            });}
        }

        return transferDetails;
    } catch (error) {
        console.error(`Error processing transfer transaction:`, error);
        return null;
    }
}

export async function processTransferSolanaTransaction(
    transaction: ParsedTransactionWithMeta,
): Promise<Set<TransferDetails> | null> {
    try {
        const transferInstructions = transaction.transaction.message.instructions.filter((instruction) => {
            if ('programId' in instruction) {
                return true;
            }
            return false;
        });
        
        let transferDetails = new Set<TransferDetails>();
        for(const transferInstruction of transferInstructions) {
            if ('parsed' in transferInstruction && (transferInstruction.parsed.type === 'transfer' || transferInstruction.parsed.type === 'transferChecked' ) ) {
                
            const info = transferInstruction.parsed.info;

            // Assuming the first account is the source and the second is the destination
            const source = info.source;
            const destination = info.destination;
            const amount = info.lamports

            // Fetch the transaction data to get the amount transferred
            

            transferDetails.add({
                tokenAddress: "So11111111111111111111111111111111111111112",
                amount: amount,
                source: source,
                destination: destination
            });}
        }

        return transferDetails;
    } catch (error) {
        console.error(`Error processing transfer transaction:`, error);
        return null;
    }
}

interface TransferDetails {
    tokenAddress: string;
    amount: number;
    source: string;
    destination: string;
}



interface DecodedSwapData {
  logType: number;
  amount: bigint;
  maxSolCost: bigint;
}
// Define the struct for decoding
export const swapDataStruct = struct<DecodedSwapData>([
    nu64('logType'),
    nu64('amount'),
    nu64('maxSolCost')
  ]);


interface DecodedSwapDatav2 {
    mint: number[]; // Changed to number, to store the UInt that u48 is decoded into.
    solAmount: bigint;
    tokenAmount: bigint;
    isBuy: number;
    user: number[];
    timestamp: bigint;
    virtualSolReserves: bigint;
    virtualTokenReserves: bigint;
}



export const swapDataStructv2 = struct<DecodedSwapDatav2>([
    seq(u8(), 48, 'mint'),
    nu64('solAmount'),
    nu64('tokenAmount'),
    u8('isBuy'),
    seq(u8(), 44, 'user'),
    nu64('timestamp'),
    nu64('virtualSolReserves'),
    nu64('virtualTokenReserves'),
    
  ]);


// Map for different log types (if needed)
export const logTypeToStructPumpFun = new Map<number, any>([
  [102, swapDataStruct],
  [51, swapDataStruct],// Assuming 0 is the log type for this structure
]);
export const logTypeToStructPumpFunv2 = new Map<number, any>([
    [228 , swapDataStructv2] // Assuming 0 is the log type for this structure
  ]);
export async function decodePumpFunTrade(txSignature: string,tx:ParsedTransactionWithMeta): Promise<{
    tokenAmount: bigint;
    solAmount: bigint;
    direction: string;
    tokenAddress: string;
  } | any >{
    
    
    try {
       
  
      const pumpFunProgramId = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
      const pumpFunAMMProgramId = new PublicKey('pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA');
      let decoded = [];
      for (const ix of tx.transaction.message.instructions) {
        if (ix.programId.equals(pumpFunProgramId) || ix.programId.equals(pumpFunAMMProgramId)) {
            if ('data' in ix) {
                // Decode from base58 instead of base64
                const data = bs58.decode(ix.data);
                if (data.length > 0) {
                    const logType = data[0];
                    const logStruct = logTypeToStructPumpFun.get(logType);
    
                    if (logStruct && typeof logStruct.decode === 'function') {
                      let result = logStruct.decode(Buffer.from(data));
                      let buyorsell;
                      if(logType == 102)
                        buyorsell = "buy";
                      else
                        buyorsell = "sell";
                      let tokenAddress;
                      if(!tx.meta?.postTokenBalances)
                        return null;
                      for (const balance of tx.meta?.postTokenBalances)
                        if(balance.mint != WSOL_MINT)
                          tokenAddress = balance.mint;
                      if(result){
                        decoded.push({
                            tokenAmount: result.amount,
                            solAmount: result.maxSolCost,
                            direction: buyorsell,
                            tokenAddress: tokenAddress
                        });}
                        
                    }
                }
            }
        }
    }
  
      return decoded;
    } catch (error) {
      return { error: `Failed to decode transaction: ${error}` };
    }
  }

  const WSOL_MINT = 'So11111111111111111111111111111111111111112';
  export async function decodePumpFunTradev2(txSignature: string,tx:ParsedTransactionWithMeta): Promise<{
    tokenAmount: bigint;
    solAmount: bigint;
    direction: string;
    tokenAddress: string;
  } | any >{
    
    
    try {
       
  
      const pumpFunProgramId = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
      const pumpFunAMMProgramId = new PublicKey('pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA');
      let decoded = [];
      if(!tx.meta?.innerInstructions)
        return null;
      let tokenAddress;
        if(!tx.meta?.postTokenBalances)
        return null;
        for (const balance of tx.meta?.postTokenBalances)
        if(balance.mint != WSOL_MINT)
            tokenAddress = balance.mint;
      for (const instruction of tx.meta.innerInstructions) 
        for(const ix of instruction.instructions){
        if (ix.programId.equals(pumpFunProgramId) ) {
            if ('data' in ix) {
                // Decode from base58 instead of base64
                const data = bs58.decode(ix.data);
                if (data.length > 0) {
                    const logType = data[0];
                    const logStruct = logTypeToStructPumpFunv2.get(logType);
    
                    if (logStruct && typeof logStruct.decode === 'function') {
                        
                      let result = logStruct.decode(Buffer.from(data));
                      let str = convertBytesToString(result.mint);
                      /*for (let i = 0; i < 250; i++) {
                        let tmpresult = readU64Bytes(data, i, 1);
                        console.log(`tmpresult[${i}]: ${tmpresult}`);
                      }*/
                      
                      let buyorsell;
                      if(result.isBuy == 0)
                        buyorsell = "sell";
                      else if(result.isBuy == 1)
                        buyorsell = "buy";
                      else
                        continue;
                      
                      if(result){
                        decoded.push({
                            tokenAmount: result.tokenAmount,
                            solAmount: result.solAmount,
                            direction: buyorsell,
                            tokenAddress: tokenAddress
                        });}
                        
                    }
                }
            }
        }
    }
  
      return decoded;
    } catch (error) {
      return { error: `Failed to decode transaction: ${error}` };
    }
  }
  function readU64Bytes(uint8Array: Uint8Array, startPosition: number, count: number = 8): bigint[] {
    const dataView = new DataView(uint8Array.buffer, uint8Array.byteOffset, uint8Array.byteLength);
    const u64Array: bigint[] = [];

    for (let i = 0; i < count; i++) {
        const offset = startPosition + i * 8; // Each u64 is 8 bytes
        if (offset + 8 > uint8Array.byteLength) {
            throw new Error('Uint8Array does not have enough data to read u64 values');
        }
        const value = dataView.getBigUint64(offset, true); // Use true for little-endian, false for big-endian
        u64Array.push(value);
    }

    return u64Array;
}
  export function isPumpFunCreation(txSignature: string,tx:ParsedTransactionWithMeta): boolean{

      const pumpFunProgramId = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
      const pumpFunAMMProgramId = new PublicKey('pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA');
      let decoded = [];
      for (const ix of tx.transaction.message.instructions) {
        if (ix.programId.equals(pumpFunProgramId) || ix.programId.equals(pumpFunAMMProgramId)) {
            if ('data' in ix) {
                // Decode from base58 instead of base64
                const data = bs58.decode(ix.data);
                if (data.length > 0) {
                    const logType = data[0];
                    if(logType == 24)
                        return true;
                }
            }
        } }
        return false;
}
        
function convertBytesToString(byteArray: number[]): string {
    let result = '';
    for (let i = 0; i < byteArray.length; i++) {
        result += String.fromCharCode(byteArray[i]);
    }
    return result;
}