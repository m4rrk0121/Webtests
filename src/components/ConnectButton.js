import React, { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { appKitInstance } from '../App';

const ConnectButton = () => {
  const { address, isConnected } = useAccount();
  // Add state to track internal connection status
  const [internalConnected, setInternalConnected] = useState(false);
  const [internalAddress, setInternalAddress] = useState(null);
  
  // Use effect to sync wagmi state with internal state
  useEffect(() => {
    if (isConnected && address) {
      setInternalConnected(true);
      setInternalAddress(address);
      // Store address for persistence
      localStorage.setItem('lastConnectedAddress', address);
    }
    
    // Check if we have a stored address from a previous connection
    const storedAddress = localStorage.getItem('lastConnectedAddress');
    if (storedAddress && !internalAddress) {
      setInternalAddress(storedAddress);
    }
    
    // Add mobile-specific event listener for WalletConnect
    const checkWalletConnectSession = () => {
      // Check if WalletConnect session exists in localStorage
      const wcSession = localStorage.getItem('walletconnect');
      if (wcSession) {
        try {
          const sessionData = JSON.parse(wcSession);
          // If we have accounts in the session
          if (sessionData && sessionData.accounts && sessionData.accounts.length > 0) {
            setInternalConnected(true);
            setInternalAddress(sessionData.accounts[0]);
          }
        } catch (e) {
          console.log("Error parsing WalletConnect session", e);
        }
      }
    };
    
    checkWalletConnectSession();
    
    // Listen for storage events (WalletConnect stores session in localStorage)
    const handleStorageChange = (e) => {
      if (e.key === 'walletconnect') {
        checkWalletConnectSession();
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [isConnected, address, internalAddress]);
  
  const handleClick = () => {
    // Use Reown AppKit to open wallet connection modal
    appKitInstance.open();
  };
  
  // Use both wagmi state and internal state to determine connection status
  const displayConnected = isConnected || internalConnected;
  const displayAddress = address || internalAddress;
  
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
