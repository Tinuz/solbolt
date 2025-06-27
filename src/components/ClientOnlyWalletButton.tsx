'use client';

import { useEffect, useState } from 'react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';

interface ClientOnlyWalletButtonProps {
  className?: string;
}

export function ClientOnlyWalletButton({ className }: ClientOnlyWalletButtonProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className={`${className} px-4 py-2 bg-gray-600 rounded-lg animate-pulse`}>
        Connecting...
      </div>
    );
  }

  return <WalletMultiButton className={className} />;
}
