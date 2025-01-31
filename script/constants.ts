export const USDT = "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58";
export const VELO = "0x9560e827aF36c94D2Ac33a39bCE1Fe78631088Db";
export const OP = "0x4200000000000000000000000000000000000042";
export const USDC = "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85";
export const ETH = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
export const WLD = "0xdC6fF44d5d932Cbd77B52E5612Ba0529DC6226F1";

export const TOKEN_INFO = {
  [USDC.toLowerCase()]: {
    symbol: "USDC",
    decimals: 6,
  },
  [OP.toLowerCase()]: {
    symbol: "OP",
    decimals: 18,
  },
  [USDT.toLowerCase()]: {
    symbol: "USDT",
    decimals: 6,
  },
  [VELO.toLowerCase()]: {
    symbol: "VELO",
    decimals: 18,
  },
  [WLD.toLowerCase()]: {
    symbol: "WLD",
    decimals: 18,
  },
  [ETH.toLowerCase()]: {
    symbol: "ETH",
    decimals: 18,
  },
} as const;

export const PATHS_WE_NEED = [
  { tokenIn: USDC, tokenOut: USDT },
  { tokenIn: OP, tokenOut: USDT },
  { tokenIn: VELO, tokenOut: USDT },
  { tokenIn: WLD, tokenOut: USDT },
];
