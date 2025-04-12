// 1. Modify ConnectButton.js to better handle mobile connections:

// ConnectButton.js updates
import React, { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { appKitInstance } from '../App';

const ConnectButton = () => {
  const { address, isConnected } = useAccount();
  // Add state to track internal connection status
  const [internalConnected, setInternalConnected] = useState(false);
  
  // Use effect to sync wagmi state with internal state
  useEffect(() => {
    if (isConnected && address) {
      setInternalConnected(true);
    } else {
      setInternalConnected(false);
    }
    
    // Add mobile-specific event listener for WalletConnect
    const checkWalletConnectSession = () => {
      // Check if WalletConnect session exists in localStorage
      const wcSession = localStorage.getItem('walletconnect');
      if (wcSession && !isConnected) {
        // If WalletConnect session exists but wagmi doesn't show connected,
        // trigger reconnection via AppKit
        appKitInstance.open();
      }
    };
    
    checkWalletConnectSession();
    
    // Listen for storage events (WalletConnect stores session in localStorage)
    window.addEventListener('storage', checkWalletConnectSession);
    
    return () => {
      window.removeEventListener('storage', checkWalletConnectSession);
    };
  }, [isConnected, address]);
  
  const handleClick = () => {
    // Use Reown AppKit to open wallet connection modal
    appKitInstance.open();
  };
  
  // Use both wagmi state and internal state to determine connection status
  const displayConnected = isConnected || internalConnected;
  const displayAddress = address || (internalConnected ? localStorage.getItem('lastConnectedAddress') : null);
  
  return (
    <button
      onClick={handleClick}
      className="connect-wallet-button"
    >
      {displayConnected && displayAddress ? 
        <span>{displayAddress?.substring(0, 6)}...{displayAddress?.substring(displayAddress?.length - 4)}</span> : 
        'Connect Wallet'}
    </button>
  );
};

export default ConnectButton;

// 2. Modify App.js to enhance the WagmiAdapter configuration:

// In App.js, update the wagmiAdapter configuration:
const wagmiAdapter = new WagmiAdapter({
  projectId,
  networks,
  // Add mobile-specific configuration
  walletConnectOptions: {
    showQrModal: true,
    // Ensure metadata is properly set for mobile wallets
    metadata: {
      name: 'King of Apes',
      description: 'King of Apes DeFi Platform',
      url: 'https://kingofapes.fun',
      icons: ['https://kingofapes.fun/favicon.ico']
    }
  }
});

// 3. Add a global connection handler in App.js:

// Add this after your AppKit initialization
useEffect(() => {
  // Function to handle connection changes
  const handleConnectionChange = (account) => {
    if (account) {
      // Store the last connected address for reference
      localStorage.setItem('lastConnectedAddress', account);
      
      // Force a UI update across components
      window.dispatchEvent(new CustomEvent('walletConnected', { 
        detail: { address: account } 
      }));
    } else {
      // Handle disconnection
      localStorage.removeItem('lastConnectedAddress');
      
      window.dispatchEvent(new CustomEvent('walletDisconnected'));
    }
  };
  
  // Subscribe to account changes
  const unsubscribe = appKit.subscribeToAccountChanges(handleConnectionChange);
  
  return () => {
    // Clean up subscription
    if (unsubscribe) unsubscribe();
  };
}, []);

// 4. Update DeployToken.js wallet event handling:

// In setupWalletEventListeners function in DeployToken.js:
const setupWalletEventListeners = (ethereum, handleChainChanged, handleAccountsChanged) => {
  // Clear any existing listeners first to prevent duplicates
  if (ethereum.removeListener) {
    ethereum.removeListener('chainChanged', handleChainChanged);
    ethereum.removeListener('accountsChanged', handleAccountsChanged);
  } else if (ethereum.removeEventListener) {
    ethereum.removeEventListener('chainChanged', handleChainChanged);
    ethereum.removeEventListener('accountsChanged', handleAccountsChanged);
  }
  
  // Set up listeners based on what the provider supports
  if (ethereum.on && typeof ethereum.on === 'function') {
    ethereum.on('chainChanged', handleChainChanged);
    ethereum.on('accountsChanged', handleAccountsChanged);
    return true;
  } else if (ethereum.addEventListener && typeof ethereum.addEventListener === 'function') {
    ethereum.addEventListener('chainChanged', handleChainChanged);
    ethereum.addEventListener('accountsChanged', handleAccountsChanged);
    return true;
  } else if (ethereum.addListener && typeof ethereum.addListener === 'function') {
    ethereum.addListener('chainChanged', handleChainChanged);
    ethereum.addListener('accountsChanged', handleAccountsChanged);
    return true;
  }
  
  // For mobile wallets using WalletConnect, also listen for our custom events
  window.addEventListener('walletConnected', (event) => {
    if (event.detail && event.detail.address) {
      handleAccountsChanged([event.detail.address]);
    }
  });
  
  console.warn('Could not set up wallet event listeners - provider may not support events');
  return false;
};

// 5. Create a new utility function to detect mobile devices:

// Create a new file: src/utils/deviceDetector.js
export const isMobileDevice = () => {
  return (
    typeof window !== 'undefined' && 
    (
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
      (window.innerWidth <= 768)
    )
  );
};

// 6. Additional check in DeployToken.js to handle mobile wallets:

// Add this in DeployToken.js useEffect for wallet connection:
useEffect(() => {
  const handleCustomWalletEvent = (event) => {
    if (event.detail && event.detail.address) {
      // This is our custom event from App.js when wallet connects
      setAddress(event.detail.address);
      setIsConnected(true);
      
      // Since we now know we're connected, fetch the provider and signer
      if (window.ethereum) {
        const provider = new ethers.BrowserProvider(window.ethereum);
        provider.getSigner().then(newSigner => {
          setSigner(newSigner);
          setProvider(provider);
        });
      }
    }
  };
  
  // Listen for our custom wallet connected event
  window.addEventListener('walletConnected', handleCustomWalletEvent);
  
  return () => {
    window.removeEventListener('walletConnected', handleCustomWalletEvent);
  };
}, []);

// 7. Mobile-specific wallet detection in CollectFees.js:

// Add this near the top of your CollectFees component:
useEffect(() => {
  // Handle our custom wallet events
  const handleWalletConnect = (event) => {
    if (event.detail && event.detail.address) {
      // Refresh the component when wallet connects
      // This forces a re-render to pick up the new connection state
      setIsConnected(true);
    }
  };
  
  const handleWalletDisconnect = () => {
    setIsConnected(false);
  };
  
  window.addEventListener('walletConnected', handleWalletConnect);
  window.addEventListener('walletDisconnected', handleWalletDisconnect);
  
  return () => {
    window.removeEventListener('walletConnected', handleWalletConnect);
    window.removeEventListener('walletDisconnected', handleWalletDisconnect);
  };
}, []);
