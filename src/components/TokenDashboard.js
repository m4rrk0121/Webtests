import axios from 'axios';
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
// Import the WebSocket context hook
import { useWebSocket } from '../context/WebSocketContext';

// Theme Toggle Component
const ThemeToggle = () => {
  // Existing code remains the same
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    const contentWrapper = document.querySelector('.content-wrapper');
    
    if (isDarkMode) {
      document.body.classList.add('dark-mode');
      if (contentWrapper) contentWrapper.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
      if (contentWrapper) contentWrapper.classList.remove('dark-mode');
    }
  }, [isDarkMode]);

  const toggleTheme = () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    localStorage.setItem('theme', newMode ? 'dark' : 'light');
  };

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
      setIsDarkMode(true);
    }
  }, []);
  return (
    <button 
      className="theme-toggle-button" 
      onClick={toggleTheme}
      style={{
        position: 'flex',
        right: '90px', // Position from the left instead of right
               zIndex: 100
      }}
    >
      {isDarkMode ? 'Light Mode' : 'Dark Mode'}
    </button>
  );
};

// Currency Formatting Utility
const formatCurrency = (value) => {
  if (value === null || value === undefined) return 'N/A';
  
  const num = parseFloat(value);
  if (isNaN(num)) return 'N/A';
  
  // For very large numbers (billions), still use suffix
  if (num >= 1000000000) {
    return `$${Math.round(num / 1000000000).toLocaleString()}B`;
  }
  
  // For prices (small numbers), show more decimals
  if (num < 0.01) {
    return `$${num.toFixed(8)}`;
  } else if (num < 1) {
    return `$${num.toFixed(4)}`;
  }
  
  // For all other numbers (including market caps), show full number with commas
  return `$${Math.round(num).toLocaleString()}`;
};

// Token Card Component - Updated with state navigation
function TokenCard({ token, highlight = false }) {
  const navigate = useNavigate();
  const dexScreenerLink = `https://dexscreener.com/base/${token.contractAddress}`;

  const handleCardClick = (e) => {
    if (e.target.closest('.dexscreener-link')) return;
    navigate(`/token/${token.contractAddress}`);
  };

  return (
    <div 
      className={`token-card ${highlight ? 'highlight-card' : ''}`}
      onClick={handleCardClick}
      style={{ cursor: 'pointer' }}
    >
      <h3>{token.name}</h3>
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
        <a 
          href={dexScreenerLink} 
          target="_blank" 
          rel="noopener noreferrer" 
          className="dexscreener-link"
          onClick={(e) => e.stopPropagation()}
        >
          DexScreener
        </a>
        {token.image?.url && (
          <img 
            src={token.image.url}
            alt={`${token.name} logo`}
            style={{
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              objectFit: 'cover'
            }}
          />
        )}
      </div>
      <p>Symbol: {token.symbol}</p>
      <p>Price: {formatCurrency(token.price_usd)}</p>
      <p>Market Cap: {formatCurrency(token.market_cap_usd)}</p>
      <p>24h Volume: {formatCurrency(token.volume_usd_24h)}</p>
      <small>CA: {token.contractAddress}</small>
    </div>
  );
}

// Main Token Dashboard Component
function TokenDashboard() {
  const { isConnected, emit, addListener, removeListener } = useWebSocket();
  
  const [tokens, setTokens] = useState([]);
  const [filteredTokens, setFilteredTokens] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [highestMarketCapToken, setHighestMarketCapToken] = useState(null);
  const [highestVolumeToken, setHighestVolumeToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortField, setSortField] = useState('marketCap');
  const [sortDirection, setSortDirection] = useState('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  
  // Enhanced screen dimensions tracking with height classes
  const [screenDimensions, setScreenDimensions] = useState({
    width: window.innerWidth,
    height: window.innerHeight
  });
  
  // More granular height breakpoints for 14-inch screens
  const isMobile = screenDimensions.width <= 768;
  const isShortScreen = screenDimensions.height <= 800;
  const isVeryShortScreen = screenDimensions.height <= 700; // Targeting 14-inch screens
  const isExtremelyShortScreen = screenDimensions.height <= 600;
  
  // Banner text for scrolling banner
  const bannerText = "WELCOME TO THE JUNGLE • WELCOME TO THE JUNGLE • WELCOME TO THE JUNGLE • ";

  // Check screen dimensions on resize
  useEffect(() => {
    const handleResize = () => {
      setScreenDimensions({
        width: window.innerWidth,
        height: window.innerHeight
      });
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Apply more specific height-based classes
  useEffect(() => {
    const appContainer = document.querySelector('.app-container');
    if (appContainer) {
      // Reset all height classes
      appContainer.classList.remove('short-screen', 'very-short-screen', 'extremely-short-screen');
      
      // Apply appropriate class based on current height
      if (isExtremelyShortScreen) {
        appContainer.classList.add('extremely-short-screen');
      } else if (isVeryShortScreen) {
        appContainer.classList.add('very-short-screen');
      } else if (isShortScreen) {
        appContainer.classList.add('short-screen');
      }
    }
  }, [isShortScreen, isVeryShortScreen, isExtremelyShortScreen]);

  // Update search filter effect to be more inclusive with wildcard search
  useEffect(() => {
    if (!searchQuery.trim()) {
      // When search is empty, show paginated results
      setFilteredTokens(tokens);
      return;
    }
    
    // Emit search event to server when search query changes
    if (isConnected) {
      emit('search-tokens', { query: searchQuery.toLowerCase().trim() });
    }
  }, [searchQuery, isConnected]);

  // Add this function to check if a token is in viewport
  const isTokenInViewport = (tokenElement) => {
    if (!tokenElement) return false;
    const rect = tokenElement.getBoundingClientRect();
    return (
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
      rect.right <= (window.innerWidth || document.documentElement.clientWidth)
    );
  };

  // Setup event listeners for WebSocket
  useEffect(() => {
    if (isConnected) {
      console.log("[TokenDashboard] WebSocket is connected, setting up event listeners");
      setLoading(true);
      
      // Register token list update listener
      const tokensListUpdateHandler = (data) => {
        console.log('Received tokens list update:', data.tokens[0]);
        const filteredTokens = data.tokens.filter(token => 
          token.symbol !== 'WETH' && token.symbol !== 'UNI-V3-POS'
        );
        setTokens(filteredTokens);
        // Only set filtered tokens if there's no active search
        if (!searchQuery.trim()) {
          setFilteredTokens(filteredTokens);
        }
        setTotalPages(data.totalPages);
        setLoading(false);
      };

      // Modified token update handler for batched updates
      const tokenUpdateHandler = (updates) => {
        // Updates is now an array of token updates
        updates.forEach(updatedToken => {
          setTokens(currentTokens => 
            currentTokens.map(token => 
              token.contractAddress === updatedToken.contractAddress 
                ? { ...token, ...updatedToken } 
                : token
            )
          );
          
          // Update highlighted tokens if needed
          if (highestMarketCapToken?.contractAddress === updatedToken.contractAddress) {
            setHighestMarketCapToken(prev => ({ ...prev, ...updatedToken }));
          }
          if (highestVolumeToken?.contractAddress === updatedToken.contractAddress) {
            setHighestVolumeToken(prev => ({ ...prev, ...updatedToken }));
          }
        });
      };

      // Register search results handler
      const searchResultsHandler = (data) => {
        console.log('Received search results:', data.tokens.length);
        const filteredResults = data.tokens.filter(token => 
          token.symbol !== 'WETH' && token.symbol !== 'UNI-V3-POS'
        );
        setFilteredTokens(filteredResults);
        setLoading(false);
      };
      
      // Register top tokens update listener
      const topTokensUpdateHandler = (data) => {
        console.log('Received top tokens update:', {
          marketCap: data.topMarketCapToken,
          volume: data.topVolumeToken
        });
        
        // Ensure we're using the correct field names
        const marketCapToken = {
          ...data.topMarketCapToken,
          market_cap_usd: data.topMarketCapToken.market_cap_usd || 0,
          volume_usd_24h: data.topMarketCapToken.volume_usd_24h || 0
        };
        
        const volumeToken = {
          ...data.topVolumeToken,
          market_cap_usd: data.topVolumeToken.market_cap_usd || 0,
          volume_usd_24h: data.topVolumeToken.volume_usd_24h || 0
        };
        
        setHighestMarketCapToken(marketCapToken);
        setHighestVolumeToken(volumeToken);
      };
      
      // Register error handler
      const errorHandler = (errorData) => {
        console.error('[TokenDashboard] Socket error:', errorData);
        setError(`Error: ${errorData.message || 'Unknown error'}`);
      };
      
      // Add viewport update handler
      const handleViewportUpdate = () => {
        const visibleTokens = Array.from(document.querySelectorAll('.token-card'))
          .filter(card => isTokenInViewport(card))
          .map(card => card.dataset.tokenAddress);

        emit('viewport-tokens', visibleTokens);
      };

      // Set up viewport update listener
      window.addEventListener('scroll', handleViewportUpdate);
      window.addEventListener('resize', handleViewportUpdate);

      // Initial viewport update
      handleViewportUpdate();

      // Add all event listeners
      addListener('tokens-list-update', tokensListUpdateHandler);
      addListener('token-updates', tokenUpdateHandler);
      addListener('search-results', searchResultsHandler);
      addListener('top-tokens-update', topTokensUpdateHandler);
      addListener('error', errorHandler);
      
      // Request initial data
      emit('get-tokens', {
        sort: sortField,
        direction: sortDirection,
        page: currentPage
      });
      
      // Cleanup function
      return () => {
        window.removeEventListener('scroll', handleViewportUpdate);
        window.removeEventListener('resize', handleViewportUpdate);
        removeListener('tokens-list-update', tokensListUpdateHandler);
        removeListener('token-updates', tokenUpdateHandler);
        removeListener('search-results', searchResultsHandler);
        removeListener('top-tokens-update', topTokensUpdateHandler);
        removeListener('error', errorHandler);
      };
    }
  }, [isConnected, sortField, sortDirection, currentPage, searchQuery]);

  // Request updated data when sort or page changes
  useEffect(() => {
    if (isConnected) {
      console.log('Requesting tokens with sort:', {
        sort: sortField,
        direction: sortDirection,
        page: currentPage
      });
      
      emit('get-tokens', {
        sort: sortField,
        direction: sortDirection,
        page: currentPage
      });
    }
  }, [isConnected, sortField, sortDirection, currentPage]);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
    setCurrentPage(1);
  };

  const handlePageChange = (newPage) => {
    if (newPage > 0 && newPage <= totalPages) {
      setCurrentPage(newPage);
    }
  };

  // Adjust monkey count based on screen dimensions
  const getMonkeyCount = () => {
    // First consider height constraints
    if (isExtremelyShortScreen) return 0; // No monkeys on very small screens
    if (isVeryShortScreen) return 2; // Fewer monkeys on 14-inch screens
    
    // Then consider width constraints
    if (screenDimensions.width <= 576) return 3;
    if (screenDimensions.width <= 768) return 4;
    if (screenDimensions.width <= 992) return 5;
    return 8; // Default for larger screens
  };

  const monkeyCount = getMonkeyCount();

  // Get height-responsive styles for monkey images
  const getMonkeyHeight = () => {
    if (isVeryShortScreen) return '120px';
    if (isShortScreen) return '160px';
    return '213px'; // Default height
  };

  const formatNumber = (value) => {
    if (value === undefined || value === null) return '0';
    if (value === 0) return '0';
    if (value < 0.01) return value.toFixed(8);
    if (value < 1) return value.toFixed(4);
    if (value < 1000) return value.toFixed(2);
    if (value < 1000000) return (value / 1000).toFixed(2) + 'K';
    if (value < 1000000000) return (value / 1000000).toFixed(2) + 'M';
    return (value / 1000000000).toFixed(2) + 'B';
  };

  const getTokenValue = (token, field) => {
    switch (field) {
      case 'market_cap_usd':
        return token.market_cap_usd || 0;
      case 'volume_usd_24h':
        return token.volume_usd_24h || 0;
      case 'fdv_usd':
        return token.fdv_usd || 0;
      default:
        return token.price_usd || 0;
    }
  };

  return (
    <div className={`app-container ${isShortScreen ? 'short-screen' : ''} ${isVeryShortScreen ? 'very-short-screen' : ''} ${isExtremelyShortScreen ? 'extremely-short-screen' : ''}`}>
      {/* Theme Toggle Component */}
      <ThemeToggle />

      <div className="static-top-section">
        {/* Logo positioned absolutely over the background */}
        <div className="logo-container">
          <img src="https://i.postimg.cc/mDgvXZqN/LOGO.png" alt="Logo" />
        </div>

        <div className="token-dashboard">
          {/* Connection status indicator */}
          <div className="connection-status" style={{ 
            position: 'absolute', 
            top: '10px', 
            right: '10px',
            display: 'flex',
            alignItems: 'center',
            fontSize: '12px',
            padding: '4px 8px',
            background: 'rgba(0,0,0,0.7)',
            borderRadius: '4px',
            color: isConnected ? '#00ff88' : '#ff4466'
          }}>
            <span style={{ 
              width: '8px', 
              height: '8px', 
              borderRadius: '50%', 
              background: isConnected ? '#00ff88' : '#ff4466',
              display: 'inline-block',
              marginRight: '5px'
            }}></span>
            {isConnected ? 'Live' : 'Offline'}
          </div>

          {/* Search Bar */}
          <div className="search-container" style={{
            margin: '20px auto',
            maxWidth: '500px',
            width: '90%',
            position: 'relative',
            display: 'flex',
            justifyContent: 'center',
            textAlign: 'center'
          }}>
            <input
              type="text"
              placeholder="Search tokens..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 16px',
                fontSize: '16px',
                backgroundColor: 'rgba(0, 0, 0, 0.7)',
                color: '#FFB800',
                border: '2px solid #FFB800',
                borderRadius: '8px',
                outline: 'none',
                fontWeight: '600'
              }}
            />
          </div>

          {/* Sorting Controls */}
          <div className="sorting-controls" style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '15px',
            margin: '20px auto',
            maxWidth: '600px',
            width: '90%'
          }}>
            <button 
              onClick={() => handleSort('marketCap')}
              className={`dexscreener-link ${sortField === 'marketCap' ? 'active' : ''}`}
            >
              Market Cap
              {sortField === 'marketCap' && (
                <span className="sort-arrow">
                  {sortDirection === 'desc' ? '▼' : '▲'}
                </span>
              )}
            </button>
            <button 
              onClick={() => handleSort('volume')}
              className={`dexscreener-link ${sortField === 'volume' ? 'active' : ''}`}
            >
              Volume
              {sortField === 'volume' && (
                <span className="sort-arrow">
                  {sortDirection === 'desc' ? '▼' : '▲'}
                </span>
              )}
            </button>
            <button 
              onClick={() => handleSort('blockNumber')}
              className={`dexscreener-link ${sortField === 'blockNumber' ? 'active' : ''}`}
            >
              Time
              {sortField === 'blockNumber' && (
                <span className="sort-arrow">
                  {sortDirection === 'desc' ? '▼' : '▲'}
                </span>
              )}
            </button>
          </div>

          {/* Top Tokens Section with updated titles */}
          {highestMarketCapToken && highestVolumeToken && (
            <div className="top-tokens-section">
              <div className="top-tokens-titles">
                <h2 className="top-token-title">KING OF THE MOUNTAIN</h2>
                <h2 className="top-token-title">KING OF THE JUNGLE</h2>
              </div>
              <div className="top-tokens-grid">
                <TokenCard token={highestMarketCapToken} highlight={true} />
                <TokenCard token={highestVolumeToken} highlight={true} />
              </div>
            </div>
          )}
        </div>

        {/* Conditionally render monkey divider based on screen height */}
        {monkeyCount > 0 && (
          <div className="monkey-divider">
            {/* First set of monkeys (left side) */}
            {[...Array(Math.floor(monkeyCount / 2))].map((_, index) => (
              <img 
                key={`left-${index}`} 
                src="https://i.postimg.cc/442Y1Byj/7.png" 
                alt="Monkey divider" 
                style={{ height: getMonkeyHeight() }}
              />
            ))}
            
            {/* Empty space for the center */}
            {!isMobile && !isVeryShortScreen && (
              [...Array(isShortScreen ? 2 : 4)].map((_, index) => (
                <div key={`empty-${index}`} style={{ width: isShortScreen ? '100px' : '213px' }}></div>
              ))
            )}
            
            {/* Second set of monkeys (right side) */}
            {[...Array(Math.floor(monkeyCount / 2))].map((_, index) => (
              <img 
                key={`right-${index}`} 
                src="https://i.postimg.cc/442Y1Byj/7.png"
                alt="Monkey divider" 
                style={{ height: getMonkeyHeight() }}
              />
            ))}
          </div>
        )}
      </div>

      <div className="content-wrapper">
        {/* Scrolling banner directly integrated at the top */}
        <div className="scrolling-banner-container">
          <div className="scrolling-banner">
            <div className="scrolling-banner-content">
              {bannerText.repeat(5)}
            </div>
          </div>
        </div>

        {loading && tokens.length > 0 ? (
          <div className="loading-overlay">
            <div className="loading-spinner"></div>
          </div>
        ) : null}

        {loading && tokens.length === 0 ? (
          <div className="loading-message">Loading tokens...</div>
        ) : error ? (
          <div className="error-message">{error}</div>
        ) : (
          <>
            <div className="token-grid">
              {filteredTokens.map((token) => (
                <TokenCard key={token.contractAddress} token={token} />
              ))}
            </div>

            {/* Mobile spacer - will only show on mobile */}
            <div className="mobile-spacer"></div>
            
            {/* Extra spacing div with inline style for mobile */}
            {isMobile && (
              <div style={{ height: '80px', width: '100%' }}></div>
            )}

            {/* Pagination Controls */}
            <div 
              className="pagination-controls"
              style={{ 
                marginTop: isMobile ? '80px' : '20px'
              }}
            >
              <button 
                onClick={() => handlePageChange(1)} 
                disabled={currentPage === 1}
              >
                First
              </button>
              <button 
                onClick={() => handlePageChange(currentPage - 1)} 
                disabled={currentPage === 1}
              >
                Previous
              </button>
              <span className="page-info">
                Page {currentPage} of {totalPages}
              </span>
              <button 
                onClick={() => handlePageChange(currentPage + 1)} 
                disabled={currentPage === totalPages}
              >
                Next
              </button>
              <button 
                onClick={() => handlePageChange(totalPages)} 
                disabled={currentPage === totalPages}
              >
                Last
              </button>
            </div>

            {/* Logo above social button */}
            <div className="logo-above-socials">
            <img src="https://i.postimg.cc/mDgvXZqN/LOGO.png" alt="Logo" />
            </div>
            
            {/* Social Button - added below pagination controls */}
            <div className="social-button-container">
              <a 
                href="https://linktr.ee/kingofapesbase" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="social-button"
              >
                SOCIALS
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default TokenDashboard;
