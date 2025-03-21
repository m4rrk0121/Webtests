import axios from 'axios';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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
        
        // Use localStorage for persistent caching
        localStorage.setItem(`token_${key}`, JSON.stringify(cacheItem));
      } catch (err) {
        console.warn('Failed to cache token data:', err);
      }
    },
    get: (key) => {
      try {
        // Get cached item from localStorage
        const cachedItem = localStorage.getItem(`token_${key}`);
        
        if (!cachedItem) return null;
        
        const { data, expiresAt } = JSON.parse(cachedItem);
        
        // Check if cache is still valid
        if (Date.now() < expiresAt) {
          return data;
        }
        
        // Remove expired cache
        localStorage.removeItem(`token_${key}`);
        return null;
      } catch (err) {
        console.warn('Failed to retrieve cached token data:', err);
        return null;
      }
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
  const dataCache = useRef(createDataCache());
  
  // Get the WebSocket context
  const { isConnected, emit, addListener, removeListener, reconnect } = useWebSocket();

  // State management
  const [tokenDetails, setTokenDetails] = useState(null);
  const [poolAddress, setPoolAddress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dataSource, setDataSource] = useState(null);
  const [fetchAttempted, setFetchAttempted] = useState(false);
  
  // Refs for managing data loading
  const isMounted = useRef(true);
  const tokenDetailHandler = useRef(null);
  const tokenUpdateHandler = useRef(null);
  const errorHandler = useRef(null);
  const refreshPage = useRef(window.performance?.navigation?.type === 1 || 
                            document.referrer === "" || 
                            !document.referrer.includes(window.location.host));

  // Fetch token data via HTTP as fallback
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
      throw new Error('Empty response');
    } catch (error) {
      console.error('[TokenDetailPage] HTTP fetch failed:', error);
      throw error;
    }
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      isMounted.current = false;
      
      // Clean up any event listeners
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

  // Function to get token data via WebSocket
  const getTokenDataViaWebSocket = useCallback((address) => {
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
        if (tokenDetailHandler.current) {
          removeListener('token-details', tokenDetailHandler.current);
        }
        if (errorHandler.current) {
          removeListener('error', errorHandler.current);
        }
        reject(new Error('WebSocket request timed out'));
      }, 10000);
    });
  }, [isConnected, emit, addListener, removeListener, contractAddress]);

  // Function to refresh token data in background via WebSocket
  const setupLiveUpdates = useCallback((address) => {
    if (!isConnected) return;
    
    console.log(`[TokenDetailPage] Setting up live updates for ${address}`);
    
    // Add listener for real-time updates
    tokenUpdateHandler.current = (updatedToken) => {
      if (updatedToken.contractAddress === address && isMounted.current) {
        console.log('[TokenDetailPage] Received token update via WebSocket');
        setTokenDetails(current => {
          const updated = {...current, ...updatedToken};
          // Update cache
          dataCache.current.set(address, updated);
          return updated;
        });
        setDataSource('websocket');
      }
    };
    
    // Add event listener
    addListener('token-details-update', tokenUpdateHandler.current);
    
    // Request initial data
    emit('get-token-details', { contractAddress: address });
  }, [isConnected, emit, addListener]);

  // Effect for fetching token details
  useEffect(() => {
    let isActive = true;
    
    // Check for valid contract address
    if (!contractAddress) {
      setError('Invalid token address');
      setLoading(false);
      return;
    }
    
    // Reset state for new address
    setLoading(true);
    setError(null);
    setFetchAttempted(false);
    
    const loadTokenData = async () => {
      console.log(`[TokenDetailPage] Starting data load for ${contractAddress}. Refresh: ${refreshPage.current ? 'Yes' : 'No'}`);
      
      try {
        // STEP 1: Try to get data from cache first (fast)
        let tokenData = dataCache.current.get(contractAddress);
        
        if (tokenData) {
          console.log('[TokenDetailPage] Using cached token data');
          if (isActive) {
            setTokenDetails(tokenData);
            setPoolAddress(tokenData.main_pool_address || contractAddress);
            setDataSource('cache');
            setLoading(false);
            setFetchAttempted(true);
          }
        }
        
        // STEP 2: Try to get fresh data from WebSocket (if connected)
        if (isConnected) {
          try {
            console.log('[TokenDetailPage] Fetching fresh data via WebSocket');
            const wsData = await getTokenDataViaWebSocket(contractAddress);
            
            if (wsData && isActive) {
              setTokenDetails(wsData);
              setPoolAddress(wsData.main_pool_address || contractAddress);
              setDataSource('websocket');
              setLoading(false);
              setFetchAttempted(true);
              
              // Update cache
              dataCache.current.set(contractAddress, wsData);
              
              // Set up live updates
              setupLiveUpdates(contractAddress);
              return;
            }
          } catch (wsError) {
            console.warn('[TokenDetailPage] WebSocket fetch failed:', wsError);
            // Continue to HTTP fallback
          }
        }
        
        // STEP 3: Fallback to HTTP if needed
        // Only use HTTP if we still don't have data or we need fresh data
        if (!tokenData || refreshPage.current) {
          try {
            console.log('[TokenDetailPage] Falling back to HTTP fetch');
            const httpData = await fetchTokenDataHttp(contractAddress);
            
            if (httpData && isActive) {
              setTokenDetails(httpData);
              setPoolAddress(httpData.main_pool_address || contractAddress);
              setDataSource('http');
              setLoading(false);
              setFetchAttempted(true);
              
              // Update cache
              dataCache.current.set(contractAddress, httpData);
              
              // Try to set up live updates anyway
              if (isConnected) {
                setupLiveUpdates(contractAddress);
              }
            }
          } catch (httpError) {
            console.error('[TokenDetailPage] HTTP fetch failed:', httpError);
            
            // Only show error if we don't already have data from cache
            if (!tokenData && isActive) {
              setError('Failed to load token data');
              setLoading(false);
              setFetchAttempted(true);
            }
          }
        }
      } catch (err) {
        console.error('[TokenDetailPage] Error loading token data:', err);
        
        if (isActive) {
          // Only show error if we don't have any data
          if (!tokenDetails) {
            setError('Unable to load token details');
          }
          setLoading(false);
          setFetchAttempted(true);
        }
      }
    };
    
    loadTokenData();
    
    return () => {
      isActive = false;
    };
  }, [contractAddress, isConnected, getTokenDataViaWebSocket, fetchTokenDataHttp, setupLiveUpdates]);

  // Effect to reconnect WebSocket if needed
  useEffect(() => {
    if (refreshPage.current && !isConnected) {
      console.log('[TokenDetailPage] Page was refreshed and WebSocket is disconnected, attempting reconnect');
      reconnect();
    }
  }, [isConnected, reconnect]);
  
  // Copy to clipboard utility
  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text)
      .then(() => alert('Copied to clipboard'))
      .catch(err => console.error('Copy failed:', err));
  };

  // Handle reload/retry
  const handleRetry = () => {
    setLoading(true);
    setError(null);
    
    // If WebSocket is disconnected, try to reconnect
    if (!isConnected) {
      reconnect();
    }
    
    // Clear cache for this token to force fresh fetch
    if (contractAddress) {
      // Try to get fresh data
      if (isConnected) {
        getTokenDataViaWebSocket(contractAddress)
          .then(data => {
            setTokenDetails(data);
            setPoolAddress(data.main_pool_address || contractAddress);
            setDataSource('websocket');
            setLoading(false);
            
            // Update cache
            dataCache.current.set(contractAddress, data);
            
            // Set up live updates
            setupLiveUpdates(contractAddress);
          })
          .catch(async (wsError) => {
            console.warn('[TokenDetailPage] Retry WebSocket fetch failed:', wsError);
            
            // Fallback to HTTP
            try {
              const httpData = await fetchTokenDataHttp(contractAddress);
              setTokenDetails(httpData);
              setPoolAddress(httpData.main_pool_address || contractAddress);
              setDataSource('http');
              setLoading(false);
              
              // Update cache
              dataCache.current.set(contractAddress, httpData);
            } catch (httpError) {
              console.error('[TokenDetailPage] Retry HTTP fetch failed:', httpError);
              setError('Failed to load token data');
              setLoading(false);
            }
          });
      } else {
        // Try HTTP directly
        fetchTokenDataHttp(contractAddress)
          .then(data => {
            setTokenDetails(data);
            setPoolAddress(data.main_pool_address || contractAddress);
            setDataSource('http');
            setLoading(false);
            
            // Update cache
            dataCache.current.set(contractAddress, data);
          })
          .catch(err => {
            console.error('[TokenDetailPage] Retry HTTP fetch failed:', err);
            setError('Failed to load token data');
            setLoading(false);
          });
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
          Loading Token Data
        </div>
        
        {contractAddress && (
          <div style={{ fontSize: '14px', marginBottom: '20px', opacity: 0.8 }}>
            Contract: {contractAddress.slice(0, 6)}...{contractAddress.slice(-4)}
          </div>
        )}
        
        <div className="loading-spinner" style={{ width: '40px', height: '40px' }}></div>
        
        <div style={{ 
          fontSize: '12px', 
          marginTop: '20px', 
          opacity: 0.8,
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <span style={{ 
            display: 'inline-block',
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: isConnected ? '#00ff88' : '#ff4466',
          }}></span>
          WebSocket: {isConnected ? 'Connected' : 'Disconnected'}
        </div>
      </div>
    );
  }

  // Render error state
  if (error || (!tokenDetails && fetchAttempted)) {
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

  // Main token detail render - show content only once we have token details
  if (tokenDetails) {
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

  // Safety fallback - should never reach here if logic above is correct
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
        Something went wrong
      </div>
      
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
    </div>
  );
}

export default TokenDetailPage;