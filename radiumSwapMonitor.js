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
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
var web3_js_1 = require("@solana/web3.js");
var spl_token_1 = require("@solana/spl-token");
var fs = require("fs");
var buffer_layout_1 = require("@solana/buffer-layout");
// Constants
var RAYDIUM_PROGRAM_ID = new web3_js_1.PublicKey('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8');
var RPC_ENDPOINT = 'https://api.mainnet-beta.solana.com';
var LOG_FILE = 'raydium_swaps.log';
var UNIFORM_DELAY = 5000; // 5 seconds delay between each execution
var BASE_RETRY_DELAY = 10000; // 10 seconds base delay for retries
// Struct definitions (unchanged)
var swapBaseInLog = (0, buffer_layout_1.struct)([
    (0, buffer_layout_1.u8)('log_type'),
    (0, buffer_layout_1.nu64)('amount_in'),
    (0, buffer_layout_1.nu64)('minimum_out'),
    (0, buffer_layout_1.nu64)('direction'),
    (0, buffer_layout_1.nu64)('user_source'),
    (0, buffer_layout_1.nu64)('pool_coin'),
    (0, buffer_layout_1.nu64)('pool_pc'),
    (0, buffer_layout_1.nu64)('out_amount'),
]);
var swapBaseOutLog = (0, buffer_layout_1.struct)([
    (0, buffer_layout_1.u8)('log_type'),
    (0, buffer_layout_1.nu64)('max_in'),
    (0, buffer_layout_1.nu64)('amount_out'),
    (0, buffer_layout_1.nu64)('direction'),
    (0, buffer_layout_1.nu64)('user_source'),
    (0, buffer_layout_1.nu64)('pool_coin'),
    (0, buffer_layout_1.nu64)('pool_pc'),
    (0, buffer_layout_1.nu64)('deduct_in'),
]);
var logTypeToStruct = new Map([
    [3, swapBaseInLog],
    [4, swapBaseOutLog],
]);
// Helper functions
function getTransactionWithRetry(connection_1, signature_1) {
    return __awaiter(this, arguments, void 0, function (connection, signature, maxRetries) {
        var _loop_1, attempt, state_1;
        if (maxRetries === void 0) { maxRetries = 3; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _loop_1 = function (attempt) {
                        var transaction, error_1, delay;
                        return __generator(this, function (_b) {
                            switch (_b.label) {
                                case 0:
                                    _b.trys.push([0, 2, , 3]);
                                    return [4 /*yield*/, connection.getTransaction(signature, {
                                            maxSupportedTransactionVersion: 0
                                        })];
                                case 1:
                                    transaction = _b.sent();
                                    if (transaction) {
                                        if (transaction.meta && transaction.meta.loadedAddresses) {
                                            console.log("Transaction ".concat(signature, " has loaded addresses:"), transaction.meta.loadedAddresses);
                                        }
                                        return [2 /*return*/, { value: transaction }];
                                    }
                                    return [3 /*break*/, 3];
                                case 2:
                                    error_1 = _b.sent();
                                    console.error("Attempt ".concat(attempt + 1, " failed:"), error_1);
                                    return [3 /*break*/, 3];
                                case 3:
                                    delay = BASE_RETRY_DELAY * Math.pow(2, attempt);
                                    console.log("Waiting ".concat(delay, "ms before next attempt..."));
                                    return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, delay); })];
                                case 4:
                                    _b.sent();
                                    return [2 /*return*/];
                            }
                        });
                    };
                    attempt = 0;
                    _a.label = 1;
                case 1:
                    if (!(attempt < maxRetries)) return [3 /*break*/, 4];
                    return [5 /*yield**/, _loop_1(attempt)];
                case 2:
                    state_1 = _a.sent();
                    if (typeof state_1 === "object")
                        return [2 /*return*/, state_1.value];
                    _a.label = 3;
                case 3:
                    attempt++;
                    return [3 /*break*/, 1];
                case 4: throw new Error("Failed to fetch transaction after ".concat(maxRetries, " attempts"));
            }
        });
    });
}
function isSwapTransaction(logs) {
    return logs.some(function (log) {
        return log.toLowerCase().includes('swap') ||
            log.toLowerCase().includes('transfer') ||
            log.toLowerCase().includes('amount_in') ||
            log.toLowerCase().includes('amount_out');
    });
}
function parseSwapInfo(logs) {
    for (var _i = 0, logs_1 = logs; _i < logs_1.length; _i++) {
        var log = logs_1[_i];
        if (log.includes('ray_log')) {
            var parts = log.split('ray_log:');
            if (parts.length > 1) {
                var logData = Buffer.from(parts[1].trim(), 'base64');
                if (logData.length > 0) {
                    var logType = logData[0];
                    var logStruct = logTypeToStruct.get(logType);
                    if (logStruct && typeof logStruct.decode === 'function') {
                        return logStruct.decode(logData);
                    }
                }
            }
        }
    }
    return null;
}
// Queue management
var queue = [];
var isProcessing = false;
function processQueue(connection, logStream) {
    return __awaiter(this, void 0, void 0, function () {
        var logsInfo, error_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (isProcessing || queue.length === 0)
                        return [2 /*return*/];
                    isProcessing = true;
                    logsInfo = queue.shift();
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, 4, 6]);
                    return [4 /*yield*/, processLogEvent(connection, logsInfo, logStream)];
                case 2:
                    _a.sent();
                    return [3 /*break*/, 6];
                case 3:
                    error_2 = _a.sent();
                    console.error('Error processing log event:', error_2);
                    return [3 /*break*/, 6];
                case 4:
                    isProcessing = false;
                    // Add uniform delay after each execution
                    return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, UNIFORM_DELAY); })];
                case 5:
                    // Add uniform delay after each execution
                    _a.sent();
                    processQueue(connection, logStream);
                    return [7 /*endfinally*/];
                case 6: return [2 /*return*/];
            }
        });
    });
}
function processLogEvent(connection, logsInfo, logStream) {
    return __awaiter(this, void 0, void 0, function () {
        var signature, err, logs, swapInfo, transaction, accountKeys, tokenAccounts, error_3;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    signature = logsInfo.signature, err = logsInfo.err, logs = logsInfo.logs;
                    console.log("\nProcessing transaction: ".concat(signature));
                    if (err) {
                        console.log("Transaction failed with error: ".concat(JSON.stringify(err)));
                        return [2 /*return*/];
                    }
                    if (!isSwapTransaction(logs)) {
                        console.log('This transaction does not appear to be a swap.');
                        return [2 /*return*/];
                    }
                    console.log('This transaction appears to be a swap.');
                    swapInfo = parseSwapInfo(logs);
                    if (!swapInfo) {
                        console.log("Could not find swap info for transaction ".concat(signature));
                        return [2 /*return*/];
                    }
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    console.log("Fetching transaction ".concat(signature, "..."));
                    return [4 /*yield*/, getTransactionWithRetry(connection, signature)];
                case 2:
                    transaction = _a.sent();
                    if (!transaction) {
                        console.log("Transaction ".concat(signature, " not found"));
                        return [2 /*return*/];
                    }
                    console.log('Transaction fetched successfully');
                    accountKeys = void 0;
                    if (transaction.meta && transaction.meta.loadedAddresses) {
                        console.log('Using loaded addresses for account keys');
                        accountKeys = __spreadArray(__spreadArray(__spreadArray([], transaction.transaction.message.staticAccountKeys, true), (transaction.meta.loadedAddresses.writable || []), true), (transaction.meta.loadedAddresses.readonly || []), true);
                    }
                    else {
                        accountKeys = transaction.transaction.message.getAccountKeys().keySegments().flat();
                    }
                    tokenAccounts = accountKeys.filter(function (key) { return key && key.toBase58() !== spl_token_1.TOKEN_PROGRAM_ID.toBase58(); });
                    // Process the swap information and token accounts here
                    // This is where you'd add your logic to analyze the swap and write to the log file
                    console.log('Swap processed successfully');
                    logStream.write("".concat(JSON.stringify({ signature: signature, swapInfo: swapInfo, tokenAccounts: tokenAccounts }), "\n"));
                    console.log("Transaction processed successfully");
                    console.log("".concat(JSON.stringify({ signature: signature, swapInfo: swapInfo, tokenAccounts: tokenAccounts }), "\n"));
                    return [3 /*break*/, 4];
                case 3:
                    error_3 = _a.sent();
                    console.error("Error processing swap transaction ".concat(signature, ":"), error_3);
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/];
            }
        });
    });
}
// Main function
function monitorRaydiumTransactions() {
    return __awaiter(this, void 0, void 0, function () {
        var connection, logStream;
        return __generator(this, function (_a) {
            console.log('Monitoring Raydium transactions...');
            connection = new web3_js_1.Connection(RPC_ENDPOINT, 'confirmed');
            logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });
            connection.onLogs(RAYDIUM_PROGRAM_ID, function (logsInfo) {
                queue.push(logsInfo);
                processQueue(connection, logStream);
            }, 'confirmed');
            return [2 /*return*/];
        });
    });
}
// Run the monitor
monitorRaydiumTransactions().catch(console.error);
