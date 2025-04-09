import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAccount } from 'wagmi';
import ConnectButton from './ConnectButton';

function Navbar() {
  const location = useLocation();
  const { address, isConnected } = useAccount();
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  
  // Function to check if a path is active
  const isActive = (path) => {
    return location.pathname === path;
  };

  // Add responsive handler
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <nav 
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        flexDirection: isMobile ? 'column' : 'row',
        top: 0,
        left: 0,
        right: 0,
        position: 'fixed',
        width: '100%',
        alignItems: 'center',
        padding: isMobile ? '10px 15px' : '15px 50px',
        backgroundColor: '#000000',
        borderBottom: '3px solid #ffb300',
        zIndex: 1001
      }}
    >
      <div style={{ 
        display: 'flex', 
        alignItems: 'center',
        justifyContent: isMobile ? 'center' : 'flex-start',
        width: isMobile ? '100%' : 'auto'
      }}>
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
          flexWrap: isMobile ? 'wrap' : 'nowrap',
          alignItems: 'center', 
          gap: isMobile ? '5px' : '20px',
          marginRight: isMobile ? '0' : '20px',
          width: isMobile ? '100%' : 'auto',
          marginTop: isMobile ? '10px' : '0',
          marginBottom: isMobile ? '10px' : '0'
        }}
      >
        <Link 
          to="/home" 
          style={{
            color: '#ffb300',
            textDecoration: 'none',
            fontFamily: "'Chewy', cursive",
            padding: isMobile ? '5px 8px' : '10px 15px',
            borderRadius: '4px',
            fontSize: isMobile ? '0.8rem' : '1rem',
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
            padding: isMobile ? '5px 8px' : '10px 15px',
            borderRadius: '4px',
            fontSize: isMobile ? '0.8rem' : '1rem',
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
            padding: isMobile ? '5px 8px' : '10px 15px',
            borderRadius: '4px',
            fontSize: isMobile ? '0.8rem' : '1rem',
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
            padding: isMobile ? '5px 8px' : '10px 15px',
            borderRadius: '4px',
            fontSize: isMobile ? '0.8rem' : '1rem',
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
            padding: isMobile ? '5px 8px' : '10px 15px',
            borderRadius: '4px',
            fontSize: isMobile ? '0.8rem' : '1rem',
            backgroundColor: isActive('/update-token-info') ? '#ffb300' : 'transparent',
            color: isActive('/update-token-info') ? '#000000' : '#ffb300'
          }}
        >
          Update Token Info
        </Link>
      </div>
      
      <div style={{
        display: 'flex',
        justifyContent: isMobile ? 'center' : 'flex-end',
        width: isMobile ? '100%' : 'auto',
        marginTop: isMobile ? '5px' : '0'
      }}>
        <ConnectButton />
      </div>
    </nav>
  );
}

export default Navbar;