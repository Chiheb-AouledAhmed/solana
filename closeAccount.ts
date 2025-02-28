import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
  closeAccount,
  createCloseAccountInstruction,
  createTransferInstruction,
  transfer,
} from '@solana/spl-token';
import bs58 from 'bs58';

// Replace these values with your own
const WSOL_MINT = new PublicKey('So11111111111111111111111111111111111111112'); // WSOL Mint Address
const WSOL_TOKEN_ACCOUNT = new PublicKey('Ad3ebKYgcmC9tsvADyhksKs1Cm2mbXgsuiZvoSN6kZGE'); // Your WSOL Token Account Address
const DESTINATION_TOKEN_ACCOUNT = new PublicKey('6XYUiKWDkRTdU81K8sXdGERRB15gesXmikGiaxLbX723'); // Destination Token Account Address
const OWNER = Keypair.fromSecretKey(bs58.decode('3NjEBhqBn1vGmpUWMYs2fvHxPMnAYqhfhAzatz2gPb9NRnoJ19nhKk8tyrDogC3zdkzovrCiW6EvswbpMAcGKNF5')); // Your Base58-encoded Private Key
const FEE_PAYER = OWNER; // Use the same keypair as the fee payer for simplicity

// Connection setup
const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed'); // Use mainnet or devnet as needed

// Function to transfer tokens
async function transferTokens() {
  try {
    const balance = await connection.getTokenAccountBalance(WSOL_TOKEN_ACCOUNT);
    if (balance.value.uiAmount === null || balance.value.uiAmount === 0) {
      console.log('Account is already empty.');
      return;
    }
    let decimals = balance.value.decimals?? 0;
    let amount = ((balance.value.uiAmount ?? 0 ) * Math.pow(10, decimals));
    const transaction = new Transaction().add(
      createTransferInstruction(
        WSOL_TOKEN_ACCOUNT, // Source token account // Mint of the token to transfer
        DESTINATION_TOKEN_ACCOUNT, // Destination token account
        OWNER.publicKey, // Authority (owner of the source token account)
        amount, // Amount to transferr
      ),
    );

    const txHash = await sendAndConfirmTransaction(connection, transaction, [FEE_PAYER]);
    console.log(`Transfer transaction hash: ${txHash}`);
  } catch (error) {
    console.error('Error transferring tokens:', error);
  }
}

// Function to close account
async function closeAccountAfterTransfer() {
  try {
    const balance = await connection.getTokenAccountBalance(WSOL_TOKEN_ACCOUNT);
    if (balance.value.uiAmount !== null && balance.value.uiAmount > 0) {
      console.error('Account is not empty. Transfer tokens first.');
      return;
    }

    const transaction = new Transaction().add(
      createCloseAccountInstruction(
        WSOL_TOKEN_ACCOUNT, // Token account to close
        OWNER.publicKey, // Destination to receive the rent
        OWNER.publicKey, // Authority (owner of the token account)
      ),
    );

    const txHash = await sendAndConfirmTransaction(connection, transaction, [FEE_PAYER]);
    console.log(`Close account transaction hash: ${txHash}`);
  } catch (error) {
    console.error('Error closing account:', error);
  }
}

// Execute both steps sequentially
async function main() {
  await transferTokens();
  await closeAccountAfterTransfer();
}

main().catch(console.error);
