import React, { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { appKitInstance } from '../App';

const ConnectButton = () => {
  const { address, isConnected } = useAccount();
  const [internalConnected, setInternalConnected] = useState(false);
  const [internalAddress, setInternalAddress] = useState(null);
  const [buttonText, setButtonText] = useState('Connect Wallet');
  
  // Force check for wallet connection status
  const forceCheckConnection = async () => {
    try {
      // Try to get accounts via ethereum provider directly
      if (window.ethereum) {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        if (accounts && accounts.length > 0) {
          setInternalConnected(true);
          setInternalAddress(accounts[0]);
          updateButtonText(accounts[0]);
          return true;
        }
      }
      
      // Check for WalletConnect session
      const wcSession = localStorage.getItem('walletconnect');
      if (wcSession) {
        try {
          const sessionData = JSON.parse(wcSession);
          if (sessionData && sessionData.accounts && sessionData.accounts.length > 0) {
            setInternalConnected(true);
            setInternalAddress(sessionData.accounts[0]);
            updateButtonText(sessionData.accounts[0]);
            return true;
          }
        } catch (e) {
          console.log("Error parsing WalletConnect session", e);
        }
      }
      
      return false;
    } catch (error) {
      console.error("Error checking connection:", error);
      return false;
    }
  };
  
  const updateButtonText = (addr) => {
    if (addr) {
      setButtonText(`${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`);
    } else {
      setButtonText('Connect Wallet');
    }
  };
  
  // Handle the connect button click
  const handleClick = async () => {
    // If we're already internally connected, just update UI again
    if (internalConnected && internalAddress) {
      updateButtonText(internalAddress);
      return;
    }
    
    // Check if already connected but UI doesn't show it
    const isAlreadyConnected = await forceCheckConnection();
    if (isAlreadyConnected) {
      // We're already connected, just update UI
      return;
    }
    
    // Otherwise, open the wallet connect modal
    appKitInstance.open();
  };
  
  // Synchronize with wagmi state
  useEffect(() => {
    if (isConnected && address) {
      setInternalConnected(true);
      setInternalAddress(address);
      updateButtonText(address);
      localStorage.setItem('lastConnectedAddress', address);
    } else {
      // Only reset if we don't have an internal connection
      if (!internalConnected) {
        forceCheckConnection();
      }
    }
  }, [isConnected, address]);
  
  // Check connection status on component mount
  useEffect(() => {
    // Initial connection check
    forceCheckConnection();
    
    // Setup event listeners for connection events
    const setupConnectionListeners = () => {
      if (window.ethereum) {
        window.ethereum.on('connect', () => {
          forceCheckConnection();
        });
        
        window.ethereum.on('accountsChanged', (accounts) => {
          if (accounts && accounts.length > 0) {
            setInternalConnected(true);
            setInternalAddress(accounts[0]);
            updateButtonText(accounts[0]);
          } else {
            setInternalConnected(false);
            setInternalAddress(null);
            updateButtonText(null);
          }
        });
      }
    };
    
    setupConnectionListeners();
    
    // Regular polling for connection status (helpful for mobile)
    const intervalId = setInterval(() => {
      if (!internalConnected) {
        forceCheckConnection();
      }
    }, 3000);
    
    return () => {
      // Clear interval on unmount
      clearInterval(intervalId);
      
      // Remove listeners
      if (window.ethereum) {
        window.ethereum.removeListener('connect', () => {});
        window.ethereum.removeListener('accountsChanged', () => {});
      }
    };
  }, [internalConnected]);
  
  return (
    <button
      onClick={handleClick}
      className="connect-wallet-button"
    >
      {buttonText}
    </button>
  );
};

export default ConnectButton;
};

export default ConnectButton;
