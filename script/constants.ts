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
export const USDZ = "0x04d5ddf5f3a8939889f11e97f8c4bb48317f1938";
export const TRUMP = "0xc27468b12ffa6d714b1b5fbc87ef403f38b82ad4";
export const VENICE = "0xacfe6019ed1a7dc6f7b508c02d1b04ec88cc21bf";
export const TOKEN_INFO = {
  [VENICE.toLowerCase()]: {
    symbol: "VENICE",
    decimals: 18,
  },
  [TRUMP.toLowerCase()]: {
    symbol: "TRUMP",
    decimals: 18,
  },
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
  [USDZ.toLowerCase()]: {
    symbol: "USDZ",
    decimals: 18,
  },
} as const;

// export const poolsToApprove = [
//   "0xebd5311bea1948e1441333976eadcfe5fbda777c",
//   "0x4e5541815227e3272c405886149f45d2f437c7ff",
//   "0x478946bcd4a5a22b316470f5486fafb928c0ba25",
// ];

export const poolsToApprove = [
  "0x56b92E5B391DbFb8b8028AC95A4b97f52ffEB416",
  "0x74E4c08Bb50619b70550733D32b7e60424E9628e",
  "0x22A52bB644f855ebD5ca2edB643FF70222D70C31",
  "0x4e962BB3889Bf030368F56810A9c96B83CB3E778",
  "0xde5ff829fef54d1bdec957d9538a306f0ead1368",
  "0x0c40e7f5b43f6759060a3c4d2fb406dfecf03b57",
  "0x46d398a5b33709877f50c8918a7ee96f1be1d7dd",
];

export const PATHS_WE_NEED = [
  // {
  //   tokenIn: USDC,
  //   tokenOut: USDT,
  // },
  // {
  //   tokenIn: AERO,
  //   tokenOut: USDT,
  // },
  // {
  //   tokenIn: TOSHI,
  //   tokenOut: USDT,
  // },
  // {
  //   tokenIn: CBBTC,
  //   tokenOut: USDT,
  // },
  {
    tokenIn: KAIKO,
    tokenOut: USDT,
  },
  // {
  //   tokenIn: TRUMP,
  //   tokenOut: USDT,
  // },
  // {
  //   tokenIn: VENICE,
  //   tokenOut: USDT,
  // },
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
