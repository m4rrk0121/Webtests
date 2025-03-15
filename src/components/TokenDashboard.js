import axios from 'axios';
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

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
      <small>Contract: {token.contractAddress}</small>
    </div>
  );
}

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

  const fetchGlobalTopTokens = useCallback(async () => {
    try {
      const response = await axios.get('https://website-4g84.onrender.com/api/global-top-tokens');
      
      setHighestMarketCapToken(response.data.topMarketCapToken);
      setHighestVolumeToken(response.data.topVolumeToken);
    } catch (err) {
      console.error('Failed to fetch global top tokens', err);
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

  useEffect(() => {
    fetchGlobalTopTokens();
    fetchTokens(sortField, sortDirection, currentPage);
  }, [fetchGlobalTopTokens, fetchTokens, sortField, sortDirection, currentPage]);

  const handlePageChange = (newPage) => {
    if (newPage > 0 && newPage <= totalPages) {
      setCurrentPage(newPage);
    }
  };

  return (
    <div className="token-dashboard">
      <h1>KOA Dashboard</h1>
      
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

      {/* Top Tokens Section */}
      {highestMarketCapToken && highestVolumeToken && (
        <div className="top-tokens-section">
          <div className="top-tokens-titles">
            <h2 className="top-token-title">King Of Value</h2>
            <h2 className="top-token-title">King Of Volume</h2>
          </div>
          <div className="top-tokens-grid">
            <TokenCard token={highestMarketCapToken} highlight={true} />
            <TokenCard token={highestVolumeToken} highlight={true} />
          </div>
        </div>
      )}

      {loading && tokens.length > 0 ? (
        <div className="loading-overlay">
          <div className="loading-spinner"></div>
        </div>
      ) : null}

      {loading ? (
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

          {/* Pagination Controls */}
          <div className="pagination-controls">
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
        </>
      )}
    </div>
  );
}

export default TokenDashboard;