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

export const poolsToApprove = [
  "0xebd5311bea1948e1441333976eadcfe5fbda777c",
  "0x4e5541815227e3272c405886149f45d2f437c7ff",
];

export const PATHS_WE_NEED = [
  {
    tokenIn: USDC,
    tokenOut: USDT,
  },
  {
    tokenIn: OP,
    tokenOut: USDT,
  },
  {
    tokenIn: VELO,
    tokenOut: USDT,
  },
  {
    tokenIn: WLD,
    tokenOut: USDT,
  },
  {
    tokenIn: OP,
    tokenOut: USDC,
  },
  {
    tokenIn: WLD,
    tokenOut: USDC,
  },
];

export const PRICE_FEEDS = [
  {
    from: OP,
    to: USDC,
    priceFeed: "0x0D276FC14719f9292D5C1eA2198673d1f4269246",
  },
  {
    from: VELO,
    to: USDC,
    priceFeed: "0x0f2Ed59657e391746C1a097BDa98F2aBb94b1120",
  },
  {
    from: WLD,
    to: USDC,
    priceFeed: "0x4e1C6B168DCFD7758bC2Ab9d2865f1895813D236",
  },
  {
    from: USDT,
    to: USDC,
    priceFeed: "0xECef79E109e997bCA29c1c0897ec9d7b03647F5E",
  },
];
