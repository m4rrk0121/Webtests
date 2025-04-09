import React from 'react';
import { useAccount } from 'wagmi';
import { appKitInstance } from '../App';

const ConnectButton = () => {
  const { address, isConnected } = useAccount();
  
  const handleClick = () => {
    // Use Reown AppKit to open wallet connection modal
    appKitInstance.open();
  };
  
  return (
    <button
      onClick={handleClick}
      className="connect-wallet-button"
    >
      {isConnected ? 
        <span>{address?.substring(0, 6)}...{address?.substring(address?.length - 4)}</span> : 
        'Connect Wallet'}
    </button>
  );
};

export default ConnectButton;