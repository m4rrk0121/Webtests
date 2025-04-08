import React from 'react';
import { Route, HashRouter as Router, Routes } from 'react-router-dom';
import './App.css';

// React Query
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Import Reown AppKit
import { createAppKit } from '@reown/appkit';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { base } from '@reown/appkit/networks';
import { createConfig, http, WagmiProvider } from 'wagmi';

// Import your components
import AIAssistantChat from './components/AIAssistantChat';
import CollectFees from './components/CollectFees';
import DeployToken from './components/DeployToken';
import Home from './components/Home';
import Navbar from './components/Navbar';
import TokenDashboard from './components/TokenDashboard';
import TokenDetailPage from './components/TokenDetailPage';
import { WebSocketProvider } from './context/WebSocketContext';

// Create a query client
const queryClient = new QueryClient();

// Your project ID from Reown Cloud or WalletConnect
const projectId = 'fbca5173eb7d0c37c86a00cc855ce453';

// Define networks
const networks = [base];

// Create a separate wagmi config for direct contract interactions
export const wagmiConfig = createConfig({
  chains: networks,
  transports: {
    [base.id]: http(),
  }
});

// Set up Wagmi adapter
const wagmiAdapter = new WagmiAdapter({
  projectId,
  networks
});

// Configure the metadata
const metadata = {
  name: 'King of Apes',
  description: 'King of Apes DeFi Platform',
  url: 'https://kingofapes.fun',
  icons: ['https://kingofapes.fun/favicon.ico']
};

// Create the AppKit instance
const appKit = createAppKit({
  adapters: [wagmiAdapter],
  networks,
  metadata,
  projectId,
  features: {
    analytics: true // Optional
  }
});

// Export the appKit instance for use in other components
export const appKitInstance = appKit;

function App() {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <WebSocketProvider>
          <Router>
            <div className="App">
              <Navbar /> {/* Navbar is now outside of the Routes */}
              <div className="content-container">
                <Routes>
                  <Route path="/home" element={<Home />} />
                  <Route path="/" element={<Home />} /> {/* This ensures both paths work */}
                  <Route path="/dashboard" element={<TokenDashboard />} />
                  <Route path="/token/:contractAddress" element={<TokenDetailPage />} />
                  <Route path="/collect-fees" element={<CollectFees />} />
                  <Route path="/deploy-token" element={<DeployToken />} />
                  <Route path="/update-token-info" element={<div className="placeholder-page"><h1>Token Info Updates Coming Soon</h1></div>} />
                </Routes>
              </div>
              <AIAssistantChat />
            </div>
          </Router>
        </WebSocketProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

export default App;