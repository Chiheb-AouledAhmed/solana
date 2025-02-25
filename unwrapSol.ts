import { Connection, Keypair, PublicKey, sendAndConfirmTransaction } from '@solana/web3.js';
import { NATIVE_MINT, getAssociatedTokenAddress, closeAccount, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import bs58 from 'bs58';

const SOLANA_RPC_URL = "https://shy-thrilling-putty.solana-mainnet.quiknode.pro/16cb32988e78aca562112a0066e5779a413346cc";
const YOUR_PRIVATE_KEY = "3NjEBhqBn1vGmpUWMYs2fvHxPMnAYqhfhAzatz2gPb9NRnoJ19nhKk8tyrDogC3zdkzovrCiW6EvswbpMAcGKNF5";

const connection = new Connection(SOLANA_RPC_URL, 'confirmed');

async function unwrapWSOL(keyPair: Keypair) {
    const wSOLTokenAccount = await getAssociatedTokenAddress(
        NATIVE_MINT,
        keyPair.publicKey,
        false, // allowOwnerOffCurve
        TOKEN_PROGRAM_ID
    );

    try {
        await closeAccount(
            connection,
            keyPair,
            wSOLTokenAccount,
            keyPair.publicKey,
            keyPair
        );
        console.log("wSOL unwrapped successfully.");
    } catch (error) {
        console.error("Error unwrapping wSOL:", error);
    }
}

// Example usage
(async () => {
    const privateKeyUint8Array = bs58.decode(YOUR_PRIVATE_KEY);
    const keyPair = Keypair.fromSecretKey(privateKeyUint8Array);

    await unwrapWSOL(keyPair);
})();
