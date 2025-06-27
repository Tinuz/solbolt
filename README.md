# SolBot v3 - Next.js Solana Trading Bot

A modern Next.js application for automated Solana pump.fun token trading with real-time monitoring and portfolio management.

## Features

- 🔗 **Solana Wallet Integration** - Connect with Phantom, Solflare, and other popular wallets
- 📊 **Real-time Token Monitoring** - Detect new tokens as they're created
- 🤖 **Automated Trading** - Buy/sell tokens based on configurable criteria
- 💰 **Portfolio Management** - Track positions, P&L, and trading history
- ⚙️ **Configurable Bot Settings** - Customize trading parameters
- 🎨 **Modern UI** - Dark theme with responsive design built with Tailwind CSS
- ⚡ **Next.js 15** - Server-side rendering and App Router for optimal performance

## Tech Stack

- **Framework**: Next.js 15 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS 4
- **Solana**: @solana/web3.js + Wallet Adapters
- **State Management**: React hooks
- **UI Components**: Lucide React icons
- **Notifications**: React Hot Toast

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm, yarn, pnpm, or bun
- A Solana wallet (Phantom, Solflare, etc.)

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd solboltv3
```

2. Install dependencies:
```bash
npm install
# or
yarn install
# or
pnpm install
# or
bun install
```

3. Start the development server:
```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

4. Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

### Usage

1. **Connect Wallet**: Click the wallet button to connect your Solana wallet
2. **Configure Bot**: Set your trading parameters (buy amount, max token age, etc.)
3. **Start Bot**: Click "Start Bot" to begin monitoring for new tokens
4. **Monitor**: View detected tokens, trading history, and current positions
5. **Manual Trading**: Positions can be sold manually using the sell buttons

## Configuration

The bot can be configured with the following parameters:

- **Buy Amount**: Amount of SOL to spend per trade
- **Max Token Age**: Maximum age of tokens to consider (in seconds)
- **Take Profit**: Percentage gain to trigger sell (%)
- **Stop Loss**: Percentage loss to trigger sell (%)
- **Max Positions**: Maximum number of concurrent positions
- **Slippage**: Allowed slippage for trades (%)

## Project Structure

```
src/
├── app/                   # Next.js App Router pages and layouts
│   ├── api/              # API routes
│   │   └── health/       # Health check endpoint
│   ├── layout.tsx        # Root layout with wallet provider
│   ├── page.tsx          # Main trading dashboard
│   └── globals.css       # Global styles
├── components/           # Reusable React components
│   ├── ErrorBoundary.tsx # Error boundary for graceful error handling
│   ├── LoadingSpinner.tsx # Loading components
│   └── Footer.tsx        # Application footer
├── contexts/             # React contexts
│   └── WalletContextProvider.tsx # Solana wallet integration
├── hooks/                # Custom React hooks
│   └── useBot.ts         # Main bot state management hook
├── services/             # Business logic services
│   ├── analytics.ts      # Analytics and reporting
│   ├── pumpFunBot.ts     # Main bot orchestrator
│   ├── pumpFunInstructions.ts # Solana transaction instructions
│   ├── pumpFunWebSocket.ts # Real-time token monitoring
│   ├── riskManager.ts    # Risk management logic
│   ├── solana.ts         # Solana blockchain interface
│   ├── tokenMonitor.ts   # Token detection and monitoring
│   └── trading.ts        # Trading logic and execution
└── types/                # TypeScript type definitions
    └── index.ts
```

## Development

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

### Key Features

- **Real-time Token Detection** - Simulated token monitoring with random generation
- **Automated Buy Logic** - Configurable criteria for token purchases
- **Portfolio Tracking** - Real-time position management
- **Responsive Design** - Mobile-friendly interface
- **Toast Notifications** - User feedback for all actions

## Security Considerations

⚠️ **Important Security Notes:**

1. **Private Keys**: Never hardcode private keys in frontend code
2. **Transaction Simulation**: Always simulate transactions before sending
3. **Slippage Protection**: Set appropriate slippage limits
4. **Rate Limiting**: Implement rate limiting for API calls
5. **Token Validation**: Validate token addresses and metadata

## Roadmap

- [ ] Real WebSocket connection to pump.fun
- [ ] Advanced charting with price history
- [ ] Portfolio analytics and reporting
- [ ] Multiple wallet support
- [ ] Transaction history export
- [ ] Advanced trading strategies
- [ ] Risk management features
- [ ] Mobile app version

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Disclaimer

This software is for educational purposes only. Trading cryptocurrencies involves substantial risk of loss. Use at your own risk. The developers are not responsible for any financial losses.

## Learn More

To learn more about the technologies used:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API
- [Solana Web3.js](https://docs.solana.com/developing/clients/javascript-api) - Solana JavaScript API
- [Tailwind CSS](https://tailwindcss.com/docs) - utility-first CSS framework
- [TypeScript](https://www.typescriptlang.org/docs/) - typed JavaScript

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.
