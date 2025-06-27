import type { Token } from '@/types';
import { 
  PumpFunWebSocketService, 
  type PumpFunWebSocketListener,
  type PumpPortalMessage 
} from './pumpFunWebSocket';

export class TokenMonitorService {
  private listeners: ((token: Token) => void)[] = [];
  private tradeListeners: ((trade: PumpPortalMessage) => void)[] = [];
  private isListening = false;
  private websocketService: PumpFunWebSocketService;

  constructor() {
    console.log('TokenMonitorService initialized for production');
    this.websocketService = new PumpFunWebSocketService();
    this.setupWebSocketListeners();
  }

  private setupWebSocketListeners() {
    const listener: PumpFunWebSocketListener = {
      onNewToken: (token: Token) => {
        console.log('🔍 New token detected:', token.symbol, token.name);
        this.listeners.forEach(callback => callback(token));
      },
      onTrade: (trade: PumpPortalMessage) => {
        console.log('💱 Trade detected:', trade.txType, trade.mint);
        this.tradeListeners.forEach(callback => callback(trade));
      },
      onConnect: () => {
        console.log('✅ WebSocket connected successfully');
      },
      onDisconnect: () => {
        console.log('❌ WebSocket disconnected');
      },
      onError: (error: Error) => {
        console.error('⚠️ WebSocket error:', error);
      }
    };

    this.websocketService.addListener(listener);
  }

  onNewToken(callback: (token: Token) => void) {
    this.listeners.push(callback);
  }

  onTrade(callback: (trade: PumpPortalMessage) => void) {
    this.tradeListeners.push(callback);
  }

  async startListening() {
    if (this.isListening) {
      console.log('⚠️ Already listening for tokens');
      return;
    }
    
    this.isListening = true;
    console.log('🚀 Starting real-time token monitoring...');
    
    try {
      await this.websocketService.connect();
      console.log('✅ Connected to pump.fun WebSocket stream');
    } catch (error) {
      console.error('❌ Failed to connect to pump.fun WebSocket:', error);
      this.isListening = false;
      throw new Error(`Failed to connect to token stream: ${error}`);
    }
  }

  stopListening() {
    if (!this.isListening) {
      console.log('⚠️ Not currently listening');
      return;
    }
    
    this.isListening = false;
    this.websocketService.disconnect();
    console.log('⏹️ Stopped listening for new tokens');
  }

  getConnectionStatus() {
    return this.websocketService.getConnectionStatus();
  }

  isConnected(): boolean {
    return this.getConnectionStatus() === 'connected';
  }

  getListenerCount(): number {
    return this.listeners.length;
  }

  getTradeListenerCount(): number {
    return this.tradeListeners.length;
  }

  removeAllListeners(): void {
    this.listeners = [];
    this.tradeListeners = [];
  }

  removeTokenListener(callback: (token: Token) => void): void {
    this.listeners = this.listeners.filter(listener => listener !== callback);
  }

  removeTradeListener(callback: (trade: PumpPortalMessage) => void): void {
    this.tradeListeners = this.tradeListeners.filter(listener => listener !== callback);
  }
}
