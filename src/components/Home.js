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
    document.body.classList.add('on-homepage');
    return () => {
      document.body.classList.remove('on-homepage');
    };
  }, []);

  // WebSocket connection and event listeners setup
  useEffect(() => {
    if (isConnected) {
      console.log("[Home] WebSocket is connected, setting up event listeners");
      setLoading(true);
      setDataSource('websocket');
      
      // Define handlers once and store in ref
      if (!handlersRef.current.tokensListUpdate) {
        // Handler for token list updates (just for display)
        handlersRef.current.tokensListUpdate = (data) => {
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
        handlersRef.current.globalStatsUpdate = (statsData) => {
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
        handlersRef.current.tokenUpdate = (updatedToken) => {
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
        handlersRef.current.error = (errorData) => {
          console.error('[Home] WebSocket error:', errorData);
          fallbackToHttpPolling();
        };
      }
      
      // Register all event listeners
      addListener('tokens-list-update', handlersRef.current.tokensListUpdate);
      addListener('token-update', handlersRef.current.tokenUpdate);
      addListener('global-stats-update', handlersRef.current.globalStatsUpdate);
      addListener('error', handlersRef.current.error);
      
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
        removeListener('tokens-list-update', handlersRef.current.tokensListUpdate);
        removeListener('token-update', handlersRef.current.tokenUpdate);
        removeListener('global-stats-update', handlersRef.current.globalStatsUpdate);
        removeListener('error', handlersRef.current.error);
      };
    } else {
      console.log("[Home] WebSocket not connected, falling back to HTTP");
      fallbackToHttpPolling();
    }
  }, [isConnected, addListener, removeListener, emit]); // Removed featuredToken from dependencies

  // Fallback to HTTP polling when WebSocket isn't available
  const fallbackToHttpPolling = useCallback(() => {
    console.log("[Home] Falling back to HTTP polling");
    setDataSource('http');
    
    const fetchData = async () => {
      try {
        setLoading(true);
        
        // Fetch top tokens for display
        const tokensResponse = await axios.get('https://website-4g84.onrender.com/api/tokens', {
          params: {
            sort: 'marketCap',
            direction: 'desc',
            page: 1
          }
        });
        
        // Fetch global statistics separately
        const statsResponse = await axios.get('https://website-4g84.onrender.com/api/global-stats');
        
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
    
    const decimals = isPrice ? 6 : 2; // Use 6 decimal places for price, 2 for others
    
    if (num >= 1000000000) {
      return `$${(num / 1000000000).toFixed(decimals)}B`;
    } else if (num >= 1000000) {
      return `$${(num / 1000000).toFixed(decimals)}M`;
    } else if (num >= 1000) {
      return `$${(num / 1000).toFixed(decimals)}K`;
    }
    
    return `$${num.toFixed(decimals)}`;
  };

  const handleTokenClick = (contractAddress) => {
    navigate(`/token/${contractAddress}`);
  };

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
        <p>Your premier destination for Base network tokens</p>
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
            {loading ? '...' : formatCurrency(stats.totalVolume)}
          </p>
        </div>
        <div className="stat-monkey">
          <img src={meditatingMonkey} alt="Meditating monkey" style={{ height: '150px', margin: '-20px 0' }} />
        </div>
        <div className="stat-box">
          <h3>Total Market Cap</h3>
          <p>
            {loading ? '...' : formatCurrency(stats.totalMarketCap)}
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
                  <strong>Price:</strong> {formatCurrency(featuredToken.price_usd, true)}
                </p>
                <p>
                  <strong>Market Cap:</strong> {formatCurrency(featuredToken.fdv_usd)}
                </p>
                <p>
                  <strong>24h Volume:</strong> {formatCurrency(featuredToken.volume_usd)}
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
                <div>{formatCurrency(token.price_usd,true)}</div>
                <div>{formatCurrency(token.fdv_usd)}</div>
                <div>{formatCurrency(token.volume_usd)}</div>
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
              Create your own token on Base network with just a few clicks. Customize name, symbol, and initial parameters.
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
          Join the Base Jungle and create your own token in minutes with our simple deployment tool.
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