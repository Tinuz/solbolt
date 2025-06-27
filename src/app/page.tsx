'use client';

import { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { toast, Toaster } from 'react-hot-toast';
import { 
  Play, 
  Square, 
  Settings, 
  TrendingUp, 
  TrendingDown,
  Clock,
  DollarSign,
  Activity,
  Zap,
  AlertCircle,
  Download,
  BarChart3,
  Target,
  Shield
} from 'lucide-react';

import { useBot } from '@/hooks/useBot';
import { Footer } from '@/components/Footer';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { ClientOnlyWalletButton } from '@/components/ClientOnlyWalletButton';
import AutonomousTradingPanel from '@/components/AutonomousTradingPanel';

export default function Home() {
  const { connected } = useWallet();
  const [mounted, setMounted] = useState(false);
  
  // UI state
  const [showSettings, setShowSettings] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);

  // Prevent hydration mismatch by only rendering after mount
  useEffect(() => {
    setMounted(true);
  }, []);

  const {
    isRunning,
    connectionStatus,
    trades,
    positions,
    stats,
    config,
    startBot,
    stopBot,
    updateConfig,
    clearHistory,
    formatTime,
    formatDuration,
    formatPrice,
    exportData
  } = useBot();

  const handleStartBot = async () => {
    if (!connected) {
      toast.error('Please connect your wallet first');
      return;
    }
    
    try {
      await startBot();
      toast.success('Autonomous bot started successfully');
    } catch (err) {
      toast.error(`Failed to start bot: ${(err as Error).message}`);
    }
  };

  const handleStopBot = async () => {
    try {
      await stopBot();
      toast.success('Bot stopped');
    } catch (error) {
      toast.error(`Failed to stop bot: ${(error as Error).message}`);
    }
  };

  const handleExportData = () => {
    try {
      const data = exportData();
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `solbot-data-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Data exported successfully');
    } catch (err) {
      console.error('Failed to export data:', err);
      toast.error('Failed to export data');
    }
  };

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

  // Don't render until mounted to prevent hydration mismatch
  if (!mounted) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <LoadingSpinner size="lg" text="Loading SolBot v3..." />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <Toaster position="top-right" />
      
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <Zap className="w-8 h-8 text-blue-400" />
                <h1 className="text-2xl font-bold text-transparent bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text">
                  SolBot v3
                </h1>
              </div>
              <div className={`flex items-center space-x-2 ${getConnectionStatusColor()}`}>
                <Activity className="w-4 h-4" />
                <span className="text-sm">{getConnectionStatusText()}</span>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setShowAnalytics(!showAnalytics)}
                className="p-2 text-gray-400 hover:text-white transition-colors"
                title="Analytics"
              >
                <BarChart3 className="w-5 h-5" />
              </button>
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="p-2 text-gray-400 hover:text-white transition-colors"
                title="Settings"
              >
                <Settings className="w-5 h-5" />
              </button>
              <ClientOnlyWalletButton className="!bg-purple-600 hover:!bg-purple-700" />
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Bot Status and Controls */}
        <div className="mb-8">
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center space-x-4">
                <div className={`p-3 rounded-lg ${isRunning ? 'bg-green-500/20' : 'bg-gray-700'}`}>
                  {isRunning ? (
                    <Play className="w-6 h-6 text-green-400" />
                  ) : (
                    <Square className="w-6 h-6 text-gray-400" />
                  )}
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-white">
                    Autonomous Trading Bot
                  </h2>
                  <p className="text-gray-400">
                    {isRunning ? 'Active - Monitoring and trading autonomously' : 'Stopped - Ready to start'}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center space-x-3">
                {isRunning ? (
                  <button
                    onClick={handleStopBot}
                    className="flex items-center space-x-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                  >
                    <Square className="w-4 h-4" />
                    <span>Stop Bot</span>
                  </button>
                ) : (
                  <button
                    onClick={handleStartBot}
                    disabled={!connected}
                    className="flex items-center space-x-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                  >
                    <Play className="w-4 h-4" />
                    <span>Start Bot</span>
                  </button>
                )}
              </div>
            </div>

            {/* Bot Statistics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-gray-700/50 rounded-lg p-4">
                <div className="flex items-center space-x-2 mb-2">
                  <Activity className="w-4 h-4 text-blue-400" />
                  <span className="text-sm text-gray-400">Tokens Detected</span>
                </div>
                <div className="text-2xl font-bold text-white">{stats.tokensDetected}</div>
              </div>
              
              <div className="bg-gray-700/50 rounded-lg p-4">
                <div className="flex items-center space-x-2 mb-2">
                  <Zap className="w-4 h-4 text-green-400" />
                  <span className="text-sm text-gray-400">Trades Executed</span>
                </div>
                <div className="text-2xl font-bold text-white">{stats.tradesExecuted}</div>
              </div>
              
              <div className="bg-gray-700/50 rounded-lg p-4">
                <div className="flex items-center space-x-2 mb-2">
                  <DollarSign className="w-4 h-4 text-yellow-400" />
                  <span className="text-sm text-gray-400">Total P&L</span>
                </div>
                <div className={`text-2xl font-bold ${stats.totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {stats.totalPnl >= 0 ? '+' : ''}{formatPrice(stats.totalPnl)} SOL
                </div>
              </div>
              
              <div className="bg-gray-700/50 rounded-lg p-4">
                <div className="flex items-center space-x-2 mb-2">
                  <Clock className="w-4 h-4 text-purple-400" />
                  <span className="text-sm text-gray-400">Uptime</span>
                </div>
                <div className="text-2xl font-bold text-white">{formatDuration(stats.uptime)}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Connection Warning */}
        {!connected && (
          <div className="mb-8">
            <div className="bg-yellow-900/20 border border-yellow-700 rounded-lg p-4">
              <div className="flex items-center space-x-2">
                <AlertCircle className="w-5 h-5 text-yellow-400" />
                <span className="text-yellow-400 font-medium">
                  Connect your wallet to start autonomous trading
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Autonomous Trading Panel */}
        <div className="mb-8">
          <AutonomousTradingPanel />
        </div>

        {/* Settings Panel */}
        {showSettings && (
          <div className="mb-8">
            <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">Bot Configuration</h3>
                <button
                  onClick={() => setShowSettings(false)}
                  className="text-gray-400 hover:text-white"
                >
                  ×
                </button>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Buy Amount (SOL)
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    min="0.001"
                    value={config.buyAmount}
                    onChange={(e) => updateConfig({ buyAmount: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Max Slippage (%)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    max="50"
                    value={config.slippage}
                    onChange={(e) => updateConfig({ slippage: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Stop Loss (%)
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    max="100"
                    value={config.stopLoss}
                    onChange={(e) => updateConfig({ stopLoss: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Take Profit (%)
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    value={config.takeProfit}
                    onChange={(e) => updateConfig({ takeProfit: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Max Positions
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={config.maxPositions}
                    onChange={(e) => updateConfig({ maxPositions: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Max Token Age (minutes)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={config.maxTokenAge}
                    onChange={(e) => updateConfig({ maxTokenAge: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Analytics Panel */}
        {showAnalytics && (
          <div className="mb-8">
            <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">Performance Analytics</h3>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={handleExportData}
                    className="flex items-center space-x-2 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    <span>Export</span>
                  </button>
                  <button
                    onClick={() => setShowAnalytics(false)}
                    className="text-gray-400 hover:text-white"
                  >
                    ×
                  </button>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-gray-700/50 rounded-lg p-4">
                  <div className="flex items-center space-x-2 mb-2">
                    <Target className="w-4 h-4 text-green-400" />
                    <span className="text-sm text-gray-400">Success Rate</span>
                  </div>
                  <div className="text-2xl font-bold text-white">
                    {trades.length > 0 
                      ? `${((trades.filter(t => t.status === 'success').length / trades.length) * 100).toFixed(1)}%`
                      : '0%'
                    }
                  </div>
                </div>
                
                <div className="bg-gray-700/50 rounded-lg p-4">
                  <div className="flex items-center space-x-2 mb-2">
                    <Shield className="w-4 h-4 text-blue-400" />
                    <span className="text-sm text-gray-400">Open Positions</span>
                  </div>
                  <div className="text-2xl font-bold text-white">
                    {positions.filter(p => p.status === 'open').length}
                  </div>
                </div>
                
                <div className="bg-gray-700/50 rounded-lg p-4">
                  <div className="flex items-center space-x-2 mb-2">
                    <Activity className="w-4 h-4 text-purple-400" />
                    <span className="text-sm text-gray-400">Avg Trade Size</span>
                  </div>
                  <div className="text-2xl font-bold text-white">
                    {trades.length > 0 
                      ? `${formatPrice(trades.reduce((sum, t) => sum + (t.amount * t.price), 0) / trades.length)} SOL`
                      : '0 SOL'
                    }
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Recent Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Recent Trades */}
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Recent Trades</h3>
              {trades.length > 0 && (
                <button
                  onClick={clearHistory}
                  className="text-sm text-gray-400 hover:text-white"
                >
                  Clear History
                </button>
              )}
            </div>
            
            {trades.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <Activity className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No trades yet</p>
                <p className="text-sm">Start the bot to begin trading</p>
              </div>
            ) : (
              <div className="space-y-3">
                {trades.slice(0, 5).map((trade) => (
                  <div key={trade.id} className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <div className={`p-2 rounded-lg ${
                        trade.type === 'buy' ? 'bg-green-500/20' : 'bg-red-500/20'
                      }`}>
                        {trade.type === 'buy' ? (
                          <TrendingUp className="w-4 h-4 text-green-400" />
                        ) : (
                          <TrendingDown className="w-4 h-4 text-red-400" />
                        )}
                      </div>
                      <div>
                        <div className="text-white font-medium">
                          {trade.type.toUpperCase()} {trade.tokenSymbol}
                        </div>
                        <div className="text-sm text-gray-400">
                          {formatTime(trade.timestamp)}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-white font-medium">
                        {formatPrice(trade.amount)} tokens
                      </div>
                      <div className="text-sm text-gray-400">
                        @ {formatPrice(trade.price)} SOL
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Open Positions */}
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
            <h3 className="text-lg font-semibold text-white mb-4">Open Positions</h3>
            
            {positions.filter(p => p.status === 'open').length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <Target className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No open positions</p>
                <p className="text-sm">Positions will appear here when trades are made</p>
              </div>
            ) : (
              <div className="space-y-3">
                {positions.filter(p => p.status === 'open').slice(0, 5).map((position) => (
                  <div key={position.id} className="p-3 bg-gray-700/50 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-white font-medium">{position.tokenSymbol}</div>
                      <div className={`text-sm font-medium ${
                        position.pnlPercent >= 0 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {position.pnlPercent >= 0 ? '+' : ''}{position.pnlPercent.toFixed(2)}%
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-sm text-gray-400">
                      <span>{formatPrice(position.amount)} tokens</span>
                      <span>{formatPrice(position.currentValue)} SOL</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
