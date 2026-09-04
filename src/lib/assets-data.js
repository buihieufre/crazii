export const ASSETS_DATA = [
  {
    name: "Commodities",
    symbols: [
      {
        name: "XAUUSD.ca",
        code: "XAUUSD.ca",
        timeframes: [
          { code: "XAUUSD.ca_5", name: "5m", minutes: 5 },
          { code: "XAUUSD.ca_15", name: "15m", minutes: 15 },
          { code: "XAUUSD.ca_1440", name: "1D", minutes: 1440 }
        ],
        image: "https://s3-symbol-logo.tradingview.com/metal/gold.svg",
        decimals: 2,
        price: "4419.02",
        active: true
      },
      {
        name: "XAGUSD.ca",
        code: "XAGUSD.ca",
        timeframes: [
          { code: "XAGUSD.ca_5", name: "5m", minutes: 5 },
          { code: "XAGUSD.ca_15", name: "15m", minutes: 15 },
          { code: "XAGUSD.ca_1440", name: "1D", minutes: 1440 }
        ],
        image: "https://s3-symbol-logo.tradingview.com/metal/silver.svg",
        decimals: 4,
        price: "65.846",
        active: true
      },
      {
        name: "USOil",
        code: "USOil",
        timeframes: [
          { code: "USOil_5", name: "5m", minutes: 5 },
          { code: "USOil_15", name: "15m", minutes: 15 },
          { code: "USOil_1440", name: "1D", minutes: 1440 }
        ],
        image: "https://s3-symbol-logo.tradingview.com/crude-oil.svg",
        decimals: 2,
        price: "89.29",
        active: true
      }
    ]
  },
  {
    name: "Crypto",
    symbols: [
      {
        name: "BTCUSD",
        code: "BTCUSD",
        timeframes: [
          { code: "BTCUSD_5", name: "5m", minutes: 5 },
          { code: "BTCUSD_15", name: "15m", minutes: 15 },
          { code: "BTCUSD_1440", name: "1D", minutes: 1440 }
        ],
        image: "https://s3-symbol-logo.tradingview.com/crypto/XTVCBTC.svg",
        decimals: 2,
        price: "79465.11",
        active: true
      },
      {
        name: "ETHUSD",
        code: "ETHUSD",
        timeframes: [
          { code: "ETHUSD_5", name: "5m", minutes: 5 },
          { code: "ETHUSD_15", name: "15m", minutes: 15 },
          { code: "ETHUSD_1440", name: "1D", minutes: 1440 }
        ],
        image: "https://s3-symbol-logo.tradingview.com/crypto/XTVCETH.svg",
        decimals: 2,
        price: "2442.92",
        active: true
      }
    ]
  },
  {
    name: "Indices & US Stocks",
    symbols: [
      {
        name: "SP500.ca",
        code: "SP500.ca",
        timeframes: [
          { code: "SP500.ca_5", name: "5m", minutes: 5 },
          { code: "SP500.ca_1440", name: "1D", minutes: 1440 }
        ],
        image: "https://s3-symbol-logo.tradingview.com/indices/s-and-p-500.svg",
        decimals: 2,
        price: "7704.00",
        active: true
      },
      {
        name: "DowJones.ca",
        code: "DowJones.ca",
        timeframes: [
          { code: "DowJones.ca_5", name: "5m", minutes: 5 },
          { code: "DowJones.ca_1440", name: "1D", minutes: 1440 }
        ],
        image: "https://s3-symbol-logo.tradingview.com/indices/dow-30.svg",
        decimals: 2,
        price: "53348.90",
        active: true
      },
      {
        name: "DAX.ca",
        code: "DAX.ca",
        timeframes: [
          { code: "DAX.ca_5", name: "5m", minutes: 5 },
          { code: "DAX.ca_1440", name: "1D", minutes: 1440 }
        ],
        image: "https://s3-symbol-logo.tradingview.com/indices/dax.svg",
        decimals: 2,
        price: "26035.20",
        active: true
      },
      {
        name: "Nasdaq.ca",
        code: "Nasdaq.ca",
        timeframes: [
          { code: "Nasdaq.ca_5", name: "5m", minutes: 5 },
          { code: "Nasdaq.ca_1440", name: "1D", minutes: 1440 }
        ],
        image: "https://s3-symbol-logo.tradingview.com/indices/nasdaq-composite.svg",
        decimals: 2,
        price: "29426.80",
        active: true
      },
      {
        name: "#NVDA",
        code: "#NVDA",
        timeframes: [
          { code: "#NVDA_1440", name: "1D", minutes: 1440 }
        ],
        image: "https://s3-symbol-logo.tradingview.com/nvidia.svg",
        decimals: 2,
        price: "230.26",
        active: true
      },
      {
        name: "#GOOGL",
        code: "#GOOGL",
        timeframes: [
          { code: "#GOOGL_1440", name: "1D", minutes: 1440 }
        ],
        image: "https://s3-symbol-logo.tradingview.com/alphabet.svg",
        decimals: 2,
        price: "338.09",
        active: true
      },
      {
        name: "#APPL",
        code: "#APPL",
        timeframes: [
          { code: "#APPL_1440", name: "1D", minutes: 1440 }
        ],
        image: "https://s3-symbol-logo.tradingview.com/apple.svg",
        decimals: 2,
        price: "320.61",
        active: true
      },
      {
        name: "#MSFT",
        code: "#MSFT",
        timeframes: [
          { code: "#MSFT_1440", name: "1D", minutes: 1440 }
        ],
        image: "https://s3-symbol-logo.tradingview.com/microsoft.svg",
        decimals: 2,
        price: "499.93",
        active: true
      },
      {
        name: "#TSLA",
        code: "#TSLA",
        timeframes: [
          { code: "#TSLA_1440", name: "1D", minutes: 1440 }
        ],
        image: "https://s3-symbol-logo.tradingview.com/tesla.svg",
        decimals: 2,
        price: "351.74",
        active: true
      },
      {
        name: "#WMT",
        code: "#WMT",
        timeframes: [
          { code: "#WMT_1440", name: "1D", minutes: 1440 }
        ],
        image: "https://s3-symbol-logo.tradingview.com/walmart.svg",
        decimals: 2,
        price: "107.20",
        active: true
      },
      {
        name: "#NFLX",
        code: "#NFLX",
        timeframes: [
          { code: "#NFLX_1440", name: "1D", minutes: 1440 }
        ],
        image: "https://s3-symbol-logo.tradingview.com/netflix.svg",
        decimals: 2,
        price: "78.79",
        active: true
      },
      {
        name: "#C",
        code: "#C",
        timeframes: [
          { code: "#C_1440", name: "1D", minutes: 1440 }
        ],
        image: "https://s3-symbol-logo.tradingview.com/citigroup.svg",
        decimals: 2,
        price: "137.79",
        active: true
      },
      {
        name: "#BABA",
        code: "#BABA",
        timeframes: [
          { code: "#BABA_1440", name: "1D", minutes: 1440 }
        ],
        image: "https://s3-symbol-logo.tradingview.com/alibaba.svg",
        decimals: 2,
        price: "112.71",
        active: true
      },
      {
        name: "#FB",
        code: "#FB",
        timeframes: [
          { code: "#FB_1440", name: "1D", minutes: 1440 }
        ],
        image: "https://s3-symbol-logo.tradingview.com/meta-platforms.svg",
        decimals: 2,
        price: "609.23",
        active: true
      },
      {
        name: "#OXY",
        code: "#OXY",
        timeframes: [
          { code: "#OXY_1440", name: "1D", minutes: 1440 }
        ],
        image: "https://s3-symbol-logo.tradingview.com/occidental-petroleum.svg",
        decimals: 2,
        price: "59.98",
        active: true
      }
    ]
  },
  {
    name: "Indices 2",
    symbols: [
      {
        name: "ChinaA50.ca",
        code: "ChinaA50.ca",
        timeframes: [
          { code: "ChinaA50.ca_5", name: "5m", minutes: 5 },
          { code: "ChinaA50.ca_1440", name: "1D", minutes: 1440 }
        ],
        image: "https://s3-symbol-logo.tradingview.com/indices/china-a50.svg",
        decimals: 2,
        price: "14763.70",
        active: true
      },
      {
        name: "Nikkei.ca",
        code: "Nikkei.ca",
        timeframes: [
          { code: "Nikkei.ca_5", name: "5m", minutes: 5 },
          { code: "Nikkei.ca_1440", name: "1D", minutes: 1440 }
        ],
        image: "https://s3-symbol-logo.tradingview.com/indices/nikkei-225.svg",
        decimals: 2,
        price: "65635.00",
        active: true
      },
      {
        name: "HangSeng.ca",
        code: "HangSeng.ca",
        timeframes: [
          { code: "HangSeng.ca_1", name: "1m", minutes: 1 },
          { code: "HangSeng.ca_5", name: "5m", minutes: 5 },
          { code: "HangSeng.ca_1440", name: "1D", minutes: 1440 }
        ],
        image: "https://s3-symbol-logo.tradingview.com/indices/hang-seng.svg",
        decimals: 2,
        price: "25719.00",
        active: true
      }
    ]
  },
  {
    name: "Forex",
    symbols: [
      {
        name: "EURUSD.ca",
        code: "EURUSD.ca",
        timeframes: [
          { code: "EURUSD.ca_5", name: "5m", minutes: 5 }
        ],
        image: "https://s3-symbol-logo.tradingview.com/country/EU.svg",
        decimals: 5,
        price: "1.16135",
        active: true
      },
      {
        name: "EURJPY.ca",
        code: "EURJPY.ca",
        timeframes: [
          { code: "EURJPY.ca_5", name: "5m", minutes: 5 }
        ],
        image: "https://s3-symbol-logo.tradingview.com/country/EU.svg",
        decimals: 4,
        price: "181.287",
        active: true
      },
      {
        name: "USDJPY.ca",
        code: "USDJPY.ca",
        timeframes: [
          { code: "USDJPY.ca_5", name: "5m", minutes: 5 }
        ],
        image: "https://s3-symbol-logo.tradingview.com/country/US.svg",
        decimals: 4,
        price: "156.101",
        active: true
      },
      {
        name: "USDCHF.ca",
        code: "USDCHF.ca",
        timeframes: [
          { code: "USDCHF.ca_5", name: "5m", minutes: 5 }
        ],
        image: "https://s3-symbol-logo.tradingview.com/country/US.svg",
        decimals: 5,
        price: "0.80996",
        active: true
      },
      {
        name: "GBPUSD.ca",
        code: "GBPUSD.ca",
        timeframes: [
          { code: "GBPUSD.ca_5", name: "5m", minutes: 5 }
        ],
        image: "https://s3-symbol-logo.tradingview.com/country/GB.svg",
        decimals: 5,
        price: "1.35136",
        active: true
      }
    ]
  },
  {
    name: "China Stocks",
    symbols: [
      {
        name: "000062 (Shenzhen Huaqiang)",
        code: "000062",
        timeframes: [
          { code: "000062_1440", name: "1D", minutes: 1440 }
        ],
        image: "https://asset.crazii.com/icon/china-stocks.jpg",
        decimals: 2,
        price: "23.77",
        active: true
      },
      {
        name: "000725 (BOE Tech)",
        code: "000725",
        timeframes: [
          { code: "000725_1440", name: "1D", minutes: 1440 }
        ],
        image: "https://asset.crazii.com/icon/china-stocks.jpg",
        decimals: 2,
        price: "5.61",
        active: true
      },
      {
        name: "002475 (Luxshare Precision)",
        code: "002475",
        timeframes: [
          { code: "002475_1440", name: "1D", minutes: 1440 }
        ],
        image: "https://asset.crazii.com/icon/china-stocks.jpg",
        decimals: 2,
        price: "54.30",
        active: true
      },
      {
        name: "002821 (Asymchem)",
        code: "002821",
        timeframes: [
          { code: "002821_1440", name: "1D", minutes: 1440 }
        ],
        image: "https://asset.crazii.com/icon/china-stocks.jpg",
        decimals: 2,
        price: "163.02",
        active: true
      },
      {
        name: "300604 (Changchuan Tech)",
        code: "300604",
        timeframes: [
          { code: "300604_1440", name: "1D", minutes: 1440 }
        ],
        image: "https://asset.crazii.com/icon/china-stocks.jpg",
        decimals: 2,
        price: "254.23",
        active: true
      },
      {
        name: "300632 (Guangpu Lighting)",
        code: "300632",
        timeframes: [
          { code: "300632_1440", name: "1D", minutes: 1440 }
        ],
        image: "https://asset.crazii.com/icon/china-stocks.jpg",
        decimals: 2,
        price: "17.15",
        active: true
      },
      {
        name: "300750 (CATL)",
        code: "300750",
        timeframes: [
          { code: "300750_1440", name: "1D", minutes: 1440 }
        ],
        image: "https://asset.crazii.com/icon/china-stocks.jpg",
        decimals: 2,
        price: "381.00",
        active: true
      },
      {
        name: "600970 (Sinoma Intl)",
        code: "600970",
        timeframes: [
          { code: "600970_1440", name: "1D", minutes: 1440 }
        ],
        image: "https://asset.crazii.com/icon/china-stocks.jpg",
        decimals: 2,
        price: "7.80",
        active: true
      },
      {
        name: "601138 (Foxconn FII)",
        code: "601138",
        timeframes: [
          { code: "601138_1440", name: "1D", minutes: 1440 }
        ],
        image: "https://asset.crazii.com/icon/china-stocks.jpg",
        decimals: 2,
        price: "63.69",
        active: true
      },
      {
        name: "601899 (Zijin Mining)",
        code: "601899",
        timeframes: [
          { code: "601899_1440", name: "1D", minutes: 1440 }
        ],
        image: "https://asset.crazii.com/icon/china-stocks.jpg",
        decimals: 2,
        price: "33.35",
        active: true
      },
      {
        name: "688008 (Montage Tech)",
        code: "688008",
        timeframes: [
          { code: "688008_1440", name: "1D", minutes: 1440 }
        ],
        image: "https://asset.crazii.com/icon/china-stocks.jpg",
        decimals: 2,
        price: "187.70",
        active: true
      },
      {
        name: "688041 (Hygon Info)",
        code: "688041",
        timeframes: [
          { code: "688041_1440", name: "1D", minutes: 1440 }
        ],
        image: "https://asset.crazii.com/icon/china-stocks.jpg",
        decimals: 2,
        price: "243.67",
        active: true
      },
      {
        name: "688981 (SMIC)",
        code: "688981",
        timeframes: [
          { code: "688981_1440", name: "1D", minutes: 1440 }
        ],
        image: "https://asset.crazii.com/icon/china-stocks.jpg",
        decimals: 2,
        price: "121.14",
        active: true
      }
    ]
  }
];

// Flat list helper
export const ALL_SYMBOLS = ASSETS_DATA.flatMap(cat => cat.symbols);

export function getSymbolByCode(symbolCode) {
  return ALL_SYMBOLS.find(s => s.code === symbolCode) || ALL_SYMBOLS[0];
}

export function getTimeframeByCode(tfCode) {
  for (const sym of ALL_SYMBOLS) {
    const found = sym.timeframes.find(tf => tf.code === tfCode);
    if (found) return { ...found, symbol: sym };
  }
  return { code: 'XAUUSD.ca_5', name: '5m', minutes: 5, symbol: ALL_SYMBOLS[0] };
}
