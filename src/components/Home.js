// src/components/Home.js
import axios from 'axios';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useWebSocket } from '../context/WebSocketContext';
import MusicPlayer from './MusicPlayer';

// Import images directly
import meditatingMonkey from '../images/7.png';
import kingMonkey from '../images/background2.png';
import thronedMonkey from '../images/jungle-background.png';
import jungleCrown from '../images/logo.png';
// Add this import at the top with your other image imports

function Home() {
  const navigate = useNavigate();
  // Get the WebSocket context
  const { isConnected, emit, addListener, removeListener } = useWebSocket();
  // Add this with your other useState declarations (around line 13-19)
  const [randomElements, setRandomElements] = useState([]);
  const [topTokens, setTopTokens] = useState([]);
  const [featuredToken, setFeaturedToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ totalTokens: 0, totalVolume: 0, totalMarketCap: 0 });
  const [dataSource, setDataSource] = useState(null);
  
  // Store event handlers in refs to maintain identity across renders
  const handlersRef = useRef({
    tokensListUpdate: null,
    tokenUpdate: null,
    globalStatsUpdate: null,
    error: null
  });
  
  // Add class to body when on homepage
  useEffect(() => {
    // Add class to body when on homepage, but don't interfere with navbar
    document.body.classList.add('on-homepage');
    
    // Make sure content container has appropriate spacing
    const contentContainer = document.querySelector('.content-container');
    if (contentContainer) {
      contentContainer.style.paddingTop = '80px';
    }
    
    return () => {
      document.body.classList.remove('on-homepage');
      
      // Reset content container padding when leaving homepage
      if (contentContainer) {
        contentContainer.style.paddingTop = '';
      }
    };
  }, []);

  // Fallback to HTTP polling when WebSocket isn't available
  const fallbackToHttpPolling = useCallback(() => {
    console.log("[Home] Falling back to HTTP polling");
    setDataSource('http');
    
    const fetchData = async () => {
      try {
        setLoading(true);
        
        // Fetch top tokens for display
        const tokensResponse = await axios.get(
          'https://websocketv2.onrender.com/api/tokens'
        );
        
        // Fetch global statistics separately
        const statsResponse = await axios.get(
          'https://websocketv2.onrender.com/api/global-stats'
        );
        
        // Make sure we're not using stale data after resubscribing to WebSocket
        if (dataSource !== 'websocket') {
          // Set display tokens
          if (tokensResponse.data && tokensResponse.data.tokens) {
            setTopTokens(tokensResponse.data.tokens.slice(0, 5)); // Get top 5 tokens
            setFeaturedToken(tokensResponse.data.tokens[0]); // Set the highest market cap token as featured
          }
          
          // Set global statistics
          if (statsResponse.data) {
            setStats({
              totalTokens: statsResponse.data.totalTokens || 0,
              totalVolume: statsResponse.data.totalVolume || 0,
              totalMarketCap: statsResponse.data.totalMarketCap || 0
            });
          } else {
            // Fallback to calculating from top tokens if global stats endpoint fails
            const tokens = tokensResponse.data.tokens;
            setStats({
              totalTokens: tokensResponse.data.totalTokens || tokens.length,
              totalVolume: 0, // Set to 0 since we don't have accurate data
              totalMarketCap: 0 // Set to 0 since we don't have accurate data
            });
          }
          
          console.log("[Home] Updated data via HTTP");
        }
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [dataSource]);

  // WebSocket connection and event listeners setup
  useEffect(() => {
    // Fix #1: Store a copy of the current handlers ref for cleanup
    const currentHandlers = handlersRef.current;
    
    if (isConnected) {
      console.log("[Home] WebSocket is connected, setting up event listeners");
      setLoading(true);
      setDataSource('websocket');
      
      // Define handlers once and store in ref
      if (!currentHandlers.tokensListUpdate) {
        // Handler for token list updates (just for display)
        currentHandlers.tokensListUpdate = (data) => {
          if (data && data.tokens) {
            const tokens = data.tokens;
            
            // Set top 5 tokens for the list
            setTopTokens(tokens.slice(0, 5));
            
            // Set featured token (highest market cap)
            setFeaturedToken(tokens[0]);
            
            setLoading(false);
            console.log("[Home] Updated display tokens via WebSocket");
          }
        };
        
        // Handler for global statistics
        currentHandlers.globalStatsUpdate = (statsData) => {
          if (statsData) {
            console.log("[Home] Received global stats:", statsData);
            setStats({
              totalTokens: statsData.totalTokens || 0,
              totalVolume: statsData.totalVolume || 0,
              totalMarketCap: statsData.totalMarketCap || 0
            });
          }
        };
        
        // Handler for individual token updates
        currentHandlers.tokenUpdate = (updatedToken) => {
          // Update token in the list if it exists
          setTopTokens(currentTokens => 
            currentTokens.map(token => 
              token.contractAddress === updatedToken.contractAddress 
                ? { ...token, ...updatedToken } 
                : token
            )
          );
          
          // Update featured token if it matches
          setFeaturedToken(current => {
            if (current && current.contractAddress === updatedToken.contractAddress) {
              return { ...current, ...updatedToken };
            }
            return current;
          });
        };
        
        // Error handler
        currentHandlers.error = (errorData) => {
          console.error('[Home] WebSocket error:', errorData);
          fallbackToHttpPolling();
        };
      }
      
      // Register all event listeners
      addListener('tokens-list-update', currentHandlers.tokensListUpdate);
      addListener('token-update', currentHandlers.tokenUpdate);
      addListener('global-stats-update', currentHandlers.globalStatsUpdate);
      addListener('error', currentHandlers.error);
      
      // Request tokens for display
      emit('get-tokens', {
        sort: 'marketCap',
        direction: 'desc',
        page: 1
      });
      
      // Request global statistics
      emit('get-global-stats');
      
      // Cleanup function
      return () => {
        console.log("[Home] Cleaning up WebSocket listeners");
        removeListener('tokens-list-update', currentHandlers.tokensListUpdate);
        removeListener('token-update', currentHandlers.tokenUpdate);
        removeListener('global-stats-update', currentHandlers.globalStatsUpdate);
        removeListener('error', currentHandlers.error);
      };
    } else {
      console.log("[Home] WebSocket not connected, falling back to HTTP");
      fallbackToHttpPolling();
    }
  }, [isConnected, addListener, removeListener, emit, fallbackToHttpPolling]); // Fix #2: Added fallbackToHttpPolling to deps array

  // Add this after your other useEffect hooks (after the WebSocket or HTTP polling effects)
  useEffect(() => {
    // Function to generate random position within viewport
    const getRandomPosition = () => {
      return {
        x: Math.random() * 80,
        y: Math.random() * 80,
      };
    };
  
    // Number of elements to create
    const numElements = 15;
    const elements = [];
    
    // Use public URL for banana image
    const bananaImage = '/images/banana.png'; // Path relative to public folder
    
    for (let i = 0; i < numElements; i++) {
      const position = getRandomPosition();
      
      // Randomly decide if this banana will zoom (about 50% chance)
      const willZoom = Math.random() > 0.5;
      
      elements.push({
        id: i,
        image: bananaImage,
        x: position.x,
        y: position.y,
        size: 40 + Math.random() * 50,
        animation: 2 + Math.random() * 5,
        delay: Math.random() * 5,
        zoom: willZoom // Add the zoom property
      });
    }
    
    setRandomElements(elements);
  }, []);

  const formatCurrency = (value, isPrice = false) => {
    if (value === null || value === undefined) return 'N/A';
    
    const num = parseFloat(value);
    if (isNaN(num)) return 'N/A';
    
    // For prices, maintain high precision
    if (isPrice) {
      if (num < 0.01) {
        return `$${num.toFixed(8)}`;
      } else if (num < 1) {
        return `$${num.toFixed(4)}`;
      }
      return `$${num.toFixed(2)}`;
    }
    
    // For regular numbers (market cap, volume), use comma formatting
    if (num >= 1000000000) {
      return `$${Math.round(num / 1000000000).toLocaleString()}B`;
    } else if (num >= 1000000) {
      return `$${Math.round(num / 1000000).toLocaleString()}M`;
    } else if (num >= 1000) {
      return `$${Math.round(num / 1000).toLocaleString()}K`;
    }
    
    // For regular numbers under 1000, use comma formatting with no decimals
    return `$${Math.round(num).toLocaleString()}`;
  };

  // Calculate market cap using price and total supply
  const calculateMarketCap = (token) => {
    if (!token.price_usd || !token.total_supply) return 0;
    const adjustedPrice = parseFloat(token.price_usd);
    const adjustedSupply = parseFloat(token.total_supply);
    return adjustedPrice * adjustedSupply;
  };

  const handleTokenClick = (contractAddress) => {
    navigate(`/token/${contractAddress}`);
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

  // Add console log to debug the stats data
  useEffect(() => {
    if (stats) {
      console.log('Global Stats:', {
        total24hVolume: stats.total24hVolume,
        totalMarketCap: stats.totalMarketCap,
        rawStats: stats
      });
    }
  }, [stats]);

  return (
    <div className="homepage">
      {/* Add this right after <div className="homepage"> (around line 165) */}
{/* Random floating bananas */}
{randomElements.map(el => (
  <div 
    key={el.id}
    className="floating-background-element"
    style={{
      left: `${el.x}%`,
      top: `${el.y}%`,
      animationDuration: `${el.animation}s`,
    }}
  >
    <img 
      src={el.image} 
      alt="Floating banana" 
      style={{
        height: `${el.size}px`,
        width: 'auto',
      }}
    />
  </div>
))}
      {/* Connection status indicator */}
      <div style={{
        position: 'fixed',
        top: '70px',
        right: '10px',
        background: '#222',
        color: isConnected ? '#00ff88' : '#ff4466',
        padding: '4px 8px',
        borderRadius: '4px',
        fontSize: '12px',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        gap: '6px'
      }}>
        <span style={{ 
          display: 'inline-block',
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          background: isConnected ? '#00ff88' : '#ff4466',
        }}></span>
        {isConnected ? 'Live Data' : 'Static Data'}
      </div>
      
      {/* Hero Section with Crown Logo */}
      <section className="hero-section">
        <div className="hero-logo">
          <img src={jungleCrown} alt="Jungle Crown Logo" style={{ height: '80px', marginBottom: '15px' }} />
        </div>
        <h1>Welcome to KOA</h1>
        <p>Built by a team of trench degens, for trench degens!</p>
        <div className="hero-buttons">
          <Link to="/deploy-token">
            Deploy A Token
          </Link>
          <Link to="/dashboard">
            Explore Tokens
          </Link>
        </div>
      </section>

      {/* Stats Section with Meditating Monkey */}
      <section className="stats-section">
        <div className="stat-box">
          <h3>24h Total Volume</h3>
          <p>
            {loading ? '...' : stats.totalVolume === 0 ? 'N/A' : `$${formatNumber(stats.totalVolume)}`}
          </p>
        </div>
        <div className="stat-monkey">
          <img src={meditatingMonkey} alt="Meditating monkey" style={{ height: '150px', margin: '-20px 0' }} />
        </div>
        <div className="stat-box">
          <h3>Total Market Cap</h3>
          <p>
            {loading ? '...' : `$${formatNumber(stats.totalMarketCap)}`}
          </p>
        </div>
      </section>

      {/* Featured Token Section with King Monkey */}
      <section className="featured-token-section">
        <div className="featured-header">
          <h2>Featured Token</h2>
          <img src={kingMonkey} alt="King Monkey" style={{ height: '60px', marginLeft: '10px' }} />
        </div>
        
        {loading ? (
          <div className="loading-text">Loading featured token...</div>
        ) : featuredToken ? (
          <div className="featured-token" onClick={() => handleTokenClick(featuredToken.contractAddress)}>
            <div className="token-info">
              <h3>{featuredToken.name} ({featuredToken.symbol})</h3>
              <div>
                <p>
                  <strong>Price:</strong> ${formatNumber(featuredToken.price_usd)}
                </p>
                <p>
                  <strong>Market Cap:</strong> ${formatNumber(featuredToken.market_cap_usd)}
                </p>
                <p>
                  <strong>24h Volume:</strong> {featuredToken.volume_usd_24h ? `$${formatNumber(featuredToken.volume_usd_24h)}` : 'N/A'}
                </p>
              </div>
              <p className="contract-address">
                Contract: {featuredToken.contractAddress}
              </p>
            </div>
            <button>
              View Token
            </button>
          </div>
        ) : (
          <div className="loading-text">No featured token available</div>
        )}
      </section>

      {/* Top Tokens Section */}
      <section className="top-tokens-section">
        <div className="top-tokens-header">
          <img src={thronedMonkey} alt="Throned Monkey" style={{ height: '70px', marginRight: '15px' }} />
          <h2>Top Tokens</h2>
        </div>
        
        {loading ? (
          <div className="loading-text">Loading top tokens...</div>
        ) : (
          <div className="tokens-list">
            <div className="tokens-header">
              <div>#</div>
              <div>Name</div>
              <div>Price</div>
              <div>Market Cap</div>
              <div>Volume (24h)</div>
            </div>
            
            {topTokens.map((token, index) => (
              <div 
                key={token.contractAddress} 
                className="token-row" 
                onClick={() => handleTokenClick(token.contractAddress)}
              >
                <div>{index + 1}</div>
                <div>{token.name} <span>({token.symbol})</span></div>
                <div>${formatNumber(token.price_usd)}</div>
                <div>${formatNumber(token.market_cap_usd)}</div>
                <div>{token.volume_usd_24h ? `$${formatNumber(token.volume_usd_24h)}` : 'N/A'}</div>
              </div>
            ))}
            
            <div className="view-all">
              <Link to="/dashboard">
                View All Tokens
              </Link>
            </div>
          </div>
        )}
      </section>

      {/* How It Works Section */}
      <section className="how-it-works">
        <h2>How It Works</h2>
        
        <div className="steps">
          <div className="step">
            <div className="step-number">1</div>
            <h3>Deploy Your Token</h3>
            <p>
              Create your own token with just a few clicks on Telegram, Twitter or right here on the website. Customize name, symbol, and initial parameters.
            </p>
          </div>
          
          <div className="step">
            <div className="step-number">2</div>
            <h3>Trade & Monitor</h3>
            <p>
              Buy and sell tokens directly from our platform. Track performance, market cap, and trading volume in real-time.
            </p>
          </div>
          
          <div className="step">
            <div className="step-number">3</div>
            <h3>Grow Your Community</h3>
            <p>
              Conquer the jungle and build a community. Add custom images, information, and track analytics.
            </p>
          </div>
        </div>
      </section>

      {/* Call To Action */}
      <section className="cta-section">
        <h2>Ready to Launch Your Own Token?</h2>
        <p>
          Join the Base Jungle and create your own token in minutes. Reach out to the team on Telegram or Twitter for project support!
        </p>
        <Link to="/deploy-token">
          Deploy Token Now
        </Link>
        <div className="cta-image">
          <img src={kingMonkey} alt="King Monkey" style={{ height: '80px', marginTop: '20px' }} />
        </div>
      </section>
      <MusicPlayer />
    </div>
  );
}

export default Home;
