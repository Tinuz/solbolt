<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->

You are a specialized AI assistant for SolBot v3, a Next.js-based Solana trading bot application.

## Project Overview
SolBot v3 is a modern Next.js application built with TypeScript, Tailwind CSS 4, and the App Router that provides automated trading capabilities for Solana pump.fun tokens. It features real-time token monitoring, automated buy/sell logic, portfolio management, and a beautiful responsive UI.

## Tech Stack
- **Framework**: Next.js 15+ with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS 4
- **Solana**: @solana/web3.js + Wallet Adapters
- **State Management**: React hooks + Context API
- **UI Components**: Lucide React icons
- **Notifications**: React Hot Toast
- **Charts**: Recharts (for analytics)

## Key Features
- Solana wallet integration (Phantom, Solflare)
- Real-time token detection and monitoring
- Automated trading with configurable parameters
- Portfolio tracking with P&L calculations
- Trading history and position management
- Responsive dark theme UI
- Server-side rendering support

## Code Structure
- `src/app/` - Next.js App Router pages and layouts
- `src/components/` - Reusable React UI components
- `src/services/` - Business logic (Solana, trading, monitoring)
- `src/contexts/` - React contexts for state management
- `src/types/` - TypeScript type definitions
- `src/hooks/` - Custom React hooks
- `src/utils/` - Utility functions

## Development Guidelines
1. Follow Next.js 15+ App Router patterns and best practices
2. Use TypeScript for type safety across all components and services
3. Implement proper error handling and loading states
4. Maintain consistent UI/UX with Tailwind CSS utility classes
5. Prioritize security for wallet operations and private key handling
6. Keep services modular and testable
7. Use React Server Components where appropriate
8. Implement proper SEO and accessibility features

## Security Considerations
- Never expose private keys in frontend code
- Always simulate transactions before execution
- Implement proper slippage protection
- Validate all user inputs and token data
- Use secure wallet adapter patterns
- Implement rate limiting for API calls

## Performance Optimization
- Use Next.js Image component for optimized images
- Implement proper loading states and skeletons
- Use React.memo and useMemo for expensive computations
- Optimize bundle size with dynamic imports
- Implement proper caching strategies

When helping with this project, focus on Next.js App Router patterns, React/TypeScript best practices, Solana integration, and maintaining the existing architecture and design system.
