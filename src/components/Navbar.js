import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAccount } from 'wagmi';
import ConnectButton from './ConnectButton';

function Navbar() {
  const location = useLocation();
  const { address, isConnected } = useAccount();
  
  // Function to check if a path is active
  const isActive = (path) => {
    return location.pathname === path;
  };

  return (
    <nav 
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        top: 0,
        alignItems: 'center',
        padding: '15px 50px', // Increased horizontal padding
        backgroundColor: '#000000',
        borderBottom: '3px solid #ffb300'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <h2 style={{ 
          color: '#ffb300', 
          fontFamily: "'Chewy', cursive", 
          margin: '0 30px 0 0' 
        }}>
          KOA
        </h2>
      </div>
      
      <div 
        style={{ 
          display: 'flex', 
          justifyContent: 'center', 
          top: 0,
          alignItems: 'center', 
          gap: '20px',
          marginRight: '20px' // Add slight right margin to shift links
        }}
      >
        <Link 
          to="/home" 
          style={{
            color: '#ffb300',
            textDecoration: 'none',
            fontFamily: "'Chewy', cursive",
            padding: '10px 15px',
            borderRadius: '4px',
            backgroundColor: isActive('/home') ? '#ffb300' : 'transparent',
            color: isActive('/home') ? '#000000' : '#ffb300'
          }}
        >
          Home
        </Link>
        <Link 
          to="/dashboard" 
          style={{
            color: '#ffb300',
            textDecoration: 'none',
            fontFamily: "'Chewy', cursive",
            padding: '10px 15px',
            borderRadius: '4px',
            backgroundColor: isActive('/dashboard') ? '#ffb300' : 'transparent',
            color: isActive('/dashboard') ? '#000000' : '#ffb300'
          }}
        >
          Token Dashboard
        </Link>
        <Link 
          to="/deploy-token" 
          style={{
            color: '#ffb300',
            textDecoration: 'none',
            fontFamily: "'Chewy', cursive",
            padding: '10px 15px',
            borderRadius: '4px',
            backgroundColor: isActive('/deploy-token') ? '#ffb300' : 'transparent',
            color: isActive('/deploy-token') ? '#000000' : '#ffb300'
          }}
        >
          Deploy Token
        </Link>
        <Link 
          to="/collect-fees" 
          style={{
            color: '#ffb300',
            textDecoration: 'none',
            fontFamily: "'Chewy', cursive",
            padding: '10px 15px',
            borderRadius: '4px',
            backgroundColor: isActive('/collect-fees') ? '#ffb300' : 'transparent',
            color: isActive('/collect-fees') ? '#000000' : '#ffb300'
          }}
        >
          Collect Fees
        </Link>
        <Link 
          to="/update-token-info" 
          style={{
            color: '#ffb300',
            textDecoration: 'none',
            fontFamily: "'Chewy', cursive",
            padding: '10px 15px',
            borderRadius: '4px',
            backgroundColor: isActive('/update-token-info') ? '#ffb300' : 'transparent',
            color: isActive('/update-token-info') ? '#000000' : '#ffb300'
          }}
        >
          Update Token Info
        </Link>
      </div>
      
      <div>
        <ConnectButton />
      </div>
    </nav>
  );
}

export default Navbar;