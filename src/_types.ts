// src/types.ts

import { PublicKey } from "@solana/web3.js";

export interface SwapDetails {
    inToken: string;
    outToken: string;
    amountIn: number;
    amountOut: number;
}

export interface SwapBaseInLog {
    log_type: number;
    amount_in: bigint;
    minimum_out: bigint;
    direction: bigint;
    user_source: bigint;
    pool_coin: bigint;
    pool_pc: bigint;
    out_amount: bigint;
}

export interface SwapBaseOutLog {
    log_type: number;
    max_in: bigint;
    amount_out: bigint;
    direction: bigint;
    user_source: bigint;
    pool_coin: bigint;
    pool_pc: bigint;
    deduct_in: bigint;
}

export type LogTypeToStruct = Map<number, any>;

export interface TokenData {
    mint: PublicKey;
    decimals: number;
    buyPrice: number; // Price at which the token was bought (in SOL)
}
