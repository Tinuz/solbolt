'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Connection } from '@solana/web3.js';
import { PriceMonitoringService, PriceUpdate, PriceHistory } from '@/services/priceMonitoring';
import { Token } from '@/types';

interface UsePriceMonitoringState {
  priceUpdates: Map<string, PriceUpdate>;
  priceHistory: Map<string, PriceHistory[]>;
  monitoredTokens: Token[];
  isMonitoring: boolean;
  stats: {
    monitoredTokens: number;
    isRunning: boolean;
    updateInterval: number;
    historyLength: number;
  };
}

interface UsePriceMonitoringActions {
  startMonitoring: (token: Token) => void;
  stopMonitoring: (tokenAddress: string) => void;
  stopAllMonitoring: () => void;
  getCurrentPrice: (tokenAddress: string) => number | null;
  getPriceChange: (tokenAddress: string, periodMinutes?: number) => {
    change: number;
    changePercent: number;
    trend: 'up' | 'down' | 'stable';
  };
  getTrend: (tokenAddress: string, periodMinutes?: number) => 'bullish' | 'bearish' | 'sideways';
}

interface UsePriceMonitoringHook extends UsePriceMonitoringState, UsePriceMonitoringActions {}

export function usePriceMonitoring(): UsePriceMonitoringHook {
  const [priceUpdates, setPriceUpdates] = useState<Map<string, PriceUpdate>>(new Map());
  const [priceHistory, setPriceHistory] = useState<Map<string, PriceHistory[]>>(new Map());
  const [monitoredTokens, setMonitoredTokens] = useState<Token[]>([]);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [stats, setStats] = useState({
    monitoredTokens: 0,
    isRunning: false,
    updateInterval: 10000,
    historyLength: 100
  });

  const priceServiceRef = useRef<PriceMonitoringService | null>(null);

  // Initialize price monitoring service
  useEffect(() => {
    const rpcEndpoint = process.env.NEXT_PUBLIC_HELIUS_RPC_URL || 'https://api.mainnet-beta.solana.com';
    const connection = new Connection(rpcEndpoint, 'confirmed');
    
    const priceService = new PriceMonitoringService(connection);
    priceServiceRef.current = priceService;

    // Set up event listeners
    const handlePriceUpdate = (update: PriceUpdate) => {
      setPriceUpdates(prev => {
        const newMap = new Map(prev);
        newMap.set(update.token.address, update);
        return newMap;
      });

      // Update history
      setPriceHistory(prev => {
        const newMap = new Map(prev);
        const history = priceService.getPriceHistory(update.token.address);
        newMap.set(update.token.address, history);
        return newMap;
      });

      // Update monitored tokens list
      setMonitoredTokens(priceService.getMonitoredTokens());
      setStats(priceService.getStats());
    };

    const handleSignificantChange = (update: PriceUpdate) => {
      console.log(`💰 Significant price change for ${update.token.symbol}: ${update.priceChangePercent.toFixed(2)}%`);
    };

    const handlePriceIncrease = (update: PriceUpdate) => {
      console.log(`📈 ${update.token.symbol} is pumping: +${update.priceChangePercent.toFixed(2)}%`);
    };

    const handlePriceDecrease = (update: PriceUpdate) => {
      console.log(`📉 ${update.token.symbol} is dumping: ${update.priceChangePercent.toFixed(2)}%`);
    };

    // Register event listeners
    priceService.on('priceUpdate', handlePriceUpdate);
    priceService.on('significantPriceChange', handleSignificantChange);
    priceService.on('priceIncrease', handlePriceIncrease);
    priceService.on('priceDecrease', handlePriceDecrease);

    setIsMonitoring(true);

    // Cleanup on unmount
    return () => {
      priceService.removeAllListeners();
      priceService.stopAllMonitoring();
      setIsMonitoring(false);
    };
  }, []);

  // Actions
  const startMonitoring = useCallback((token: Token) => {
    if (priceServiceRef.current) {
      priceServiceRef.current.startMonitoring(token);
      setMonitoredTokens(priceServiceRef.current.getMonitoredTokens());
      setStats(priceServiceRef.current.getStats());
    }
  }, []);

  const stopMonitoring = useCallback((tokenAddress: string) => {
    if (priceServiceRef.current) {
      priceServiceRef.current.stopMonitoring(tokenAddress);
      
      // Remove from state
      setPriceUpdates(prev => {
        const newMap = new Map(prev);
        newMap.delete(tokenAddress);
        return newMap;
      });
      
      setPriceHistory(prev => {
        const newMap = new Map(prev);
        newMap.delete(tokenAddress);
        return newMap;
      });

      setMonitoredTokens(priceServiceRef.current.getMonitoredTokens());
      setStats(priceServiceRef.current.getStats());
    }
  }, []);

  const stopAllMonitoring = useCallback(() => {
    if (priceServiceRef.current) {
      priceServiceRef.current.stopAllMonitoring();
      setPriceUpdates(new Map());
      setPriceHistory(new Map());
      setMonitoredTokens([]);
      setStats({
        monitoredTokens: 0,
        isRunning: false,
        updateInterval: 10000,
        historyLength: 100
      });
    }
  }, []);

  const getCurrentPrice = useCallback((tokenAddress: string): number | null => {
    if (priceServiceRef.current) {
      return priceServiceRef.current.getCurrentPrice(tokenAddress);
    }
    return null;
  }, []);

  const getPriceChange = useCallback((tokenAddress: string, periodMinutes: number = 5) => {
    if (priceServiceRef.current) {
      return priceServiceRef.current.getPriceChange(tokenAddress, periodMinutes);
    }
    return { change: 0, changePercent: 0, trend: 'stable' as const };
  }, []);

  const getTrend = useCallback((tokenAddress: string, periodMinutes: number = 10) => {
    if (priceServiceRef.current) {
      return priceServiceRef.current.getTrend(tokenAddress, periodMinutes);
    }
    return 'sideways' as const;
  }, []);

  return {
    // State
    priceUpdates,
    priceHistory,
    monitoredTokens,
    isMonitoring,
    stats,
    
    // Actions
    startMonitoring,
    stopMonitoring,
    stopAllMonitoring,
    getCurrentPrice,
    getPriceChange,
    getTrend
  };
}
