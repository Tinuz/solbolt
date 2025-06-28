'use client';

import { useState, useEffect, useCallback } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { toast, Toaster } from 'react-hot-toast';
import { 
  Play, 
  Square, 
  Settings, 
  Wallet, 
  TrendingUp, 
  TrendingDown,
  Clock,
  DollarSign,
  Activity,
  Zap,
  AlertCircle
} from 'lucide-react';

import type { Token, Trade, Position, BotConfig } from '@/types';
import LivePricePanel from '@/components/LivePricePanel';
import { useBot } from '@/hooks/useBot';

export default function Home() {
  const [isMounted, setIsMounted] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  
  // Use the bot hook instead of managing bot state manually
  const {
    isRunning,
    connectionStatus,
    tokens,
    trades,
    positions,
    stats,
    config,
    startBot,
    stopBot,
    updateConfig,
    updatePositionPrices, // ⭐ ADD: Get the updatePositionPrices function
    addTestPosition, // 🧪 TEST function
    formatTime,
    formatDuration,
    formatPrice
  } = useBot();

  const { publicKey, connected } = useWallet();
  const { connection } = useConnection();
  const [walletBalance, setWalletBalance] = useState(0);

  // Handle hydration
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Update wallet balance
  useEffect(() => {
    if (connected && publicKey && connection) {
      const updateBalance = async () => {
        try {
          const balance = await connection.getBalance(publicKey);
          setWalletBalance(balance / 1e9);
        } catch (error) {
          console.error('Error fetching balance:', error);
        }
      };
      
      updateBalance();
      const interval = setInterval(updateBalance, 10000);
      return () => clearInterval(interval);
    }
  }, [connected, publicKey, connection]);

  const getConnectionStatusColor = () => {
    switch (connectionStatus) {
      case 'connected': return 'text-green-400';
      case 'connecting': return 'text-yellow-400';
      case 'error': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  const getConnectionStatusText = () => {
    switch (connectionStatus) {
      case 'connected': return 'Connected';
      case 'connecting': return 'Connecting...';
      case 'error': return 'Error';
      default: return 'Disconnected';
    }
  };

  // Better price formatting for very small values
  const formatDisplayPrice = (price: number) => {
    if (price === 0) return '0.00';
    if (price >= 1) return price.toFixed(3);
    if (price >= 0.001) return price.toFixed(6);
    if (price >= 0.000001) return price.toFixed(8);
    
    // Voor zeer kleine waardes, gebruik een betere weergave
    const formatted = price.toFixed(12);
    const trimmed = formatted.replace(/\.?0+$/, '');
    return trimmed || '0.00';
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <Toaster position="top-right" />
      
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <h1 className="text-2xl font-bold text-transparent bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text">
                SolBot v3
              </h1>
              <div className={`flex items-center space-x-2 ${getConnectionStatusColor()}`}>
                <Activity className="w-4 h-4" />
                <span className="text-sm">{getConnectionStatusText()}</span>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              {isMounted && connected && (
                <div className="flex items-center space-x-2 text-sm">
                  <Wallet className="w-4 h-4" />
                  <span>{walletBalance.toFixed(3)} SOL</span>
                </div>
              )}
              {isMounted ? (
                <WalletMultiButton className="!bg-purple-600 hover:!bg-purple-700" />
              ) : (
                <div className="bg-purple-600 px-4 py-2 rounded-lg animate-pulse">
                  <span className="text-white text-sm">Loading...</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Bot Controls */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-8">
          {/* Control Panel */}
          <div className="lg:col-span-1">
            <div className="bg-gray-800 rounded-xl p-6 space-y-4">
              <h3 className="text-lg font-semibold">Bot Controls</h3>
              
              <div className="space-y-3">
                {!isRunning ? (
                  <button
                    onClick={startBot}
                    disabled={!connected}
                    className="w-full flex items-center justify-center space-x-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed px-4 py-2 rounded-lg transition-colors"
                  >
                    <Play className="w-4 h-4" />
                    <span>Start Bot</span>
                  </button>
                ) : (
                  <button
                    onClick={stopBot}
                    className="w-full flex items-center justify-center space-x-2 bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg transition-colors"
                  >
                    <Square className="w-4 h-4" />
                    <span>Stop Bot</span>
                  </button>
                )}
                
                <button
                  onClick={() => setShowSettings(!showSettings)}
                  className="w-full flex items-center justify-center space-x-2 bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg transition-colors"
                >
                  <Settings className="w-4 h-4" />
                  <span>Settings</span>
                </button>
                
                {/* 🧪 TEST: Add test position button */}
                <button
                  onClick={addTestPosition}
                  className="w-full flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg transition-colors text-sm"
                >
                  <Zap className="w-4 h-4" />
                  <span>Test Position</span>
                </button>
              </div>

              {/* Status Indicator */}
              <div className="flex items-center space-x-2 pt-2">
                <div className={`w-3 h-3 rounded-full ${isRunning ? 'bg-green-400 animate-pulse' : 'bg-gray-500'}`} />
                <span className="text-sm">{isRunning ? 'Running' : 'Stopped'}</span>
              </div>
            </div>
          </div>

          {/* Bot Statistics */}
          <div className="lg:col-span-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-gray-800 rounded-xl p-4">
                <div className="flex items-center space-x-2 mb-2">
                  <Zap className="w-4 h-4 text-blue-400" />
                  <span className="text-sm text-gray-400">Tokens Detected</span>
                </div>
                <div className="text-2xl font-bold">{stats.tokensDetected}</div>
              </div>
              
              <div className="bg-gray-800 rounded-xl p-4">
                <div className="flex items-center space-x-2 mb-2">
                  <Activity className="w-4 h-4 text-purple-400" />
                  <span className="text-sm text-gray-400">Trades</span>
                </div>
                <div className="text-2xl font-bold">{stats.tradesExecuted}</div>
                <div className="text-xs text-gray-500">
                  {stats.successfulTrades} success / {stats.failedTrades} failed
                </div>
              </div>
              
              <div className="bg-gray-800 rounded-xl p-4">
                <div className="flex items-center space-x-2 mb-2">
                  <DollarSign className={`w-4 h-4 ${stats.totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`} />
                  <span className="text-sm text-gray-400">Total P&L</span>
                </div>
                <div className={`text-2xl font-bold ${stats.totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {stats.totalPnl >= 0 ? '+' : ''}{stats.totalPnl.toFixed(4)} SOL
                </div>
                <div className={`text-xs ${stats.totalPnlPercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {stats.totalPnlPercent >= 0 ? '+' : ''}{stats.totalPnlPercent.toFixed(2)}%
                </div>
              </div>
              
              <div className="bg-gray-800 rounded-xl p-4">
                <div className="flex items-center space-x-2 mb-2">
                  <Clock className="w-4 h-4 text-yellow-400" />
                  <span className="text-sm text-gray-400">Uptime</span>
                </div>
                <div className="text-2xl font-bold">{formatDuration(stats.uptime)}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Settings Panel */}
        {showSettings && (
          <div className="bg-gray-800 rounded-xl p-6 mb-8">
            <h3 className="text-lg font-semibold mb-4">Bot Configuration</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">Buy Amount (SOL)</label>
                <input
                  type="number"
                  step="0.001"
                  value={config.buyAmount}
                  onChange={(e) => updateConfig({ buyAmount: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">Take Profit (%)</label>
                <input
                  type="number"
                  value={config.takeProfit}
                  onChange={(e) => updateConfig({ takeProfit: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">Stop Loss (%)</label>
                <input
                  type="number"
                  value={config.stopLoss}
                  onChange={(e) => updateConfig({ stopLoss: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">Max Positions</label>
                <input
                  type="number"
                  value={config.maxPositions}
                  onChange={(e) => updateConfig({ maxPositions: parseInt(e.target.value) || 0 })}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                />
              </div>
            </div>
          </div>
        )}

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Token Stream */}
          <div className="lg:col-span-1">
            <div className="bg-gray-800 rounded-xl p-6">
              <h3 className="text-lg font-semibold mb-4">Live Token Stream</h3>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {tokens.length === 0 ? (
                  <div className="text-center text-gray-400 py-8">
                    <AlertCircle className="w-8 h-8 mx-auto mb-2" />
                    <p>No tokens detected yet</p>
                    <p className="text-sm">Start the bot to monitor new tokens</p>
                  </div>
                ) : (
                  tokens.map((token, index) => (
                    <div key={token.address} className="bg-gray-700 rounded-lg p-3 border border-gray-600/30">
                      <div className="flex items-center space-x-3">
                        <img src={token.image} alt={token.symbol} className="w-10 h-10 rounded-full border border-gray-600" />
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium truncate text-white">{token.name}</h4>
                          <p className="text-sm text-gray-400 font-medium">{token.symbol}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-sm font-mono font-medium text-white">${formatDisplayPrice(token.price)}</p>
                          <p className="text-xs text-gray-400">{formatTime(token.createdOn)}</p>
                        </div>
                      </div>
                      <div className="mt-3 flex justify-between text-xs">
                        <span className="text-blue-400 font-medium">MC: ${(token.marketCap / 1000).toFixed(1)}K</span>
                        <span className="text-purple-400 font-medium">{token.progress.toFixed(1)}% to Raydium</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Positions & Trades */}
          <div className="lg:col-span-2 space-y-6">
            {/* Live Price Monitoring */}
            <LivePricePanel positions={positions} updatePositionPrices={updatePositionPrices} />

            {/* Current Positions */}
            <div className="bg-gray-800 rounded-xl p-6">
              <h3 className="text-lg font-semibold mb-4">Current Positions ({positions.length})</h3>
              <div className="space-y-4">
                {positions.length === 0 ? (
                  <div className="text-center text-gray-400 py-4">
                    <p>No open positions</p>
                  </div>
                ) : (
                  positions.map((position) => (
                    <div key={position.tokenAddress} className="bg-gray-700 rounded-lg p-4 border border-gray-600/30">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-white text-lg mb-1">{position.tokenSymbol}</h3>
                          <p className="text-sm text-gray-400 font-mono">
                            {position.tokenAddress.slice(0, 8)}...{position.tokenAddress.slice(-8)}
                          </p>
                        </div>
                        <button className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors flex-shrink-0">
                          Sell
                        </button>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="space-y-1">
                          <p className="text-gray-400 text-xs uppercase tracking-wide">Amount</p>
                          <p className="text-white font-mono text-sm font-medium">{position.amount.toFixed(2)}</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-gray-400 text-xs uppercase tracking-wide">Entry Price</p>
                          <p className="text-white font-mono text-sm font-medium">${formatDisplayPrice(position.entryPrice)}</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-gray-400 text-xs uppercase tracking-wide">Current Price</p>
                          <p className="text-white font-mono text-sm font-medium">${formatDisplayPrice(position.currentPrice)}</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-gray-400 text-xs uppercase tracking-wide">P&L</p>
                          <div className={`font-mono ${position.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            <div className="text-sm font-medium">{position.pnl >= 0 ? '+' : ''}{position.pnl.toFixed(4)} SOL</div>
                            <div className="text-xs">{position.pnlPercent >= 0 ? '+' : ''}{position.pnlPercent.toFixed(2)}%</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Trade History */}
            <div className="bg-gray-800 rounded-xl p-6">
              <h3 className="text-lg font-semibold mb-4">Trade History ({trades.length})</h3>
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {trades.length === 0 ? (
                  <div className="text-center text-gray-400 py-4">
                    <p>No trades executed yet</p>
                  </div>
                ) : (
                  trades.slice(0, 20).map((trade) => (
                    <div key={trade.id} className="flex items-center justify-between py-2 border-b border-gray-700 last:border-b-0">
                      <div className="flex items-center space-x-3">
                        <div className={`w-3 h-3 rounded-full ${
                          trade.type === 'buy' ? 'bg-green-400' : 'bg-red-400'
                        }`} />
                        <div>
                          <p className="font-medium">{trade.tokenSymbol}</p>
                          <p className="text-sm text-gray-400">{formatTime(trade.timestamp)}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`font-mono ${trade.type === 'buy' ? 'text-green-400' : 'text-red-400'}`}>
                          {trade.type === 'buy' ? '+' : '-'}{trade.amount.toFixed(4)} SOL
                        </p>
                        <div className="flex items-center space-x-2">
                          <span className={`w-2 h-2 rounded-full ${
                            trade.status === 'success' ? 'bg-green-400' : 
                            trade.status === 'failed' ? 'bg-red-400' : 'bg-yellow-400'
                          }`} />
                          <span className="text-xs text-gray-400">{trade.status}</span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
