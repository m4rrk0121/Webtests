import axios from 'axios';
import { ethers } from 'ethers';
import React, { useEffect, useRef, useState } from 'react';

// Safety check for wallet providers
const checkProviderSafety = async (provider) => {
  try {
    // Check for suspicious provider properties
    const suspiciousProps = ['_handleAccountsChanged', '_handleConnect', '_handleChainChanged']
      .filter(prop => typeof provider[prop] !== 'function');
    
    if (suspiciousProps.length > 0) {
      console.warn('Potentially unsafe provider detected: Missing standard methods');
      return false;
    }
    
    // Verify chainId is accessible and returns a valid response
    const chainId = await provider.request({ method: 'eth_chainId' });
    if (!chainId || typeof chainId !== 'string' || !chainId.startsWith('0x')) {
      console.warn('Potentially unsafe provider detected: Invalid chainId response');
      return false;
    }
    
    // Check if the provider follows EIP-1193 standard
    if (typeof provider.request !== 'function' || 
        typeof provider.on !== 'function') {
      console.warn('Potentially unsafe provider: Not EIP-1193 compliant');
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error checking provider safety:', error);
    return false;
  }
};

// Basic ERC20 ABI for name and symbol
const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)"
];

// Fee recipient address
const FEE_RECIPIENT = "0xe33Be189B01388D8224f4b1933e085868d7Cb6db";

// Payment amount
const PAYMENT_AMOUNT = ethers.parseEther("0.01");

// Valid image URL patterns for validation
const VALID_IMAGE_PATTERNS = [
  /^https?:\/\/.*\.(jpg|jpeg|png|gif|webp)$/i,
  /^https:\/\/i\.ibb\.co\/\w+\/.+$/,
  /^https:\/\/ibb\.co\/\w+$/,
  /^https:\/\/i\.postimg\.cc\/.*\.(jpg|jpeg|png|gif|webp)$/i
];

function UpdateTokenInfo() {
  // Wallet connection state
  const [wallet, setWallet] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState('');
  
  // Form state
  const [contractAddress, setContractAddress] = useState('');
  const [tokenName, setTokenName] = useState('');
  const [tokenSymbol, setTokenSymbol] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [imagePreview, setImagePreview] = useState(null);
  const [isFetchingTokenInfo, setIsFetchingTokenInfo] = useState(false);
  const [isValidatingImage, setIsValidatingImage] = useState(false);
  
  // Transaction state
  const [isProcessing, setIsProcessing] = useState(false);
  const [txHash, setTxHash] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [success, setSuccess] = useState(false);
  
  // Refs
  const contractAddressTimeoutRef = useRef(null);
  const imageUrlTimeoutRef = useRef(null);

  // Connect wallet
  const connectWallet = async () => {
    if (!window.ethereum) {
      setError('No Ethereum wallet detected. Please install MetaMask or another wallet.');
      return;
    }

    try {
      setIsConnecting(true);
      setError('');
      
      // Check provider safety
      const isProviderSafe = await checkProviderSafety(window.ethereum);
      if (!isProviderSafe) {
        setError('Potentially unsafe wallet provider detected. Please verify your wallet extension.');
        setIsConnecting(false);
        return;
      }
      
      // Request account access
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      
      // Validate account format
      if (!accounts || !accounts.length || !ethers.isAddress(accounts[0])) {
        setError('Invalid account format received from wallet.');
        setIsConnecting(false);
        return;
      }
      
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const chainId = await provider.getNetwork();
      
      const walletInfo = {
        address: accounts[0],
        chainId: chainId.chainId,
        signer: signer,
        provider: provider
      };
      
      setWallet(walletInfo);
      setIsConnecting(false);
    } catch (err) {
      setError('Failed to connect wallet: ' + err.message);
      setIsConnecting(false);
    }
  };

  // Disconnect wallet
  const disconnectWallet = () => {
    setWallet(null);
    setTxHash('');
    setSuccess(false);
    setTokenName('');
    setTokenSymbol('');
    setImageUrl('');
    setImagePreview(null);
  };

  // Fetch token information
  const fetchTokenInfo = async (address) => {
    if (!wallet || !wallet.provider || !ethers.isAddress(address)) return;
    
    try {
      setIsFetchingTokenInfo(true);
      setError('');
      
      // Create a contract instance
      const contract = new ethers.Contract(
        address,
        ERC20_ABI,
        wallet.provider
      );
      
      // Try to get token name and symbol
      const name = await contract.name();
      const symbol = await contract.symbol();
      
      setTokenName(name);
      setTokenSymbol(symbol);
      setIsFetchingTokenInfo(false);
    } catch (err) {
      console.error('Error fetching token info:', err);
      setTokenName('');
      setTokenSymbol('');
      setIsFetchingTokenInfo(false);
      setError('Could not fetch token information. Please check the contract address.');
    }
  };

  // Validate image URL
  const validateImageUrl = async (url) => {
    setIsValidatingImage(true);
    setImagePreview(null);
    
    // Basic URL pattern validation
    const isValidFormat = VALID_IMAGE_PATTERNS.some(pattern => pattern.test(url));
    
    if (!isValidFormat) {
      // Remove the ImgBB-specific error message
      setError('Please enter a valid image URL');
      setIsValidatingImage(false);
      return false;
    }
    
    // Try to load the image
    try {
      const img = new Image();
      img.onload = () => {
        // Additional size check
        if (img.width > 0 && img.height > 0) {
          setImagePreview(url);
          setError('');
        } else {
          setError('Invalid image dimensions');
        }
        setIsValidatingImage(false);
      };
      
      img.onerror = () => {
        setError('Cannot load the image from the provided URL. Please check the link.');
        setImagePreview(null);
        setIsValidatingImage(false);
      };
      
      img.src = url;
      return true;
    } catch (err) {
      setError('Error validating image URL: ' + err.message);
      setIsValidatingImage(false);
      return false;
    }
  };

  // Handle contract address change with debounce
  const handleContractAddressChange = (e) => {
    const address = e.target.value;
    setContractAddress(address);
    
    // Clear existing timeout
    if (contractAddressTimeoutRef.current) {
      clearTimeout(contractAddressTimeoutRef.current);
    }
    
    // Only fetch if the address looks valid
    if (address.length === 42 && address.startsWith('0x')) {
      // Set a new timeout
      contractAddressTimeoutRef.current = setTimeout(() => {
        fetchTokenInfo(address);
      }, 500); // 500ms debounce
    } else {
      setTokenName('');
      setTokenSymbol('');
    }
  };

  // Handle image URL change with debounce
  const handleImageUrlChange = (e) => {
    const url = e.target.value;
    setImageUrl(url);
    
    // Clear existing timeout
    if (imageUrlTimeoutRef.current) {
      clearTimeout(imageUrlTimeoutRef.current);
    }
    
    // Only validate if URL is not empty
    if (url.trim() !== '') {
      // Set a new timeout
      imageUrlTimeoutRef.current = setTimeout(() => {
        validateImageUrl(url);
      }, 1000); // 1000ms debounce
    } else {
      setImagePreview(null);
    }
  };

  // Clear timeout on unmount
  useEffect(() => {
    return () => {
      if (contractAddressTimeoutRef.current) {
        clearTimeout(contractAddressTimeoutRef.current);
      }
      if (imageUrlTimeoutRef.current) {
        clearTimeout(imageUrlTimeoutRef.current);
      }
    };
  }, []);

  // Process payment and submit token info
  const submitTokenInfo = async () => {
    // Validate inputs
    if (!contractAddress || !ethers.isAddress(contractAddress)) {
      setError('Please enter a valid contract address');
      return;
    }

    // Ensure image URL is provided
    if (!imageUrl) {
      setError('Please provide an image URL');
      return;
    }

    try {
      setIsProcessing(true);
      setError('');

      // Send ETH payment to fee recipient
      const tx = await wallet.signer.sendTransaction({
        to: FEE_RECIPIENT,
        value: PAYMENT_AMOUNT
      });

      setTxHash(tx.hash);

      // Wait for transaction to be mined
      await tx.wait();

      // Transaction successful, now upload the data
      setIsUploading(true);

      // Create data for the API request
      const tokenData = {
        contractAddress: contractAddress,
        imageUrl: imageUrl,
        paymentTxHash: tx.hash,
        tokenName: tokenName || '',
        tokenSymbol: tokenSymbol || ''
      };

      // Send to your token server
      await axios.post('https://website-4g84.onrender.com/api/update-token-info-url', tokenData);

      setSuccess(true);
      setIsUploading(false);
      setIsProcessing(false);
    } catch (err) {
      console.error('Error:', err);
      setError(err.response?.data?.message || err.message || 'Transaction failed');
      setIsProcessing(false);
      setIsUploading(false);
    }
  };

  return (
    <div className="contract-interaction">
      <h1>Update Token Info</h1>
      
      <div className="wallet-connection">
        {!wallet ? (
          <button 
            onClick={connectWallet} 
            disabled={isConnecting}
            className="connect-button"
          >
            {isConnecting ? 'Connecting...' : 'Connect Wallet'}
          </button>
        ) : (
          <div className="wallet-info">
            <span>Connected: {wallet.address.substring(0, 6)}...{wallet.address.substring(38)}</span>
            <button onClick={disconnectWallet} className="disconnect-button">Disconnect</button>
          </div>
        )}
      </div>

      {wallet ? (
        <div className="contract-form-container">
          <h3>Upload Token Image</h3>
          <p>
            Update your token's image by providing a direct image URL.
            This requires a one-time payment of 0.01 ETH.
          </p>
          
          <div className="info-message" style={{ backgroundColor: '#1a1a1a', marginBottom: '20px', padding: '15px', borderRadius: '6px', border: '1px solid #333' }}>
            <h4 style={{ marginTop: '5px', color: '#ffb300' }}>How to upload your token image:</h4>
            <ol style={{ marginBottom: '5px', paddingLeft: '20px', color: '#ffb300' }}>
              <li>Prepare a <strong>200×200 pixel</strong> image of your token</li>
              <li>Upload the image to a hosting service like:
                <ul>
                  <li>ImgBB (https://imgbb.com/)</li>
                  <li>PostImg (https://postimg.cc/)</li>
                </ul>
              </li>
              <li>Copy the <strong>direct image URL</strong></li>
            </ol>
          </div>
          
          <div className="form-group">
            <label htmlFor="contractAddress">Token Contract Address:</label>
            <input
              id="contractAddress"
              type="text"
              value={contractAddress}
              onChange={handleContractAddressChange}
              placeholder="0x..."
              disabled={isProcessing || success}
              required
            />
            <small>Enter the contract address of your token</small>
          </div>
          
          {isFetchingTokenInfo && (
            <div className="info-message" style={{ backgroundColor: '#1a1a1a', padding: '10px', borderRadius: '6px', marginTop: '10px', color: '#ffb300' }}>
              Fetching token information...
            </div>
          )}
          
          {tokenName && (
            <div className="token-allocation-info" style={{ marginBottom: '20px', backgroundColor: '#1a1a1a', padding: '15px', borderRadius: '6px', border: '1px solid #333' }}>
              <h4 style={{ color: '#ffb300' }}>Token Information</h4>
              <p style={{ color: '#ffb300' }}>• Name: {tokenName}</p>
              <p style={{ color: '#ffb300' }}>• Symbol: {tokenSymbol}</p>
            </div>
          )}
          
          <div className="form-group">
            <label htmlFor="imageUrl">Token Image URL:</label>
            <input
              id="imageUrl"
              type="text"
              value={imageUrl}
              onChange={handleImageUrlChange}
              placeholder="https://i.postimg.cc/PfQB4qyW/example-token.png"
              disabled={isProcessing || success || isValidatingImage}
              required
            />
            <small>Enter a direct image URL (jpg, jpeg, png, gif, webp)</small>
          </div>
          
          {isValidatingImage && (
            <div className="info-message" style={{ backgroundColor: '#1a1a1a', padding: '10px', borderRadius: '6px', marginTop: '10px', color: '#ffb300' }}>
              Validating image URL...
            </div>
          )}
          
          {imagePreview && (
            <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'center' }}>
              <div style={{ position: 'relative', maxWidth: '200px', border: '2px solid #ffb300', borderRadius: '8px', padding: '10px', backgroundColor: '#1a1a1a' }}>
                <img 
                  src={imagePreview} 
                  alt="Token preview" 
                  style={{ maxWidth: '180px', maxHeight: '180px', objectFit: 'contain' }}
                />
                <p style={{ textAlign: 'center', marginTop: '10px', fontSize: '0.9rem', color: '#ffb300' }}>Image Preview</p>
              </div>
            </div>
          )}
          
          <div className="token-allocation-info" style={{ backgroundColor: '#1a1a1a', padding: '15px', borderRadius: '6px', border: '1px solid #333' }}>
            <h4 style={{ color: '#ffb300' }}>Payment Details</h4>
            <p style={{ color: '#ffb300' }}>• Fee: 0.01 ETH</p>
            <p style={{ color: '#ffb300' }}>• Recipient: {FEE_RECIPIENT.substring(0, 6)}...{FEE_RECIPIENT.substring(38)}</p>
          </div>
          
          <button
            onClick={submitTokenInfo}
            disabled={
              isProcessing || 
              isUploading || 
              !contractAddress ||
              !imageUrl || 
              success || 
              !tokenName || 
              isValidatingImage
            }
            className="execute-button"
            style={{ marginTop: '20px' }}
          >
            {isProcessing 
              ? 'Processing Payment...' 
              : isUploading 
                ? 'Updating Token Info...' 
                : success 
                  ? 'Completed ✓' 
                  : 'Pay Fee & Submit'}
          </button>
          
          {!tokenName && contractAddress && !isFetchingTokenInfo && !error && (
            <div className="info-message" style={{ marginTop: '10px', backgroundColor: '#1a1a1a', padding: '10px', borderRadius: '6px', color: '#ffb300' }}>
              No token information found for this address. Please verify it's a valid token contract.
            </div>
          )}

          {error && (
            <div className="error-message">
              {error}
            </div>
          )}
          
          {txHash && (
            <div className="tx-hash">
              Payment transaction hash: {txHash}
              <a 
                href={`https://basescan.org/tx/${txHash}`} 
                target="_blank" 
                rel="noopener noreferrer"
                className="explorer-link"
                style={{ marginLeft: '10px', color: '#ffb300', textDecoration: 'underline' }}
              >
                View on BaseScan
              </a>
            </div>
          )}
          
          {success && (
            <div className="success-message" style={{ marginTop: '20px' }}>
              <h4>Token Information Updated Successfully!</h4>
              <p>Your token image has been updated. It may take a few minutes to appear on the website.</p>
            </div>
          )}

          <div className="connection-info">
            <p>Connected to chain ID: {wallet.chainId.toString()}</p>
            <p>Connected address: {wallet.address}</p>
          </div>
        </div>
      ) : (
        <div className="connect-prompt">
          <p>Please connect your wallet to update token information</p>
        </div>
      )}
    </div>
  );
}

export default UpdateTokenInfo;