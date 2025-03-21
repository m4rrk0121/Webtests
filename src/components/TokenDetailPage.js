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
  const dataCache = useRef(createDataCache());

  // State management
  const [tokenDetails, setTokenDetails] = useState(null);
  const [poolAddress, setPoolAddress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dataSource, setDataSource] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('connecting');

  // Refs for managing connection and data retrieval
  const isMounted = useRef(true);
  const reconnectAttempts = useRef(0);
  const loadingTimeout = useRef(null);

  // WebSocket context
  const { isConnected, emit, addListener, removeListener } = useWebSocket();

  // Fetch token data via direct HTTP
  const fetchTokenDataDirect = useCallback(async (address) => {
    try {
      const response = await axios.get(
        `https://website-4g84.onrender.com/api/tokens/${address}`,
        { timeout: 10000 }
      );
      
      return response.data;
    } catch (error) {
      console.error('Direct HTTP fetch failed:', error);
      throw error;
    }
  }, []);

  // Comprehensive data retrieval strategy
  const retrieveTokenData = useCallback(async () => {
    // Try strategies in order
    const strategies = [
      // 1. Cached data
      () => {
        const cachedData = dataCache.current.get(contractAddress);
        if (cachedData) {
          setDataSource('cache');
          return cachedData;
        }
        return null;
      },
      
      // 2. WebSocket (if connected)
      () => new Promise((resolve, reject) => {
        if (isConnected) {
          const handler = (data) => {
            removeListener('token-details', handler);
            setDataSource('websocket');
            resolve(data);
          };
          
          addListener('token-details', handler);
          emit('get-token-details', { contractAddress });
          
          // Timeout for WebSocket response
          setTimeout(() => {
            removeListener('token-details', handler);
            reject(new Error('WebSocket timeout'));
          }, 5000);
        } else {
          reject(new Error('WebSocket not connected'));
        }
      }),
      
      // 3. Direct HTTP fallback
      () => {
        setDataSource('http');
        return fetchTokenDataDirect(contractAddress);
      }
    ];

    // Try strategies sequentially
    for (const strategy of strategies) {
      try {
        const data = await strategy();
        if (data) {
          // Cache successful retrieval
          dataCache.current.set(contractAddress, data);
          return data;
        }
      } catch (error) {
        console.warn('Data retrieval strategy failed:', error);
      }
    }

    // All strategies failed
    throw new Error('Unable to retrieve token data');
  }, [contractAddress, isConnected, emit, addListener, removeListener, fetchTokenDataDirect]);

  // Main data loading effect
  useEffect(() => {
    // Reset state
    setTokenDetails(null);
    setPoolAddress(null);
    setLoading(true);
    setError(null);
    setConnectionStatus('connecting');
    reconnectAttempts.current = 0;

    // No address, exit early
    if (!contractAddress) {
      setError('Invalid token address');
      setLoading(false);
      return;
    }

    // Loading timeout
    loadingTimeout.current = setTimeout(() => {
      if (loading) {
        setConnectionStatus('slow_connection');
      }
    }, 8000);

    // Attempt to retrieve data
    const loadData = async () => {
      try {
        const data = await retrieveTokenData();
        
        if (!isMounted.current) return;

        setTokenDetails(data);
        setPoolAddress(data.main_pool_address || contractAddress);
        setLoading(false);
        setConnectionStatus('connected');
      } catch (err) {
        if (!isMounted.current) return;

        console.error('Failed to load token data:', err);
        setError('Unable to load token details');
        setLoading(false);
        setConnectionStatus('failed');
      }
    };

    loadData();

    // Cleanup
    return () => {
      isMounted.current = false;
      clearTimeout(loadingTimeout.current);
    };
  }, [contractAddress, retrieveTokenData]);

  // Copy to clipboard utility
  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text)
      .then(() => alert('Copied to clipboard'))
      .catch(err => console.error('Copy failed:', err));
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
            : 'Connection Slow, Retrying...'}
        </div>
        
        {contractAddress && (
          <div style={{ fontSize: '14px', marginBottom: '20px', opacity: 0.8 }}>
            Contract: {contractAddress.slice(0, 6)}...{contractAddress.slice(-4)}
          </div>
        )}
        
        <div className="loading-spinner" style={{ width: '40px', height: '40px' }}></div>
        
        {connectionStatus === 'slow_connection' && (
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
              fontSize: '16px'
            }}
          >
            Retry Loading
          </button>
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
            onClick={() => window.history.back()} 
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
          onClick={() => window.history.back()} 
          style={{ 
            background: 'none', 
            border: 'none', 
            color: '#ffb300', 
            fontSize: '16px', 
            cursor: 'pointer' 
          }}
        >
          ← Back
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