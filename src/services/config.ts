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
  private config: AppConfig | null = null;

  constructor() {
    // Don't load config immediately, wait for first access
  }

  private loadConfig(): AppConfig {
    // Debug: log all NEXT_PUBLIC_ environment variables
    console.log('🔍 Available NEXT_PUBLIC_ vars:', 
      Object.keys(process.env)
        .filter(key => key.startsWith('NEXT_PUBLIC_'))
        .reduce((obj, key) => {
          obj[key] = (process.env as any)[key];
          return obj;
        }, {} as Record<string, string>)
    );

    // Load from environment variables with explicit fallbacks
    const chainStackRpc = 'https://solana-mainnet.core.chainstack.com/69600811e0e036c9e11cecaecc1f1843';
    const chainStackWss = 'wss://solana-mainnet.core.chainstack.com/69600811e0e036c9e11cecaecc1f1843';
    
    const config = {
      solana: {
        rpcEndpoint: this.getEnvVar('NEXT_PUBLIC_SOLANA_RPC_ENDPOINT', chainStackRpc),
        wssEndpoint: this.getEnvVar('NEXT_PUBLIC_SOLANA_WSS_ENDPOINT', chainStackWss),
        privateKey: this.getEnvVar('SOLANA_PRIVATE_KEY'),
      },
      trading: {
        defaultBuyAmount: parseFloat(this.getEnvVar('DEFAULT_BUY_AMOUNT', '0.01')),
        maxSlippage: parseFloat(this.getEnvVar('MAX_SLIPPAGE', '5.0')),
        priorityFee: parseFloat(this.getEnvVar('PRIORITY_FEE', '0.0001')),
        stopLossPercentage: parseFloat(this.getEnvVar('STOP_LOSS_PERCENTAGE', '10.0')),
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

    // Log the loaded configuration for debugging
    console.log('🔧 Loaded Solana config:', {
      rpcEndpoint: config.solana.rpcEndpoint,
      wssEndpoint: config.solana.wssEndpoint,
      hasPrivateKey: !!config.solana.privateKey
    });

    return config;
  }

  private getEnvVar(key: string, defaultValue?: string): string {
    const isClient = typeof window !== 'undefined';
    let value: string | undefined;
    
    if (isClient) {
      // Client-side: environment variables are embedded at build time
      // For Next.js, we need to access them directly from process.env
      value = (process.env as any)[key];
      
      // If still undefined, try accessing from window if it was set
      if (!value && key.startsWith('NEXT_PUBLIC_')) {
        // Fallback to check if it was injected another way
        value = undefined;
      }
    } else {
      // Server-side: can access all environment variables
      value = process.env[key];
    }
    
    const finalValue = value || defaultValue || '';
    
    // Debug logging for important vars
    if (key.includes('SOLANA_RPC') || key.includes('SOLANA_WSS')) {
      console.log(`🔧 EnvVar ${key}:`, {
        isClient,
        processEnv: (process.env as any)[key],
        raw: value,
        default: defaultValue,
        final: finalValue,
        allEnvKeys: isClient ? Object.keys(process.env).filter(k => k.startsWith('NEXT_PUBLIC_')) : 'server-side'
      });
    }
    
    return finalValue;
  }

  public getConfig(): AppConfig {
    if (!this.config) {
      this.config = this.loadConfig();
    }
    return this.config;
  }

  public getSolanaConfig() {
    return this.getConfig().solana;
  }

  public getTradingConfig() {
    return this.getConfig().trading;
  }

  public getMonitoringConfig() {
    return this.getConfig().monitoring;
  }

  public getApiConfig() {
    return this.getConfig().api;
  }

  public getGeyserConfig() {
    return this.getConfig().geyser;
  }

  public hasPrivateKey(): boolean {
    return !!this.getConfig().solana.privateKey;
  }

  public isServerTradingEnabled(): boolean {
    return this.hasPrivateKey() && typeof window === 'undefined';
  }

  public updateConfig(updates: Partial<AppConfig>): void {
    const currentConfig = this.getConfig();
    this.config = { ...currentConfig, ...updates };
  }

  public validateConfig(): { valid: boolean; errors: string[] } {
    const config = this.getConfig();
    const errors: string[] = [];

    // Validate RPC endpoint
    if (!config.solana.rpcEndpoint) {
      errors.push('Solana RPC endpoint is required');
    }

    // Validate trading amounts
    if (config.trading.defaultBuyAmount <= 0) {
      errors.push('Default buy amount must be greater than 0');
    }

    if (config.trading.maxSlippage < 0 || config.trading.maxSlippage > 100) {
      errors.push('Max slippage must be between 0 and 100');
    }

    if (config.trading.stopLossPercentage < 0 || config.trading.stopLossPercentage > 100) {
      errors.push('Stop loss percentage must be between 0 and 100');
    }

    if (config.trading.takeProfitPercentage <= 0) {
      errors.push('Take profit percentage must be greater than 0');
    }

    // Validate monitoring settings
    if (config.monitoring.maxConcurrentTrades <= 0) {
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
