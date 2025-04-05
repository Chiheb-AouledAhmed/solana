// src/main.ts
import { watchTransactions } from './_accountWatcher';
import { watchTokenTransactions } from './_TokenAccountWatcher';
import { watchPumpFunTransactions } from './pumpFunAccountWatcher';
import { AnalysePumpFunTransactions } from './pumpFunTokenAnalyser';
import { AnalyseCommonAddressesTransactions } from './AnalyseCommonAddresses';
import { AnalyseExchangeAddresses } from './AnalyseExchangeAddresses';
import { watchTokenTxs } from './TokenCreatorFinder';
import { watchTokenTxsToBuy } from './TokenBuyer';
import { compareFiles } from './extract';

import PumpFunTrader from '@degenfrends/solana-pumpfun-trader';

import { Market } from '@project-serum/serum';
//import { startMonitoring,startTokenWatcher, stopTokenWatcher } from './_tokenWatcher';
import { buyNewToken ,makeAndExecuteSwap,findOrCreateWrappedSolAccount,unwrapWrappedSol,findWrappedSolAccount,closeTokenAta} from './_transactionUtils';
import { isPumpFunCreation,pollTransactionsForSwap,getPoolKeysFromParsedInstruction,processTransferSolanaTransaction,isSwapTransaction,processSwapTransaction,decodePumpFunTradev2}  from './swapUtils';
import { startMonitoring } from './radiumRugMonitor';
import { monitorTransactions } from './signature';
import dotenv from 'dotenv';
import {LAMPORTS_PER_SOL, Connection, Keypair, PublicKey, Transaction, SystemProgram, sendAndConfirmTransaction } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, MINT_SIZE, ACCOUNT_SIZE ,getAssociatedTokenAddress, closeAccount, ASSOCIATED_TOKEN_PROGRAM_ID} from '@solana/spl-token';
import { NATIVE_MINT ,createCloseAccountInstruction ,createInitializeAccountInstruction,getAccount} from '@solana/spl-token';
//import { getAssociatedTokenAddress } from '@solana/spl-token/extension';
//import { Connection, Keypair,PublicKey } from '@solana/web3.js';
import {SLIPPAGE_BASIS_POINTS, SOLANA_RPC_URL, YOUR_PRIVATE_KEY, KNOWN_TOKENS ,CENTRAL_WALLET_PRIVATE_KEY} from './_config';
import bs58 from 'bs58';
import express from 'express';
let stopAccountWatcher = false;
let tokenToWatch: string | null = null;

import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import { AnchorProvider } from "@coral-xyz/anchor";
import {
    printSOLBalance
  } from "./sdk/util";
import {PumpFunSDK} from "./sdk/pumpfun";
import { transferAllSOL,getParsedTransactionWithRetry,sendTelegramNotification,checkTransactionStatus} from './_utils';
import { BondingCurveAccount } from './sdk';

async function main() {
    console.log('Starting Solana Trader Bot...');
    try {
        const connection = new Connection(SOLANA_RPC_URL, 'processed');
        const privateKeyUint8Array = bs58.decode(CENTRAL_WALLET_PRIVATE_KEY);
        const keyPair = Keypair.fromSecretKey(privateKeyUint8Array);
        dotenv.config();

        const PORT = process.env.PORT || 3000;
        const app = express();
        app.get('/', (req, res) => {
            res.send('Radium Swap Monitor is running!');
        });

        app.get('/health', (req, res) => {
            res.sendStatus(200);
            console.log("service running");
          });

        app.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`);
        });
        /*let signature =  "428meFyUbrENa4Ryy2Mrc2x6dyn6RKAoLxqnoS3emMo6SZJkRUMTLpYqf7UNEUwkuepttgnBxbT4ULGk3uVuVh6j"
        const transaction = await connection.getParsedTransaction(signature, {
            maxSupportedTransactionVersion: 0,
            commitment: 'confirmed'
        });
        let program_id = "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8";
        let instructions = transaction?.transaction.message.instructions;
        instructions?.forEach(instruction => {
            if(instruction.programId.toBase58() ==program_id)
            console.log(instruction)});
        
        let pool = "3em8kgr3kJHnshetbWyWK88wdbq4J3HhvPV7yDBUcrh3";
        let token = "9eXC6W3ZKnkNnCr9iENExRLJDYfPGLbc4m6qfJzJpump"
        const instruction = await pollTransactionsForSwap(token,program_id,connection);
        if(!instruction){
            console.log("No instruction found for token ",token);
            return;
        }
        let ammId = await getPoolKeysFromParsedInstruction(instruction, connection);
        

        await makeAndExecuteSwap(connection, keyPair,
            "So11111111111111111111111111111111111111112",
            token,
            0.01,
            ammId
        );*/
        /*let token = "31RanJGYZbqxN23c6hYV5tb4dewjLVsYTPkaRPCBWh7r"
        await startMonitoring(connection,keyPair,0,
            {
                mint: new PublicKey(token),
                decimals: 9,
                buyPrice : 100000000000000000,
                "amm" : ""
            });*/
        //setInterval(monitorTransactions, 200);
        //let token = "HFGtT4CT2Wnh2FbXVtEKiB9DT864VpR7N2nzvaH5iMEw"
        //buyNewToken(connection, token);
        /*let privateKey = "tZ+VdkXsTevrNeIsJ+EPMnbP4JSXyZT+7nYS+/tzKmMOJMZ7sC+6W2dN+atfIM81p+oKzbTKlmD43k9D2s7X2A==" //Central wallet private key
        const privateKeyUint8Arrayender = Buffer.from(privateKey, 'base64');
        const senderKeypair = Keypair.fromSecretKey(new Uint8Array(privateKeyUint8Arrayender));*/

        //await transferAllSOL(connection, senderKeypair, keyPair.publicKey);
        //await transferAllSOL(connection, keyPair, senderKeypair.publicKey);
        /*try {
            let walletAddress = "xDETdCgweb7ywmMAmfRNfNNPBmuJioyuwXn9kS5eZgT";
            //await closeTokenAta(connection, walletAddress, privateKeyUint8Arrayender,"9HijEDM1Hfcocua1V7XY2YNLJp7gtf3cnDxyFUEX9HHd");
            await transferAllSOL(connection, senderKeypair, keyPair.publicKey);
        } catch (error) {
            console.error("Error:", error);
            
        }*/
       /*const signature = "2JBCxDFdALp3fyENxnDFFsHgvhm7vkUiEkAFGS8oaFVDsgK6ZVWtPd1WKTre5KRYJ9dVMeG8t9wy5AF4ywW5qYKt"
       const transaction = await getParsedTransactionWithRetry(
        connection,
        signature,
        {
            commitment: 'confirmed',
            maxSupportedTransactionVersion: 0
        }
        );
       const transferDetails = await processTransferSolanaTransaction(transaction);

       if (transferDetails) {
        for(const transferDetail of transferDetails){
            console.log(transferDetails)
            console.log(`Transfer Details: ${JSON.stringify(transferDetails)}`);
            let amount = transferDetail.amount
            if((amount>90 * 1e9) && (transferDetail.destination == '69dQZMdXizk5N9PbK7fppTspbuG6VbsVxLD6hu4BvKBt')){
                const message = `
                New Token Transfer Detected!
                Signature: ${signature}
                `;
                await sendTelegramNotification(message);
            }
        } 
       }*/
      /*const accountaddress = "267KLVeSw2FBCcEYsLwnV8gxHh84BCK9JoSXgyqGaPBJ"
      const tokenaddress = "8MSMWUw113qmQbasc3ip9VWN5MrqXLFP4cL28txbpump"
      compareFiles();
      await watchTokenTransactions(accountaddress,tokenaddress);*/
    
        /*const wallet = new NodeWallet(keyPair); // Note: Replace with actual wallet
        const provider = new AnchorProvider(connection, wallet, {
          commitment: "finalized",
        });
        let mint = "pWkzfDrPxfTNPdumQgzR79ismW3upvhmGQxh6Gspump";
        let signature = "5BHXT1amNvHFEJt1AzUrFgVP8VhkE29iLUq62dGwcxtYckeDEYHTAbJTMPHtmGQ7cXNy1gjGwaPJrJQnxd166MWB"
        let fileName = "interacting_addresses.txt";
        /*const pumpFunTrader = new PumpFunTrader();
        pumpFunTrader.setSolanaRpcUrl(SOLANA_RPC_URL);
        
        // Buy tokens (AMM-based trade)
        const buyTx = await pumpFunTrader.buy(
          CENTRAL_WALLET_PRIVATE_KEY,
          mint,
          0.01, // SOL amount
          0.25 // 25% slippage tolerance
        );*/
        //buyToken();
        /*let exempleSignature = "2oKhejMRKpQN2pnBeYokVySbxq3qdPUVSdkZMdcBhKN8daEycqtc3rndTByEpKuRp6kYdiJduViqEcvyLAHTspKd"
        const transaction = await getParsedTransactionWithRetry(
            connection,
            exempleSignature,
            {
                commitment: 'confirmed',
                maxSupportedTransactionVersion: 0
            }
        )
        let result = await decodePumpFunTradev2(exempleSignature,transaction);
        checkTransactionStatus(transaction,exempleSignature);
        await AnalysePumpFunTransactions(mint,signature,fileName);*/
        //await watchTokenTxsToBuy(mint,signature);
        //await AnalyseCommonAddressesTransactions(mint,signature,fileName);
        /*await printSOLBalance(connection, keyPair.publicKey, "Test Account");
      
        const sdk = new PumpFunSDK(provider);
      
        const currentSolBalance = await connection.getBalance(keyPair.publicKey);
        if (currentSolBalance === 0) {
          console.log(
            "Please send some SOL to the test account:",
            keyPair.publicKey.toBase58()
          );
        }
      
        // Check if mint already exists
        let boundingCurveAccount = await sdk.getBondingCurveAccount(new PublicKey(mint));
        console.log(boundingCurveAccount)
        const axios = require('axios');

        const privateKey = CENTRAL_WALLET_PRIVATE_KEY+"+"; // APIs Test PK
        const amount = 500000; // Amount in TOKENS
        const microlamports = 1000000;
        const units = 1000000;
        const slippage = 50; // 50%

        const testSellRequest = async () => {
        try {
            const response = await axios.post('https://api.pumpfunapi.org/pumpfun/sell', {
            private_key: privateKey,
            mint: mint,
            amount: amount,
            microlamports: microlamports,
            units: units,
            slippage: slippage
            });

            console.log('Response:', response.data);
        } catch (error) {
            console.error('Error:', error);
        }
        };

        await testSellRequest();

        async function testPriceApi() {
        try {
            const response = await axios.get('https://api.pumpfunapi.org/price/E6op7B6nwm21JpVP4aoJi4PCJBvKEy5N78UEYHNEpump');
            
            // Log the response data
            console.log('Price Data:', response.data);
        } catch (error) {
            // If there was an error, log it
            console.error('Error fetching price:', error);
        }
        }*/


        //const filename = "export_transfer_BmFdpraQhkiDQE6SnfG5omcA1VwzqfXrwtNYBwWTymy6_1743717772074.csv";
        //await AnalyseExchangeAddresses(filename);
        const watchedAccountsUsage: { [publicKey: string]: number } = {};
        await watchPumpFunTransactions();
        console.log('awaited');
    } catch (error) {
        console.error("An error occurred:", error);
       if (error instanceof Error) {
        console.error(error.message); // Now it's safe to access .message
    } else {
        console.error("Unknown error:", error);
    }
        return null;
    }
}

main()
    .catch(error => {
        console.error("An error occurred:", error);
    });

    const connection = new Connection(SOLANA_RPC_URL);
    const privateKeyUint8Array = bs58.decode(CENTRAL_WALLET_PRIVATE_KEY);
    const wallet = Keypair.fromSecretKey(privateKeyUint8Array);
    // Replace with your wallet's private key
    
    
    // Replace with the token mint address you want to trade
    const TOKEN_MINT_ADDRESS = '2eFNfPvMzKAcqB7hnidLz7hBYz2tXmNYFShB8b3mt9jW';
    const PUMPSWAP_MARKET_ADDRESS = 'PUMPSWAP_MARKET_ADDRESS'; 
    async function buyToken() {
        try {
          const marketAddress = new PublicKey(PUMPSWAP_MARKET_ADDRESS);
          const tokenMintAddress = new PublicKey(TOKEN_MINT_ADDRESS);
      
          // Load the PumpSwap market
          const market = await Market.load(connection, marketAddress, {}, new PublicKey('ProgramID'));
      
          // Fetch order book and place a buy order
          const bids = await market.loadBids(connection);
          console.log('Order book bids:', [...bids]);
      
          // Place a buy order (example)
          const transaction = new Transaction().add(
            SystemProgram.transfer({
              fromPubkey: wallet.publicKey,
              toPubkey: tokenMintAddress,
              lamports: 1_000_000 // Amount in lamports (1 SOL = 1 billion lamports)
            })
          );
      
          const signature = await connection.sendTransaction(transaction, [wallet]);
          console.log('Transaction signature:', signature);
        } catch (error) {
          console.error('Error buying token:', error);
        }
      }
      
      