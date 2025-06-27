import { Loader2 } from 'lucide-react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  text?: string;
  className?: string;
}

export function LoadingSpinner({ size = 'md', text, className = '' }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8'
  };

  return (
    <div className={`flex flex-col items-center gap-2 ${className}`}>
      <Loader2 className={`animate-spin text-blue-500 ${sizeClasses[size]}`} />
      {text && <p className="text-sm text-gray-400">{text}</p>}
    </div>
  );
}

interface LoadingOverlayProps {
  text?: string;
  children?: React.ReactNode;
}

export function LoadingOverlay({ text = 'Loading...', children }: LoadingOverlayProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-8 text-center">
        <LoadingSpinner size="lg" text={text} />
        {children}
      </div>
    </div>
  );
}

interface LoadingCardProps {
  title?: string;
  description?: string;
  className?: string;
}

export function LoadingCard({ title = 'Loading', description, className = '' }: LoadingCardProps) {
  return (
    <div className={`bg-gray-800 border border-gray-700 rounded-lg p-6 ${className}`}>
      <div className="flex items-center gap-3 mb-3">
        <LoadingSpinner size="sm" />
        <h3 className="text-lg font-semibold text-white">{title}</h3>
      </div>
      {description && (
        <p className="text-gray-400 text-sm">{description}</p>
      )}
    </div>
  );
}
