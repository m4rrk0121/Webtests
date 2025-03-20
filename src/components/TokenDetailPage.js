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
  const [poolAddress, setPoolAddress] = useState(null);
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
        
        // Check if the response contains the main pool address
        if (response.data.main_pool_address) {
          setPoolAddress(response.data.main_pool_address);
        } else {
          // If no main pool address is available, fallback to the token contract address
          setPoolAddress(contractAddress);
        }
        
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

  // Use the poolAddress (from MongoDB) for the DexScreener embed URL
  const dexScreenerEmbedUrl = `https://dexscreener.com/base/${poolAddress}?embed=1&loadChartSettings=0&trades=0&tabs=0&info=0&chartLeftToolbar=0&chartDefaultOnMobile=1&chartTheme=dark&theme=light&chartStyle=0&chartType=usd&interval=15`;
  
  // Log the URL for debugging
  console.log("DexScreener URL:", dexScreenerEmbedUrl);

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
          <style>
            {`
              #dexscreener-embed {
                position: relative;
                width: 100%;
                padding-bottom: 125%;
              }
              @media(min-width:1400px) {
                #dexscreener-embed {
                  padding-bottom: 70%;
                }
              }
              #dexscreener-embed iframe {
                position: absolute;
                width: 100%;
                height: 100%;
                top: 0;
                left: 0;
                border: 0;
              }
            `}
          </style>
          <div id="dexscreener-embed">
            <iframe 
              src={dexScreenerEmbedUrl}
            ></iframe>
          </div>
        </div>
      </div>
    </>
  );
}

export default TokenDetailPage;