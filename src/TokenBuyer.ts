// src/accountWatcher.ts

import { LAMPORTS_PER_SOL,Connection, PublicKey, Keypair,ParsedInstruction,TransactionInstruction,ParsedTransactionWithMeta } from '@solana/web3.js';
import { SOLANA_RPC_URL,CENTRAL_WALLET_PRIVATE_KEY,YOUR_PRIVATE_KEY, ACCOUNTS_FILE,ACCOUNT_TO_WATCH, POLLING_INTERVAL, KNOWN_TOKENS , ACCOUNTS_TO_WATCH } from './_config';
import { loadIgnoredAddresses,checkTransactionStatus,getParsedTransactionWithRetry, sendTelegramNotification ,transferAllSOLToRandomAccount} from './_utils';
import { TOKEN_PROGRAM_ID, getMint } from '@solana/spl-token';
import { decodePumpFunTradev2,isPumpFunCreation,decodePumpFunTrade,processTransferTransaction, processTransferSolanaTransaction,isSwapTransaction, processSwapTransaction,parseSwapInfo, determineInOutTokens, logTypeToStruct } from './swapUtils';
import { buyNewToken } from './_transactionUtils';
import { startMonitoring } from './_tokenWatcher'; // Import startTokenWatcher
import { TokenData,AccountData } from './_types';
import { watchTokenTransactions } from './_TokenAccountWatcher';
import { watchPumpFunTransactions } from './pumpFunAccountWatcher';
import bs58 from 'bs58';
import * as fs from 'fs';

const logStream = fs.createWriteStream('./logs/output.log', { flags: 'a' });

// Custom logger function to replace console.log
function logToFile(...args: any[]): void {
    const timestamp = new Date().toISOString();
    const formattedMessage = args
      .map(arg =>
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      )
      .join(' ');
  
    logStream.write(`[${timestamp}] [INFO] ${formattedMessage}\n`);
  }
  
  // Custom logger function for errors
  function errorToFile(...args: any[]): void {
    const timestamp = new Date().toISOString();
    const formattedMessage = args
      .map(arg =>
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      )
      .join(' ');
  
    logStream.write(`[${timestamp}] [ERROR] ${formattedMessage}\n`);
  }
  
  // Replace console.log and console.error with custom loggers
  console.log = logToFile;
  console.error = errorToFile;

let stopWatching = false;
let lastSignature = '';
let knownTokens = KNOWN_TOKENS;
let Processing = false;
let stopcurrWatch = false;
const COOL_DOWN_PERIOD = 3 * 30 * 60 * 1000;
let firstRun = true;
let TRANSACTION_INTERVAL = 2000;
let BUY_THRESHHOLD = 8;

export function setNotProcessing(){
    Processing = false;
    firstRun = true;
    console.log("watching another token ->>>")
}
let ignoredAddresses = new Set<string>();

export async function watchTokenTxsToBuy(tokenAccountAddress : String,signatureBefore:string,filename:string ='interacting_addresses.txt'): Promise<void> {
    console.log('Monitoring Start Token transactions...');
    const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
    ignoredAddresses=loadIgnoredAddresses(filename);
    const addressData: { [address: string]: { buys: number, sells: number, TokenBuys:number,TokenSells:number,signatures: string[] } } = {};

    // Initialize monitored accounts (accounts that will be buying tokens)
    /*accounts.forEach(accountData => {
        try {
            const privateKeyUint8Array = Buffer.from(accountData.privateKey, 'base64');
            const keypair = Keypair.fromSecretKey(new Uint8Array(privateKeyUint8Array));
            monitoredAccounts[accountData.publicKey] = { lastActive: null, keypair: keypair };
        } catch (error) {
            console.error(`Error loading account ${accountData.publicKey}:`, error);
        }
    });*/
    let firstBuy = true;
    let allsum = 0;
    let tokenCreator =null
    /*const centralWalletPrivateKeyUint8Array = bs58.decode(CENTRAL_WALLET_PRIVATE_KEY);
    const centralWalletKeypair = Keypair.fromSecretKey(centralWalletPrivateKeyUint8Array);

    // Transfer SOL to a random account before starting the loop
    const recipientPublicKey = await transferAllSOLToRandomAccount(connection, centralWalletKeypair, accounts); // Transfer 1 SOL
    if (!recipientPublicKey) {
        console.error('Failed to transfer SOL to a random account.');
        return;
    }*/
    //const watchedAccount = new PublicKey(ACCOUNT_TO_WATCH);
    let watchedAccounts: PublicKey[] = [new PublicKey(tokenAccountAddress)];
    
    let cacheSignature = new Set<string>();
    let allSum= 0;
    while(true){
        if(tokenCreator != null)
        {
            console.log("Token Creator: ",tokenCreator)
            console.log("Token Creator Buys: ",addressData[tokenCreator].TokenBuys)
            console.log("Token Creator Sells: ",addressData[tokenCreator].TokenSells)
        }

    const signatures = [];
    
    for (const account of watchedAccounts) {
        const publicKey = new PublicKey(account);
        let signaturesAccount ;
        if(firstRun){
            signaturesAccount = await connection.getSignaturesForAddress(
            account,
            
            {
                before: signatureBefore,
                limit: 1000 
            },
            'confirmed'
        )}
        else{
            signaturesAccount = await connection.getSignaturesForAddress(
                account,
                {
                    limit: 1000 
                },
                'confirmed'
            );
        }
    
        for(const signature of signaturesAccount){
            signatures.push({signature:signature,account:publicKey});
        }
    }
    signatures.reverse();
    let cnt = 0;
    for (const signatureInfo of signatures) {
        cnt++;
        const signature = signatureInfo.signature.signature;
        if(signature && !cacheSignature.has(signature)){
            cacheSignature.add(signature);
        if(cnt %100 == 0)
            console.log("Processed ",cnt," signatures");
            /*console.log(`New transaction detected: ${signature}`);
            const message = `
            New Token Transfer Detected!
            Signature: ${signature}
            `;
            await sendTelegramNotification(message);*/
            try {
                const transaction = await getParsedTransactionWithRetry(
                    connection,
                    signature,
                    {
                        commitment: 'confirmed',
                        maxSupportedTransactionVersion: 0
                    }
                );

                console.log("signature: ",signature)
                if (checkTransactionStatus(transaction, signature)) {
                    console.log('checkTransactionStatus succeeded for transaction: ', signature);

                    const result = await decodePumpFunTradev2(signature, transaction);
                    if (result.length > 0) {
                        let address = transaction.transaction.message.accountKeys[0].pubkey.toBase58()
                        
                        for (const res of result) {
                            console.log("Result: ", res)
                            {
                                if (res.direction == "buy") {
                                    let solAmount = (res.solAmount / LAMPORTS_PER_SOL)
                                    console.log("Buy Amount: ", solAmount);
                                    if (!ignoredAddresses.has(address.trim().toLowerCase())) 
                                        allsum += solAmount;

                                    // Update addressData for buy
                                    if (!addressData[address]) {
                                        addressData[address] = { buys: 0, sells: 0,TokenBuys:0,TokenSells:0, signatures: [] };
                                    }
                                    addressData[address].buys += solAmount;
                                    addressData[address].TokenBuys += res.tokenAmount;
                                    addressData[address].signatures.push(signature);


                                }

                                else if (res.direction == "sell") {
                                    let solAmount = (res.solAmount / LAMPORTS_PER_SOL)
                                    if (!ignoredAddresses.has(address.trim().toLowerCase())) 
                                        allsum -= solAmount;
                                    console.log("Sell Amount: ", solAmount);
                                    // Update addressData for sell
                                    if (!addressData[address]) {
                                        addressData[address] = { buys: 0, sells: 0,TokenBuys:0,TokenSells:0, signatures: [] };
                                    }
                                    addressData[address].sells += solAmount;
                                    addressData[address].TokenSells += res.tokenAmount;
                                    addressData[address].signatures.push(signature);
                                }

                            }
                        }
                        if((tokenCreator == address)){
                            console.log("TokenCreator signature found: ",signature)
                            if(Math.abs(addressData[address].TokenBuys - addressData[address].TokenSells )< 1e13){

                                
                                const filteredAddressArray = Object.entries(addressData)
                                    .filter(([address]) => 
                                        !ignoredAddresses.has(address.trim().toLowerCase())) // Filter addresses based on the set
                                    const addressArray=filteredAddressArray.map(([address, data]) => ({
                                        address,
                                        ...data,
                                        netValue: data.buys - data.sells // Calculate net buy/sell amount
                                    }));
                                    const tmpsum = addressArray.reduce((acc, data) => acc + data.netValue, 0);
                                    // Sort the array by net buy/sell amount in descending order
                                    addressArray.sort((a, b) => b.netValue - a.netValue);
                                    let output_file = 'token_logs/address_data_sorted_' + tokenAccountAddress + '.json';
                                    // Save the sorted address data to a JSON file
                                    fs.writeFileSync(output_file, JSON.stringify(addressArray, null, 2));
                                    let message;
                                    if(tmpsum<BUY_THRESHHOLD)
                                        message =`
                                            Token Creator ${address} has no more transactions and sum is sufficiently low !: ${tmpsum} => supposed sum : ${allsum}
                                            Buying
                                            `;
                                    else
                                        message =`
                                                Token Creator ${address} has no more transactions and sum is above threshold ! : ${allsum} => supposed sum : ${allsum}
                                                Rejecting !!
                                                `;
                                    sendTelegramNotification(message);
                                    return watchPumpFunTransactions();
                            }
                            
                        }

                    }

                    else {
                        console.log('This transaction does not appear to be a pump fun transaction');
                    }
                    if(isPumpFunCreation(signature,transaction)){
                            
                        console.log("Signautre Found: ",signature)
                        let address = transaction.transaction.message.accountKeys[0].pubkey.toBase58()
                        console.log("Address found : ",address)
                        tokenCreator = address;
                        ignoredAddresses.add(tokenCreator.trim().toLowerCase())    
                        //return watchTokenTransactions(address,tokenAccountAddress);
                    }
                        

                }
                else {
                    console.log('checkTransactionStatus failed for transaction: ', signature);
                }
            }
        catch (error) {    
            console.error("Error processing transaction:", error);
        }
                    
                    
        }}
        if(tokenCreator == null){
        console.log("Start Token not found in the transactions")
        console.log("restarting the process")
        watchPumpFunTransactions();
        }
        if((firstRun) && (tokenCreator))
    {
        allsum-=addressData[tokenCreator].buys;
        allsum+=addressData[tokenCreator].sells;
    }
        firstRun = false;
    }
}
    
        
       


// Call this function to stop watching transactions
export function stopAccountWatcher(): void {
    stopWatching = true;
}

