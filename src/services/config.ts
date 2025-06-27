export interface AppConfig {
  solana: {
    rpcEndpoint: string;
    wssEndpoint: string;
    privateKey?: string;
  };
  trading: {
    defaultBuyAmount: number;
    maxSlippage: number;
    priorityFee: number;
    stopLossPercentage: number;
    takeProfitPercentage: number;
  };
  monitoring: {
    tokenDetectionEnabled: boolean;
    autoTradingEnabled: boolean;
    maxConcurrentTrades: number;
  };
  api: {
    pumpPortalApiKey?: string;
    birdeyeApiKey?: string;
  };
  geyser?: {
    endpoint: string;
    apiToken: string;
    authType: string;
  };
}

class ConfigService {
  private config: AppConfig;

  constructor() {
    this.config = this.loadConfig();
  }

  private loadConfig(): AppConfig {
    // Load from environment variables
    return {
      solana: {
        rpcEndpoint: this.getEnvVar('NEXT_PUBLIC_SOLANA_RPC_ENDPOINT', 'https://api.mainnet-beta.solana.com'),
        wssEndpoint: this.getEnvVar('NEXT_PUBLIC_SOLANA_WSS_ENDPOINT', 'wss://api.mainnet-beta.solana.com'),
        privateKey: this.getEnvVar('SOLANA_PRIVATE_KEY'),
      },
      trading: {
        defaultBuyAmount: parseFloat(this.getEnvVar('DEFAULT_BUY_AMOUNT', '0.01')),
        maxSlippage: parseFloat(this.getEnvVar('MAX_SLIPPAGE', '5.0')),
        priorityFee: parseFloat(this.getEnvVar('PRIORITY_FEE', '0.0001')),
        stopLossPercentage: parseFloat(this.getEnvVar('STOP_LOSS_PERCENTAGE', '20.0')),
        takeProfitPercentage: parseFloat(this.getEnvVar('TAKE_PROFIT_PERCENTAGE', '100.0')),
      },
      monitoring: {
        tokenDetectionEnabled: this.getEnvVar('TOKEN_DETECTION_ENABLED', 'true') === 'true',
        autoTradingEnabled: this.getEnvVar('AUTO_TRADING_ENABLED', 'false') === 'true',
        maxConcurrentTrades: parseInt(this.getEnvVar('MAX_CONCURRENT_TRADES', '5')),
      },
      api: {
        pumpPortalApiKey: this.getEnvVar('PUMP_PORTAL_API_KEY'),
        birdeyeApiKey: this.getEnvVar('BIRDEYE_API_KEY'),
      },
      geyser: this.getEnvVar('GEYSER_ENDPOINT') ? {
        endpoint: this.getEnvVar('GEYSER_ENDPOINT', ''),
        apiToken: this.getEnvVar('GEYSER_API_TOKEN', ''),
        authType: this.getEnvVar('GEYSER_AUTH_TYPE', 'x-token'),
      } : undefined,
    };
  }

  private getEnvVar(key: string, defaultValue?: string): string {
    if (typeof window !== 'undefined') {
      // Client-side: only access NEXT_PUBLIC_ variables
      if (key.startsWith('NEXT_PUBLIC_')) {
        return process.env[key] || defaultValue || '';
      }
      return defaultValue || '';
    } else {
      // Server-side: can access all environment variables
      return process.env[key] || defaultValue || '';
    }
  }

  public getConfig(): AppConfig {
    return this.config;
  }

  public getSolanaConfig() {
    return this.config.solana;
  }

  public getTradingConfig() {
    return this.config.trading;
  }

  public getMonitoringConfig() {
    return this.config.monitoring;
  }

  public getApiConfig() {
    return this.config.api;
  }

  public getGeyserConfig() {
    return this.config.geyser;
  }

  public hasPrivateKey(): boolean {
    return !!this.config.solana.privateKey;
  }

  public isServerTradingEnabled(): boolean {
    return this.hasPrivateKey() && typeof window === 'undefined';
  }

  public updateConfig(updates: Partial<AppConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  public validateConfig(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Validate RPC endpoint
    if (!this.config.solana.rpcEndpoint) {
      errors.push('Solana RPC endpoint is required');
    }

    // Validate trading amounts
    if (this.config.trading.defaultBuyAmount <= 0) {
      errors.push('Default buy amount must be greater than 0');
    }

    if (this.config.trading.maxSlippage < 0 || this.config.trading.maxSlippage > 100) {
      errors.push('Max slippage must be between 0 and 100');
    }

    if (this.config.trading.stopLossPercentage < 0 || this.config.trading.stopLossPercentage > 100) {
      errors.push('Stop loss percentage must be between 0 and 100');
    }

    if (this.config.trading.takeProfitPercentage <= 0) {
      errors.push('Take profit percentage must be greater than 0');
    }

    // Validate monitoring settings
    if (this.config.monitoring.maxConcurrentTrades <= 0) {
      errors.push('Max concurrent trades must be greater than 0');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  public isDevelopment(): boolean {
    return process.env.NODE_ENV === 'development';
  }

  public isProduction(): boolean {
    return process.env.NODE_ENV === 'production';
  }
}

// Export singleton instance
export const configService = new ConfigService();
export default configService;
