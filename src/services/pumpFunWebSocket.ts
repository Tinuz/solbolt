import type { Token } from '@/types';
import { getValidImageUrl } from '@/utils/imageUtils';

export interface PumpPortalMessage {
  txType: string;
  signature: string;
  mint: string;
  traderPublicKey: string;
  timestamp: number;
  initialBuy?: number;
  bondingCurveKey?: string;
  associatedBondingCurveKey?: string;
  vTokensInBondingCurve?: number;
  vSolInBondingCurve?: number;
  marketCapSol?: number;
  name?: string;
  symbol?: string;
  description?: string;
  image?: string;
  metadata?: any;
  showName?: boolean;
  createdTimestamp?: number;
  raydiumPool?: string;
  complete?: boolean;
}

export interface PumpFunWebSocketListener {
  onNewToken: (token: Token) => void;
  onTrade: (trade: PumpPortalMessage) => void;
  onError: (error: Error) => void;
  onConnect: () => void;
  onDisconnect: () => void;
}

export class PumpFunWebSocketService {
  private ws: WebSocket | null = null;
  private listeners: PumpFunWebSocketListener[] = [];
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectInterval = 5000;
  private isConnecting = false;
  private shouldReconnect = true;
  private heartbeatInterval: NodeJS.Timeout | null = null;

  // PumpPortal WebSocket endpoint
  private readonly wsEndpoint = 'wss://pumpportal.fun/api/data';

  constructor() {
    console.log('PumpFunWebSocketService initialized');
  }

  addListener(listener: PumpFunWebSocketListener) {
    this.listeners.push(listener);
  }

  removeListener(listener: PumpFunWebSocketListener) {
    const index = this.listeners.indexOf(listener);
    if (index > -1) {
      this.listeners.splice(index, 1);
    }
  }

  async connect(): Promise<void> {
    if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) {
      return;
    }

    this.isConnecting = true;
    this.shouldReconnect = true;

    try {
      console.log('Connecting to PumpPortal WebSocket...');
      this.ws = new WebSocket(this.wsEndpoint);

      this.ws.onopen = () => {
        console.log('Connected to PumpPortal WebSocket');
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        
        // Subscribe to new token events
        this.subscribeToNewTokens();
        
        // Start heartbeat
        this.startHeartbeat();
        
        this.listeners.forEach(listener => listener.onConnect());
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as PumpPortalMessage;
          this.handleMessage(data);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      this.ws.onclose = (event) => {
        console.log('PumpPortal WebSocket connection closed:', event.code, event.reason);
        this.isConnecting = false;
        this.stopHeartbeat();
        
        this.listeners.forEach(listener => listener.onDisconnect());
        
        if (this.shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = (error) => {
        console.error('PumpPortal WebSocket error:', error);
        this.isConnecting = false;
        
        this.listeners.forEach(listener => listener.onError(new Error('WebSocket connection error')));
      };

    } catch (error) {
      this.isConnecting = false;
      console.error('Failed to connect to PumpPortal WebSocket:', error);
      throw error;
    }
  }

  disconnect(): void {
    this.shouldReconnect = false;
    this.stopHeartbeat();
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private subscribeToNewTokens(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const subscribeMessage = {
        method: 'subscribeNewToken'
      };
      
      this.ws.send(JSON.stringify(subscribeMessage));
      console.log('Subscribed to new token events');
    }
  }

  private handleMessage(data: PumpPortalMessage): void {
    try {
      // Handle new token creation
      if (data.txType === 'create') {
        const token = this.parseTokenFromMessage(data);
        if (token) {
          this.listeners.forEach(listener => listener.onNewToken(token));
        }
      }
      
      // Handle trades (buy/sell events)
      if (data.txType === 'buy' || data.txType === 'sell') {
        this.listeners.forEach(listener => listener.onTrade(data));
      }
      
    } catch (error) {
      console.error('Error handling WebSocket message:', error);
    }
  }

  private parseTokenFromMessage(data: PumpPortalMessage): Token | null {
    try {
      if (!data.mint || !data.name || !data.symbol) {
        return null;
      }

      const token: Token = {
        address: data.mint,
        name: data.name,
        symbol: data.symbol,
        description: data.description || '',
        image: getValidImageUrl(data.image, data.symbol),
        showName: data.showName ?? true,
        createdOn: data.createdTimestamp || Date.now(),
        website: '',
        telegram: '',
        twitter: '',
        bondingCurve: data.bondingCurveKey || '',
        associatedBondingCurve: data.associatedBondingCurveKey || '',
        creator: data.traderPublicKey,
        marketCap: data.marketCapSol ? data.marketCapSol * 1000000 : 0, // Convert SOL to USD estimate
        price: this.calculateTokenPrice(data),
        progress: this.calculateProgress(data),
        virtualSolReserves: data.vSolInBondingCurve || 0,
        virtualTokenReserves: data.vTokensInBondingCurve || 0,
        liquidity: data.marketCapSol || 0,
        volume24h: 0,
        priceChange24h: 0,
        holders: 0,
        raydiumPool: data.raydiumPool || undefined,
      };

      return token;
    } catch (error) {
      console.error('Error parsing token from message:', error);
      return null;
    }
  }

  private calculateTokenPrice(data: PumpPortalMessage): number {
    // Calculate price based on bonding curve reserves
    if (data.vSolInBondingCurve && data.vTokensInBondingCurve) {
      return data.vSolInBondingCurve / data.vTokensInBondingCurve;
    }
    return 0.000001; // Default tiny price
  }

  private calculateProgress(data: PumpPortalMessage): number {
    // Calculate graduation progress (0-100%)
    // This is based on how much SOL is in the bonding curve
    // Pump.fun tokens typically graduate at around 85 SOL
    if (data.vSolInBondingCurve) {
      const graduationThreshold = 85; // SOL
      return Math.min((data.vSolInBondingCurve / graduationThreshold) * 100, 100);
    }
    return 0;
  }

  private scheduleReconnect(): void {
    this.reconnectAttempts++;
    const delay = Math.min(this.reconnectInterval * this.reconnectAttempts, 30000); // Max 30 seconds
    
    console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    
    setTimeout(() => {
      this.connect().catch(error => {
        console.error('Reconnection failed:', error);
      });
    }, delay);
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ method: 'ping' }));
      }
    }, 30000); // Ping every 30 seconds
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  getConnectionStatus(): 'connecting' | 'connected' | 'disconnected' | 'error' {
    if (this.isConnecting) return 'connecting';
    if (this.ws) {
      switch (this.ws.readyState) {
        case WebSocket.OPEN:
          return 'connected';
        case WebSocket.CONNECTING:
          return 'connecting';
        case WebSocket.CLOSED:
        case WebSocket.CLOSING:
          return 'disconnected';
        default:
          return 'error';
      }    }
    return 'disconnected';
  }
}
