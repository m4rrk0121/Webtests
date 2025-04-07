// appkit-config.js
import { createAppKit } from '@reown/appkit';
import { EthersAdapter } from '@reown/appkit-adapter-ethers';
import { arbitrum, mainnet } from '@reown/appkit/networks';

// Custom Base network definition
// Base network definition in MetaMask-compatible format
const baseNetwork = {
  chainId: '0x8453', // Hexadecimal format for chainId
  chainName: 'Base',
  rpcUrls: ['https://mainnet.base.org'], // Array of URLs
  blockExplorerUrls: ['https://basescan.org'],
  nativeCurrency: {
    name: 'Ethereum',
    symbol: 'ETH',
    decimals: 18
  }
};

// Project ID from your AppKit setup
const projectId = 'fbca5173eb7d0c37c86a00cc855ce453';

// Application metadata
const metadata = {
  name: 'KOA Fee Collector',
  description: 'Collect fees from your King of Apes LP positions',
  url: typeof window !== 'undefined' ? window.location.origin : 'https://kingofapes.fun',
  icons: ['https://kingofapes.fun/favicon.ico'] 
};

// Create and export the AppKit instance
let appKitInstance = null;

// Initialize AppKit in a way that works with both server-side rendering and client-side code
if (typeof window !== 'undefined') {
  // We're in the browser, it's safe to create the instance
  try {
    // Define networks array with Base network
    const networks = [mainnet, arbitrum, baseNetwork];
    
    // Create AppKit instance
    appKitInstance = createAppKit({
      adapters: [new EthersAdapter()],
      networks: networks,
      metadata,
      projectId,
      features: {
        analytics: true
      }
    });
    
    console.log('AppKit initialized successfully');
  } catch (error) {
    console.error('Error initializing AppKit:', error);
  }
}

export default appKitInstance;