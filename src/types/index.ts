export interface Token {
  address: string;
  name: string;
  symbol: string;
  description: string;
  image: string;
  showName: boolean;
  createdOn: number;
  website: string;
  telegram: string;
  twitter: string;
  bondingCurve: string;
  associatedBondingCurve: string;
  creator: string;
  marketCap: number;
  price: number;
  progress: number;
  virtualSolReserves: number;
  virtualTokenReserves: number;
  liquidity: number;
  volume24h: number;
  priceChange24h: number;
  holders: number;
  raydiumPool?: string;
}

export interface Trade {
  id: string;
  type: 'buy' | 'sell';
  tokenAddress: string;
  tokenSymbol: string;
  amount: number;
  price: number;
  timestamp: number;
  status: 'pending' | 'success' | 'failed';
  signature?: string;
}

export interface BotConfig {
  enabled: boolean;
  maxTokenAge: number;
  buyAmount: number;
  sellPercentage: number;
  stopLoss: number;
  takeProfit: number;
  maxPositions: number;
  slippage: number;
}

export interface Position {
  id: string;
  tokenAddress: string;
  tokenSymbol: string;
  tokenName: string;
  amount: number;
  entryPrice: number;
  currentPrice: number;
  solInvested: number;
  currentValue: number;
  pnl: number;
  pnlPercent: number;
  pnlPercentage: number;
  openedAt: number;
  closedAt?: number;
  status: 'open' | 'closed';
  exitPrice?: number;
  exitReason?: string;
  exitTimestamp?: number;
}

export interface WalletState {
  connected: boolean;
  publicKey: string | null;
  balance: number;
}

export interface BotState {
  isRunning: boolean;
  tokensDetected: number;
  tradesExecuted: number;
  totalPnl: number;
  uptime: number;
}

export interface TradeParams {
  mintAddress: string;
  solAmount?: number;
  tokenAmount?: number;
  maxSlippage?: number;
  type: 'buy' | 'sell';
}

export interface TradeResult {
  success: boolean;
  signature?: string;
  solAmount?: number;
  tokenAmount?: number;
  price?: number;
  error?: string;
  timestamp: number;
}
