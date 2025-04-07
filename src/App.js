import React from 'react';
import { Route, HashRouter as Router, Routes } from 'react-router-dom';
import './App.css';

// Wagmi and Onchain Kit imports
import { OnchainKitProvider } from '@coinbase/onchainkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { base } from 'wagmi/chains';
import { coinbaseWallet, walletConnect } from 'wagmi/connectors';

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

// WalletConnect project ID
const projectId = 'fbca5173eb7d0c37c86a00cc855ce453';

// Create Wagmi configuration
const wagmiConfig = createConfig({
  chains: [base],
  connectors: [
    coinbaseWallet({
      appName: 'King of Apes',
    }),
    walletConnect({
      projectId,
    }),
  ],
  ssr: true,
  transports: {
    [base.id]: http(),
  },
});

function App() {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <OnchainKitProvider 
          appName="King of Apes"
          appIcon="https://kingofapes.fun/favicon.ico"
          chain={base}
          walletConnectProjectId={projectId}
          mode="dark"
        >
          <WebSocketProvider>
            <Router>
              <div className="App">
                <Navbar />
                <div className="content-container">
                  <Routes>
                    <Route path="/" element={<Home />} />
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
        </OnchainKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

export default App;