"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTotalBoughtAmounts = getTotalBoughtAmounts;
exports.compareFiles = compareFiles;
const fs = __importStar(require("fs"));
const readline = __importStar(require("readline"));
async function getTotalBoughtAmounts(filename) {
    const totalAmounts = new Set();
    const pattern = /^Total bought amount:\s*(.*)/;
    const fileStream = fs.createReadStream(filename);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });
    for await (const line of rl) {
        const match = line.match(pattern);
        if (match) {
            totalAmounts.add(match[1].trim());
        }
    }
    return totalAmounts;
}
async function compareFiles() {
    const file1 = 'test.txt';
    const file2 = 'test1.txt';
    const amounts1 = await getTotalBoughtAmounts(file1);
    const amounts2 = await getTotalBoughtAmounts(file2);
    console.log("Amounts in file1:", amounts1);
    console.log("Amounts in file2:", amounts2);
    // Compare the two sets
    const commonAmounts = new Set([...amounts1].filter(x => amounts2.has(x)));
    const onlyInFile1 = new Set([...amounts1].filter(x => !amounts2.has(x)));
    const onlyInFile2 = new Set([...amounts2].filter(x => !amounts1.has(x)));
    console.log("\nCommon amounts:", commonAmounts);
    console.log("Amounts only in file1:", onlyInFile1);
    console.log("Amounts only in file2:", onlyInFile2);
}
compareFiles().catch(console.error);
//# sourceMappingURL=extract.js.map