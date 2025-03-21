import axios from 'axios';
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import io from 'socket.io-client';

const formatCurrency = (value) => {
  if (value === null || value === undefined) return 'N/A';
  
  const num = parseFloat(value);
  if (isNaN(num)) return 'N/A';
  
  // Handle large numbers
  if (num >= 1000000000) {
    return `$${(num / 1000000000).toFixed(2)}B`;
  } else if (num >= 1000000) {
    return `$${(num / 1000000).toFixed(2)}M`;
  } else if (num >= 1000) {
    return `$${(num / 1000).toFixed(2)}K`;
  }
  
  // Format based on value size
  if (num >= 1) {
    return `$${num.toFixed(2)}`;
  } else if (num >= 0.01) {
    return `$${num.toFixed(4)}`;
  } else {
    return `$${num.toFixed(8)}`;
  }
};

function TokenDetailPage() {
  const { contractAddress } = useParams();
  const navigate = useNavigate();
  const [tokenDetails, setTokenDetails] = useState(null);
  const [poolAddress, setPoolAddress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Socket.io connection reference
  const socketRef = useRef(null);
  const socketConnected = useRef(false);
  
  // Add this effect to apply the black background to the page
  useEffect(() => {
    // Save the original background
    const originalBodyBackground = document.body.style.background;
    const originalBodyBackgroundColor = document.body.style.backgroundColor;
    
    // Apply black background to body
    document.body.style.background = 'none';
    document.body.style.backgroundColor = '#000000';
    
    // Cleanup when component unmounts
    return () => {
      // Restore original background
      document.body.style.background = originalBodyBackground;
      document.body.style.backgroundColor = originalBodyBackgroundColor;
    };
  }, []);

  // Modified to use WebSockets with fallback to HTTP
  useEffect(() => {
    // Try WebSocket connection first
    const SOCKET_URL = process.env.NODE_ENV === 'production'
      ? 'https://websocket-okv9.onrender.com'
      : 'http://localhost:4003';
    
    console.log(`Connecting to WebSocket at ${SOCKET_URL}`);
    
    socketRef.current = io(SOCKET_URL, {
      withCredentials: false,
      transports: ['polling', 'websocket']
    });
    
    socketRef.current.on('connect', () => {
      console.log('WebSocket connected');
      socketConnected.current = true;
      
      // Request token details
      console.log(`Requesting token details for ${contractAddress}`);
      socketRef.current.emit('get-token-details', { contractAddress });
    });
    
    // Listen for token details response
    socketRef.current.on('token-details', (data) => {
      console.log('Received token details:', data);
      setTokenDetails(data);
      
      if (data.main_pool_address) {
        setPoolAddress(data.main_pool_address);
      } else {
        setPoolAddress(contractAddress);
      }
      
      setLoading(false);
    });
    
    // Listen for errors
    socketRef.current.on('error', (err) => {
      console.error('Socket error:', err);
      setError(err.message || 'An error occurred');
      setLoading(false);
    });
    
    socketRef.current.on('connect_error', (err) => {
      console.error('Socket connection error:', err);
      // Fall back to HTTP if WebSocket fails
      fallbackToHttp();
    });
    
    // Add a timeout to fall back to HTTP if WebSocket is taking too long
    const timeoutId = setTimeout(() => {
      if (loading && !tokenDetails) {
        console.log('WebSocket request timeout - falling back to HTTP');
        fallbackToHttp();
      }
    }, 5000); // 5 second timeout
    
    // Clean up on unmount
    return () => {
      clearTimeout(timeoutId);
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [contractAddress]);
  
  // HTTP fallback function
  const fallbackToHttp = async () => {
    // Only proceed if we're still loading and don't have data yet
    if (!loading || tokenDetails) return;
    
    console.log('Falling back to HTTP request');
    try {
      const response = await axios.get(`https://website-4g84.onrender.com/api/tokens/${contractAddress}`);
      setTokenDetails(response.data);
      
      if (response.data.main_pool_address) {
        setPoolAddress(response.data.main_pool_address);
      } else {
        setPoolAddress(contractAddress);
      }
      
      setLoading(false);
    } catch (err) {
      setError('Failed to fetch token details');
      setLoading(false);
    }
  };

  // Wrap the loading, error, and empty states to include the background div
  if (loading) return (
    <>
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: '#000000',
        zIndex: -1
      }}></div>
      <div>Loading...</div>
    </>
  );
  
  if (error) return (
    <>
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: '#000000',
        zIndex: -1
      }}></div>
      <div>{error}</div>
    </>
  );
  
  if (!tokenDetails) return (
    <>
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: '#000000',
        zIndex: -1
      }}></div>
      <div>No token details found</div>
    </>
  );

  // Use the poolAddress (from MongoDB) for the DexScreener embed URL
  const dexScreenerEmbedUrl = `https://dexscreener.com/base/${poolAddress}?embed=1&loadChartSettings=0&trades=0&tabs=0&info=0&chartLeftToolbar=0&chartDefaultOnMobile=1&chartTheme=dark&theme=light&chartStyle=0&chartType=usd&interval=15`;
  
  // Log the URL for debugging
  console.log("DexScreener URL:", dexScreenerEmbedUrl);

  // Add the background div to the main return statement
  return (
    <>
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: '#000000',
        zIndex: -1
      }}></div>
      
      <div className="token-detail-page">
        <div className="token-detail-header">
          <button 
            onClick={() => window.history.back()} 
            className="back-button"
          >
            ← Back
          </button>
          <h1>{tokenDetails.name} ({tokenDetails.symbol})</h1>
          <div className="token-details-summary">
            <p>Price: {formatCurrency(tokenDetails.price_usd)}</p>
            <p>Market Cap: {formatCurrency(tokenDetails.fdv_usd)}</p>
            <p>24h Volume: {formatCurrency(tokenDetails.volume_usd)}</p>
            <p>Contract: {tokenDetails.contractAddress}</p>
          </div>
        </div>
        <div className="token-chart-container">
          <style>
            {`
              #dexscreener-embed {
                position: relative;
                width: 100%;
                padding-bottom: 125%;
              }
              @media(min-width:1400px) {
                #dexscreener-embed {
                  padding-bottom: 70%;
                }
              }
              #dexscreener-embed iframe {
                position: absolute;
                width: 100%;
                height: 100%;
                top: 0;
                left: 0;
                border: 0;
              }
            `}
          </style>
          <div id="dexscreener-embed">
            <iframe 
              src={dexScreenerEmbedUrl}
            ></iframe>
          </div>
        </div>
      </div>
    </>
  );
}

export default TokenDetailPage;