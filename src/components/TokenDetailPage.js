import axios from 'axios';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useWebSocket } from '../context/WebSocketContext';

// Memory cache without complex operations
const memoryCache = {
  store: {},
  get: function(key) {
    const item = this.store[key];
    if (!item) return null;
    if (item.expires && item.expires < Date.now()) {
      delete this.store[key];
      return null;
    }
    return item.value;
  },
  set: function(key, value, ttlMinutes = 60) {
    this.store[key] = {
      value: value,
      expires: Date.now() + (ttlMinutes * 60 * 1000)
    };
  }
};

function TokenDetailPage() {
  const { contractAddress } = useParams();
  const navigate = useNavigate();
  
  // Get the WebSocket context
  const { isConnected, emit, addListener, removeListener } = useWebSocket();

  // State management
  const [tokenDetails, setTokenDetails] = useState(null);
  const [poolAddress, setPoolAddress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dataSource, setDataSource] = useState('loading');
  
  // Reference for event handlers and cleanup
  const mounted = useRef(true);
  const initialRender = useRef(true);
  const initialLoadSource = useRef(null);
  const eventHandlers = useRef({});
  
  // Safe data formatting utility
  function formatCurrency(value) {
    if (value == null) return 'N/A';
    
    const num = parseFloat(value);
    if (isNaN(num)) return 'N/A';
    
    if (num >= 1000000000) {
      return '$' + (num / 1000000000).toFixed(2) + 'B';
    } else if (num >= 1000000) {
      return '$' + (num / 1000000).toFixed(2) + 'M';
    } else if (num >= 1000) {
      return '$' + (num / 1000).toFixed(2) + 'K';
    } else if (num >= 1) {
      return '$' + num.toFixed(2);
    } else if (num >= 0.01) {
      return '$' + num.toFixed(4);
    } else {
      return '$' + num.toFixed(8);
    }
  }
  
  // HTTP fetch utility
  const fetchTokenDataHttp = useCallback(function(address) {
    return new Promise(function(resolve, reject) {
      axios.get('https://website-4g84.onrender.com/api/tokens/' + address, {
        timeout: 15000
      })
      .then(function(response) {
        if (response && response.data) {
          resolve(response.data);
        } else {
          reject(new Error('Empty response'));
        }
      })
      .catch(function(error) {
        reject(error);
      });
    });
  }, []);
  
  // WebSocket fetch utility
  const fetchTokenDataWebSocket = useCallback(function(address) {
    return new Promise(function(resolve, reject) {
      if (!isConnected) {
        reject(new Error('WebSocket not connected'));
        return;
      }
      
      // Create handler functions
      function handleTokenDetails(data) {
        console.log('[TokenDetailPage] WebSocket data received successfully');
        // Remove listeners to avoid memory leaks
        removeListener('token-details', handleTokenDetails);
        removeListener('error', handleError);
        
        // Clear from tracking object
        delete eventHandlers.current.tokenDetails;
        delete eventHandlers.current.error;
        
        resolve(data);
      }
      
      function handleError(error) {
        console.error('[TokenDetailPage] WebSocket error:', error);
        // Remove listeners to avoid memory leaks
        removeListener('token-details', handleTokenDetails);
        removeListener('error', handleError);
        
        // Clear from tracking object
        delete eventHandlers.current.tokenDetails;
        delete eventHandlers.current.error;
        
        reject(error);
      }
      
      // Track handlers for cleanup
      eventHandlers.current.tokenDetails = handleTokenDetails;
      eventHandlers.current.error = handleError;
      
      // Add listeners
      addListener('token-details', handleTokenDetails);
      addListener('error', handleError);
      
      // Request data
      console.log('[TokenDetailPage] Requesting data via WebSocket');
      emit('get-token-details', { contractAddress: address });
      
      // Set timeout
      setTimeout(function() {
        if (eventHandlers.current.tokenDetails === handleTokenDetails) {
          console.log('[TokenDetailPage] WebSocket request timed out');
          removeListener('token-details', handleTokenDetails);
          removeListener('error', handleError);
          delete eventHandlers.current.tokenDetails;
          delete eventHandlers.current.error;
          reject(new Error('Request timed out'));
        }
      }, 10000);
    });
  }, [isConnected, addListener, removeListener, emit]);
  
  // Set up live updates
  const setupLiveUpdates = useCallback(function(address) {
    // Skip if not connected or missing address
    if (!isConnected || !address) return;
    
    // Clean up any existing update handler
    if (eventHandlers.current.update) {
      removeListener('token-details-update', eventHandlers.current.update);
      delete eventHandlers.current.update;
    }
    
    // Create update handler
    function handleUpdate(updatedToken) {
      if (!mounted.current) return;
      
      if (updatedToken && updatedToken.contractAddress === address) {
        console.log('[TokenDetailPage] Live update received');
        
        // Only update if this is a data-changing update
        const hasChanges = 
          !tokenDetails || 
          updatedToken.price_usd !== tokenDetails.price_usd || 
          updatedToken.fdv_usd !== tokenDetails.fdv_usd ||
          updatedToken.volume_usd !== tokenDetails.volume_usd;
          
        if (hasChanges) {
          setTokenDetails(function(current) {
            // Handle null case
            if (!current) return updatedToken;
            
            // Create new object with updates
            return {
              ...current,
              ...updatedToken
            };
          });
          
          // Only update data source if it's not already websocket
          if (dataSource !== 'websocket') {
            setDataSource('websocket');
          }
          
          // Update cache
          memoryCache.set(address, updatedToken);
        }
      }
    }
    
    // Track and add listener
    eventHandlers.current.update = handleUpdate;
    addListener('token-details-update', handleUpdate);
    
    // Initial request
    emit('get-token-details', { contractAddress: address });
    
    console.log('[TokenDetailPage] Live updates set up for', address);
  }, [isConnected, addListener, removeListener, emit, dataSource, tokenDetails]);
  
  // Cleanup on unmount
  useEffect(function() {
    return function() {
      mounted.current = false;
      
      // Clean up all listeners
      Object.entries(eventHandlers.current).forEach(function([key, handler]) {
        if (key === 'tokenDetails' || key === 'error') {
          removeListener('token-details', handler);
          removeListener('error', handler);
        } else if (key === 'update') {
          removeListener('token-details-update', handler);
        }
      });
      
      eventHandlers.current = {};
    };
  }, [removeListener]);
  
  // Main data loading effect
  useEffect(function() {
    // Reset for new address
    if (!initialRender.current) {
      setLoading(true);
      setError(null);
      setTokenDetails(null);
      setPoolAddress(null);
      setDataSource('loading');
    }
    initialRender.current = false;
    
    // Skip if missing address
    if (!contractAddress) {
      setError('Invalid token address');
      setLoading(false);
      return;
    }
    
    let isActive = true;
    
    // Core data loading function
    async function loadData() {
      try {
        // First check memory cache
        const cachedData = memoryCache.get(contractAddress);
        if (cachedData) {
          console.log('[TokenDetailPage] Using cached data');
          
          if (isActive) {
            setTokenDetails(cachedData);
            setPoolAddress(cachedData.main_pool_address || contractAddress);
            
            // Only set dataSource if we haven't loaded from somewhere else
            if (!initialLoadSource.current) {
              setDataSource('cache');
              initialLoadSource.current = 'cache';
            }
            
            setLoading(false);
          }
        }
        
        // Try WebSocket if connected
        if (isConnected) {
          try {
            console.log('[TokenDetailPage] Fetching via WebSocket');
            const wsData = await fetchTokenDataWebSocket(contractAddress);
            
            if (wsData && isActive) {
              setTokenDetails(wsData);
              setPoolAddress(wsData.main_pool_address || contractAddress);
              setDataSource('websocket');
              initialLoadSource.current = 'websocket';
              setLoading(false);
              
              // Update cache
              memoryCache.set(contractAddress, wsData);
              
              // Set up live updates
              setupLiveUpdates(contractAddress);
              
              return; // Success via WebSocket
            }
          } catch (wsError) {
            console.warn('[TokenDetailPage] WebSocket fetch failed, trying HTTP');
            // Continue to HTTP fallback
          }
        }
        
        // Fallback to HTTP
        if ((!tokenDetails || dataSource === 'loading' || dataSource === 'cache') && isActive) {
          try {
            console.log('[TokenDetailPage] Fetching via HTTP');
            const httpData = await fetchTokenDataHttp(contractAddress);
            
            if (httpData && isActive) {
              setTokenDetails(httpData);
              setPoolAddress(httpData.main_pool_address || contractAddress);
              
              // Only change data source if we haven't successfully loaded from WebSocket
              if (dataSource !== 'websocket') {
                setDataSource('http');
                initialLoadSource.current = 'http';
              }
              
              setLoading(false);
              
              // Update cache
              memoryCache.set(contractAddress, httpData);
              
              // Try to set up WebSocket updates anyway
              if (isConnected) {
                setupLiveUpdates(contractAddress);
              }
              
              return; // Success via HTTP
            }
          } catch (httpError) {
            console.error('[TokenDetailPage] HTTP fetch failed');
            
            // Only show error if we don't have any data yet
            if (!tokenDetails && isActive) {
              setError('Failed to load token data');
              setLoading(false);
            }
          }
        }
        
        // If we got here and still don't have data, show error
        if (!tokenDetails && !error && isActive) {
          setError('Unable to load token data');
          setLoading(false);
        }
        
      } catch (err) {
        console.error('[TokenDetailPage] General error in data loading');
        
        // Only show error if we don't have data yet
        if (!tokenDetails && isActive) {
          setError('Error loading token data');
          setLoading(false);
        }
      }
    }
    
    // Load data
    loadData();
    
    // Cleanup
    return function() {
      isActive = false;
    };
  }, [
    contractAddress, 
    isConnected, 
    fetchTokenDataWebSocket, 
    fetchTokenDataHttp, 
    setupLiveUpdates,
    error
  ]);
  
  // Copy to clipboard utility
  function copyToClipboard(text) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text)
        .then(function() {
          window.alert('Copied to clipboard');
        })
        .catch(function() {
          window.alert('Copy failed');
        });
    } else {
      window.alert('Copy not supported');
    }
  }
  
  // Handle navigation to dashboard
  function goToDashboard() {
    navigate('/');
  }
  
  // Handle retry
  function handleRetry() {
    window.location.reload();
  }
  
  // -- Render logic --
  
  // Loading state
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
      </div>
    );
  }
  
  // Error state
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
            onClick={goToDashboard} 
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
  
  // Main content - token detail view
  return (
    <div className="token-detail-page" style={{ backgroundColor: '#000000', minHeight: '100vh', color: '#ffffff' }}>
      <div className="token-detail-header" style={{ padding: '20px' }}>
        <button 
          onClick={goToDashboard} 
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
                  tokenDetails.contractAddress.slice(0, 8) + '...' + tokenDetails.contractAddress.slice(-6)}
              </span>
            </p>
            <button
              onClick={function() { copyToClipboard(tokenDetails.contractAddress); }}
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
        
        {/* Data source indicator */}
        <div style={{
          display: 'inline-block',
          marginTop: '10px',
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
      </div>
      
      {/* Chart Embed */}
      <div className="token-chart-container" style={{ padding: '20px' }}>
        <iframe 
          src={'https://dexscreener.com/base/' + (poolAddress || contractAddress) + '?embed=1&loadChartSettings=0&trades=0&tabs=0&info=0&chartLeftToolbar=0&chartDefaultOnMobile=1&chartTheme=dark&theme=light&chartStyle=0&chartType=usd&interval=15'}
          style={{
            width: '100%',
            height: '500px',
            border: 'none',
            backgroundColor: '#000000'
          }}
          title={tokenDetails.name + ' price chart'}
        />
      </div>
    </div>
  );
}

export default TokenDetailPage;