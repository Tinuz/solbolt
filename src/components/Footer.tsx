import { Github, ExternalLink, Heart } from 'lucide-react';

export function Footer() {
  return (
    <footer className="bg-gray-800 border-t border-gray-700 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          
          {/* Left side - Branding */}
          <div className="flex items-center gap-2">
            <div className="text-xl font-bold text-white">SolBot v3</div>
            <div className="text-sm text-gray-400">
              Built with Next.js & Solana
            </div>
          </div>

          {/* Center - Links */}
          <div className="flex items-center gap-6">
            <a
              href="https://pump.fun"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-400 hover:text-white transition-colors flex items-center gap-1"
            >
              <ExternalLink className="w-4 h-4" />
              pump.fun
            </a>
            <a
              href="https://solana.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-400 hover:text-white transition-colors flex items-center gap-1"
            >
              <ExternalLink className="w-4 h-4" />
              Solana
            </a>
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-400 hover:text-white transition-colors flex items-center gap-1"
            >
              <Github className="w-4 h-4" />
              GitHub
            </a>
          </div>

          {/* Right side - Made with love */}
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <span>Made with</span>
            <Heart className="w-4 h-4 text-red-500" />
            <span>for the Solana community</span>
          </div>
        </div>

        {/* Bottom disclaimer */}
        <div className="mt-4 pt-4 border-t border-gray-700">
          <p className="text-xs text-gray-500 text-center">
            ⚠️ <strong>Disclaimer:</strong> This software is for educational purposes only. 
            Trading cryptocurrencies involves substantial risk of loss. Use at your own risk. 
            The developers are not responsible for any financial losses.
          </p>
        </div>
      </div>
    </footer>
  );
}
