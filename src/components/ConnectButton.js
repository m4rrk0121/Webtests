import React from 'react';
import { useAccount } from 'wagmi';
import { appKitInstance } from '../App';

const ConnectButton = () => {
  const { address, isConnected, status } = useAccount();
  
  const handleClick = () => {
    appKitInstance.open();
  };

  return (
    <button
      onClick={handleClick}
      className="connect-wallet-button"
    >
      {isConnected && address ? 
        `${address.substring(0, 6)}...${address.substring(address.length - 4)}` : 
        'Connect Wallet'}
    </button>
  );
};

export default ConnectButton;
