import axios from 'axios';
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useWebSocket } from '../context/WebSocketContext';

// Force black background immediately
document.documentElement.style.backgroundColor = '#000000';
document.body.style.backgroundColor = '#000000';
document.body.style.background = 'none';

// Pre-loaded CSS for loading states
const preloadStyles = `
  .loading-spinner {
    border: 4px solid rgba(255, 255, 255, 0.3);
    border-radius: 50%;
    border-top: 4px solid #ffb300;
    width: 40px;
    height: 40px;
    animation: spin 1s linear infinite;
  }
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;

// Add styles to head to ensure they're available immediately
const styleElement = document.createElement('style');
styleElement.innerHTML = preloadStyles;
document.head.appendChild(styleElement);

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
  const [isLoadingChart, setIsLoadingChart] = useState(true);
  const [dataSource, setDataSource] = useState(null);
  const [loadingTimeExceeded, setLoadingTimeExceeded] = useState(false);
  
  // Use the shared WebSocket context
  const { isConnected, emit, addListener, removeListener } = useWebSocket();
  
  // Track if component is mounted
  const isMounted = useRef(true);
  const dataRequested = useRef(false);
  const httpFallbackTimer = useRef(null);
  const fallbackAttempted = useRef(false);
  const directHttpAttempted = useRef(false);
  
  // Add a timeout checker for very slow loading
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (loading) {
        setLoadingTimeExceeded(true);
      }
    }, 8000); // 8 seconds
    
    return () => clearTimeout(timeoutId);
  }, [loading]);
  
  // LocalStorage cache functions
  const cacheTokenData = (address, data) => {
    if (!address || !data) return;
    
    try {
      const cacheItem = {
        data,
        timestamp: Date.now()
      };
      
      localStorage.setItem(`token_${address}`, JSON.stringify(cacheItem));
    } catch (err) {
      console.warn('Failed to cache token data:', err);
    }
  };
  
  const getCachedTokenData = (address, maxAge = 60 * 60 * 1000) => {
    if (!address) return null;
    
    try {
      const cachedItem = localStorage.getItem(`token_${address}`);
      if (!cachedItem) return null;
      
      const { data, timestamp } = JSON.parse(cachedItem);
      const age = Date.now() - timestamp;
      
      if (age <= maxAge) {
        console.log(`Using cached token data (${Math.round(age/1000)}s old)`);
        return data;
      }
      return null;
    } catch (err) {
      console.warn('Failed to retrieve cached token data:', err);
      return null;
    }
  };
  
  // Direct HTTP fetch without problematic headers
  const fetchTokenDataDirect = async (address) => {
    try {
      console.log('Attempting direct HTTP fetch without headers');
      const response = await axios.get(
        `https://website-4g84.onrender.com/api/tokens/${address}`,
        { timeout: 10000 } // No headers that cause CORS issues
      );
      
      if (response && response.data) {
        return response.data;
      }
      throw new Error('No data received from direct HTTP fetch');
    } catch (error) {
      console.error('Direct HTTP fetch failed:', error);
      throw error;
    }
  };
  
  // Enhanced fallback function
  const enhancedFallback = async () => {
    if (!isMounted.current || !loading || tokenDetails || !contractAddress) return;
    
    console.log('Starting enhanced fallback process');
    
    // Step 1: Try to load from cache (immediate)
    const cachedData = getCachedTokenData(contractAddress);
    if (cachedData && isMounted.current) {
      console.log('Using cached token data');
      setTokenDetails(cachedData);
      setDataSource('cache');
      
      if (cachedData.main_pool_address) {
        setPoolAddress(cachedData.main_pool_address);
      } else {
        setPoolAddress(contractAddress);
      }
      
      setLoading(false);
      return;
    }
    
    // Step 2: If no valid cache, try direct HTTP without headers
    if (!directHttpAttempted.current) {
      directHttpAttempted.current = true;
      try {
        console.log('No cache found - trying direct HTTP without headers');
        const data = await fetchTokenDataDirect(contractAddress);
        
        if (!isMounted.current) return;
        
        console.log('Direct HTTP successful!');
        setTokenDetails(data);
        setDataSource('http');
        
        if (data.main_pool_address) {
          setPoolAddress(data.main_pool_address);
        } else {
          setPoolAddress(contractAddress);
        }
        
        setLoading(false);
        
        // Cache the data for future use
        cacheTokenData(contractAddress, data);
        return;
      } catch (err) {
        console.error('Direct HTTP failed:', err);
        // Continue to error state
      }
    }
    
    // If everything fails, show error with retry option
    setError('Unable to load token data. Please try again.');
    setLoading(false);
  };
  
  // Store current token in localStorage
  useEffect(() => {
    if (tokenDetails && tokenDetails.contractAddress) {
      localStorage.setItem('currentTokenAddress', tokenDetails.contractAddress);
      // Also cache the full token data
      cacheTokenData(tokenDetails.contractAddress, tokenDetails);
    }
  }, [tokenDetails]);
  
  // Recover from localStorage if needed
  useEffect(() => {
    if (!contractAddress && localStorage.getItem('currentTokenAddress')) {
      navigate(`/token/${localStorage.getItem('currentTokenAddress')}`);
    }
  }, [contractAddress, navigate]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMounted.current = false;
      clearTimeout(httpFallbackTimer.current);
    };
  }, []);

  // Immediate direct HTTP on page load/refresh if no cache
  useEffect(() => {
    // Skip if we already have data, aren't loading, or don't have an address
    if (!loading || tokenDetails || !contractAddress || directHttpAttempted.current) {
      return;
    }

    const isPageRefresh = performance.navigation && 
                       (performance.navigation.type === 1 || 
                        window.performance.getEntriesByType('navigation')[0]?.type === 'reload');
    
    // If this is a direct load or refresh, try immediate HTTP load without headers
    if (isPageRefresh || document.referrer === '') {
      console.log('Initial page load detected - trying direct HTTP without headers');
      directHttpAttempted.current = true;
      
      // First check if we have cached data
      const cachedData = getCachedTokenData(contractAddress);
      if (cachedData) {
        console.log('Found cached data on initial load');
        setTokenDetails(cachedData);
        setDataSource('cache');
        setLoading(false);
        
        if (cachedData.main_pool_address) {
          setPoolAddress(cachedData.main_pool_address);
        } else {
          setPoolAddress(contractAddress);
        }
        
        // Still try WebSocket connection in the background
        return;
      }
      
      // No cached data, try direct HTTP
      fetchTokenDataDirect(contractAddress)
        .then(data => {
          if (!isMounted.current) return;
          
          console.log('Initial HTTP load successful');
          setTokenDetails(data);
          setDataSource('http');
          
          if (data.main_pool_address) {
            setPoolAddress(data.main_pool_address);
          } else {
            setPoolAddress(contractAddress);
          }
          
          setLoading(false);
          
          // Cache the data for future use
          cacheTokenData(contractAddress, data);
        })
        .catch(err => {
          console.error('Initial HTTP load failed:', err);
          // Will continue with normal WebSocket flow
        });
    }
  }, [contractAddress]);
  
  // Main effect for loading token data
  useEffect(() => {
    console.log(`Loading token details for contract: ${contractAddress}`);
    
    // Reset states when contract address changes
    setTokenDetails(null);
    setPoolAddress(null);
    setLoading(true);
    setError(null);
    dataRequested.current = false;
    fallbackAttempted.current = false;
    
    // If no contract address, exit early
    if (!contractAddress) {
      setError('Invalid token address');
      setLoading(false);
      return;
    }
    
    // Handler functions
    const handleTokenDetails = (data) => {
      if (!isMounted.current) return;
      
      console.log('Received token details via WebSocket:', data);
      setTokenDetails(data);
      setDataSource('websocket');
      
      if (data.main_pool_address) {
        setPoolAddress(data.main_pool_address);
      } else {
        setPoolAddress(contractAddress);
      }
      
      setLoading(false);
      
      // Cache the data we received via WebSocket
      cacheTokenData(contractAddress, data);
    };
    
    const handleTokenUpdate = (data) => {
      if (!isMounted.current) return;
      
      if (data.contractAddress === contractAddress) {
        console.log('Received real-time token update:', data);
        setTokenDetails(prevDetails => ({
          ...prevDetails,
          ...data
        }));
        
        // Update cache with latest data
        if (tokenDetails) {
          cacheTokenData(contractAddress, {...tokenDetails, ...data});
        }
      }
    };
    
    const handleError = (err) => {
      if (!isMounted.current) return;
      
      console.error('Socket error:', err);
      
      // Trigger enhanced fallback on socket error
      if (!fallbackAttempted.current) {
        enhancedFallback();
        fallbackAttempted.current = true;
      }
    };
    
    // Add listeners
    addListener('token-details', handleTokenDetails);
    addListener('token-details-update', handleTokenUpdate);
    addListener('error', handleError);
    
    // Request token details if connected
    if (isConnected && !dataRequested.current) {
      console.log(`WebSocket connected, requesting token details for ${contractAddress}`);
      dataRequested.current = true;
      emit('get-token-details', { contractAddress });
      
      // Still set a fallback timer even if WebSocket is connected
      httpFallbackTimer.current = setTimeout(() => {
        if (isMounted.current && loading && !tokenDetails && !fallbackAttempted.current) {
          console.log('WebSocket request timeout - trying enhanced fallback');
          enhancedFallback();
          fallbackAttempted.current = true;
        }
      }, 3000);
    } else {
      console.log('WebSocket not connected, setting HTTP fallback timer');
      // Shorter fallback timer when not connected
      httpFallbackTimer.current = setTimeout(() => {
        if (isMounted.current && loading && !tokenDetails && !fallbackAttempted.current) {
          console.log('WebSocket not connected within timeout - trying enhanced fallback');
          enhancedFallback();
          fallbackAttempted.current = true;
        }
      }, 1000); // Very short timeout for better UX
    }
    
    // Clean up
    return () => {
      clearTimeout(httpFallbackTimer.current);
      removeListener('token-details', handleTokenDetails);
      removeListener('token-details-update', handleTokenUpdate);
      removeListener('error', handleError);
    };
  }, [contractAddress, isConnected, emit, addListener, removeListener]);
  
  // Effect to request data when connection state changes
  useEffect(() => {
    if (isConnected && contractAddress && !tokenDetails && !dataRequested.current) {
      console.log(`WebSocket connection established, requesting token details for ${contractAddress}`);
      dataRequested.current = true;
      emit('get-token-details', { contractAddress });
    }
  }, [isConnected, contractAddress, tokenDetails, emit]);

  // Handler for chart loading
  const handleChartLoad = () => {
    console.log('Chart iframe loaded');
    setIsLoadingChart(false);
  };

  // Copy address to clipboard function
  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text)
      .then(() => {
        alert('Copied to clipboard');
      })
      .catch(err => {
        console.error('Failed to copy: ', err);
      });
  };

  // Improved loading state with retry button for long loads
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
        zIndex: 999
      }}>
        <div style={{ fontSize: '20px', marginBottom: '15px', fontFamily: "'Chewy', cursive" }}>Loading Token Data</div>
        {contractAddress && (
          <div style={{ fontSize: '14px', marginBottom: '20px', opacity: 0.8 }}>
            Contract: {contractAddress.slice(0, 6)}...{contractAddress.slice(-4)}
          </div>
        )}
        <div className="loading-spinner" style={{ width: '40px', height: '40px' }}></div>
        
        {/* Add retry button for slow loads */}
        {loadingTimeExceeded && (
          <button 
            onClick={() => window.location.reload()} 
            style={{ 
              padding: '10px 20px', 
              background: '#ffb300', 
              color: '#000000', 
              border: 'none', 
              borderRadius: '6px', 
              cursor: 'pointer',
              marginTop: '20px',
              fontSize: '16px',
              fontFamily: "'Chewy', cursive"
            }}
          >
            Retry Loading
          </button>
        )}
      </div>
    );
  }
  
  if (error) {
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
        <div style={{ fontSize: '20px', marginBottom: '15px', color: '#ff4466' }}>Error Loading Token</div>
        <div style={{ fontSize: '16px', marginBottom: '20px', maxWidth: '80%', textAlign: 'center' }}>{error}</div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button 
            onClick={() => window.history.back()} 
            style={{ 
              padding: '10px 20px', 
              background: '#ffb300', 
              color: '#000000', 
              border: 'none', 
              borderRadius: '6px', 
              cursor: 'pointer',
              fontSize: '16px',
              fontFamily: "'Chewy', cursive"
            }}
          >
            ← Go Back
          </button>
          <button 
            onClick={() => window.location.reload()} 
            style={{ 
              padding: '10px 20px', 
              background: '#333', 
              color: '#ffb300', 
              border: '1px solid #ffb300', 
              borderRadius: '6px', 
              cursor: 'pointer',
              fontSize: '16px',
              fontFamily: "'Chewy', cursive"
            }}
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }
  
  if (!tokenDetails) {
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
        <div style={{ fontSize: '20px', marginBottom: '15px', color: '#ff9900' }}>No Token Details Found</div>
        <div style={{ fontSize: '16px', marginBottom: '20px', maxWidth: '80%', textAlign: 'center' }}>
          We couldn't find data for this token.
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button 
            onClick={() => window.history.back()} 
            style={{ 
              padding: '10px 20px', 
              background: '#ffb300', 
              color: '#000000', 
              border: 'none', 
              borderRadius: '6px', 
              cursor: 'pointer',
              fontSize: '16px',
              fontFamily: "'Chewy', cursive"
            }}
          >
            ← Go Back
          </button>
          <button 
            onClick={() => window.location.reload()} 
            style={{ 
              padding: '10px 20px', 
              background: '#333', 
              color: '#ffb300', 
              border: '1px solid #ffb300', 
              borderRadius: '6px', 
              cursor: 'pointer',
              fontSize: '16px',
              fontFamily: "'Chewy', cursive"
            }}
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // Use the poolAddress (from MongoDB) for the DexScreener embed URL
  const dexScreenerEmbedUrl = `https://dexscreener.com/base/${poolAddress}?embed=1&loadChartSettings=0&trades=0&tabs=0&info=0&chartLeftToolbar=0&chartDefaultOnMobile=1&chartTheme=dark&theme=light&chartStyle=0&chartType=usd&interval=15`;

  // Main content with enhanced loading states
  return (
    <>
      {/* Full-screen black background that's always visible */}
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
          <h1 style={{ color: '#ffb300', fontFamily: "'Chewy', cursive" }}>{tokenDetails.name} ({tokenDetails.symbol})</h1>
          <div className="token-details-summary">
            <p>Price: {formatCurrency(tokenDetails.price_usd)}</p>
            <p>Market Cap: {formatCurrency(tokenDetails.fdv_usd)}</p>
            <p>24h Volume: {formatCurrency(tokenDetails.volume_usd)}</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <p style={{ marginRight: '10px' }}>Contract: 
                <span style={{ marginLeft: '5px' }}>{tokenDetails.contractAddress.slice(0, 8)}...{tokenDetails.contractAddress.slice(-6)}</span>
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
                  fontSize: '12px',
                  fontFamily: "'Chewy', cursive"
                }}
              >
                Copy
              </button>
            </div>
          </div>
          
          {/* Data source indicator */}
          {dataSource && (
            <div style={{
              display: 'inline-block',
              background: '#222',
              color: dataSource === 'websocket' ? '#00ff88' : dataSource === 'cache' ? '#ffb300' : '#ff9900',
              padding: '4px 8px',
              borderRadius: '4px',
              fontSize: '12px',
              marginTop: '10px'
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
          )}
        </div>
        <div className="token-chart-container">
          {isLoadingChart && (
            <div style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              color: '#ffb300',
              zIndex: 5,
              textAlign: 'center'
            }}>
              <div style={{ fontFamily: "'Chewy', cursive" }}>Loading chart...</div>
              <div className="loading-spinner" style={{ 
                margin: '20px auto', 
                width: '30px', 
                height: '30px'
              }}></div>
            </div>
          )}
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
                background-color: #000;
              }
            `}
          </style>
          <div id="dexscreener-embed">
            <iframe 
              src={dexScreenerEmbedUrl}
              onLoad={handleChartLoad}
              title={`${tokenDetails.name} price chart`}
            ></iframe>
          </div>
        </div>
        
        {/* Bottom margin for better spacing */}
        <div style={{ height: '50px' }}></div>
      </div>
    </>
  );
}

export default TokenDetailPage;