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
      style={{
        background: '#0052ff',
        color: 'white',
        border: 'none',
        borderRadius: '6px',
        padding: '10px 16px',
        cursor: 'pointer',
        fontWeight: 'bold',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px'
      }}
    >
      {isConnected ? 
        `${address?.substring(0, 6)}...${address?.substring(address?.length - 4)}` : 
        'Connect Wallet'}
    </button>
  );
};

export default ConnectButton;