"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var web3_js_1 = require("@solana/web3.js");
var raydium_sdk_1 = require("@raydium-io/raydium-sdk");
var spl_token_1 = require("@solana/spl-token");
var bs58_1 = require("bs58");
function getPoolKey(connection, tokenAMint, tokenBMint) {
    return __awaiter(this, void 0, void 0, function () {
        var filters, accounts, _i, accounts_1, account, poolState;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    filters = [
                        {
                            memcmp: {
                                offset: 0,
                                bytes: raydium_sdk_1.LIQUIDITY_STATE_LAYOUT_V4.RAYDIUM_LIQUIDITY_STATE_LAYOUT_V4_ID.toBase58(), // Type assertion!
                            },
                        },
                        {
                            dataSize: raydium_sdk_1.LIQUIDITY_STATE_LAYOUT_V4.span,
                        },
                    ];
                    return [4 /*yield*/, connection.getProgramAccounts(new web3_js_1.PublicKey('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8'), { filters: filters })];
                case 1:
                    accounts = _a.sent();
                    for (_i = 0, accounts_1 = accounts; _i < accounts_1.length; _i++) {
                        account = accounts_1[_i];
                        poolState = raydium_sdk_1.LIQUIDITY_STATE_LAYOUT_V4.decode(account.account.data);
                        if ((poolState.mintA.equals(tokenAMint) && poolState.mintB.equals(tokenBMint)) ||
                            (poolState.mintA.equals(tokenBMint) && poolState.mintB.equals(tokenAMint))) {
                            return [2 /*return*/, account.pubkey];
                        }
                    }
                    return [2 /*return*/, null];
            }
        });
    });
}
function swapWSOLForToken(connection, wallet, tokenAddress, amountInSOL) {
    return __awaiter(this, void 0, void 0, function () {
        var tokenAMint, tokenBMint, poolKey, tokenA, tokenB, poolKeys, amountIn, slippage, poolInfo, _a, amountOut, minAmountOut, innerTransactions, _i, innerTransactions_1, innerTransaction, transaction, signature, error_1;
        var _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    tokenAMint = new web3_js_1.PublicKey(raydium_sdk_1.WSOL.mint);
                    tokenBMint = new web3_js_1.PublicKey(tokenAddress);
                    return [4 /*yield*/, getPoolKey(connection, tokenAMint, tokenBMint)];
                case 1:
                    poolKey = _d.sent();
                    if (!poolKey) {
                        console.error('Could not find a suitable pool for the given token pair');
                        return [2 /*return*/];
                    }
                    console.log("Using POOL_KEY: ".concat(poolKey.toBase58()));
                    tokenA = new raydium_sdk_1.Token(spl_token_1.TOKEN_PROGRAM_ID, tokenAMint, raydium_sdk_1.WSOL.decimals, raydium_sdk_1.WSOL.symbol, raydium_sdk_1.WSOL.name);
                    tokenB = new raydium_sdk_1.Token(spl_token_1.TOKEN_PROGRAM_ID, tokenBMint, 9, 'Unknown', 'Unknown');
                    return [4 /*yield*/, raydium_sdk_1.Liquidity.fetchPoolKeys(connection, poolKey)];
                case 2:
                    poolKeys = _d.sent();
                    amountIn = new raydium_sdk_1.TokenAmount(tokenA, amountInSOL * Math.pow(10, raydium_sdk_1.WSOL.decimals));
                    slippage = new raydium_sdk_1.Percent(50, 10000);
                    _d.label = 3;
                case 3:
                    _d.trys.push([3, 11, , 12]);
                    return [4 /*yield*/, raydium_sdk_1.Liquidity.fetchInfo({ connection: connection, poolKeys: poolKeys })];
                case 4:
                    poolInfo = _d.sent();
                    _a = raydium_sdk_1.Liquidity.computeAmountOut({
                        poolKeys: poolKeys,
                        poolInfo: poolInfo,
                        amountIn: amountIn,
                        currencyOut: tokenB,
                        slippage: slippage
                    }), amountOut = _a.amountOut, minAmountOut = _a.minAmountOut;
                    return [4 /*yield*/, raydium_sdk_1.Liquidity.makeSwapInstructionSimple({
                            connection: connection,
                            poolKeys: poolKeys,
                            userKeys: {
                                tokenAccounts: [], // Add user token accounts here
                                owner: wallet.publicKey,
                            },
                            amountIn: amountIn,
                            amountOut: minAmountOut,
                            fixedSide: 'in',
                            makeTxVersion: 0, // or 1 for v0 transactions
                        })];
                case 5:
                    innerTransactions = (_d.sent()).innerTransactions;
                    _i = 0, innerTransactions_1 = innerTransactions;
                    _d.label = 6;
                case 6:
                    if (!(_i < innerTransactions_1.length)) return [3 /*break*/, 10];
                    innerTransaction = innerTransactions_1[_i];
                    transaction = void 0;
                    if ('instructions' in innerTransaction && Array.isArray(innerTransaction.instructions)) {
                        transaction = (_b = new web3_js_1.Transaction()).add.apply(_b, innerTransaction.instructions);
                    }
                    else if (Array.isArray(innerTransaction) && innerTransaction.length > 0 && 'instructions' in innerTransaction[0]) {
                        transaction = (_c = new web3_js_1.Transaction()).add.apply(_c, innerTransaction[0].instructions);
                    }
                    else {
                        console.error('Unexpected innerTransaction structure:', innerTransaction);
                        throw new Error('Invalid innerTransaction structure');
                    }
                    return [4 /*yield*/, connection.sendTransaction(transaction, [wallet])];
                case 7:
                    signature = _d.sent();
                    console.log("Swap transaction sent: ".concat(signature));
                    return [4 /*yield*/, connection.confirmTransaction(signature)];
                case 8:
                    _d.sent();
                    console.log("Swap transaction confirmed: ".concat(signature));
                    _d.label = 9;
                case 9:
                    _i++;
                    return [3 /*break*/, 6];
                case 10: return [3 /*break*/, 12];
                case 11:
                    error_1 = _d.sent();
                    console.error('Error during swap:', error_1);
                    return [3 /*break*/, 12];
                case 12: return [2 /*return*/];
            }
        });
    });
}
// Usage example
function main() {
    return __awaiter(this, void 0, void 0, function () {
        var connection, base58SecretKey, secretKeyUint8Array, wallet, tokenAddress, amountInSOL;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    connection = new web3_js_1.Connection('https://shy-thrilling-putty.solana-mainnet.quiknode.pro/16cb32988e78aca562112a0066e5779a413346cc', 'confirmed');
                    base58SecretKey = '67rGZqVxUxtkBdTm9imwvY8PRpN8PndQdMARCSmgRZzYZU8smTXgktHAxveFNccdJdnyurQgcvQUHNGxtBCJfCti';
                    secretKeyUint8Array = bs58_1.default.decode(base58SecretKey);
                    wallet = web3_js_1.Keypair.fromSecretKey(secretKeyUint8Array);
                    tokenAddress = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
                    amountInSOL = 0.1;
                    return [4 /*yield*/, swapWSOLForToken(connection, wallet, tokenAddress, amountInSOL)];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
main().catch(console.error);
