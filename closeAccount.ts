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
  } from '@solana/spl-token';
  import bs58 from 'bs58';
  
  // Replace these values with your own
  const WSOL_MINT = new PublicKey('So11111111111111111111111111111111111111112'); // WSOL Mint Address
  const WSOL_TOKEN_ACCOUNT = new PublicKey('AVahywMVNRYzdgWrufSWrtdGXAeNEvfpJFxhVFK516mT'); // Your WSOL Token Account Address
  const OWNER = Keypair.fromSecretKey(bs58.decode('3NjEBhqBn1vGmpUWMYs2fvHxPMnAYqhfhAzatz2gPb9NRnoJ19nhKk8tyrDogC3zdkzovrCiW6EvswbpMAcGKNF5')); // Your Base58-encoded Private Key
  const FEE_PAYER = OWNER; // Use the same keypair as the fee payer for simplicity
  
  // Connection setup
  const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed'); // Use mainnet or devnet as needed
  
  // Ensure the account is empty
  async function ensureAccountIsEmpty() {
    const balance = await connection.getTokenAccountBalance(WSOL_TOKEN_ACCOUNT);
    const uiAmount = balance.value.uiAmount ?? 0; // Default to 0 if null or undefined

    if (uiAmount > 0) {
      console.log('Account is not empty. You need to burn the tokens first.');
      // Implement token burning logic here if needed
      return false;
    }
    return true;
  }
  
  // Close the account
  async function closeWSOLAccount() {
    if (!(await ensureAccountIsEmpty())) {
      console.error('Cannot close non-empty account.');
      return;
    }
  
    const transaction = new Transaction().add(
      createCloseAccountInstruction(
        WSOL_TOKEN_ACCOUNT, // Token account to close
        OWNER.publicKey, // Destination to receive the rent
        OWNER.publicKey, // Authority (owner of the token account)
      ),
    );
  
    try {
      const txHash = await sendAndConfirmTransaction(connection, transaction, [FEE_PAYER]);
      console.log(`Transaction hash: ${txHash}`);
    } catch (error) {
      console.error('Error closing account:', error);
    }
  }
  
  closeWSOLAccount().catch(console.error);
  