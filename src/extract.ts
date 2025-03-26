import * as fs from 'fs';
import * as readline from 'readline';

async function getTotalBoughtAmounts(filename: string): Promise<Set<string>> {
    const totalAmounts = new Set<string>();
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

export async function compareFiles() {
    const file1 = 'text.txt';
    const file2 = 'text1.txt';

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
