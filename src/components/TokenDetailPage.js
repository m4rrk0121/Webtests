import axios from 'axios';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useWebSocket } from '../context/WebSocketContext';

const TOKEN_API_BASE_URL = 'https://website-4g84.onrender.com/api/tokens';
const HTTP_FALLBACK_TIMEOUT = 3000; // Reduced from 5000ms to 3000ms

// Format currency values with appropriate suffixes and decimal places
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

// Calculate percentage change with color indicator
const formatPercentageChange = (value) => {
  if (value === undefined || value === null) return { text: 'N/A', color: 'white' };
  
  const num = parseFloat(value);
  if (isNaN(num)) return { text: 'N/A', color: 'white' };
  
  const formatted = `${num >= 0 ? '+' : ''}${num.toFixed(2)}%`;
  const color = num >= 0 ? '#00ff88' : '#ff4466';
  
  return { text: formatted, color };
};

function TokenDetailPage() {
  const { contractAddress } = useParams();
  const navigate = useNavigate();
  const [tokenDetails, setTokenDetails] = useState(null);
  const [poolAddress, setPoolAddress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isLoadingChart, setIsLoadingChart] = useState(true);
  const [dataSource, setDataSource] = useState(null); // 'websocket' or 'http'
  
  // Use the shared WebSocket context
  const { isConnected, emit, addListener, removeListener, reconnectAttempts } = useWebSocket();
  
  // Track if component is mounted and if data has been requested
  const isMounted = useRef(true);
  const dataRequested = useRef(false);
  const httpFallbackTimer = useRef(null);
  
  // Memoize the contract address to avoid unnecessary rerenders
  const normalizedContractAddress = useMemo(() => {
    return contractAddress ? contractAddress.toLowerCase() : null;
  }, [contractAddress]);
  
  // Format percentage change for display
  const percentageChangeFormatted = useMemo(() => {
    return formatPercentageChange(tokenDetails?.price_change_percentage_24h);
  }, [tokenDetails?.price_change_percentage_24h]);
  
  // HTTP fallback function
  const fetchTokenDataHttp = useCallback(async () => {
    // Only proceed if we're still loading and don't have data yet
    if (!isMounted.current || !loading || tokenDetails || !normalizedContractAddress) return;
    
    console.log(`[${new Date().toISOString()}] Fetching token data via HTTP`);
    try {
      setDataSource('http');
      const response = await axios.get(`${TOKEN_API_BASE_URL}/${normalizedContractAddress}`);
      
      if (!isMounted.current) return;
      
      if (response?.data) {
        console.log(`[${new Date().toISOString()}] HTTP data received:`, response.data);
        setTokenDetails(response.data);
        
        if (response.data.main_pool_address) {
          setPoolAddress(response.data.main_pool_address);
        } else {
          setPoolAddress(normalizedContractAddress);
        }
        
        setLoading(false);
      } else {
        throw new Error('No data received from API');
      }
    } catch (err) {
      if (!isMounted.current) return;
      
      console.error(`[${new Date().toISOString()}] HTTP error:`, err);
      setError('Failed to fetch token details');
      setLoading(false);
    }
  }, [normalizedContractAddress, loading, tokenDetails]);
  
  // Request token details via WebSocket
  const requestTokenViaWebSocket = useCallback(() => {
    if (isConnected && normalizedContractAddress && !dataRequested.current) {
      console.log(`[${new Date().toISOString()}] Requesting token details via WebSocket for ${normalizedContractAddress}`);
      dataRequested.current = true;
      setDataSource('websocket');
      emit('get-token-details', { contractAddress: normalizedContractAddress });
      
      // Set up HTTP fallback timer
      clearTimeout(httpFallbackTimer.current);
      httpFallbackTimer.current = setTimeout(() => {
        if (isMounted.current && loading && !tokenDetails) {
          console.log(`[${new Date().toISOString()}] WebSocket response timeout - falling back to HTTP`);
          fetchTokenDataHttp();
        }
      }, HTTP_FALLBACK_TIMEOUT);
    }
  }, [isConnected, normalizedContractAddress, emit, loading, tokenDetails, fetchTokenDataHttp]);
  
  // Store/retrieve current token in localStorage
  useEffect(() => {
    if (tokenDetails?.contractAddress) {
      localStorage.setItem('currentTokenAddress', tokenDetails.contractAddress);
    }
    
    // Recover from localStorage if needed
    if (!normalizedContractAddress && localStorage.getItem('currentTokenAddress')) {
      navigate(`/token/${localStorage.getItem('currentTokenAddress')}`);
    }
  }, [tokenDetails, normalizedContractAddress, navigate]);
  
  // Apply dark background to the page
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
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMounted.current = false;
      clearTimeout(httpFallbackTimer.current);
    };
  }, []);

  // Main effect for loading token data
  useEffect(() => {
    console.log(`[${new Date().toISOString()}] Loading token details for contract: ${normalizedContractAddress}`);
    
    // Reset states when contract address changes
    setTokenDetails(null);
    setPoolAddress(null);
    setLoading(true);
    setError(null);
    setDataSource(null);
    dataRequested.current = false;
    clearTimeout(httpFallbackTimer.current);
    
    // If no contract address, exit early
    if (!normalizedContractAddress) {
      setError('Invalid token address');
      setLoading(false);
      return;
    }
    
    // Handler functions
    const handleTokenDetails = (data) => {
      if (!isMounted.current) return;
      
      console.log(`[${new Date().toISOString()}] Received token details via WebSocket:`, data);
      
      // Only update if this is for our token
      if (data.contractAddress?.toLowerCase() === normalizedContractAddress) {
        setTokenDetails(data);
        
        if (data.main_pool_address) {
          setPoolAddress(data.main_pool_address);
        } else {
          setPoolAddress(normalizedContractAddress);
        }
        
        setLoading(false);
        clearTimeout(httpFallbackTimer.current);
      }
    };
    
    const handleTokenUpdate = (data) => {
      if (!isMounted.current) return;
      
      if (data.contractAddress?.toLowerCase() === normalizedContractAddress) {
        console.log(`[${new Date().toISOString()}] Received real-time token update:`, data);
        setTokenDetails(prevDetails => ({
          ...prevDetails,
          ...data
        }));
      }
    };
    
    const handleError = (err) => {
      if (!isMounted.current) return;
      
      console.error(`[${new Date().toISOString()}] Socket error:`, err);
      // Don't set error state here, as we'll try HTTP fallback
      
      // Trigger HTTP fallback immediately on socket error
      fetchTokenDataHttp();
    };
    
    // Add listeners
    addListener('token-details', handleTokenDetails);
    addListener('token-details-update', handleTokenUpdate);
    addListener('error', handleError);
    
    // Request token details if connected
    if (isConnected) {
      requestTokenViaWebSocket();
    } else {
      // Set timer for HTTP fallback if WebSocket doesn't connect quickly
      httpFallbackTimer.current = setTimeout(() => {
        if (isMounted.current && loading && !tokenDetails) {
          console.log(`[${new Date().toISOString()}] WebSocket not connected - falling back to HTTP`);
          fetchTokenDataHttp();
        }
      }, HTTP_FALLBACK_TIMEOUT);
    }
    
    // Clean up
    return () => {
      clearTimeout(httpFallbackTimer.current);
      removeListener('token-details', handleTokenDetails);
      removeListener('token-details-update', handleTokenUpdate);
      removeListener('error', handleError);
    };
  }, [normalizedContractAddress, isConnected, addListener, removeListener, fetchTokenDataHttp, requestTokenViaWebSocket]);
  
  // Effect to request data when connection state changes
  useEffect(() => {
    if (isConnected && normalizedContractAddress && !tokenDetails && !dataRequested.current) {
      requestTokenViaWebSocket();
    }
  }, [isConnected, normalizedContractAddress, tokenDetails, requestTokenViaWebSocket]);
  
  // Effect to retry HTTP if WebSocket fails after multiple attempts
  useEffect(() => {
    if (reconnectAttempts >= 3 && loading && !tokenDetails && !dataSource) {
      console.log(`[${new Date().toISOString()}] WebSocket reconnect attempts exhausted - trying HTTP`);
      fetchTokenDataHttp();
    }
  }, [reconnectAttempts, loading, tokenDetails, dataSource, fetchTokenDataHttp]);

  // Handler for chart loading
  const handleChartLoad = () => {
    console.log(`[${new Date().toISOString()}] Chart iframe loaded`);
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

  // Improved loading state
  if (loading) {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: '#000000',
        color: 'white',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 999
      }}>
        <div style={{ fontSize: '20px', marginBottom: '15px', fontWeight: 'bold' }}>Loading Token Data</div>
        <div style={{ fontSize: '14px', marginBottom: '20px', opacity: 0.8 }}>
          {normalizedContractAddress ? `Contract: ${normalizedContractAddress?.slice(0, 6)}...${normalizedContractAddress?.slice(-4)}` : ''}
        </div>
        <div className="loading-spinner" style={{ width: '40px', height: '40px' }}></div>
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
        color: 'white',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 999
      }}>
        <div style={{ fontSize: '20px', marginBottom: '15px', color: '#ff4466' }}>Error Loading Token</div>
        <div style={{ fontSize: '16px', marginBottom: '20px', maxWidth: '80%', textAlign: 'center' }}>{error}</div>
        <button 
          onClick={() => window.history.back()} 
          style={{ 
            padding: '10px 20px', 
            background: '#333', 
            color: 'white', 
            border: 'none', 
            borderRadius: '6px', 
            cursor: 'pointer',
            marginTop: '20px',
            fontSize: '16px'
          }}
        >
          ← Go Back
        </button>
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
        color: 'white',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 999
      }}>
        <div style={{ fontSize: '20px', marginBottom: '15px', color: '#ff9900' }}>No Token Details Found</div>
        <div style={{ fontSize: '16px', marginBottom: '20px', maxWidth: '80%', textAlign: 'center' }}>
          We couldn't find data for this token.
        </div>
        <button 
          onClick={() => window.history.back()} 
          style={{ 
            padding: '10px 20px', 
            background: '#333', 
            color: 'white', 
            border: 'none', 
            borderRadius: '6px', 
            cursor: 'pointer',
            marginTop: '21px',
            fontSize: '16px'
          }}
        >
          ← Go Back
        </button>
      </div>
    );
  }

  // Use the poolAddress for DexScreener embed URL
  const dexScreenerEmbedUrl = `https://dexscreener.com/base/${poolAddress}?embed=1&loadChartSettings=0&trades=0&tabs=0&info=0&chartLeftToolbar=0&chartDefaultOnMobile=1&chartTheme=dark&theme=light&chartStyle=0&chartType=usd&interval=15`;

  // Main content with enhanced design
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
      
      <div className="token-detail-page" style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
        <div className="token-detail-header" style={{ marginBottom: '20px' }}>
          <button 
            onClick={() => window.history.back()} 
            style={{
              background: 'transparent',
              border: 'none',
              color: 'white',
              cursor: 'pointer',
              fontSize: '16px',
              display: 'flex',
              alignItems: 'center',
              padding: '5px 0',
              marginBottom: '15px'
            }}
          >
            <span style={{ marginRight: '5px' }}>←</span> Back to Tokens
          </button>
          
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '10px',
            marginBottom: '15px'
          }}>
            <h1 style={{ 
              margin: 0, 
              fontSize: '28px', 
              color: 'white',
              fontFamily: "'Chewy', sans-serif" 
            }}>
              {tokenDetails.name} <span style={{ opacity: 0.7 }}>({tokenDetails.symbol})</span>
            </h1>
            
            <div style={{ 
              display: 'flex',
              alignItems: 'center',
              gap: '10px' 
            }}>
              <div style={{ 
                background: percentageChangeFormatted.color,
                padding: '5px 10px',
                borderRadius: '6px',
                fontSize: '16px',
                fontWeight: 'bold',
                color: '#000'
              }}>
                {percentageChangeFormatted.text}
              </div>
              
              <div style={{ 
                background: '#333',
                padding: '5px 10px',
                borderRadius: '6px',
                fontSize: '16px',
                color: '#fff',
                display: dataSource ? 'flex' : 'none',
                alignItems: 'center',
                gap: '5px'
              }}>
                <span style={{ 
                  width: '8px', 
                  height: '8px', 
                  borderRadius: '50%',
                  background: dataSource === 'websocket' ? '#00ff88' : '#ff9900',
                  display: 'inline-block'
                }}></span>
                {dataSource === 'websocket' ? 'Live' : 'Static'}
              </div>
            </div>
          </div>
          
          <div className="token-details-summary" style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '15px',
            backgroundColor: '#111',
            borderRadius: '10px',
            padding: '15px',
            marginBottom: '20px'
          }}>
            <div>
              <div style={{ fontSize: '14px', color: '#999', marginBottom: '5px' }}>Price</div>
              <div style={{ fontSize: '24px', color: 'white', fontWeight: 'bold' }}>{formatCurrency(tokenDetails.price_usd)}</div>
            </div>
            
            <div>
              <div style={{ fontSize: '14px', color: '#999', marginBottom: '5px' }}>Market Cap</div>
              <div style={{ fontSize: '24px', color: 'white', fontWeight: 'bold' }}>{formatCurrency(tokenDetails.fdv_usd)}</div>
            </div>
            
            <div>
              <div style={{ fontSize: '14px', color: '#999', marginBottom: '5px' }}>24h Volume</div>
              <div style={{ fontSize: '24px', color: 'white', fontWeight: 'bold' }}>{formatCurrency(tokenDetails.volume_usd)}</div>
            </div>
          </div>
          
          <div style={{ 
            display: 'flex', 
            alignItems: 'center',
            backgroundColor: '#111',
            borderRadius: '6px',
            padding: '10px 15px',
            marginBottom: '20px'
          }}>
            <div style={{ flexGrow: 1, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
              <div style={{ fontSize: '14px', color: '#999', marginBottom: '5px' }}>Contract Address</div>
              <div style={{ fontSize: '14px', color: 'white' }}>{tokenDetails.contractAddress}</div>
            </div>
            
            <button
              onClick={() => copyToClipboard(tokenDetails.contractAddress)}
              style={{
                background: '#333',
                border: 'none',
                color: 'white',
                borderRadius: '4px',
                padding: '5px 10px',
                marginLeft: '10px',
                cursor: 'pointer'
              }}
            >
              Copy
            </button>
          </div>
        </div>
        
        <div className="token-chart-container" style={{ position: 'relative', marginBottom: '20px' }}>
          {isLoadingChart && (
            <div style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              color: 'white',
              zIndex: 5,
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center'
            }}>
              <div style={{ fontSize: '18px', marginBottom: '15px' }}>Loading price chart...</div>
              <div className="loading-spinner" style={{ margin: '0 auto', width: '30px', height: '30px' }}></div>
            </div>
          )}
          
          <style>
            {`
              #dexscreener-embed {
                position: relative;
                width: 100%;
                padding-bottom: 75%;
                background-color: #111;
                border-radius: 10px;
                overflow: hidden;
              }
              
              @media(min-width:1400px) {
                #dexscreener-embed {
                  padding-bottom: 65%;
                }
              }
              
              @media(max-width:767px) {
                #dexscreener-embed {
                  padding-bottom: 125%;
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
              
              .loading-spinner {
                border: 4px solid rgba(255, 255, 255, 0.3);
                border-radius: 50%;
                border-top: 4px solid white;
                width: 24px;
                height: 24px;
                animation: spin 1s linear infinite;
              }
              
              @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
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
          
          <div style={{ 
            fontSize: '12px', 
            color: '#999', 
            textAlign: 'center', 
            marginTop: '10px',
            display: dataSource ? 'block' : 'none'
          }}>
            Data source: {dataSource === 'websocket' ? 'Real-time WebSocket' : 'HTTP API'} | Chart: DexScreener
          </div>
        </div>
      </div>
    </>
  );
}

export default TokenDetailPage;