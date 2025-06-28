'use client';

import React, { useEffect } from 'react';
import { usePriceMonitoring } from '@/hooks/usePriceMonitoring';
import PriceIndicator from './PriceIndicator';
import { TrendingUp, TrendingDown, Activity } from 'lucide-react';
import type { Position } from '@/types';

interface LivePricePanelProps {
  positions?: Position[];
  updatePositionPrices?: (tokenAddress: string, newPrice: number) => void;
}

export default function LivePricePanel({ positions = [], updatePositionPrices }: LivePricePanelProps) {
  const { 
    priceUpdates, 
    monitoredTokens, 
    startMonitoring, 
    stopMonitoring,
    getPriceChange,
    stats 
  } = usePriceMonitoring();

  // Auto-monitor tokens from positions
  useEffect(() => {
    // Monitor active positions
    positions.forEach(position => {
      const token = {
        address: position.tokenAddress || '',
        symbol: position.tokenSymbol || 'UNKNOWN',
        name: position.tokenName || 'Unknown Token',
        bondingCurve: '',
        price: position.currentPrice || 0,
        marketCap: 0,
        volume24h: 0,
        priceChange24h: 0,
        liquidity: 0,
        holders: 0,
        description: '',
        image: '',
        showName: false,
        createdOn: Date.now(),
        twitter: '',
        telegram: '',
        website: '',
        creator: '',
        virtualSolReserves: 0,
        virtualTokenReserves: 0,
        associatedBondingCurve: '',
        progress: 0
      };
      
      if (token.address && !monitoredTokens.find(t => t.address === token.address)) {
        startMonitoring(token);
      }
    });
  }, [positions, monitoredTokens, startMonitoring]);

  // Clean up monitoring for closed positions
  useEffect(() => {
    const activeAddresses = new Set(positions.map(p => p.tokenAddress));

    monitoredTokens.forEach(token => {
      if (!activeAddresses.has(token.address)) {
        stopMonitoring(token.address);
      }
    });
  }, [positions, monitoredTokens, stopMonitoring]);

  // Update position prices when new price data comes in
  useEffect(() => {
    if (!updatePositionPrices) return;

    priceUpdates.forEach((priceUpdate, tokenAddress) => {
      const position = positions.find(p => p.tokenAddress === tokenAddress && p.status === 'open');
      if (position && priceUpdate.currentPrice !== position.currentPrice) {
        updatePositionPrices(tokenAddress, priceUpdate.currentPrice);
      }
    });
  }, [priceUpdates, positions, updatePositionPrices]);

  if (monitoredTokens.length === 0) {
    return (
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-2">
          <Activity className="h-4 w-4 text-gray-400" />
          <span className="text-sm text-gray-400">Live Price Monitoring</span>
        </div>
        <p className="text-gray-500 text-sm">No tokens being monitored</p>
      </div>
    );
  }

  const getTokenPriceData = (tokenAddress: string) => {
    const priceUpdate = priceUpdates.get(tokenAddress);
    if (priceUpdate) {
      return {
        currentPrice: priceUpdate.currentPrice,
        priceChange: priceUpdate.priceChange,
        priceChangePercent: priceUpdate.priceChangePercent,
        trend: priceUpdate.trend
      };
    }

    // Fallback to position data
    const position = positions.find(p => p.tokenAddress === tokenAddress);
    if (position) {
      const fiveMinChange = getPriceChange(tokenAddress, 5);
      return {
        currentPrice: position.currentPrice || 0,
        priceChange: fiveMinChange.change,
        priceChangePercent: fiveMinChange.changePercent,
        trend: fiveMinChange.trend
      };
    }

    return {
      currentPrice: 0,
      priceChange: 0,
      priceChangePercent: 0,
      trend: 'stable' as const
    };
  };

  const sortedTokens = [...monitoredTokens].sort((a, b) => {
    const aData = getTokenPriceData(a.address);
    const bData = getTokenPriceData(b.address);
    return Math.abs(bData.priceChangePercent) - Math.abs(aData.priceChangePercent);
  });

  const upCount = sortedTokens.filter(token => {
    const data = getTokenPriceData(token.address);
    return data.trend === 'up';
  }).length;

  const downCount = sortedTokens.filter(token => {
    const data = getTokenPriceData(token.address);
    return data.trend === 'down';
  }).length;

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-blue-400" />
          <span className="text-sm font-medium text-white">Live Price Monitoring</span>
        </div>
        
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1">
            <TrendingUp className="h-3 w-3 text-green-400" />
            <span className="text-green-400">{upCount}</span>
          </div>
          <div className="flex items-center gap-1">
            <TrendingDown className="h-3 w-3 text-red-400" />
            <span className="text-red-400">{downCount}</span>
          </div>
          <span className="text-gray-400">{stats.monitoredTokens} tokens</span>
        </div>
      </div>

      <div className="space-y-3">
        {sortedTokens.map(token => {
          const priceData = getTokenPriceData(token.address);
          const position = positions.find(p => p.tokenAddress === token.address);
          
          return (
            <div key={token.address} className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg border border-gray-600/30">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-white text-sm mb-1">{token.symbol}</div>
                  <div className="text-xs text-gray-400">
                    {position ? '📊 Position' : '🔍 Detected'}
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-3 flex-shrink-0">
                {position && (
                  <div className="text-right text-xs min-w-20">
                    <div className={`font-semibold mb-1 ${position.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {position.pnl >= 0 ? '+' : ''}{position.pnl.toFixed(4)} SOL
                    </div>
                    <div className={`text-xs ${position.pnlPercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {position.pnlPercent >= 0 ? '+' : ''}{position.pnlPercent.toFixed(1)}%
                    </div>
                  </div>
                )}
                
                <div className="min-w-24">
                  <PriceIndicator
                    currentPrice={priceData.currentPrice}
                    priceChange={priceData.priceChange}
                    priceChangePercent={priceData.priceChangePercent}
                    size="sm"
                    showPercentage={true}
                    showArrow={true}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
      
      <div className="mt-3 pt-3 border-t border-gray-600">
        <div className="text-xs text-gray-400 text-center">
          Updates every {Math.round(stats.updateInterval / 1000)}s • Last 5min change shown
        </div>
      </div>
    </div>
  );
}
