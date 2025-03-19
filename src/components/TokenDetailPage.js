import axios from 'axios';
import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Add this effect to apply the black background to the page
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

  useEffect(() => {
    const fetchTokenDetails = async () => {
      try {
        const response = await axios.get(`https://website-4g84.onrender.com/api/tokens/${contractAddress}`);
        setTokenDetails(response.data);
        setLoading(false);
      } catch (err) {
        setError('Failed to fetch token details');
        setLoading(false);
      }
    };

    fetchTokenDetails();
  }, [contractAddress]);

  // Wrap the loading, error, and empty states to include the background div
  if (loading) return (
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
      <div>Loading...</div>
    </>
  );
  
  if (error) return (
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
      <div>{error}</div>
    </>
  );
  
  if (!tokenDetails) return (
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
      <div>No token details found</div>
    </>
  );

  const geckoTerminalEmbedUrl = `https://www.geckoterminal.com/base/pools/${contractAddress}?embed=1&info=0&swaps=1&grayscale=0&light_chart=0&chart_type=price&resolution=15m`;

  // Add the background div to the main return statement
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
      
      <div className="token-detail-page">
        <div className="token-detail-header">
          <button 
            onClick={() => window.history.back()} 
            className="back-button"
          >
            ← Back
          </button>
          <h1>{tokenDetails.name} ({tokenDetails.symbol})</h1>
          <div className="token-details-summary">
            <p>Price: {formatCurrency(tokenDetails.price_usd)}</p>
            <p>Market Cap: {formatCurrency(tokenDetails.fdv_usd)}</p>
            <p>24h Volume: {formatCurrency(tokenDetails.volume_usd)}</p>
            <p>Contract: {tokenDetails.contractAddress}</p>
          </div>
        </div>
        <div className="token-chart-container">
          <iframe 
            height="100%" 
            width="100%" 
            id="geckoterminal-embed" 
            title="GeckoTerminal Embed" 
            src={geckoTerminalEmbedUrl} 
            frameBorder="0" 
            allow="clipboard-write" 
            allowFullScreen
          ></iframe>
        </div>
      </div>
    </>
  );
}

export default TokenDetailPage;