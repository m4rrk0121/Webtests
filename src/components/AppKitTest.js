import { createAppKit } from '@reown/appkit';
import { EthersAdapter } from '@reown/appkit-adapter-ethers';
import React, { useEffect, useState } from 'react';

function AppKitTest() {
  const [status, setStatus] = useState('Loading...');
  const [error, setError] = useState(null);
  const [appKit, setAppKit] = useState(null);

  useEffect(() => {
    async function initializeAppKit() {
      try {
        // Log the environment
        console.log('Environment check:');
        console.log('- Window defined:', typeof window !== 'undefined');
        console.log('- Running in browser:', typeof document !== 'undefined');
        
        // Verify imports
        console.log('Import verification:');
        console.log('- createAppKit available:', typeof createAppKit === 'function');
        console.log('- EthersAdapter available:', typeof EthersAdapter === 'function');
        
        // Updated Base network definition with rpcUrls.default for v1.7.1
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
          name: 'AppKit Test',
          description: 'Simple test to verify AppKit initialization',
          url: window.location.origin,
          icons: ['https://kingofapes.fun/favicon.ico'] 
        };
        
        console.log('Creating AppKit with configuration:', {
          networks: [baseNetwork],
          projectId,
          metadata
        });
        
        // Create AppKit instance
        console.log('Step 1: Creating EthersAdapter...');
        const adapter = new EthersAdapter();
        
        console.log('Step 2: Calling createAppKit...');
        const appKitInstance = createAppKit({
          adapters: [adapter],
          networks: [baseNetwork],
          metadata,
          projectId,
          features: {
            analytics: true
          }
        });
        
        // Check what methods are available on the AppKit instance
        console.log('Available methods on AppKit instance:', Object.getOwnPropertyNames(appKitInstance));
        console.log('Methods on AppKit prototype:', Object.getOwnPropertyNames(Object.getPrototypeOf(appKitInstance)));
        
        setAppKit(appKitInstance);
        setStatus('AppKit initialized successfully. Ready to connect.');
      } catch (err) {
        console.error('AppKit initialization error:', err);
        setError(err.message || 'Unknown error during AppKit initialization');
        setStatus('Failed to initialize AppKit');
      }
    }

    initializeAppKit();
  }, []);

  const handleConnect = async () => {
    if (!appKit) {
      setError('AppKit not initialized yet');
      return;
    }
    
    try {
      setStatus('Connecting...');
      
      // Try different possible connection methods
      console.log('Attempting to connect to wallet...');
      
      // Check if there's a signIn method (newer versions might use this)
      if (typeof appKit.signIn === 'function') {
        console.log('Using signIn method...');
        await appKit.signIn();
      } 
      // Check if there's a connectWallet method
      else if (typeof appKit.connectWallet === 'function') {
        console.log('Using connectWallet method...');
        await appKit.connectWallet();
      }
      // Check if there's an openModal method
      else if (typeof appKit.openModal === 'function') {
        console.log('Using openModal method...');
        await appKit.openModal();
      }
      // If none of the above work, try direct adapter connection
      else if (appKit.ethereum && typeof appKit.ethereum.request === 'function') {
        console.log('Using direct ethereum request...');
        await appKit.ethereum.request({ method: 'eth_requestAccounts' });
      }
      else {
        throw new Error('No suitable connection method found on AppKit instance');
      }
      
      console.log('Connection attempt completed, checking provider...');
      
      // Try to get provider using different possible methods
      let provider = null;
      
      if (typeof appKit.getProvider === 'function') {
        provider = await appKit.getProvider();
      } else if (appKit.ethereum) {
        provider = appKit.ethereum;
      } else if (appKit.provider) {
        provider = appKit.provider;
      }
      
      if (provider) {
        console.log('Provider received:', provider);
        setStatus('Successfully connected!');
      } else {
        setStatus('Connection completed but no provider available');
      }
    } catch (err) {
      console.error('Connection error:', err);
      setError(err.message || 'Unknown error during connection');
      setStatus('Connection failed');
    }
  };

  return (
    <div style={{ 
      maxWidth: '600px', 
      margin: '40px auto', 
      padding: '20px',
      backgroundColor: '#1c1c1e',
      color: 'white',
      borderRadius: '12px',
      textAlign: 'center'
    }}>
      <h1>AppKit Test</h1>
      
      <div style={{ 
        marginBottom: '20px',
        padding: '15px',
        backgroundColor: '#2c2c2e',
        borderRadius: '8px'
      }}>
        <h3>Status: {status}</h3>
        {error && (
          <div style={{ 
            marginTop: '10px',
            padding: '10px',
            backgroundColor: 'rgba(255, 59, 48, 0.2)',
            color: '#ff3b30',
            borderRadius: '6px'
          }}>
            <strong>Error:</strong> {error}
          </div>
        )}
      </div>
      
      <button 
        onClick={handleConnect}
        disabled={!appKit}
        style={{
          padding: '12px 24px',
          backgroundColor: appKit ? '#ffb300' : '#666',
          color: appKit ? '#000' : '#ccc',
          border: 'none',
          borderRadius: '8px',
          fontSize: '16px',
          fontWeight: 'bold',
          cursor: appKit ? 'pointer' : 'not-allowed'
        }}
      >
        {appKit ? 'Test Wallet Connection' : 'Waiting for AppKit...'}
      </button>
      
      <p style={{ marginTop: '20px', fontSize: '14px', color: '#999' }}>
        Check the browser console for detailed logs.
      </p>
    </div>
  );
}

export default AppKitTest;