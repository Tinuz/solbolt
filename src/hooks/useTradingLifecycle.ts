/**
 * Hook for managing trading service lifecycle and cleanup
 */

import { useEffect, useRef } from 'react';
import { AutonomousTradingManager } from '@/services/autonomousTrading';
import { TradingService } from '@/services/trading';

export function useTradingLifecycle(
  tradingManager: AutonomousTradingManager | null,
  tradingService: TradingService | null
) {
  const isShuttingDown = useRef(false);

  // Cleanup function to stop trading and close positions
  const cleanup = async () => {
    if (isShuttingDown.current) return;
    isShuttingDown.current = true;

    console.log('🔄 Trading lifecycle cleanup initiated...');

    try {
      // Stop autonomous trading manager
      if (tradingManager) {
        await tradingManager.stop();
      }

      // Also shutdown trading service directly if available
      if (tradingService) {
        await tradingService.shutdown();
      }

      console.log('✅ Trading lifecycle cleanup completed');
    } catch (error) {
      console.error('❌ Error during trading cleanup:', error);
    }
  };

  useEffect(() => {
    // Cleanup on component unmount
    return () => {
      cleanup();
    };
  }, [tradingManager, tradingService]);

  useEffect(() => {
    // Browser beforeunload event (page refresh/close)
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      const hasActiveTrades = tradingManager?.isRunningTrading() || 
                            (tradingService?.getPositionManager()?.getActivePositions().length ?? 0) > 0;
      
      if (hasActiveTrades) {
        cleanup();
        
        // Show warning to user
        const message = 'Trading bot is still running with active positions. Are you sure you want to leave?';
        event.preventDefault();
        event.returnValue = message;
        return message;
      }
    };

    // Visibility change (tab switching, minimizing)
    const handleVisibilityChange = () => {
      if (document.hidden) {
        console.log('👁️ Page hidden, trading continues in background...');
      } else {
        console.log('👁️ Page visible again');
      }
    };

    // Page hide event (more reliable than beforeunload)
    const handlePageHide = () => {
      cleanup();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [tradingManager, tradingService]);

  return {
    cleanup,
    isShuttingDown: isShuttingDown.current
  };
}
