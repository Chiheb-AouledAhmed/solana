// src/transactionUtils.ts
import { YOUR_PRIVATE_KEY, BUY_AMOUNT_PERCENTAGE } from './_config';
import { getParsedTransactionWithRetry, getSOLBalance } from './_utils';
import bs58 from 'bs58';
import {
    Connection,
    PublicKey,
    TransactionInstruction,
    Keypair,
    SystemProgram,
    VersionedTransaction,
    ComputeBudgetProgram,
    TransactionMessage,
    ParsedInstruction, PartiallyDecodedInstruction,
    SendTransactionError
} from "@solana/web3.js";
import {
    TOKEN_PROGRAM_ID,
    NATIVE_MINT,
    getOrCreateAssociatedTokenAccount,
    createSyncNativeInstruction,
    Account
} from "@solana/spl-token";
import {
    getOrCreateAssociatedTokenAccountWithRetry,
    getPoolId,
    getPoolKeys,
    makeSwapInstruction,
    executeVersionedTransaction,
    getPoolKeysFromParsedInstruction,
    pollTransactionsForSwap
} from './swapUtils';
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







export async function buyNewToken(connection: Connection, tokenAddress: string): Promise<string> {
    let curAmmId = "";
    const privateKeyUint8Array = bs58.decode(YOUR_PRIVATE_KEY);
    const keyPair = Keypair.fromSecretKey(privateKeyUint8Array);
    const solBalance = await getSOLBalance(connection, keyPair.publicKey);
    const amountToBuy = solBalance * BUY_AMOUNT_PERCENTAGE; // Use percentage from config
    console.log(`Buying token ${tokenAddress} with ${amountToBuy} SOL`);
    let program_id = "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8";
    const instruction = await pollTransactionsForSwap(tokenAddress,program_id,connection);
    if(!instruction){
        console.log("No instruction found for token ",tokenAddress);
        return "";
    }
    curAmmId = await getPoolKeysFromParsedInstruction(instruction, connection);
    try {
        await makeAndExecuteSwap(
            connection,
            keyPair,
            "So11111111111111111111111111111111111111112", // SOL address
            tokenAddress,
            amountToBuy,
            curAmmId
        );
    } catch (error) {
        console.error(`Error buying token ${tokenAddress}:`, error);
        throw error; // Re-throw so the calling function knows it failed
    }
    return curAmmId;
}

export async function sellToken(connection: Connection, tokenAddress: string,amm : string): Promise<void> {
    const privateKeyUint8Array = bs58.decode(YOUR_PRIVATE_KEY);
    const keyPair = Keypair.fromSecretKey(privateKeyUint8Array);

    try {
        /*await makeAndExecuteSwap(
            connection,
            keyPair,
            tokenAddress, // token address
            "So11111111111111111111111111111111111111112", // SOL address
            amount
        );*/
        await executeTradeBasedOnBalance(
            connection,
            keyPair,
            tokenAddress,
            "So11111111111111111111111111111111111111112",
            100,
            false,
            amm // isBuy = false (sell)
        );
    } catch (error) {
        console.error(`Error selling token ${tokenAddress}:`, error);
        throw error; // Re-throw so the calling function knows it failed
    }
}

export async function makeAndExecuteSwap(
    connection: Connection,
    keyPair: Keypair,
    tokenInAddress: string,
    tokenOutAddress: string,
    swapAmountIn: number,
    poolId : string,
): Promise<void>{
    const MAX_ATTEMPTS = 20; // Maximum number of attempts to find the pool
    //const DELAY_BETWEEN_ATTEMPTS = 5000; // Delay in milliseconds between attempts

    let attempts = 0;
    let ammId: string ="";
    let poolKeys = null;

    /*if(signature.length>0){
        const transaction = await connection.getParsedTransaction(signature, {
            maxSupportedTransactionVersion: 0,
            commitment: 'confirmed'
        });
        let program_id = "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8";
        let instructions = transaction?.transaction.message.instructions;
        if (instructions !== undefined) {
        for (let i = 0; i < instructions.length; i++) {
            const instruction = instructions[i];
            if (instruction.programId.toBase58() === program_id) {
                ammId = await getPoolKeysFromParsedInstruction(instruction, connection);
            }
          }
        }
          
    }
    else*/
    if(poolId.length>0){
        ammId = poolId;
    }
    else{
        ammId = await getPoolId(connection, tokenInAddress, tokenOutAddress);
        if (!ammId) {
            console.error(`Failed to find pool for ${tokenInAddress}-${tokenOutAddress} after ${MAX_ATTEMPTS} attempts.`);
            return;
        }
        console.log(`Using AMM ID: ${ammId}`);
        //poolKeys = await getPoolKeys(ammId, connection);
           
    }
    poolKeys = await getPoolKeys(ammId, connection);
    
    

    const slippage = 2; // 2% slippage tolerance
    

    if (poolKeys) {
        const poolInfo = await Liquidity.fetchInfo({ connection, poolKeys });
        const {
            swapIX,
            tokenInAccount,
            tokenInMint,
            amountIn
        } = await makeSwapInstruction(
            connection,
            tokenInAddress,
            tokenOutAddress,
            swapAmountIn,
            slippage,
            poolKeys,
            poolInfo,
            keyPair,
        );

        const latestBlockhash = await connection.getLatestBlockhash('confirmed');

        const instructions = [
            ComputeBudgetProgram.setComputeUnitLimit({ units: 1000000 }),
            ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1000 }),
            ...(tokenInMint.equals(NATIVE_MINT) ? [
                SystemProgram.transfer({
                    fromPubkey: keyPair.publicKey,
                    toPubkey: tokenInAccount,
                    lamports: amountIn.toNumber(),
                }),
                createSyncNativeInstruction(tokenInAccount, TOKEN_PROGRAM_ID),
            ] : []),
            swapIX
        ];

        const message = new TransactionMessage({
            payerKey: keyPair.publicKey,
            recentBlockhash: latestBlockhash.blockhash,
            instructions,
        }).compileToV0Message();

        const transaction = new VersionedTransaction(message);

        try {
            const signature = await executeVersionedTransaction(connection, transaction, [keyPair]);
            if (signature) {
                console.log("Transaction Completed Successfully 🎉🚀.");
                console.log(`Explorer URL: https://solscan.io/tx/${signature}`);
            } else {
                console.error("Versioned Transaction failed");
            }
        } catch (error) {
            console.error("Transaction failed:", error);
        }
    } else {
        console.log(`Could not get PoolKeys for AMM: ${ammId}`);
    }
}



function extractPoolKeysFromLogs(instruction:any ) {
    // Logic to extract pool keys from logs
    // This might involve regular expressions or string manipulation
    // For simplicity, assume we can directly extract the necessary details
    const poolKeys = {
      id: new PublicKey('pool_id_from_logs'),
      authority: new PublicKey('authority_from_logs'),
      openOrders: new PublicKey('open_orders_from_logs'),
      baseVault: new PublicKey('base_vault_from_logs'),
      quoteVault: new PublicKey('quote_vault_from_logs'),
      marketProgramId: new PublicKey('market_program_id_from_logs'),
      marketId: new PublicKey('market_id_from_logs'),
      marketBids: new PublicKey('market_bids_from_logs'),
      marketAsks: new PublicKey('market_asks_from_logs'),
      marketEventQueue: new PublicKey('market_event_queue_from_logs'),
      marketBaseVault: new PublicKey('market_base_vault_from_logs'),
      marketQuoteVault: new PublicKey('market_quote_vault_from_logs'),
      marketAuthority: new PublicKey('market_authority_from_logs'),
      programId: new PublicKey('program_id_from_logs'),
      baseMint: new PublicKey('base_mint_from_logs'),
      quoteMint: new PublicKey('quote_mint_from_logs'),
      baseDecimals: 9, // Example decimals
      quoteDecimals: 9, // Example decimals
    };
    return poolKeys;
  }
  
export async function executeTradeBasedOnBalance(
    connection: Connection,
    keyPair: Keypair,
    fromTokenAddress: string,
    toTokenAddress: string,
    percentageToTrade: number,
    isBuy: boolean,
    amm : string
) {
    const balance = await getTokenBalance(connection, fromTokenAddress, keyPair.publicKey);
    const amountToTrade = balance * (percentageToTrade / 100);

    console.log(`Current ${fromTokenAddress} balance: ${balance}`);
    console.log(`Amount to ${isBuy ? 'buy' : 'sell'} (${percentageToTrade}%): ${amountToTrade}`);

    if (amountToTrade > 0) {
        await makeAndExecuteSwap(
            connection,
            keyPair,
            fromTokenAddress,
            toTokenAddress,
            amountToTrade,
            amm
        );
    } else {
        console.log("Not enough balance to execute trade.");
    }
}

async function getTokenBalance(connection: Connection, tokenAddress: string, owner: PublicKey): Promise<number> {
    if (tokenAddress === "So11111111111111111111111111111111111111112") {
        // For SOL
        const balance = await connection.getBalance(owner);
        return balance / 1e9; // Convert lamports to SOL
    } else {
        // For other tokens
        const tokenMint = new PublicKey(tokenAddress);
        const tokenAccount = await getOrCreateAssociatedTokenAccount(
            connection,
            owner as any, // Assuming owner is a Keypair
            tokenMint,
            owner
        );
        const balance = await connection.getTokenAccountBalance(tokenAccount.address);
        return parseFloat(balance.value.amount) / Math.pow(10, balance.value.decimals);
    }
}




export async function getTransactionWithRetry(connection: Connection, signature: string, maxRetries = 3): Promise<any> {
    const initialDelay = 2000; // 2 seconds initial delay
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const transaction = await connection.getParsedTransaction(signature, {
                maxSupportedTransactionVersion: 0,
                commitment: 'confirmed'
            });
            if (transaction) {
                if (transaction.meta && transaction.meta.loadedAddresses) {
                    //console.log(`Transaction ${signature} has loaded addresses:`, transaction.meta.loadedAddresses);
                }
                return transaction;
            }
        } catch (error: any) {
            console.error(`Attempt ${attempt + 1} failed:`, error);
        }
        const delay = initialDelay * Math.pow(2, attempt);
        console.log(`Waiting ${delay}ms before next attempt...`);
        await new Promise(resolve => setTimeout(resolve, delay));
    }
    throw new Error(`Failed to fetch transaction after ${maxRetries} attempts`);
}