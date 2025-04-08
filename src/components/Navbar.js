import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAccount } from 'wagmi'; // Import useAccount to check connection status
import { appKitInstance } from '../App'; // Import the appKit instance

function Navbar() {
  const location = useLocation();
  const { address, isConnected } = useAccount(); // Get connection status
  
  // Function to check if a path is active
  const isActive = (path) => {
    return location.pathname === path;
  };

  // Function to open the wallet connect modal
  const openConnectModal = () => {
    appKitInstance.open();
  };

  // Function to open the network switch modal
  const openNetworkModal = () => {
    appKitInstance.open({ view: 'Networks' });
  };

  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <h2>KOA</h2>
      </div>
      <div className="navbar-menu">
        <Link 
          to="/" 
          className={`navbar-item ${isActive('/') ? 'active' : ''}`}
        >
          Home
        </Link>
        <Link 
          to="/dashboard" 
          className={`navbar-item ${isActive('/dashboard') ? 'active' : ''}`}
        >
          Token Dashboard
        </Link>
        <Link 
          to="/deploy-token" 
          className={`navbar-item ${isActive('/deploy-token') ? 'active' : ''}`}
        >
          Deploy Token
        </Link>
        <Link 
          to="/collect-fees" 
          className={`navbar-item ${isActive('/collect-fees') ? 'active' : ''}`}
        >
          Collect Fees
        </Link>
        <Link 
          to="/update-token-info" 
          className={`navbar-item ${isActive('/update-token-info') ? 'active' : ''}`}
        >
          Update Token Info
        </Link>
      </div>
      
      {/* Add Reown AppKit wallet buttons */}
      <div className="navbar-wallet">
        {isConnected ? (
          <button 
            onClick={openConnectModal} 
            className="connect-button connected"
          >
            {address ? `${address.substring(0, 6)}...${address.substring(address.length - 4)}` : 'Connected'}
          </button>
        ) : (
          <button 
            onClick={openConnectModal} 
            className="connect-button"
          >
            Connect Wallet
          </button>
        )}
      </div>
    </nav>
  );
}

export default Navbar;

