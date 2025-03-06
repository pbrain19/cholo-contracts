export const USDT = "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2";
export const VELO = "0x9560e827aF36c94D2Ac33a39bCE1Fe78631088Db";
export const OP = "0x4200000000000000000000000000000000000042";
export const WLD = "0xdC6fF44d5d932Cbd77B52E5612Ba0529DC6226F1";
export const TOSHI = "0xAC1Bd2486aAf3B5C0fc3Fd868558b082a531B2B4";
export const WETH = "0x4200000000000000000000000000000000000006";
export const AERO = "0x940181a94A35A4569E4529A3CDfB74e38FD98631";
export const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
export const ETH = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
export const KAIKO = "0x98d0baa52b2d063e780de12f615f963fe8537553";
export const CBBTC = "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf";

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
  [AERO.toLowerCase()]: {
    symbol: "AERO",
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
  [WETH.toLowerCase()]: {
    symbol: "WETH",
    decimals: 18,
  },
  [TOSHI.toLowerCase()]: {
    symbol: "TOSHI",
    decimals: 18,
  },
  [CBBTC.toLowerCase()]: {
    symbol: "CBBTC",
    decimals: 8,
  },
  [KAIKO.toLowerCase()]: {
    symbol: "KAIKO",
    decimals: 18,
  },
} as const;

// export const poolsToApprove = [
//   "0xebd5311bea1948e1441333976eadcfe5fbda777c",
//   "0x4e5541815227e3272c405886149f45d2f437c7ff",
//   "0x478946bcd4a5a22b316470f5486fafb928c0ba25",
// ];

export const poolsToApprove = ["0x74E4c08Bb50619b70550733D32b7e60424E9628e"];

export const PATHS_WE_NEED = [
  {
    tokenIn: USDC,
    tokenOut: USDT,
  },

  {
    tokenIn: AERO,
    tokenOut: USDT,
  },
  {
    tokenIn: TOSHI,
    tokenOut: USDT,
  },
  {
    tokenIn: CBBTC,
    tokenOut: USDT,
  },
  {
    tokenIn: KAIKO,
    tokenOut: USDT,
  },
  // {
  //   tokenIn: OP,
  //   tokenOut: USDC,
  // },
  // {
  //   tokenIn: WLD,
  //   tokenOut: USDC,
  // },
  // {
  //   tokenIn: WETH,
  //   tokenOut: USDC,
  // },
  // {
  //   tokenIn: WETH,
  //   tokenOut: USDT,
  // },
];

export const PRICE_FEEDS = [
  // {
  //   from: OP,
  //   to: USDC,
  //   priceFeed: "0x0D276FC14719f9292D5C1eA2198673d1f4269246",
  // },
  {
    from: AERO,
    to: USDC,
    priceFeed: "0x4EC5970fC728C5f65ba413992CD5fF6FD70fcfF0",
  },
  // {
  //   from: WLD,
  //   to: USDC,
  //   priceFeed: "0x4e1C6B168DCFD7758bC2Ab9d2865f1895813D236",
  // },
  {
    from: USDT,
    to: USDC,
    priceFeed: "0xf19d560eB8d2ADf07BD6D13ed03e1D11215721F9",
  },
  // {
  //   from: WETH,
  //   to: USDC,
  //   priceFeed: "0xb7B9A39CC63f856b90B364911CC324dC46aC1770",
  // },
];
