"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logTypeToStructPumpFunv2 = exports.logTypeToStructPumpFun = exports.swapDataStructv2 = exports.swapDataStruct = exports.makeSwapInstruction = exports.getPoolKeys = exports.getPoolKeysFromParsedInstruction = exports.logTypeToStruct = exports.swapBaseOutLog = exports.swapBaseInLog = void 0;
exports.pollTransactionsForSwap = pollTransactionsForSwap;
exports.isSwapTransaction = isSwapTransaction;
exports.processSwapTransaction = processSwapTransaction;
exports.parseSwapInfo = parseSwapInfo;
exports.determineInOutTokens = determineInOutTokens;
exports.getPoolId = getPoolId;
exports.executeVersionedTransaction = executeVersionedTransaction;
exports.getOrCreateAssociatedTokenAccountWithRetry = getOrCreateAssociatedTokenAccountWithRetry;
exports.processTransferTransaction = processTransferTransaction;
exports.processTransferSolanaTransaction = processTransferSolanaTransaction;
exports.decodePumpFunTrade = decodePumpFunTrade;
exports.decodePumpFunTradev2 = decodePumpFunTradev2;
exports.isPumpFunCreation = isPumpFunCreation;
// src/swapUtils.ts
const buffer_layout_1 = require("@solana/buffer-layout");
const bs58_1 = __importDefault(require("bs58"));
// src/swapUtils.ts
const web3_js_1 = require("@solana/web3.js");
const spl_token_1 = require("@solana/spl-token");
const raydium_sdk_1 = require("@raydium-io/raydium-sdk");
const raydium_sdk_v2_1 = require("@raydium-io/raydium-sdk-v2");
const bn_js_1 = __importDefault(require("bn.js"));
async function pollTransactionsForSwap(tokenAddress, programId, connection) {
    try {
        const tokenPublicKey = new web3_js_1.PublicKey(tokenAddress);
        const programIdPublicKey = new web3_js_1.PublicKey(programId);
        let lastSlot = await connection.getSlot('finalized');
        while (true) {
            // Fetch the latest transactions for the account
            const signatures = await connection.getSignaturesForAddress(tokenPublicKey, {
                limit: 10
            }, 'confirmed');
            // Loop through each transaction
            for (const signatureInfo of signatures) {
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
    }
    catch (error) {
        console.error('Error polling transactions:', error);
    }
}
// Enhanced Swap Verification Function
function isSwapTransaction(transaction) {
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
        "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P" // Raydium CLMM Program ID
    ];
    const isRaydiumSwap = programIds.some(programId => raydiumProgramIds.includes(programId));
    return isRaydiumSwap;
}
async function processSwapTransaction(connection, transaction, signature) {
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
        console.log(`Date: ${new Date().toLocaleString()}`);
        return swapDetails;
    }
    catch (error) {
        console.error(`Error processing transaction ${signature}:`, error);
        return null;
    }
}
// Helper function to parse swap info from logs
function parseSwapInfo(logs) {
    for (const log of logs) {
        if (log.includes('ray_log')) {
            const parts = log.split('ray_log:');
            if (parts.length > 1) {
                const logData = Buffer.from(parts[1].trim(), 'base64');
                if (logData.length > 0) {
                    const logType = logData[0];
                    const logStruct = exports.logTypeToStruct.get(logType);
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
function determineInOutTokens(transaction, swapInfo) {
    const preBalances = new Map();
    const postBalances = new Map();
    const netChanges = new Map();
    transaction.meta?.preTokenBalances?.forEach(balance => {
        if (!preBalances.has(balance.mint)) {
            preBalances.set(balance.mint, new Map());
        }
        preBalances.get(balance.mint).set(balance.accountIndex, BigInt(balance.uiTokenAmount.amount));
    });
    transaction.meta?.postTokenBalances?.forEach(balance => {
        if (!postBalances.has(balance.mint)) {
            postBalances.set(balance.mint, new Map());
        }
        postBalances.get(balance.mint).set(balance.accountIndex, BigInt(balance.uiTokenAmount.amount));
        if (!netChanges.has(balance.mint)) {
            netChanges.set(balance.mint, new Map());
        }
        const preBalance = preBalances.get(balance.mint)?.get(balance.accountIndex) || BigInt(0);
        const change = postBalances.get(balance.mint).get(balance.accountIndex) - preBalance;
        netChanges.get(balance.mint).set(balance.accountIndex, change);
    });
    let inToken = null;
    let outToken = null;
    for (const [mint, changes] of netChanges) {
        for (const change of changes.values()) {
            if (Math.abs(Number(change)) === Number(swapInfo.amount_in)) {
                inToken = mint;
            }
            else if (Math.abs(Number(change)) === Number(swapInfo.out_amount)) {
                outToken = mint;
            }
        }
    }
    if (!inToken || !outToken) {
        throw new Error('Could not determine in and out tokens');
    }
    return {
        inToken: new web3_js_1.PublicKey(inToken),
        outToken: new web3_js_1.PublicKey(outToken)
    };
}
exports.swapBaseInLog = (0, buffer_layout_1.struct)([
    (0, buffer_layout_1.u8)('log_type'),
    (0, buffer_layout_1.nu64)('amount_in'),
    (0, buffer_layout_1.nu64)('minimum_out'),
    (0, buffer_layout_1.nu64)('direction'),
    (0, buffer_layout_1.nu64)('user_source'),
    (0, buffer_layout_1.nu64)('pool_coin'),
    (0, buffer_layout_1.nu64)('pool_pc'),
    (0, buffer_layout_1.nu64)('out_amount')
]);
exports.swapBaseOutLog = (0, buffer_layout_1.struct)([
    (0, buffer_layout_1.u8)('log_type'),
    (0, buffer_layout_1.nu64)('max_in'),
    (0, buffer_layout_1.nu64)('amount_out'),
    (0, buffer_layout_1.nu64)('direction'),
    (0, buffer_layout_1.nu64)('user_source'),
    (0, buffer_layout_1.nu64)('pool_coin'),
    (0, buffer_layout_1.nu64)('pool_pc'),
    (0, buffer_layout_1.nu64)('deduct_in')
]);
exports.logTypeToStruct = new Map([
    [3, exports.swapBaseInLog],
    [4, exports.swapBaseOutLog],
]);
// Raydium Pool Functions
async function getPoolId(connection, tokenAAddress, tokenBAddress) {
    const raydium = await raydium_sdk_v2_1.Raydium.load({
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
            if (obj.id)
                return obj.id; // This is the POOL_ID
            return "";
        }
    }
    return ""; // Return null if no suitable pool is found
}
const getPoolKeysFromParsedInstruction = async (instruction, connection) => {
    //try {
    // Check if the instruction is a Raydium swap instruction
    {
        // Extract the pool ID from the instruction keys
        let poolId;
        if ('parsed' in instruction) {
            // For ParsedInstruction
            poolId = instruction.parsed.info.programId === raydium_sdk_1.MAINNET_PROGRAM_ID.AmmV4.toString()
                ? instruction.parsed.info.accounts.find((account) => account.account === 'pool')?.publicKey
                : "";
        }
        else if ('programId' in instruction) {
            // For PartiallyDecodedInstruction
            poolId = instruction.accounts[1];
            //find((account:any) => account.isWritable && account.pubkey.toString() !== TOKEN_PROGRAM_ID.toString())?.pubkey;
        }
        else {
            console.error('Unsupported instruction type.');
            return "";
        }
        if (poolId)
            return poolId.toBase58();
        return "";
    }
};
exports.getPoolKeysFromParsedInstruction = getPoolKeysFromParsedInstruction;
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
const getPoolKeys = async (ammId, connection) => {
    try {
        const ammAccount = await connection.getAccountInfo(new web3_js_1.PublicKey(ammId));
        if (ammAccount) {
            const poolState = raydium_sdk_1.LIQUIDITY_STATE_LAYOUT_V4.decode(ammAccount.data);
            const marketAccount = await connection.getAccountInfo(poolState.marketId);
            if (marketAccount) {
                const marketState = raydium_sdk_1.MARKET_STATE_LAYOUT_V3.decode(marketAccount.data);
                const marketAuthority = web3_js_1.PublicKey.createProgramAddressSync([
                    marketState.ownAddress.toBuffer(),
                    marketState.vaultSignerNonce.toArrayLike(Buffer, "le", 8),
                ], raydium_sdk_1.MAINNET_PROGRAM_ID.OPENBOOK_MARKET);
                return {
                    id: new web3_js_1.PublicKey(ammId),
                    programId: raydium_sdk_1.MAINNET_PROGRAM_ID.AmmV4,
                    status: poolState.status,
                    baseDecimals: poolState.baseDecimal.toNumber(),
                    quoteDecimals: poolState.quoteDecimal.toNumber(),
                    lpDecimals: 9,
                    baseMint: poolState.baseMint,
                    quoteMint: poolState.quoteMint,
                    version: 4,
                    authority: new web3_js_1.PublicKey("5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1"),
                    openOrders: poolState.openOrders,
                    baseVault: poolState.baseVault,
                    quoteVault: poolState.quoteVault,
                    marketProgramId: raydium_sdk_1.MAINNET_PROGRAM_ID.OPENBOOK_MARKET,
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
                    lookupTableAccount: web3_js_1.PublicKey.default
                };
            }
        }
    }
    catch (error) {
        console.error("getPoolKeys error:", error);
    }
    return undefined;
};
exports.getPoolKeys = getPoolKeys;
const makeSwapInstruction = async (connection, tokenInAddress, tokenOutAddress, rawAmountIn, slippage, poolKeys, poolInfo, keyPair) => {
    const tokenInMint = new web3_js_1.PublicKey(tokenInAddress);
    const tokenOutMint = new web3_js_1.PublicKey(tokenOutAddress);
    const tokenInDecimals = poolKeys.baseMint.equals(tokenInMint) ? poolKeys.baseDecimals : poolKeys.quoteDecimals;
    const tokenOutDecimals = poolKeys.baseMint.equals(tokenOutMint) ? poolKeys.baseDecimals : poolKeys.quoteDecimals;
    const amountInRaw = new bn_js_1.default(rawAmountIn * (10 ** tokenInDecimals));
    const amountOutParams = raydium_sdk_1.Liquidity.computeAmountOut({
        poolKeys,
        poolInfo,
        amountIn: new raydium_sdk_1.TokenAmount(new raydium_sdk_1.Token(spl_token_1.TOKEN_PROGRAM_ID, tokenInMint, tokenInDecimals), amountInRaw),
        currencyOut: new raydium_sdk_1.Token(spl_token_1.TOKEN_PROGRAM_ID, tokenOutMint, tokenOutDecimals),
        slippage: new raydium_sdk_1.Percent(slippage, 100),
    });
    let tokenInAccount;
    let tokenOutAccount;
    if (tokenInMint.equals(spl_token_1.NATIVE_MINT)) {
        tokenInAccount = (await getOrCreateAssociatedTokenAccountWithRetry(connection, keyPair, spl_token_1.NATIVE_MINT, keyPair.publicKey)).address;
    }
    else {
        tokenInAccount = (await getOrCreateAssociatedTokenAccountWithRetry(connection, keyPair, tokenInMint, keyPair.publicKey)).address;
    }
    if (tokenOutMint.equals(spl_token_1.NATIVE_MINT)) {
        tokenOutAccount = (await getOrCreateAssociatedTokenAccountWithRetry(connection, keyPair, spl_token_1.NATIVE_MINT, keyPair.publicKey)).address;
    }
    else {
        tokenOutAccount = (await getOrCreateAssociatedTokenAccountWithRetry(connection, keyPair, tokenOutMint, keyPair.publicKey)).address;
    }
    const ix = new web3_js_1.TransactionInstruction({
        programId: new web3_js_1.PublicKey(poolKeys.programId),
        keys: [
            { pubkey: spl_token_1.TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
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
        data: Buffer.from(Uint8Array.of(9, ...amountInRaw.toArray("le", 8), ...amountOutParams.minAmountOut.raw.toArray("le", 8))),
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
exports.makeSwapInstruction = makeSwapInstruction;
async function executeVersionedTransaction(connection, transaction, signers) {
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
        }
        catch (error) {
            console.error(`Attempt ${attempt + 1} failed:`, error);
            if (error instanceof web3_js_1.SendTransactionError) {
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
async function getOrCreateAssociatedTokenAccountWithRetry(connection, payer, mint, owner, maxRetries = 3, delay = 1000) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const account = await (0, spl_token_1.getOrCreateAssociatedTokenAccount)(connection, payer, mint, owner);
            return account;
        }
        catch (error) {
            console.error(`Attempt ${attempt + 1} failed: ${error instanceof Error ? error.message : String(error)}`);
            if (attempt === maxRetries - 1)
                throw error;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    throw new Error("Failed to get or create associated token account after max retries");
}
async function processTransferTransaction(transaction) {
    try {
        const transferInstructions = transaction.transaction.message.instructions.filter((instruction) => {
            if ('programId' in instruction) {
                return instruction.programId.toBase58() === spl_token_1.TOKEN_PROGRAM_ID.toBase58();
            }
            return false;
        });
        let transferDetails = new Set();
        for (const transferInstruction of transferInstructions) {
            if ('parsed' in transferInstruction && (transferInstruction.parsed.type === 'transfer' || transferInstruction.parsed.type === 'transferChecked')) {
                const info = transferInstruction.parsed.info;
                // Assuming the first account is the source and the second is the destination
                const source = info.source;
                const destination = info.destination;
                const amount = info.lamports;
                // Fetch the transaction data to get the amount transferred
                // Extract the amount from the transaction data
                const preBalances = new Set();
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
                });
            }
        }
        return transferDetails;
    }
    catch (error) {
        console.error(`Error processing transfer transaction:`, error);
        return null;
    }
}
async function processTransferSolanaTransaction(transaction) {
    try {
        const transferInstructions = transaction.transaction.message.instructions.filter((instruction) => {
            if ('programId' in instruction) {
                return true;
            }
            return false;
        });
        let transferDetails = new Set();
        for (const transferInstruction of transferInstructions) {
            if ('parsed' in transferInstruction && (transferInstruction.parsed.type === 'transfer' || transferInstruction.parsed.type === 'transferChecked')) {
                const info = transferInstruction.parsed.info;
                // Assuming the first account is the source and the second is the destination
                const source = info.source;
                const destination = info.destination;
                const amount = info.lamports;
                // Fetch the transaction data to get the amount transferred
                transferDetails.add({
                    tokenAddress: "So11111111111111111111111111111111111111112",
                    amount: amount,
                    source: source,
                    destination: destination
                });
            }
        }
        return transferDetails;
    }
    catch (error) {
        console.error(`Error processing transfer transaction:`, error);
        return null;
    }
}
// Define the struct for decoding
exports.swapDataStruct = (0, buffer_layout_1.struct)([
    (0, buffer_layout_1.nu64)('logType'),
    (0, buffer_layout_1.nu64)('amount'),
    (0, buffer_layout_1.nu64)('maxSolCost')
]);
exports.swapDataStructv2 = (0, buffer_layout_1.struct)([
    (0, buffer_layout_1.seq)((0, buffer_layout_1.u8)(), 48, 'mint'),
    (0, buffer_layout_1.nu64)('solAmount'),
    (0, buffer_layout_1.nu64)('tokenAmount'),
    (0, buffer_layout_1.u8)('isBuy'),
    (0, buffer_layout_1.seq)((0, buffer_layout_1.u8)(), 44, 'user'),
    (0, buffer_layout_1.nu64)('timestamp'),
    (0, buffer_layout_1.nu64)('virtualSolReserves'),
    (0, buffer_layout_1.nu64)('virtualTokenReserves'),
]);
// Map for different log types (if needed)
exports.logTypeToStructPumpFun = new Map([
    [102, exports.swapDataStruct],
    [51, exports.swapDataStruct], // Assuming 0 is the log type for this structure
]);
exports.logTypeToStructPumpFunv2 = new Map([
    [228, exports.swapDataStructv2] // Assuming 0 is the log type for this structure
]);
async function decodePumpFunTrade(txSignature, tx) {
    try {
        const pumpFunProgramId = new web3_js_1.PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
        const pumpFunAMMProgramId = new web3_js_1.PublicKey('pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA');
        let decoded = [];
        for (const ix of tx.transaction.message.instructions) {
            if (ix.programId.equals(pumpFunProgramId) || ix.programId.equals(pumpFunAMMProgramId)) {
                if ('data' in ix) {
                    // Decode from base58 instead of base64
                    const data = bs58_1.default.decode(ix.data);
                    if (data.length > 0) {
                        const logType = data[0];
                        const logStruct = exports.logTypeToStructPumpFun.get(logType);
                        if (logStruct && typeof logStruct.decode === 'function') {
                            let result = logStruct.decode(Buffer.from(data));
                            let buyorsell;
                            if (logType == 102)
                                buyorsell = "buy";
                            else
                                buyorsell = "sell";
                            let tokenAddress;
                            if (!tx.meta?.postTokenBalances)
                                return null;
                            for (const balance of tx.meta?.postTokenBalances)
                                if (balance.mint != WSOL_MINT)
                                    tokenAddress = balance.mint;
                            if (result) {
                                decoded.push({
                                    tokenAmount: result.amount,
                                    solAmount: result.maxSolCost,
                                    direction: buyorsell,
                                    tokenAddress: tokenAddress
                                });
                            }
                        }
                    }
                }
            }
        }
        return decoded;
    }
    catch (error) {
        return { error: `Failed to decode transaction: ${error}` };
    }
}
const WSOL_MINT = 'So11111111111111111111111111111111111111112';
async function decodePumpFunTradev2(txSignature, tx) {
    try {
        const pumpFunProgramId = new web3_js_1.PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
        const pumpFunAMMProgramId = new web3_js_1.PublicKey('pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA');
        let decoded = [];
        if (!tx.meta?.innerInstructions)
            return null;
        let tokenAddress;
        if (!tx.meta?.postTokenBalances)
            return null;
        for (const balance of tx.meta?.postTokenBalances)
            if (balance.mint != WSOL_MINT)
                tokenAddress = balance.mint;
        for (const instruction of tx.meta.innerInstructions)
            for (const ix of instruction.instructions) {
                if (ix.programId.equals(pumpFunProgramId) || ix.programId.equals(pumpFunAMMProgramId)) {
                    if ('data' in ix) {
                        // Decode from base58 instead of base64
                        const data = bs58_1.default.decode(ix.data);
                        if (data.length > 0) {
                            const logType = data[0];
                            const logStruct = exports.logTypeToStructPumpFunv2.get(logType);
                            if (logStruct && typeof logStruct.decode === 'function') {
                                let result = logStruct.decode(Buffer.from(data));
                                let str = convertBytesToString(result.mint);
                                /*for (let i = 0; i < 250; i++) {
                                  let tmpresult = readU64Bytes(data, i, 1);
                                  console.log(`tmpresult[${i}]: ${tmpresult}`);
                                }*/
                                let buyorsell;
                                if (result.isBuy == 0)
                                    buyorsell = "sell";
                                else if (result.isBuy == 1)
                                    buyorsell = "buy";
                                else
                                    continue;
                                if (result) {
                                    decoded.push({
                                        tokenAmount: result.tokenAmount,
                                        solAmount: result.solAmount,
                                        direction: buyorsell,
                                        tokenAddress: tokenAddress
                                    });
                                }
                            }
                        }
                    }
                }
            }
        return decoded;
    }
    catch (error) {
        return { error: `Failed to decode transaction: ${error}` };
    }
}
function readU64Bytes(uint8Array, startPosition, count = 8) {
    const dataView = new DataView(uint8Array.buffer, uint8Array.byteOffset, uint8Array.byteLength);
    const u64Array = [];
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
function isPumpFunCreation(txSignature, tx) {
    const pumpFunProgramId = new web3_js_1.PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
    const pumpFunAMMProgramId = new web3_js_1.PublicKey('pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA');
    let decoded = [];
    for (const ix of tx.transaction.message.instructions) {
        if (ix.programId.equals(pumpFunProgramId) || ix.programId.equals(pumpFunAMMProgramId)) {
            if ('data' in ix) {
                // Decode from base58 instead of base64
                const data = bs58_1.default.decode(ix.data);
                if (data.length > 0) {
                    const logType = data[0];
                    if (logType == 24)
                        return true;
                }
            }
        }
    }
    return false;
}
function convertBytesToString(byteArray) {
    let result = '';
    for (let i = 0; i < byteArray.length; i++) {
        result += String.fromCharCode(byteArray[i]);
    }
    return result;
}
//# sourceMappingURL=swapUtils.js.map