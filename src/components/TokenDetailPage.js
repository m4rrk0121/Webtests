import axios from 'axios';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useWebSocket } from '../context/WebSocketContext';

// Simple cache that doesn't use eval or JSON.parse
const tokenCache = {
  data: {},
  set: function(key, value, expiresInMs = 24 * 60 * 60 * 1000) {
    this.data[key] = {
      value: value,
      expires: Date.now() + expiresInMs
    };
    // No localStorage to avoid JSON.parse
  },
  get: function(key) {
    const item = this.data[key];
    if (!item) return null;
    if (Date.now() > item.expires) {
      delete this.data[key];
      return null;
    }
    return item.value;
  }
};

// Currency formatting utility
const formatCurrency = (value) => {
  if (value === null || value === undefined) return 'N/A';
  
  const num = parseFloat(value);
  if (isNaN(num)) return 'N/A';
  
  // Handle large numbers with abbreviated notation
  if (num >= 1000000000) {
    return `$${(num / 1000000000).toFixed(2)}B`;
  } else if (num >= 1000000) {
    return `$${(num / 1000000).toFixed(2)}M`;
  } else if (num >= 1000) {
    return `$${(num / 1000).toFixed(2)}K`;
  }
  
  // Precise formatting for smaller values
  return num >= 1 
    ? `$${num.toFixed(2)}` 
    : num >= 0.01 
      ? `$${num.toFixed(4)}` 
      : `$${num.toFixed(8)}`;
};

function TokenDetailPage() {
  const { contractAddress } = useParams();
  const navigate = useNavigate();
  
  // Get the WebSocket context
  const { isConnected, emit, addListener, removeListener, reconnect } = useWebSocket();

  // State management with safer defaults
  const [tokenDetails, setTokenDetails] = useState(() => {
    // Try to get from in-memory cache
    return tokenCache.get(contractAddress) || null;
  });
  const [poolAddress, setPoolAddress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dataSource, setDataSource] = useState(null);
  
  // Refs for managing data loading
  const isMounted = useRef(true);
  const hasAttemptedLoad = useRef(false);
  const tokenDetailHandler = useRef(null);
  const tokenUpdateHandler = useRef(null);
  const errorHandler = useRef(null);

  // Fetch token data via HTTP without any eval
  const fetchTokenDataHttp = useCallback(async (address) => {
    try {
      console.log('[TokenDetailPage] Fetching token data via HTTP');
      const response = await axios.get(
        `https://website-4g84.onrender.com/api/tokens/${address}`,
        { timeout: 15000 }
      );
      
      if (response.data) {
        return response.data;
      }
      return null;
    } catch (error) {
      console.error('[TokenDetailPage] HTTP fetch failed:', error);
      return null;
    }
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      isMounted.current = false;
      
      // Clean up any event listeners
      if (tokenDetailHandler.current) {
        removeListener('token-details', tokenDetailHandler.current);
        tokenDetailHandler.current = null;
      }
      if (tokenUpdateHandler.current) {
        removeListener('token-details-update', tokenUpdateHandler.current);
        tokenUpdateHandler.current = null;
      }
      if (errorHandler.current) {
        removeListener('error', errorHandler.current);
        errorHandler.current = null;
      }
    };
  }, [removeListener]);

  // Function to get token data via WebSocket
  const getTokenDataViaWebSocket = useCallback((address) => {
    return new Promise((resolve, reject) => {
      if (!isConnected) {
        reject(new Error('WebSocket not connected'));
        return;
      }
      
      console.log(`[TokenDetailPage] Requesting token details for ${address} via WebSocket`);
      
      // Using regular functions instead of arrow functions
      function detailHandler(data) {
        console.log('[TokenDetailPage] Received token details via WebSocket');
        resolve(data);
      }
      
      function wsErrorHandler(errorData) {
        console.error('[TokenDetailPage] WebSocket error:', errorData?.message || 'Unknown error');
        reject(new Error('WebSocket error'));
      }
      
      // Store refs for cleanup
      tokenDetailHandler.current = detailHandler;
      errorHandler.current = wsErrorHandler;
      
      // Add event listeners
      addListener('token-details', detailHandler);
      addListener('error', wsErrorHandler);
      
      // Send request for token details
      emit('get-token-details', { contractAddress: address });
      
      // Set timeout to prevent hanging
      setTimeout(function() {
        if (tokenDetailHandler.current === detailHandler) {
          removeListener('token-details', detailHandler);
          tokenDetailHandler.current = null;
        }
        if (errorHandler.current === wsErrorHandler) {
          removeListener('error', wsErrorHandler);
          errorHandler.current = null;
        }
        reject(new Error('WebSocket request timed out'));
      }, 10000);
    });
  }, [isConnected, emit, addListener, removeListener, contractAddress]);

  // Setup live updates
  const setupLiveUpdates = useCallback((address) => {
    if (!isConnected || !address) return;
    
    console.log(`[TokenDetailPage] Setting up live updates for ${address}`);
    
    // Remove any existing update handler
    if (tokenUpdateHandler.current) {
      removeListener('token-details-update', tokenUpdateHandler.current);
    }
    
    // Create update handler using regular function
    function updateHandler(updatedToken) {
      if (updatedToken && updatedToken.contractAddress === address && isMounted.current) {
        console.log('[TokenDetailPage] Received token update via WebSocket');
        setTokenDetails(function(current) {
          // Handle case where current is null
          const baseToken = current || {};
          const updated = {...baseToken, ...updatedToken};
          
          // Update memory cache
          tokenCache.set(address, updated);
          
          return updated;
        });
        setDataSource('websocket');
      }
    }
    
    // Store ref and add listener
    tokenUpdateHandler.current = updateHandler;
    addListener('token-details-update', updateHandler);
    
    // Request initial data
    emit('get-token-details', { contractAddress: address });
  }, [isConnected, emit, addListener, removeListener]);

  // Main effect for loading token data
  useEffect(() => {
    // Skip if no address
    if (!contractAddress) {
      setError('Invalid token address');
      setLoading(false);
      return;
    }
    
    // Set loading state
    setLoading(true);
    
    // Mark that we've attempted to load
    hasAttemptedLoad.current = true;
    
    // Define load function
    async function loadData() {
      try {
        // Try memory cache first (fast)
        const cachedToken = tokenCache.get(contractAddress);
        if (cachedToken) {
          console.log('[TokenDetailPage] Using cached token data');
          setTokenDetails(cachedToken);
          setPoolAddress(cachedToken.main_pool_address || contractAddress);
          setDataSource('cache');
          setLoading(false);
        }
        
        // Try WebSocket if connected
        if (isConnected) {
          try {
            const wsData = await getTokenDataViaWebSocket(contractAddress);
            if (wsData && isMounted.current) {
              console.log('[TokenDetailPage] WebSocket data received');
              setTokenDetails(wsData);
              setPoolAddress(wsData.main_pool_address || contractAddress);
              setDataSource('websocket');
              setLoading(false);
              
              // Cache the data
              tokenCache.set(contractAddress, wsData);
              
              // Set up live updates
              setupLiveUpdates(contractAddress);
              return; // Success, exit early
            }
          } catch (wsError) {
            console.warn('[TokenDetailPage] WebSocket data fetch failed:', wsError?.message || 'Unknown error');
            // Continue to HTTP fetch
          }
        }
        
        // Fallback to HTTP if needed
        if (!tokenDetails || dataSource !== 'websocket') {
          console.log('[TokenDetailPage] Trying HTTP fetch');
          const httpData = await fetchTokenDataHttp(contractAddress);
          
          if (httpData && isMounted.current) {
            setTokenDetails(httpData);
            setPoolAddress(httpData.main_pool_address || contractAddress);
            setDataSource('http');
            setLoading(false);
            
            // Cache the data
            tokenCache.set(contractAddress, httpData);
            
            // Try to set up live updates if connected
            if (isConnected) {
              setupLiveUpdates(contractAddress);
            }
            return; // Success
          }
        }
        
        // If we reach here with no data and we're not showing an error, 
        // we might have failed silently
        if (!tokenDetails && !error && isMounted.current) {
          console.warn('[TokenDetailPage] All data fetching methods failed');
          setError('Unable to load token data');
          setLoading(false);
        }
      } catch (err) {
        console.error('[TokenDetailPage] Error in data loading:', err?.message || 'Unknown error');
        
        if (isMounted.current && !tokenDetails) {
          setError('Error loading token data');
          setLoading(false);
        }
      }
    }
    
    // Run the load function
    loadData();
    
    // Clean up function
    return function() {
      // Any specific cleanup needed
    };
  }, [
    contractAddress, 
    isConnected, 
    tokenDetails, 
    dataSource, 
    error,
    getTokenDataViaWebSocket, 
    fetchTokenDataHttp, 
    setupLiveUpdates
  ]);

  // Force WebSocket reconnect if needed
  useEffect(() => {
    // If we're showing an error or no data on refresh, try reconnecting
    const needsReconnect = (error || !tokenDetails) && !isConnected;
    
    if (needsReconnect && hasAttemptedLoad.current) {
      console.log('[TokenDetailPage] Trying to reconnect WebSocket');
      reconnect();
    }
  }, [error, tokenDetails, isConnected, reconnect]);
  
  // Copy to clipboard utility
  const copyToClipboard = (text) => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
        .then(() => {
          window.alert('Copied to clipboard');
        })
        .catch(() => {
          window.alert('Failed to copy');
        });
    } else {
      window.alert('Copy not supported in this browser');
    }
  };

  // Handle reload
  const handleRetry = () => {
    window.location.reload();
  };

  // Render loading state
  if (loading) {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: '#000000',
        color: '#ffb300',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 999,
        fontFamily: "'Chewy', cursive"
      }}>
        <div style={{ fontSize: '20px', marginBottom: '15px' }}>
          Loading Token Data
        </div>
        
        {contractAddress && (
          <div style={{ fontSize: '14px', marginBottom: '20px', opacity: 0.8 }}>
            Contract: {contractAddress.slice(0, 6)}...{contractAddress.slice(-4)}
          </div>
        )}
        
        <div className="loading-spinner" style={{ width: '40px', height: '40px' }}></div>
        
        <div style={{ fontSize: '14px', marginTop: '10px', opacity: 0.8 }}>
          {isConnected ? 'WebSocket Connected' : 'Using HTTP Fallback'}
        </div>
      </div>
    );
  }

  // Render error state
  if (error || !tokenDetails) {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: '#000000',
        color: '#ffb300',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 999,
        fontFamily: "'Chewy', cursive"
      }}>
        <div style={{ fontSize: '20px', marginBottom: '15px', color: '#ff4466' }}>
          {error || 'No Token Details Available'}
        </div>
        
        <div style={{ display: 'flex', gap: '10px' }}>
          <button 
            onClick={() => navigate('/')} 
            style={{ 
              padding: '10px 20px', 
              background: '#ffb300', 
              color: '#000000', 
              border: 'none', 
              borderRadius: '6px', 
              cursor: 'pointer',
              fontSize: '16px'
            }}
          >
            ← Go to Dashboard
          </button>
          <button 
            onClick={handleRetry} 
            style={{ 
              padding: '10px 20px', 
              background: '#333', 
              color: '#ffb300', 
              border: '1px solid #ffb300', 
              borderRadius: '6px', 
              cursor: 'pointer',
              fontSize: '16px'
            }}
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // Render token details
  return (
    <div className="token-detail-page" style={{ backgroundColor: '#000000', minHeight: '100vh', color: '#ffffff' }}>
      <div className="token-detail-header" style={{ padding: '20px' }}>
        <button 
          onClick={() => navigate('/')} 
          style={{ 
            background: 'none', 
            border: 'none', 
            color: '#ffb300', 
            fontSize: '16px', 
            cursor: 'pointer' 
          }}
        >
          ← Back to Dashboard
        </button>
        
        <h1 style={{ color: '#ffb300', fontFamily: "'Chewy', cursive" }}>
          {tokenDetails.name} ({tokenDetails.symbol})
        </h1>
        
        <div className="token-details-summary">
          <p>Price: {formatCurrency(tokenDetails.price_usd)}</p>
          <p>Market Cap: {formatCurrency(tokenDetails.fdv_usd)}</p>
          <p>24h Volume: {formatCurrency(tokenDetails.volume_usd)}</p>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <p>Contract: 
              <span style={{ marginLeft: '5px' }}>
                {tokenDetails.contractAddress && 
                 `${tokenDetails.contractAddress.slice(0, 8)}...${tokenDetails.contractAddress.slice(-6)}`}
              </span>
            </p>
            <button
              onClick={() => copyToClipboard(tokenDetails.contractAddress)}
              style={{
                background: '#333',
                color: '#ffb300',
                border: 'none',
                borderRadius: '4px',
                padding: '4px 8px',
                cursor: 'pointer',
                fontSize: '12px'
              }}
            >
              Copy
            </button>
          </div>
        </div>
        
        {/* Connection status indicator */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginTop: '10px'
        }}>
          <div style={{
            display: 'inline-block',
            background: '#222',
            color: dataSource === 'websocket' ? '#00ff88' : dataSource === 'cache' ? '#ffb300' : '#ff9900',
            padding: '4px 8px',
            borderRadius: '4px',
            fontSize: '12px'
          }}>
            <span style={{ 
              display: 'inline-block',
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: dataSource === 'websocket' ? '#00ff88' : dataSource === 'cache' ? '#ffb300' : '#ff9900',
              marginRight: '6px'
            }}></span>
            {dataSource === 'websocket' ? 'Live Data' : dataSource === 'cache' ? 'Cached Data' : 'Static Data'}
          </div>
          
          <div style={{
            display: 'inline-block',
            background: '#222',
            color: isConnected ? '#00ff88' : '#ff4466',
            padding: '4px 8px',
            borderRadius: '4px',
            fontSize: '12px'
          }}>
            <span style={{ 
              display: 'inline-block',
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: isConnected ? '#00ff88' : '#ff4466',
              marginRight: '6px'
            }}></span>
            {isConnected ? 'WebSocket Connected' : 'WebSocket Disconnected'}
          </div>
        </div>
      </div>
      
      {/* Chart Embed */}
      <div className="token-chart-container" style={{ padding: '20px' }}>
        <iframe 
          src={`https://dexscreener.com/base/${poolAddress || contractAddress}?embed=1&loadChartSettings=0&trades=0&tabs=0&info=0&chartLeftToolbar=0&chartDefaultOnMobile=1&chartTheme=dark&theme=light&chartStyle=0&chartType=usd&interval=15`}
          style={{
            width: '100%',
            height: '500px',
            border: 'none',
            backgroundColor: '#000000'
          }}
          title={`${tokenDetails.name} price chart`}
        />
      </div>
    </div>
  );
}

export default TokenDetailPage;