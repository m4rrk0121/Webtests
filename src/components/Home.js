// src/components/Home.js
import axios from 'axios';
import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

// Import images directly
import meditatingMonkey from '../images/7.png';
import kingMonkey from '../images/background2.png';
import thronedMonkey from '../images/jungle-background.png';
import jungleCrown from '../images/logo.png';

function Home() {
  const navigate = useNavigate();
  const [topTokens, setTopTokens] = useState([]);
  const [featuredToken, setFeaturedToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ totalTokens: 0, totalVolume: 0, totalMarketCap: 0 });

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        // Fetch top tokens
        const tokensResponse = await axios.get('https://website-4g84.onrender.com/api/tokens', {
          params: {
            sort: 'marketCap',
            direction: 'desc',
            page: 1
          }
        });
        
        // Fetch global stats (this is a placeholder - adjust the endpoint as needed)
        // New code that still makes the API call but doesn't store the unused result
await axios.get('https://website-4g84.onrender.com/api/global-top-tokens');
        
        if (tokensResponse.data && tokensResponse.data.tokens) {
          setTopTokens(tokensResponse.data.tokens.slice(0, 5)); // Get top 5 tokens
          setFeaturedToken(tokensResponse.data.tokens[0]); // Set the highest market cap token as featured
        }
        
        // Calculate some basic stats
        if (tokensResponse.data && tokensResponse.data.tokens) {
          const tokens = tokensResponse.data.tokens;
          const totalMarketCap = tokens.reduce((sum, token) => sum + (token.fdv_usd || 0), 0);
          const totalVolume = tokens.reduce((sum, token) => sum + (token.volume_usd || 0), 0);
          
          setStats({
            totalTokens: tokensResponse.data.totalTokens || tokens.length,
            totalVolume: totalVolume,
            totalMarketCap: totalMarketCap
          });
        }
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const formatCurrency = (value) => {
    if (value === null || value === undefined) return 'N/A';
    
    const num = parseFloat(value);
    if (isNaN(num)) return 'N/A';
    
    if (num >= 1000000000) {
      return `$${(num / 1000000000).toFixed(2)}B`;
    } else if (num >= 1000000) {
      return `$${(num / 1000000).toFixed(2)}M`;
    } else if (num >= 1000) {
      return `$${(num / 1000).toFixed(2)}K`;
    }
    
    return `$${num.toFixed(2)}`;
  };

  const handleTokenClick = (contractAddress) => {
    navigate(`/token/${contractAddress}`);
  };

  return (
    <div className="homepage">
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
          <h3>Total Volume</h3>
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
                  <strong>Price:</strong> {formatCurrency(featuredToken.price_usd)}
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
                <div>{formatCurrency(token.price_usd)}</div>
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
    </div>
  );
}

export default Home;