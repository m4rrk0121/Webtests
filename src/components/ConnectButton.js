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
        background: '#ffb300',
        color: '#000000',
        border: 'none',
        borderRadius: '6px',
        padding: '10px 20px',
        cursor: 'pointer',
        fontWeight: 'bold',
        fontSize: '1rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        transition: 'transform 0.3s ease',
        boxShadow: '0 2px 5px rgba(0,0,0,0.2)'
      }}
      onMouseOver={(e) => e.target.style.transform = 'scale(1.05)'}
      onMouseOut={(e) => e.target.style.transform = 'scale(1)'}
    >
      {isConnected ? 
        `${address?.substring(0, 6)}...${address?.substring(address?.length - 4)}` : 
        'Connect Wallet'}
    </button>
  );
};

export default ConnectButton;