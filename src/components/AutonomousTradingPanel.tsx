'use client';

import { useState } from 'react';
import { 
  Bot, 
  Activity, 
  DollarSign, 
  TrendingUp, 
  TrendingDown, 
  Target,
  AlertTriangle,
  Clock,
  Settings,
  BarChart3,
  Play,
  Square
} from 'lucide-react';
import { useBot } from '@/hooks/useBot';

export default function AutonomousTradingPanel() {
  const {
    isRunning,
    connectionStatus,
    trades,
    positions,
    stats,
    config,
    startBot,
    stopBot,
    updateConfig
  } = useBot();

  const [showSettings, setShowSettings] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  // Derived data from bot state
  const activePositions = positions.filter(p => p.status === 'open');
  const totalValue = activePositions.reduce((sum, pos) => sum + pos.currentValue, 0);
  const buyTrades = trades.filter(t => t.type === 'buy' && t.status === 'success');
  const sellTrades = trades.filter(t => t.type === 'sell' && t.status === 'success');
  const lastActivity = trades.length > 0 ? Math.max(...trades.map(t => t.timestamp)) : 0;

  const handleToggleBot = async () => {
    setIsLoading(true);
    try {
      if (isRunning) {
        await stopBot();
      } else {
        await startBot();
      }
    } catch (error) {
      console.error('Bot toggle error:', error);
    }
    setIsLoading(false);
  };

  const handleConfigChange = (key: string, value: any) => {
    updateConfig({ [key]: value });
  };

  const formatTimeAgo = (timestamp: number) => {
    if (!timestamp) return 'Never';
    const now = Date.now();
    const diff = now - timestamp;
    
    if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    return `${Math.floor(diff / 3600000)}h ago`;
  };

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-green-400" />
          <h2 className="text-xl font-semibold text-white">Autonomous Trading</h2>
          <div className={`w-3 h-3 rounded-full ${isRunning ? 'bg-green-400 animate-pulse' : 'bg-gray-500'}`} />
          <span className="text-sm text-gray-400">
            {connectionStatus === 'connecting' ? 'Connecting...' :
             connectionStatus === 'connected' ? 'Connected' :
             connectionStatus === 'error' ? 'Error' : 'Disconnected'}
          </span>
        </div>
        
        <div className="flex gap-2">
          <button
            onClick={handleToggleBot}
            disabled={isLoading}
            className={`flex items-center gap-2 px-4 py-2 rounded text-sm font-medium transition-colors ${
              isRunning 
                ? 'bg-red-600 hover:bg-red-700 text-white' 
                : 'bg-green-600 hover:bg-green-700 text-white'
            } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {isLoading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : isRunning ? (
              <Square className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            {isLoading ? 'Working...' : isRunning ? 'Stop Bot' : 'Start Bot'}
          </button>
          
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 bg-gray-700 hover:bg-gray-600 rounded text-gray-300 transition-colors"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Status Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="h-4 w-4 text-blue-400" />
            <span className="text-sm text-gray-400">Active Positions</span>
          </div>
          <div className="text-2xl font-bold text-white">{activePositions.length}</div>
          <div className="text-xs text-gray-500">of {config.maxPositions} max</div>
        </div>

        <div className="bg-gray-800 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="h-4 w-4 text-green-400" />
            <span className="text-sm text-gray-400">Total Value</span>
          </div>
          <div className="text-2xl font-bold text-white">{totalValue.toFixed(4)} SOL</div>
          <div className="text-xs text-gray-500">Portfolio value</div>
        </div>

        <div className="bg-gray-800 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className={`h-4 w-4 ${stats.totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`} />
            <span className="text-sm text-gray-400">P&L</span>
          </div>
          <div className={`text-2xl font-bold ${stats.totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {stats.totalPnl >= 0 ? '+' : ''}{stats.totalPnl.toFixed(4)} SOL
          </div>
          <div className={`text-xs ${stats.totalPnlPercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {stats.totalPnlPercent >= 0 ? '+' : ''}{stats.totalPnlPercent.toFixed(2)}%
          </div>
        </div>

        <div className="bg-gray-800 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="h-4 w-4 text-yellow-400" />
            <span className="text-sm text-gray-400">Last Activity</span>
          </div>
          <div className="text-lg font-bold text-white">{formatTimeAgo(lastActivity)}</div>
          <div className="text-xs text-gray-500">Trading signal</div>
        </div>
      </div>

      {/* Trading Signals */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="h-4 w-4 text-green-400" />
            <span className="text-sm text-gray-400">Buy Signals</span>
          </div>
          <div className="text-xl font-bold text-green-400">{buyTrades.length}</div>
          <div className="text-xs text-gray-500">Total executed</div>
        </div>

        <div className="bg-gray-800 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown className="h-4 w-4 text-red-400" />
            <span className="text-sm text-gray-400">Sell Signals</span>
          </div>
          <div className="text-xl font-bold text-red-400">{sellTrades.length}</div>
          <div className="text-xs text-gray-500">Total executed</div>
        </div>
      </div>

      {/* Configuration Panel */}
      {showSettings && (
        <div className="bg-gray-800 rounded-lg p-4 space-y-4">
          <h3 className="text-lg font-semibold text-white mb-4">Trading Configuration</h3>
          
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-2">Buy Amount (SOL)</label>
              <input
                type="number"
                value={config.buyAmount}
                onChange={(e) => handleConfigChange('buyAmount', parseFloat(e.target.value) || 0)}
                step="0.001"
                min="0"
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-2">Stop Loss (%)</label>
              <input
                type="number"
                value={config.stopLoss}
                onChange={(e) => handleConfigChange('stopLoss', parseFloat(e.target.value) || 0)}
                step="1"
                min="0"
                max="100"
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-2">Take Profit (%)</label>
              <input
                type="number"
                value={config.takeProfit}
                onChange={(e) => handleConfigChange('takeProfit', parseFloat(e.target.value) || 0)}
                step="1"
                min="0"
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-2">Max Positions</label>
              <input
                type="number"
                value={config.maxPositions}
                onChange={(e) => handleConfigChange('maxPositions', parseInt(e.target.value) || 0)}
                step="1"
                min="1"
                max="10"
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-2">Max Slippage (%)</label>
              <input
                type="number"
                value={config.slippage}
                onChange={(e) => handleConfigChange('slippage', parseFloat(e.target.value) || 0)}
                step="0.1"
                min="0"
                max="20"
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-2">Max Token Age (min)</label>
              <input
                type="number"
                value={config.maxTokenAge}
                onChange={(e) => handleConfigChange('maxTokenAge', parseInt(e.target.value) || 0)}
                step="1"
                min="1"
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="flex items-center gap-4 pt-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={config.enabled}
                onChange={(e) => handleConfigChange('enabled', e.target.checked)}
                className="rounded"
              />
              <span className="text-sm text-gray-400">Enable Autonomous Trading</span>
            </label>
          </div>

          <div className="flex items-center gap-2 p-3 bg-yellow-900/20 border border-yellow-700 rounded">
            <AlertTriangle className="h-4 w-4 text-yellow-400" />
            <span className="text-sm text-yellow-400">
              Autonomous trading uses the configured private key to execute trades automatically
            </span>
          </div>
        </div>
      )}

      {/* Real Trading Warning */}
      <div className="mb-4">
        <div className="bg-red-900/20 border border-red-700 rounded-lg p-4">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="h-5 w-5 text-red-400" />
            <div>
              <span className="text-red-400 font-medium">⚠️ REAL TRADING ENABLED</span>
              <p className="text-red-300 text-sm mt-1">
                This bot now executes REAL blockchain transactions with YOUR wallet. 
                You will spend REAL SOL and receive REAL tokens. Use at your own risk!
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Status Indicators */}
      <div className="flex items-center justify-between text-sm text-gray-400">
        <div className="flex items-center gap-4">
          <span>🎯 Risk Management: Active</span>
          <span>🔍 Token Detection: {isRunning ? 'Monitoring' : 'Paused'}</span>
        </div>
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4" />
          <span>Bot Status: {connectionStatus}</span>
        </div>
      </div>
    </div>
  );
}
