import axios from 'axios';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useWebSocket } from '../context/WebSocketContext';

// Utility function for robust data caching
const createDataCache = () => {
  const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

  return {
    set: (key, data) => {
      try {
        const cacheItem = {
          data,
          timestamp: Date.now(),
          expiresAt: Date.now() + CACHE_DURATION
        };
        
        // Use both localStorage and sessionStorage for redundancy
        localStorage.setItem(`token_${key}`, JSON.stringify(cacheItem));
        sessionStorage.setItem(`token_${key}`, JSON.stringify(cacheItem));
      } catch (err) {
        console.warn('Failed to cache token data:', err);
      }
    },
    get: (key) => {
      try {
        // Try sessionStorage first (more immediate)
        let cachedItem = sessionStorage.getItem(`token_${key}`);
        
        // Fallback to localStorage
        if (!cachedItem) {
          cachedItem = localStorage.getItem(`token_${key}`);
        }
        
        if (!cachedItem) return null;
        
        const { data, expiresAt } = JSON.parse(cachedItem);
        
        // Check if cache is still valid
        if (Date.now() < expiresAt) {
          return data;
        }
        
        // Remove expired cache
        sessionStorage.removeItem(`token_${key}`);
        localStorage.removeItem(`token_${key}`);
        return null;
      } catch (err) {
        console.warn('Failed to retrieve cached token data:', err);
        return null;
      }
    },
    clear: (key) => {
      sessionStorage.removeItem(`token_${key}`);
      localStorage.removeItem(`token_${key}`);
    }
  };
};

// Currency formatting utility
const formatCurrency = (value) => {
  if (value === null || value === undefined) return 'N/A';
  
  const num = parseFloat(value);
  if (isNaN(num)) return 'N/A';
  
  // Handle large numbers with abbreviated notation
  const abbreviations = [
    { value: 1e9, symbol: 'B' },
    { value: 1e6, symbol: 'M' },
    { value: 1e3, symbol: 'K' }
  ];

  for (let abbr of abbreviations) {
    if (num >= abbr.value) {
      return `$${(num / abbr.value).toFixed(2)}${abbr.symbol}`;
    }
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
  const location = useLocation();
  const dataCache = useRef(createDataCache());
  
  // Get the WebSocket context
  const { isConnected, emit, addListener, removeListener, reconnect } = useWebSocket();

  // State management
  const [tokenDetails, setTokenDetails] = useState(null);
  const [poolAddress, setPoolAddress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dataSource, setDataSource] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [refreshAttempted, setRefreshAttempted] = useState(false);

  // Refs for managing connection and data retrieval
  const isMounted = useRef(true);
  const reconnectAttempts = useRef(0);
  const loadingTimeout = useRef(null);
  const tokenDetailHandler = useRef(null);
  const tokenUpdateHandler = useRef(null);
  const errorHandler = useRef(null);
  const directLoad = useRef(true); // Track if this is a direct page load

  // Track initial page load vs. navigation 
  useEffect(() => {
    // Check if we have state from navigation
    if (location.state && location.state.fromDashboard) {
      directLoad.current = false;
    } else {
      // This appears to be a direct page load or refresh
      console.log('[TokenDetailPage] Direct page load or refresh detected');
      directLoad.current = true;
    }

    // Cleanup
    return () => {
      directLoad.current = true; // Reset for next mount
    };
  }, [location]);

  // Fetch token data via direct HTTP as fallback
  const fetchTokenDataDirect = useCallback(async (address) => {
    try {
      console.log('[TokenDetailPage] Attempting to fetch token data via HTTP');
      const response = await axios.get(
        `https://website-4g84.onrender.com/api/tokens/${address}`,
        { timeout: 10000 }
      );
      
      return response.data;
    } catch (error) {
      console.error('[TokenDetailPage] Direct HTTP fetch failed:', error);
      throw error;
    }
  }, []);

  // Clear component state on unmount
  useEffect(() => {
    return () => {
      isMounted.current = false;
      clearTimeout(loadingTimeout.current);
      
      // Remove all event listeners
      if (tokenDetailHandler.current) {
        removeListener('token-details', tokenDetailHandler.current);
      }
      if (tokenUpdateHandler.current) {
        removeListener('token-details-update', tokenUpdateHandler.current);
      }
      if (errorHandler.current) {
        removeListener('error', errorHandler.current);
      }
    };
  }, [removeListener]);

  // Handle 404 Navigation
  const handleNotFound = useCallback(() => {
    if (directLoad.current && !refreshAttempted) {
      console.log('[TokenDetailPage] No data found on direct load, navigating to dashboard');
      
      // Show a brief message before redirecting
      setError('Token not found. Redirecting to dashboard...');
      
      // Delay redirection to show the message
      setTimeout(() => {
        if (isMounted.current) {
          navigate('/', { replace: true });
        }
      }, 2000);
    }
  }, [navigate, refreshAttempted]);

  // Main effect for data loading
  useEffect(() => {
    // Reset state
    setTokenDetails(null);
    setPoolAddress(null);
    setLoading(true);
    setError(null);
    setConnectionStatus(isConnected ? 'connecting' : 'offline');
    reconnectAttempts.current = 0;

    // No address, exit early with redirection
    if (!contractAddress) {
      setError('Invalid token address');
      setLoading(false);
      handleNotFound();
      return;
    }

    // Loading timeout
    loadingTimeout.current = setTimeout(() => {
      if (loading && isMounted.current) {
        setConnectionStatus('slow_connection');
      }
    }, 8000);

    const loadData = async () => {
      console.log(`[TokenDetailPage] Starting data load for token: ${contractAddress}`);
      console.log(`[TokenDetailPage] WebSocket connection status: ${isConnected ? 'Connected' : 'Disconnected'}`);

      try {
        let tokenData = null;
        
        // First try cache
        tokenData = dataCache.current.get(contractAddress);
        if (tokenData) {
          console.log('[TokenDetailPage] Using cached token data');
          setDataSource('cache');
          if (isMounted.current) {
            setTokenDetails(tokenData);
            setPoolAddress(tokenData.main_pool_address || contractAddress);
            setLoading(false);
            setConnectionStatus('connected');
          }
          
          // Still try to get fresh data via WebSocket if connected
          if (isConnected) {
            refreshTokenDataViaWebSocket(contractAddress);
          }
          
          return;
        }
        
        // If connected to WebSocket, use it as primary data source
        if (isConnected) {
          console.log('[TokenDetailPage] Attempting to fetch via WebSocket');
          
          try {
            tokenData = await getTokenDataViaWebSocket(contractAddress);
            console.log('[TokenDetailPage] Successfully received data via WebSocket');
            setDataSource('websocket');
          } catch (wsError) {
            console.warn('[TokenDetailPage] WebSocket fetch failed:', wsError);
            // Fall back to HTTP
            tokenData = await fetchTokenDataDirect(contractAddress);
            console.log('[TokenDetailPage] Successfully received data via HTTP fallback');
            setDataSource('http');
          }
        } else {
          // If not connected to WebSocket, use HTTP
          console.log('[TokenDetailPage] WebSocket not connected, using HTTP directly');
          tokenData = await fetchTokenDataDirect(contractAddress);
          setDataSource('http');
        }
        
        if (tokenData && isMounted.current) {
          // Cache successful retrieval
          dataCache.current.set(contractAddress, tokenData);
          
          setTokenDetails(tokenData);
          setPoolAddress(tokenData.main_pool_address || contractAddress);
          setLoading(false);
          setConnectionStatus('connected');
          setRefreshAttempted(true);
        } else {
          if (isMounted.current) {
            setError('No data found for this token');
            setLoading(false);
            handleNotFound();
          }
        }
      } catch (err) {
        console.error('[TokenDetailPage] All data retrieval methods failed:', err);
        
        if (isMounted.current) {
          setError('Unable to load token details');
          setLoading(false);
          setConnectionStatus('failed');
          
          // If this is a direct page load, handle the not found case
          if (directLoad.current) {
            handleNotFound();
          }
        }
      }
    };

    loadData();
    
    // Cleanup function for timeouts
    return () => {
      clearTimeout(loadingTimeout.current);
    };
  }, [contractAddress, isConnected, fetchTokenDataDirect, handleNotFound]);

  // Function to get token data via WebSocket
  const getTokenDataViaWebSocket = (address) => {
    return new Promise((resolve, reject) => {
      if (!isConnected) {
        reject(new Error('WebSocket not connected'));
        return;
      }
      
      console.log(`[TokenDetailPage] Requesting token details for ${address} via WebSocket`);
      
      // Create and store handlers for cleanup
      tokenDetailHandler.current = (data) => {
        console.log('[TokenDetailPage] Received token details via WebSocket:', data ? data.name : 'no data');
        resolve(data);
      };
      
      errorHandler.current = (errorData) => {
        console.error('[TokenDetailPage] Received error from WebSocket:', errorData);
        reject(new Error(errorData.message || 'Failed to fetch token details'));
      };
      
      // Add event listeners
      addListener('token-details', tokenDetailHandler.current);
      addListener('error', errorHandler.current);
      
      // Send request for token details
      emit('get-token-details', { contractAddress: address });
      
      // Set timeout to prevent hanging
      setTimeout(() => {
        removeListener('token-details', tokenDetailHandler.current);
        removeListener('error', errorHandler.current);
        reject(new Error('WebSocket request timed out'));
      }, 10000);
    });
  };

  // Function to refresh token data in background
  const refreshTokenDataViaWebSocket = (address) => {
    if (!isConnected) return;
    
    console.log(`[TokenDetailPage] Setting up live updates for ${address}`);
    
    // Add listener for real-time updates
    tokenUpdateHandler.current = (updatedToken) => {
      if (updatedToken.contractAddress === address && isMounted.current) {
        console.log('[TokenDetailPage] Received token update via WebSocket');
        setTokenDetails(current => ({...current, ...updatedToken}));
        setDataSource('websocket');
        
        // Update cache
        dataCache.current.set(address, {...tokenDetails, ...updatedToken});
      }
    };
    
    // Add event listener
    addListener('token-details-update', tokenUpdateHandler.current);
    
    // Request initial data
    emit('get-token-details', { contractAddress: address });
  };
  
  // Copy to clipboard utility
  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text)
      .then(() => alert('Copied to clipboard'))
      .catch(err => console.error('Copy failed:', err));
  };

  // Retry loading the token
  const handleRetryLoading = () => {
    setLoading(true);
    setError(null);
    setConnectionStatus('connecting');
    setRefreshAttempted(true);
    
    // Force reconnect if needed
    if (!isConnected) {
      reconnect();
    }
    
    // Re-fetch data
    if (contractAddress) {
      // Clear cache to force a fresh fetch
      dataCache.current.clear(contractAddress);
      
      // Re-emit the get-token-details event
      if (isConnected) {
        emit('get-token-details', { contractAddress });
      }
    }
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
          {connectionStatus === 'connecting' 
            ? 'Loading Token Data' 
            : connectionStatus === 'offline'
              ? 'Connecting to Server...'
              : 'Connection Slow, Retrying...'}
        </div>
        
        {contractAddress && (
          <div style={{ fontSize: '14px', marginBottom: '20px', opacity: 0.8 }}>
            Contract: {contractAddress.slice(0, 6)}...{contractAddress.slice(-4)}
          </div>
        )}
        
        <div className="loading-spinner" style={{ width: '40px', height: '40px' }}></div>
        
        {connectionStatus === 'offline' && (
          <div style={{ fontSize: '14px', marginTop: '20px', opacity: 0.8 }}>
            WebSocket Status: {isConnected ? 'Connected' : 'Disconnected'}
          </div>
        )}
        
        {(connectionStatus === 'slow_connection' || connectionStatus === 'offline') && (
          <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
            <button 
              onClick={() => window.location.reload()} 
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
              Reload Page
            </button>
            {!isConnected && (
              <button 
                onClick={() => reconnect()} 
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
                Reconnect
              </button>
            )}
          </div>
        )}
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
          {error || 'No Token Details Found'}
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
            onClick={handleRetryLoading} 
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

  // Main token detail render
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
                {tokenDetails.contractAddress.slice(0, 8)}...{tokenDetails.contractAddress.slice(-6)}
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
          
          {!isConnected && (
            <button
              onClick={() => reconnect()}
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
              Reconnect
            </button>
          )}
        </div>
      </div>
      
      {/* Chart Embed */}
      <div className="token-chart-container" style={{ padding: '20px' }}>
        <iframe 
          src={`https://dexscreener.com/base/${poolAddress}?embed=1&loadChartSettings=0&trades=0&tabs=0&info=0&chartLeftToolbar=0&chartDefaultOnMobile=1&chartTheme=dark&theme=light&chartStyle=0&chartType=usd&interval=15`}
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