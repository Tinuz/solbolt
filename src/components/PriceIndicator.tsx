'use client';

import React, { useMemo } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface PriceIndicatorProps {
  currentPrice: number;
  priceChange: number;
  priceChangePercent: number;
  showPercentage?: boolean;
  showArrow?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export default function PriceIndicator({
  currentPrice,
  priceChange,
  priceChangePercent,
  showPercentage = true,
  showArrow = true,
  size = 'md',
  className = ''
}: PriceIndicatorProps) {
  
  const trend = useMemo(() => {
    if (Math.abs(priceChangePercent) < 0.1) return 'stable';
    return priceChangePercent > 0 ? 'up' : 'down';
  }, [priceChangePercent]);

  const formatPrice = (price: number) => {
    if (price === 0) return '0.00';
    if (price >= 1) return price.toFixed(3);
    if (price >= 0.001) return price.toFixed(6);
    if (price >= 0.000001) return price.toFixed(8);
    
    // Voor zeer kleine waardes, gebruik een betere weergave
    const formatted = price.toFixed(12);
    const trimmed = formatted.replace(/\.?0+$/, '');
    return trimmed || '0.00';
  };

  const formatChange = (change: number) => {
    if (change === 0) return '0.00';
    if (Math.abs(change) >= 1) return change.toFixed(3);
    if (Math.abs(change) >= 0.001) return change.toFixed(6);
    if (Math.abs(change) >= 0.000001) return change.toFixed(8);
    
    // Voor zeer kleine wijzigingen, gebruik een betere weergave
    const formatted = change.toFixed(12);
    const trimmed = formatted.replace(/\.?0+$/, '');
    return trimmed || '0.00';
  };

  const sizeClasses = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg'
  };

  const iconSizeClasses = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
    lg: 'h-5 w-5'
  };

  const getColorClasses = () => {
    switch (trend) {
      case 'up':
        return 'text-green-400';
      case 'down':
        return 'text-red-400';
      default:
        return 'text-gray-400';
    }
  };

  const getIcon = () => {
    if (!showArrow) return null;
    
    const iconClass = `${iconSizeClasses[size]} ${getColorClasses()}`;
    
    switch (trend) {
      case 'up':
        return <TrendingUp className={iconClass} />;
      case 'down':
        return <TrendingDown className={iconClass} />;
      default:
        return <Minus className={iconClass} />;
    }
  };

  const getBgColorClass = () => {
    switch (trend) {
      case 'up':
        return 'bg-green-900/20 border-green-700';
      case 'down':
        return 'bg-red-900/20 border-red-700';
      default:
        return 'bg-gray-800 border-gray-600';
    }
  };

  return (
    <div className={`
      inline-flex items-center gap-1 px-2 py-1 rounded-lg border 
      ${getBgColorClass()} ${sizeClasses[size]} ${className}
    `}>
      {getIcon()}
      
      <div className="flex flex-col text-right">
        <span className="text-white font-mono font-medium text-xs leading-tight">
          ${formatPrice(currentPrice)}
        </span>
        
        {showPercentage && (
          <div className={`flex items-center justify-end gap-1 ${getColorClasses()}`}>
            <span className="font-mono text-xs font-medium leading-tight">
              {priceChangePercent >= 0 ? '+' : ''}{priceChangePercent.toFixed(2)}%
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
