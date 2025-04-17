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
import { injected, walletConnect, coinbaseWallet } from 'wagmi/connectors';

// Import RPC configuration
import { createRPCTransport } from './config/rpc';

// Import your components
import AIAssistantChat from './components/AIAssistantChat';
import CollectFees from './components/CollectFees';
import DeployToken from './components/DeployToken';
import Home from './components/Home';
import Navbar from './components/Navbar';
import TokenDashboard from './components/TokenDashboard';
import TokenDetailPage from './components/TokenDetailPage';
import UpdateTokenInfo from './components/UpdateTokenInfo';
import { WebSocketProvider } from './context/WebSocketContext';

// Create query client
const queryClient = new QueryClient();

// Get WalletConnect project ID from environment
const projectId = process.env.REACT_APP_WALLETCONNECT_PROJECT_ID;
if (!projectId) {
  throw new Error('WalletConnect project ID not found in environment variables');
}

// Define networks
const networks = [base];

// Configure metadata
const metadata = {
  name: 'King of Apes',
  description: 'King of Apes DeFi Platform',
  url: window.location.origin,
  icons: ['https://kingofapes.fun/favicon.ico']
};

// Create wagmi config first
export const wagmiConfig = createConfig({
  chains: networks,
  transports: {
    [base.id]: createRPCTransport(base.id),
  },
  connectors: [
    injected({
      target: 'metaMask',
      shimDisconnect: true,
      shimChainChanged: true,
      onConnect: () => {
        // Force state update on connect
        window.dispatchEvent(new Event('wagmi:connected'));
      },
      onDisconnect: () => {
        // Clear any stored connection data
        localStorage.removeItem('wagmi.wallet');
        localStorage.removeItem('wagmi.connected');
        localStorage.removeItem('wagmi.store');
        // Force state update on disconnect
        window.dispatchEvent(new Event('wagmi:disconnected'));
      },
    }),
    walletConnect({
      projectId: process.env.REACT_APP_WALLETCONNECT_PROJECT_ID,
      showQrModal: true,
      qrModalOptions: {
        themeMode: 'dark',
        themeVariables: {
          '--wcm-z-index': '1000',
        },
      },
      metadata: {
        name: 'King of Apes',
        description: 'King of Apes DeFi Platform',
        url: window.location.origin,
        icons: ['https://kingofapes.fun/favicon.ico']
      },
      options: {
        relayUrl: 'wss://relay.walletconnect.com',
        projectId: process.env.REACT_APP_WALLETCONNECT_PROJECT_ID,
        metadata: {
          name: 'King of Apes',
          description: 'King of Apes DeFi Platform',
          url: window.location.origin,
          icons: ['https://kingofapes.fun/favicon.ico']
        },
        storageOptions: {
          storage: {
            getItem: (key) => {
              try {
                const item = localStorage.getItem(key);
                return item ? JSON.parse(item) : null;
              } catch (error) {
                console.error('Error getting item from storage:', error);
                return null;
              }
            },
            setItem: (key, value) => {
              try {
                localStorage.setItem(key, JSON.stringify(value));
                // Force state update when storage changes
                window.dispatchEvent(new Event('wagmi:storage'));
              } catch (error) {
                console.error('Error setting item in storage:', error);
              }
            },
            removeItem: (key) => {
              try {
                localStorage.removeItem(key);
                // Force state update when storage changes
                window.dispatchEvent(new Event('wagmi:storage'));
              } catch (error) {
                console.error('Error removing item from storage:', error);
              }
            }
          }
        }
      },
      onConnect: () => {
        // Force state update on connect
        window.dispatchEvent(new Event('wagmi:connected'));
      },
      onDisconnect: () => {
        // Clear WalletConnect specific storage
        localStorage.removeItem('walletconnect');
        localStorage.removeItem('wagmi.wallet');
        localStorage.removeItem('wagmi.connected');
        localStorage.removeItem('wagmi.store');
        // Force state update on disconnect
        window.dispatchEvent(new Event('wagmi:disconnected'));
      },
    }),
    coinbaseWallet({
      appName: 'King of Apes',
      appLogoUrl: 'https://kingofapes.fun/favicon.ico',
      onConnect: () => {
        // Force state update on connect
        window.dispatchEvent(new Event('wagmi:connected'));
      },
      onDisconnect: () => {
        // Clear Coinbase specific storage
        localStorage.removeItem('wagmi.wallet');
        localStorage.removeItem('wagmi.connected');
        localStorage.removeItem('wagmi.store');
        // Force state update on disconnect
        window.dispatchEvent(new Event('wagmi:disconnected'));
      },
    }),
  ],
  ssr: true,
  batch: {
    multicall: true,
  },
  syncConnectedChain: true,
  // Add state synchronization
  state: {
    onConnect: () => {
      window.dispatchEvent(new Event('wagmi:connected'));
    },
    onDisconnect: () => {
      window.dispatchEvent(new Event('wagmi:disconnected'));
    },
  },
});

// Set up Wagmi adapter with the config
const wagmiAdapter = new WagmiAdapter({
  wagmiConfig,
  projectId,
  networks,
  defaultChain: base,
  metadata,
  defaultAccountTypes: { eip155: 'eoa' },
});

// Create the AppKit instance
export const appKitInstance = createAppKit({
  adapters: [wagmiAdapter],
  networks,
  metadata,
  projectId,
  defaultNetwork: base,
  defaultAccountTypes: { eip155: 'eoa' },
  features: {
    analytics: true,
    connectMethodsOrder: ['wallet', 'email', 'social'],
  },
  enableNetworkSwitch: true,
  debug: true,
});

function App() {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <WebSocketProvider>
          <Router>
            <div className="App">
              <Navbar />
              <div className="content-container">
                <Routes>
                  <Route path="/home" element={<Home />} />
                  <Route path="/" element={<Home />} />
                  <Route path="/dashboard" element={<TokenDashboard />} />
                  <Route path="/token/:contractAddress" element={<TokenDetailPage />} />
                  <Route path="/collect-fees" element={<CollectFees />} />
                  <Route path="/deploy-token" element={<DeployToken />} />
                  <Route path="/update-token-info" element={<UpdateTokenInfo />} />
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