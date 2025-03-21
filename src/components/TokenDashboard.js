import axios from 'axios';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import io from 'socket.io-client';


// Theme Toggle Component
const ThemeToggle = () => {
  const [isDarkMode, setIsDarkMode] = useState(false);

  // Effect to apply theme class to body and content-wrapper
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

  // Toggle theme function
  const toggleTheme = () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    
    // Save preference in localStorage
    localStorage.setItem('theme', newMode ? 'dark' : 'light');
  };

  // Check for saved theme preference on component mount
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

// Token Card Component
function TokenCard({ token, highlight = false }) {
  const navigate = useNavigate();
  const dexScreenerLink = `https://dexscreener.com/base/${token.contractAddress}`;

  const handleCardClick = (e) => {
    // Prevent navigation if DexScreener link is clicked
    if (e.target.closest('.dexscreener-link')) return;
    navigate(`/token/${token.contractAddress}`);
  };

  return (
    <div 
      className={`token-card ${highlight ? 'highlight-card' : ''}`}
      onClick={handleCardClick}
      style={{ cursor: 'pointer' }}
    >
      <div className="token-card-header">
        <h3>{token.name}</h3>
        <a 
          href={dexScreenerLink} 
          target="_blank" 
          rel="noopener noreferrer" 
          className="dexscreener-link"
          onClick={(e) => e.stopPropagation()}
        >
          DexScreener
        </a>
      </div>
      <p>Symbol: {token.symbol}</p>
      <p>Price: {formatCurrency(token.price_usd)}</p>
      <p>Market Cap: {formatCurrency(token.fdv_usd)}</p>
      <p>24h Volume: {formatCurrency(token.volume_usd)}</p>
      <small>CA: {token.contractAddress}</small>
    </div>
  );
}

// Main Token Dashboard Component
function TokenDashboard() {
  const [tokens, setTokens] = useState([]);
  const [highestMarketCapToken, setHighestMarketCapToken] = useState(null);
  const [highestVolumeToken, setHighestVolumeToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortField, setSortField] = useState('marketCap');
  const [sortDirection, setSortDirection] = useState('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  
  // Socket.io connection reference
  const socketRef = useRef(null);
  const socketConnected = useRef(false);
  
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

  // WebSocket setup and event handlers
  useEffect(() => {
    // Initialize socket connection
    socketRef.current = io('http://localhost:4003');
    
    // Initial loading state
    setLoading(true);
    
    // Connection event handlers
    socketRef.current.on('connect', () => {
      console.log('Connected to WebSocket server');
      socketConnected.current = true;
      
      // Request data for current page/sort after connection is established
      console.log(`Initial connection - Sending sort params: field=${sortField}, direction=${sortDirection}`);
      
      socketRef.current.emit('get-tokens', {
        sort: sortField, // Send the actual sort field without transformation
        direction: sortDirection, // Send the actual direction without transformation
        page: currentPage
      });
    });
    
    // Handle top tokens updates
    socketRef.current.on('top-tokens-update', (data) => {
      setHighestMarketCapToken(data.topMarketCapToken);
      setHighestVolumeToken(data.topVolumeToken);
    });
    
    // Handle tokens list updates
    socketRef.current.on('tokens-list-update', (data) => {
      setTokens(data.tokens);
      setTotalPages(data.totalPages);
      setLoading(false);
    });
    
    // Handle individual token updates
    socketRef.current.on('token-update', (updatedToken) => {
      // Update the token in our existing list if it's there
      setTokens(currentTokens => 
        currentTokens.map(token => 
          token.contractAddress === updatedToken.contractAddress 
            ? { ...token, ...updatedToken } 
            : token
        )
      );
      
      // Check if we need to update highlighted tokens
      if (highestMarketCapToken && 
          highestMarketCapToken.contractAddress === updatedToken.contractAddress) {
        setHighestMarketCapToken({ ...highestMarketCapToken, ...updatedToken });
      }
      
      if (highestVolumeToken && 
          highestVolumeToken.contractAddress === updatedToken.contractAddress) {
        setHighestVolumeToken({ ...highestVolumeToken, ...updatedToken });
      }
    });
    
    socketRef.current.on('connect_error', (err) => {
      console.error('Socket connection error:', err);
      // Fall back to HTTP polling if WebSocket connection fails
      fallbackToHttpPolling();
    });
    
    socketRef.current.on('disconnect', () => {
      console.log('Disconnected from WebSocket server');
      socketConnected.current = false;
      // Fall back to HTTP polling if WebSocket disconnects
      fallbackToHttpPolling();
    });
    
    // Clean up on unmount
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []); // Empty dependency array ensures this runs only once on component mount
  
  // Fallback to HTTP polling if WebSocket fails
  const fallbackToHttpPolling = useCallback(() => {
    console.log('Falling back to HTTP polling');
    
    // Only proceed with HTTP polling if socket is not connected
    if (!socketConnected.current) {
      fetchGlobalTopTokens();
      fetchTokens(sortField, sortDirection, currentPage);
    }
  }, [sortField, sortDirection, currentPage]);
  
  // Request updated data when sort or page changes via WebSocket
  useEffect(() => {
    if (socketRef.current && socketConnected.current) {
      setLoading(true);
      
      // Send the actual sort field and direction values directly
      console.log(`Sort/page changed - Sending params: field=${sortField}, direction=${sortDirection}, page=${currentPage}`);
      
      socketRef.current.emit('get-tokens', {
        sort: sortField, // Send the actual sort field without transformation
        direction: sortDirection, // Send the actual direction without transformation
        page: currentPage
      });
    } else {
      // If WebSocket is not connected, fall back to HTTP
      fallbackToHttpPolling();
    }
  }, [sortField, sortDirection, currentPage, fallbackToHttpPolling]);

  // Original HTTP methods kept as fallbacks
  const fetchGlobalTopTokens = useCallback(async () => {
    try {
      const response = await axios.get('https://website-4g84.onrender.com/api/global-top-tokens');
      
      setHighestMarketCapToken(response.data.topMarketCapToken);
      setHighestVolumeToken(response.data.topVolumeToken);
    } catch (err) {
      console.error('Failed to fetch global top tokens', err);
    }
  }, []);

  const fetchTokens = useCallback(async (field, direction, page) => {
    try {
      setLoading(true);
      const response = await axios.get('https://website-4g84.onrender.com/api/tokens', {
        params: {
          sort: field === 'marketCap' ? 'marketCap' : 'volume',
          direction: direction,
          page: page
        }
      });
      
      setTokens(response.data.tokens);
      setTotalPages(response.data.totalPages);
    } catch (err) {
      setError('Failed to fetch tokens');
    } finally {
      setTimeout(() => setLoading(false), 300);
    }
  }, []);

  const handleSort = (field) => {
    if (field === sortField) {
      setSortDirection(sortDirection === 'desc' ? 'asc' : 'desc');
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
          {/* Sorting Controls */}
          <div className="sorting-controls">
            <button 
              onClick={() => handleSort('marketCap')}
              className={sortField === 'marketCap' ? 'active' : ''}
            >
              Sort by Market Cap {sortField === 'marketCap' && (sortDirection === 'desc' ? '▼' : '▲')}
            </button>
            <button 
              onClick={() => handleSort('volume')}
              className={sortField === 'volume' ? 'active' : ''}
            >
              Sort by Volume {sortField === 'volume' && (sortDirection === 'desc' ? '▼' : '▲')}
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
              {tokens.map((token) => (
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