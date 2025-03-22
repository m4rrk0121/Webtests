import axios from 'axios';
import { ethers } from 'ethers';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useWebSocket } from '../context/WebSocketContext';
import './modal.css'; // Reuse the modal CSS we created earlier

// Constants
const WETH_ADDRESS = "0x4200000000000000000000000000000000000006"; // WETH on Base
const UNISWAP_ROUTER = "0x2626664c2603336E57B271c5C0b26F421741e481"; // Correct Uniswap V3 Router on Base
const FEE_TIER = 10000; // Fixed 1% fee tier

// Simple ERC20 ABI for token balance and approval
const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function approve(address spender, uint256 amount) returns (bool)"
];

// Uniswap V3 Router ABI
const SWAP_ROUTER_ABI = [
  {
    "inputs": [
      {
        "components": [
          {
            "internalType": "address",
            "name": "tokenIn",
            "type": "address"
          },
          {
            "internalType": "address",
            "name": "tokenOut",
            "type": "address"
          },
          {
            "internalType": "uint24",
            "name": "fee",
            "type": "uint24"
          },
          {
            "internalType": "address",
            "name": "recipient",
            "type": "address"
          },
          {
            "internalType": "uint256",
            "name": "amountIn",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "amountOutMinimum",
            "type": "uint256"
          },
          {
            "internalType": "uint160",
            "name": "sqrtPriceLimitX96",
            "type": "uint160"
          }
        ],
        "internalType": "struct ISwapRouter.ExactInputSingleParams",
        "name": "params",
        "type": "tuple"
      }
    ],
    "name": "exactInputSingle",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "amountOut",
        "type": "uint256"
      }
    ],
    "stateMutability": "payable",
    "type": "function"
  }
];

// Generate shill text for the token
function generateShillText(tokenName, tokenSymbol, contractAddress, ethAmount) {
  const formattedAmount = parseFloat(ethAmount || "0.1").toFixed(3);
  
  const shillTexts = [
    `🚀 Just aped ${formattedAmount} ETH into ${tokenName} (${tokenSymbol}) on Base! This gem is going to explode soon! Check it out: https://basescan.org/address/${contractAddress} #Base #DeFi #${tokenSymbol}`,
    
    `💎 I'm bullish on ${tokenSymbol}! Just bought ${formattedAmount} ETH worth on Base. Early gem with huge potential! https://basescan.org/address/${contractAddress} #Crypto #Base #${tokenSymbol}`,
    
    `🔥 Just picked up some ${tokenSymbol} on Base (${formattedAmount} ETH) and I'm feeling super bullish! Don't miss this opportunity! https://basescan.org/address/${contractAddress} #BaseChain #${tokenSymbol} #CryptoGems`,
    
    `⚡️ APE ALERT: Just bought ${tokenName} (${tokenSymbol}) on Base with ${formattedAmount} ETH! Who's with me? https://basescan.org/address/${contractAddress} #BaseGems #${tokenSymbol} #100x`
  ];
  
  // Randomly select one of the shill texts
  return shillTexts[Math.floor(Math.random() * shillTexts.length)];
}

// Utility function for robust data caching
const createDataCache = () => {
  const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

  return {
    set: (key, data) => {
      try {
        const cacheItem = {
          data,
          timestamp: Date.now(),
          expiresAt: Date.now() + CACHE_DURATION
        };
        
        // Use localStorage for persistent caching
        localStorage.setItem(`token_${key}`, JSON.stringify(cacheItem));
      } catch (err) {
        console.warn('Failed to cache token data:', err);
      }
    },
    get: (key) => {
      try {
        // Get cached item from localStorage
        const cachedItem = localStorage.getItem(`token_${key}`);
        
        if (!cachedItem) return null;
        
        const { data, expiresAt } = JSON.parse(cachedItem);
        
        // Check if cache is still valid
        if (Date.now() < expiresAt) {
          return data;
        }
        
        // Remove expired cache
        localStorage.removeItem(`token_${key}`);
        return null;
      } catch (err) {
        console.warn('Failed to retrieve cached token data:', err);
        return null;
      }
    }
  };
};

// Check provider safety
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

// Currency formatting utility
const formatCurrency = (value) => {
  if (value === null || value === undefined) return 'N/A';
  
  const num = parseFloat(value);
  if (isNaN(num)) return 'N/A';
  
  // Handle large numbers with abbreviated notation
  const abbreviations = [
    { value: 1e9, symbol: 'B' },
    { value: 1e6, symbol: 'M' },
    { value: 1e3, symbol: 'K' }
  ];

  for (let abbr of abbreviations) {
    if (num >= abbr.value) {
      return `$${(num / abbr.value).toFixed(2)}${abbr.symbol}`;
    }
  }
  
  // Precise formatting for smaller values
  return num >= 1 
    ? `$${num.toFixed(2)}` 
    : num >= 0.01 
      ? `$${num.toFixed(4)}` 
      : `$${num.toFixed(8)}`;
};

function TokenDetailPage() {
  const { contractAddress } = useParams();
  const navigate = useNavigate();
  const dataCache = useRef(createDataCache());
  
  // Get the WebSocket context
  const { isConnected, emit, addListener, removeListener, reconnect } = useWebSocket();

  // State management
  const [tokenDetails, setTokenDetails] = useState(null);
  const [poolAddress, setPoolAddress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dataSource, setDataSource] = useState(null);
  const [fetchAttempted, setFetchAttempted] = useState(false);
  
  // Wallet connection state
  const [wallet, setWallet] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState('');
  
  // Token balance
  const [tokenBalance, setTokenBalance] = useState(null);
  const [tokenDecimals, setTokenDecimals] = useState(18);
  
  // Trade state
  const [tradeMode, setTradeMode] = useState('buy'); // 'buy' or 'sell'
  const [ethAmount, setEthAmount] = useState('');
  const [tokenAmount, setTokenAmount] = useState('');
  const [isTrading, setIsTrading] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [transactionHash, setTransactionHash] = useState('');
  const [tradeSuccess, setTradeSuccess] = useState(false);
  const [tradeError, setTradeError] = useState('');
  const [slippage, setSlippage] = useState(2); // Default 2% slippage for 1% fee pool

  // Shill modal state
  const [showShillModal, setShowShillModal] = useState(false);
  const [shillText, setShillText] = useState('');
  
  // Refs for managing data loading
  const isMounted = useRef(true);
  const tokenDetailHandler = useRef(null);
  const tokenUpdateHandler = useRef(null);
  const errorHandler = useRef(null);
  const refreshPage = useRef(window.performance?.navigation?.type === 1 || 
                            document.referrer === "" || 
                            !document.referrer.includes(window.location.host));

  // Fetch token data via HTTP as fallback
  const fetchTokenDataHttp = useCallback(async (address) => {
    try {
      console.log('[TokenDetailPage] Fetching token data via HTTP');
      const response = await axios.get(
        `https://website-4g84.onrender.com/api/tokens/${address}`,
        { timeout: 15000 }
      );
      
      if (response.data) {
        return response.data;
      }
      throw new Error('Empty response');
    } catch (error) {
      console.error('[TokenDetailPage] HTTP fetch failed:', error);
      throw error;
    }
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      isMounted.current = false;
      
      // Clean up any event listeners
      if (tokenDetailHandler.current) {
        removeListener('token-details', tokenDetailHandler.current);
      }
      if (tokenUpdateHandler.current) {
        removeListener('token-details-update', tokenUpdateHandler.current);
      }
      if (errorHandler.current) {
        removeListener('error', errorHandler.current);
      }
    };
  }, [removeListener]);

  // Function to get token data via WebSocket
  const getTokenDataViaWebSocket = useCallback((address) => {
    return new Promise((resolve, reject) => {
      if (!isConnected) {
        reject(new Error('WebSocket not connected'));
        return;
      }
      
      console.log(`[TokenDetailPage] Requesting token details for ${address} via WebSocket`);
      
      // Create and store handlers for cleanup
      tokenDetailHandler.current = (data) => {
        console.log('[TokenDetailPage] Received token details via WebSocket:', data ? data.name : 'no data');
        resolve(data);
      };
      
      errorHandler.current = (errorData) => {
        console.error('[TokenDetailPage] Received error from WebSocket:', errorData);
        reject(new Error(errorData.message || 'Failed to fetch token details'));
      };
      
      // Add event listeners
      addListener('token-details', tokenDetailHandler.current);
      addListener('error', errorHandler.current);
      
      // Send request for token details
      emit('get-token-details', { contractAddress: address });
      
      // Set timeout to prevent hanging
      setTimeout(() => {
        if (tokenDetailHandler.current) {
          removeListener('token-details', tokenDetailHandler.current);
        }
        if (errorHandler.current) {
          removeListener('error', errorHandler.current);
        }
        reject(new Error('WebSocket request timed out'));
      }, 10000);
    });
  }, [isConnected, emit, addListener, removeListener, contractAddress]);

  // Function to refresh token data in background via WebSocket
  const setupLiveUpdates = useCallback((address) => {
    if (!isConnected) return;
    
    console.log(`[TokenDetailPage] Setting up live updates for ${address}`);
    
    // Add listener for real-time updates
    tokenUpdateHandler.current = (updatedToken) => {
      if (updatedToken.contractAddress === address && isMounted.current) {
        console.log('[TokenDetailPage] Received token update via WebSocket');
        setTokenDetails(current => {
          const updated = {...current, ...updatedToken};
          // Update cache
          dataCache.current.set(address, updated);
          return updated;
        });
        setDataSource('websocket');
      }
    };
    
    // Add event listener
    addListener('token-details-update', tokenUpdateHandler.current);
    
    // Request initial data
    emit('get-token-details', { contractAddress: address });
  }, [isConnected, emit, addListener]);

  // Effect for fetching token details
  useEffect(() => {
    let isActive = true;
    
    // Check for valid contract address
    if (!contractAddress) {
      setError('Invalid token address');
      setLoading(false);
      return;
    }
    
    // Reset state for new address
    setLoading(true);
    setError(null);
    setFetchAttempted(false);
    
    const loadTokenData = async () => {
      console.log(`[TokenDetailPage] Starting data load for ${contractAddress}. Refresh: ${refreshPage.current ? 'Yes' : 'No'}`);
      
      try {
        // STEP 1: Try to get data from cache first (fast)
        let tokenData = dataCache.current.get(contractAddress);
        
        if (tokenData) {
          console.log('[TokenDetailPage] Using cached token data');
          if (isActive) {
            setTokenDetails(tokenData);
            setPoolAddress(tokenData.main_pool_address || contractAddress);
            setDataSource('cache');
            setLoading(false);
            setFetchAttempted(true);
          }
        }
        
        // STEP 2: Try to get fresh data from WebSocket (if connected)
        if (isConnected) {
          try {
            console.log('[TokenDetailPage] Fetching fresh data via WebSocket');
            const wsData = await getTokenDataViaWebSocket(contractAddress);
            
            if (wsData && isActive) {
              setTokenDetails(wsData);
              setPoolAddress(wsData.main_pool_address || contractAddress);
              setDataSource('websocket');
              setLoading(false);
              setFetchAttempted(true);
              
              // Update cache
              dataCache.current.set(contractAddress, wsData);
              
              // Set up live updates
              setupLiveUpdates(contractAddress);
              return;
            }
          } catch (wsError) {
            console.warn('[TokenDetailPage] WebSocket fetch failed:', wsError);
            // Continue to HTTP fallback
          }
        }
        
        // STEP 3: Fallback to HTTP if needed
        // Only use HTTP if we still don't have data or we need fresh data
        if (!tokenData || refreshPage.current) {
          try {
            console.log('[TokenDetailPage] Falling back to HTTP fetch');
            const httpData = await fetchTokenDataHttp(contractAddress);
            
            if (httpData && isActive) {
              setTokenDetails(httpData);
              setPoolAddress(httpData.main_pool_address || contractAddress);
              setDataSource('http');
              setLoading(false);
              setFetchAttempted(true);
              
              // Update cache
              dataCache.current.set(contractAddress, httpData);
              
              // Try to set up live updates anyway
              if (isConnected) {
                setupLiveUpdates(contractAddress);
              }
            }
          } catch (httpError) {
            console.error('[TokenDetailPage] HTTP fetch failed:', httpError);
            
            // Only show error if we don't already have data from cache
            if (!tokenData && isActive) {
              setError('Failed to load token data');
              setLoading(false);
              setFetchAttempted(true);
            }
          }
        }
      } catch (err) {
        console.error('[TokenDetailPage] Error loading token data:', err);
        
        if (isActive) {
          // Only show error if we don't have any data
          if (!tokenDetails) {
            setError('Unable to load token details');
          }
          setLoading(false);
          setFetchAttempted(true);
        }
      }
    };
    
    loadTokenData();
    
    return () => {
      isActive = false;
    };
  }, [contractAddress, isConnected, getTokenDataViaWebSocket, fetchTokenDataHttp, setupLiveUpdates]);

  // Connect wallet
  const connectWallet = async () => {
    if (!window.ethereum) {
      setConnectionError('No Ethereum wallet detected. Please install MetaMask or another wallet.');
      return;
    }

    try {
      setIsConnecting(true);
      setConnectionError('');
      
      // Check provider safety
      const isProviderSafe = await checkProviderSafety(window.ethereum);
      if (!isProviderSafe) {
        setConnectionError('Potentially unsafe wallet provider detected. Please verify your wallet extension.');
        setIsConnecting(false);
        return;
      }
      
      // Request account access
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      
      // Validate account format
      if (!accounts || !accounts.length || !ethers.isAddress(accounts[0])) {
        setConnectionError('Invalid account format received from wallet.');
        setIsConnecting(false);
        return;
      }
      
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const network = await provider.getNetwork();
      
      // Check if on Base network (chain ID 8453)
      if (network.chainId !== 8453n) {
        try {
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: '0x2105' }], // Base chain ID in hex
          });
        } catch (switchError) {
          // This error code indicates that the chain has not been added to MetaMask
          if (switchError.code === 4902) {
            try {
              await window.ethereum.request({
                method: 'wallet_addEthereumChain',
                params: [
                  {
                    chainId: '0x2105',
                    chainName: 'Base',
                    nativeCurrency: {
                      name: 'ETH',
                      symbol: 'ETH',
                      decimals: 18
                    },
                    rpcUrls: ['https://mainnet.base.org'],
                    blockExplorerUrls: ['https://basescan.org']
                  },
                ],
              });
            } catch (addError) {
              setConnectionError('Failed to add Base network to your wallet');
              setIsConnecting(false);
              return;
            }
          } else {
            setConnectionError('Failed to switch to Base network');
            setIsConnecting(false);
            return;
          }
        }
        
        // Re-check the network after switching
        const updatedNetwork = await provider.getNetwork();
        if (updatedNetwork.chainId !== 8453n) {
          setConnectionError('Please switch to the Base network to continue');
          setIsConnecting(false);
          return;
        }
      }
      
      const walletInfo = {
        address: accounts[0],
        network: network,
        signer: signer,
        provider: provider
      };
      
      setWallet(walletInfo);
      
      // Get token balance and decimals
      await fetchTokenBalance(contractAddress, accounts[0], provider);
      
      setIsConnecting(false);
    } catch (err) {
      setConnectionError('Failed to connect wallet: ' + err.message);
      setIsConnecting(false);
    }
  };

  // Fetch token balance and decimals
  const fetchTokenBalance = async (tokenAddress, walletAddress, provider) => {
    try {
      const tokenContract = new ethers.Contract(
        tokenAddress,
        ERC20_ABI,
        provider
      );
      
      // Get token decimals
      try {
        const decimals = await tokenContract.decimals();
        setTokenDecimals(decimals);
      } catch (error) {
        console.error("Error getting decimals, using default 18:", error);
        setTokenDecimals(18);
      }
      
      // Get token balance
      const balance = await tokenContract.balanceOf(walletAddress);
      setTokenBalance(balance);
      
    } catch (error) {
      console.error("Error fetching token details:", error);
    }
  };

  // Update token balance
  const updateTokenBalance = async () => {
    if (!wallet || !contractAddress) return;
    
    await fetchTokenBalance(contractAddress, wallet.address, wallet.provider);
  };

  // Disconnect wallet
  const disconnectWallet = () => {
    setWallet(null);
    setTokenBalance(null);
    setTransactionHash('');
    setTradeSuccess(false);
    setTradeError('');
    setShowShillModal(false);
  };

  // Effect to reconnect WebSocket if needed
  useEffect(() => {
    if (refreshPage.current && !isConnected) {
      console.log('[TokenDetailPage] Page was refreshed and WebSocket is disconnected, attempting reconnect');
      reconnect();
    }
  }, [isConnected, reconnect]);
  
  // Copy to clipboard utility
  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text)
      .then(() => alert('Copied to clipboard'))
      .catch(err => console.error('Copy failed:', err));
  };

  // Copy shill text to clipboard
  const copyShillText = () => {
    navigator.clipboard.writeText(shillText).then(
      () => {
        alert('Shill text copied to clipboard!');
      },
      (err) => {
        console.error('Could not copy text: ', err);
      }
    );
  };

  // Share to Twitter
  const shareToTwitter = () => {
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shillText)}`;
    window.open(twitterUrl, '_blank');
  };

  // Toggle trade mode (buy/sell)
  const toggleTradeMode = (mode) => {
    setTradeMode(mode);
    setEthAmount('');
    setTokenAmount('');
    setTradeError('');
  };

  // Handle reload/retry
  const handleRetry = () => {
    setLoading(true);
    setError(null);
    
    // If WebSocket is disconnected, try to reconnect
    if (!isConnected) {
      reconnect();
    }
    
    // Clear cache for this token to force fresh fetch
    if (contractAddress) {
      // Try to get fresh data
      if (isConnected) {
        getTokenDataViaWebSocket(contractAddress)
          .then(data => {
            setTokenDetails(data);
            setPoolAddress(data.main_pool_address || contractAddress);
            setDataSource('websocket');
            setLoading(false);
            
            // Update cache
            dataCache.current.set(contractAddress, data);
            
            // Set up live updates
            setupLiveUpdates(contractAddress);
          })
          .catch(async (wsError) => {
            console.warn('[TokenDetailPage] Retry WebSocket fetch failed:', wsError);
            
            // Fallback to HTTP
            try {
              const httpData = await fetchTokenDataHttp(contractAddress);
              setTokenDetails(httpData);
              setPoolAddress(httpData.main_pool_address || contractAddress);
              setDataSource('http');
              setLoading(false);
              
              // Update cache
              dataCache.current.set(contractAddress, httpData);
            } catch (httpError) {
              console.error('[TokenDetailPage] Retry HTTP fetch failed:', httpError);
              setError('Failed to load token data');
              setLoading(false);
            }
          });
      } else {
        // Try HTTP directly
        fetchTokenDataHttp(contractAddress)
          .then(data => {
            setTokenDetails(data);
            setPoolAddress(data.main_pool_address || contractAddress);
            setDataSource('http');
            setLoading(false);
            
            // Update cache
            dataCache.current.set(contractAddress, data);
          })
          .catch(err => {
            console.error('[TokenDetailPage] Retry HTTP fetch failed:', err);
            setError('Failed to load token data');
            setLoading(false);
          });
      }
    }
  };

  // Approve token spending
  const approveToken = async () => {
    if (!wallet || !contractAddress || !tokenAmount || parseFloat(tokenAmount) <= 0) {
      setTradeError('Please enter a valid amount');
      return;
    }
    
    try {
      setIsApproving(true);
      setTradeError('');
      
      const tokenContract = new ethers.Contract(
        contractAddress,
        ERC20_ABI,
        wallet.signer
      );
      
      // We use MaxUint256 to approve maximum amount
      const MAX_UINT256 = ethers.MaxUint256;
      
      const tx = await tokenContract.approve(
        UNISWAP_ROUTER,
        MAX_UINT256
      );
      
      await tx.wait();
      
      setIsApproving(false);
      return true;
    } catch (err) {
      console.error("Approval error:", err);
      
      let errorMessage = 'Failed to approve token: ';
      if (err.reason) {
        errorMessage += err.reason;
      } else if (err.message) {
        errorMessage += err.message;
      }
      
      setTradeError(errorMessage);
      setIsApproving(false);
      return false;
    }
  };

  // Execute a buy
  const buyToken = async () => {
    if (!wallet || !contractAddress || !ethAmount || parseFloat(ethAmount) <= 0) {
      setTradeError('Please enter a valid ETH amount');
      return;
    }

    try {
      setIsTrading(true);
      setTradeError('');
      setTradeSuccess(false);
      setTransactionHash('');
      setShowShillModal(false);
      
      const amountIn = ethers.parseEther(ethAmount);
      
      // Create contract instance
      const swapRouter = new ethers.Contract(
        UNISWAP_ROUTER,
        SWAP_ROUTER_ABI,
        wallet.signer
      );
      
      // Prepare swap params - use 1% fee tier (10000)
      const params = {
        tokenIn: WETH_ADDRESS,
        tokenOut: contractAddress,
        fee: FEE_TIER,
        recipient: wallet.address,
        amountIn: amountIn,
        amountOutMinimum: 0, // Set to 0 since we're not estimating
        sqrtPriceLimitX96: 0 // No price limit
      };
      
      // Execute the swap
      const tx = await swapRouter.exactInputSingle(
        params,
        { 
          value: amountIn,
          gasLimit: 500000 // Set a high gas limit for swaps
        }
      );
      
      setTransactionHash(tx.hash);
      
      // Wait for transaction to be mined
      await tx.wait();
      
      // Update token balance
      await updateTokenBalance();
      
      setTradeSuccess(true);
      setIsTrading(false);
      
      // Generate shill text and show modal
      if (tokenDetails) {
        const generatedShillText = generateShillText(
          tokenDetails.name, 
          tokenDetails.symbol, 
          contractAddress,
          ethAmount
        );
        setShillText(generatedShillText);
        setShowShillModal(true);
      }
      
    } catch (err) {
      console.error('Transaction error:', err);
      
      // Provide a more helpful error message
      let errorMessage = 'Failed to buy token: ';
      
      if (err.reason) {
        errorMessage += err.reason;
      } else if (err.message) {
        if (err.message.includes('insufficient funds')) {
          errorMessage = 'Insufficient ETH in your wallet to complete this transaction.';
        } else if (err.message.includes('user rejected')) {
          errorMessage = 'Transaction was rejected by the user.';
        } else if (err.message.includes('execution reverted')) {
          errorMessage = 'Transaction failed - there may be issues with liquidity or token restrictions.';
        } else {
          errorMessage += err.message;
        }
      } else {
        errorMessage += 'Unknown error occurred. The token might have trading restrictions or insufficient liquidity.';
      }
      
      setTradeError(errorMessage);
      setIsTrading(false);
    }
  };

  // Execute a sell
  const sellToken = async () => {
    if (!wallet || !contractAddress || !tokenAmount || parseFloat(tokenAmount) <= 0) {
      setTradeError('Please enter a valid token amount');
      return;
    }
    
    // Check if token balance is sufficient
    const inputAmount = ethers.parseUnits(tokenAmount, tokenDecimals);
    if (tokenBalance < inputAmount) {
      setTradeError('Insufficient token balance');
      return;
    }

    try {
      // First approve the router to spend tokens
      const approved = await approveToken();
      if (!approved) return;
      
      setIsTrading(true);
      setTradeError('');
      setTradeSuccess(false);
      setTransactionHash('');
      
      // Create contract instance
      const swapRouter = new ethers.Contract(
        UNISWAP_ROUTER,
        SWAP_ROUTER_ABI,
        wallet.signer
      );
      
      // Prepare swap params for selling tokens
      const params = {
        tokenIn: contractAddress,
        tokenOut: WETH_ADDRESS,
        fee: FEE_TIER,
        recipient: wallet.address,
        amountIn: inputAmount,
        amountOutMinimum: 0, // Set to 0 since we're not estimating
        sqrtPriceLimitX96: 0 // No price limit
      };
      
      // Execute the swap
      const tx = await swapRouter.exactInputSingle(
        params,
        { 
          gasLimit: 500000 // Set a high gas limit for swaps
        }
      );
      
      setTransactionHash(tx.hash);
      
      // Wait for transaction to be mined
      await tx.wait();
      
      // Update token balance
      await updateTokenBalance();
      
      setTradeSuccess(true);
      setIsTrading(false);
    } catch (err) {
      console.error('Transaction error:', err);
      
      // Provide a more helpful error message
      let errorMessage = 'Failed to sell token: ';
      
      if (err.reason) {
        errorMessage += err.reason;
      } else if (err.message) {
        if (err.message.includes('user rejected')) {
          errorMessage = 'Transaction was rejected by the user.';
        } else if (err.message.includes('execution reverted')) {
          errorMessage = 'Transaction failed - there may be issues with liquidity or token restrictions.';
        } else {
          errorMessage += err.message;
        }
      } else {
        errorMessage += 'Unknown error occurred. The token might have trading restrictions or insufficient liquidity.';
      }
      
      setTradeError(errorMessage);
      setIsTrading(false);
    }
  };

  // Handle trade execution
  const executeTrade = () => {
    if (tradeMode === 'buy') {
      buyToken();
    } else {
      sellToken();
    }
  };

  // Format token balance
  const formatTokenBalance = () => {
    if (!tokenBalance) return "0";
    return parseFloat(ethers.formatUnits(tokenBalance, tokenDecimals)).toFixed(6);
  };

  // Render loading state
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
        
        <div style={{ 
          fontSize: '12px', 
          marginTop: '20px', 
          opacity: 0.8,
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <span style={{ 
            display: 'inline-block',
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: isConnected ? '#00ff88' : '#ff4466',
          }}></span>
          WebSocket: {isConnected ? 'Connected' : 'Disconnected'}
        </div>
      </div>
    );
  }

  // Render error state
  if (error || (!tokenDetails && fetchAttempted)) {
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
            onClick={() => navigate('/')} 
            className="back-button"
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
  // Main token detail render - show content only once we have token details
  if (tokenDetails) {
    return (
      <div className="token-detail-page">
        <div className="token-detail-header">
          <button 
            onClick={() => navigate('/')} 
            className="back-button"
          >
            ← Back to Dashboard
          </button>
          
          <h1 className="token-detail-title">{tokenDetails.name} ({tokenDetails.symbol})</h1>
          
          <div className="token-details-summary">
            <div className="token-detail-data">
              <div>
                <span className="token-detail-label">Price:</span>
                <span className="token-detail-value">{formatCurrency(tokenDetails.price_usd)}</span>
              </div>
              <div>
                <span className="token-detail-label">Market Cap:</span>
                <span className="token-detail-value">{formatCurrency(tokenDetails.fdv_usd)}</span>
              </div>
            </div>
            <div className="token-detail-data">
              <div>
                <span className="token-detail-label">24h Volume:</span>
                <span className="token-detail-value">{formatCurrency(tokenDetails.volume_usd)}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="token-detail-label">Contract:</span>
                <span className="token-detail-value">{tokenDetails.contractAddress.slice(0, 8)}...{tokenDetails.contractAddress.slice(-6)}</span>
                <button
                  onClick={() => copyToClipboard(tokenDetails.contractAddress)}
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
          </div>
          
          {/* Connection status indicator */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginTop: '10px'
          }}>
            <div style={{
              display: 'inline-block',
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
            
            <div style={{
              display: 'inline-block',
              background: '#222',
              color: isConnected ? '#00ff88' : '#ff4466',
              padding: '4px 8px',
              borderRadius: '4px',
              fontSize: '12px'
            }}>
              <span style={{ 
                display: 'inline-block',
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: isConnected ? '#00ff88' : '#ff4466',
                marginRight: '6px'
              }}></span>
              {isConnected ? 'WebSocket Connected' : 'WebSocket Disconnected'}
            </div>
            
            {!isConnected && (
              <button
                onClick={() => reconnect()}
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
                Reconnect
              </button>
            )}
          </div>
        </div>
        
        {/* Trade Token Section - Full Width */}
        <div className="contract-form-container" style={{ width: '100%', maxWidth: '100%' }}>
          <h2>Trade {tokenDetails.symbol}</h2>
          
          {!wallet ? (
            <div style={{ textAlign: 'center' }}>
              <button
                onClick={connectWallet}
                disabled={isConnecting}
                className="connect-button"
                style={{
                  width: '80%',
                  maxWidth: '400px',
                  margin: '0 auto'
                }}
              >
                {isConnecting ? 'Connecting...' : 'Connect Wallet to Trade'}
              </button>
              {connectionError && <div className="error-message">{connectionError}</div>}
            </div>
          ) : (
            <div className="trade-token-form">
              <div className="wallet-info" style={{ 
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '15px'
              }}>
                <span>Connected: {wallet.address.substring(0, 6)}...{wallet.address.substring(38)}</span>
                <button onClick={disconnectWallet} className="disconnect-button">Disconnect</button>
              </div>
              
              {tokenBalance !== null && (
                <div className="token-balance-info" style={{ marginTop: '10px', color: '#ffb300' }}>
                  <p>Your {tokenDetails.symbol} Balance: {formatTokenBalance()}</p>
                </div>
              )}
              
              <div className="pool-info" style={{ marginTop: '10px', color: '#ffb300' }}>
                <p>Pool: 1% fee tier</p>
              </div>
              
              <div className="trade-mode-selector" style={{ 
                display: 'flex',
                gap: '10px',
                marginTop: '20px'
              }}>
                <button 
                  className={`mode-button ${tradeMode === 'buy' ? 'active' : ''}`}
                  onClick={() => toggleTradeMode('buy')}
                  style={{
                    flex: 1,
                    padding: '10px 15px',
                    background: tradeMode === 'buy' ? '#ffb300' : '#333',
                    color: tradeMode === 'buy' ? '#000' : '#ffb300',
                    border: '1px solid #ffb300',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontFamily: "'Chewy', cursive",
                    fontSize: '16px'
                  }}
                >
                  Buy
                </button>
                <button 
                  className={`mode-button ${tradeMode === 'sell' ? 'active' : ''}`}
                  onClick={() => toggleTradeMode('sell')}
                  style={{
                    flex: 1,
                    padding: '10px 15px',
                    background: tradeMode === 'sell' ? '#ffb300' : '#333',
                    color: tradeMode === 'sell' ? '#000' : '#ffb300',
                    border: '1px solid #ffb300',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontFamily: "'Chewy', cursive",
                    fontSize: '16px'
                  }}
                >
                  Sell
                </button>
              </div>
              {tradeMode === 'buy' ? (
                <div className="input-group" style={{ 
                  position: 'relative', 
                  marginBottom: '15px',
                  marginTop: '15px',
                  maxWidth: '100%'
                }}>
                  <label htmlFor="ethAmount" style={{ 
                    display: 'block', 
                    marginBottom: '8px', 
                    fontWeight: 'bold',
                    color: '#ffb300'
                  }}>
                    ETH Amount:
                  </label>
                  <div style={{ 
                    position: 'relative',
                    width: '100%'
                  }}>
                    <input
                      id="ethAmount"
                      type="number"
                      value={ethAmount}
                      onChange={(e) => setEthAmount(e.target.value)}
                      placeholder="0.1"
                      step="0.01"
                      min="0"
                      style={{ 
                        width: '100%',
                        padding: '12px 15px 12px 15px',
                        paddingRight: '55px',
                        fontSize: '16px',
                        border: '2px solid #ffb300',
                        borderRadius: '8px',
                        backgroundColor: '#1a1a1a',
                        color: '#ffb300',
                        boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.1)',
                        transition: 'border-color 0.2s ease',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                      onFocus={(e) => {
                        e.target.style.borderColor = '#f1c40f';
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = '#ffb300';
                      }}
                    />
                    <div style={{ 
                      position: 'absolute', 
                      right: '15px', 
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: '#ffb300',
                      pointerEvents: 'none',
                      padding: '0 5px',
                      borderRadius: '4px'
                    }}>
                      ETH
                    </div>
                  </div>
                  <small style={{ 
                    display: 'block', 
                    marginTop: '5px', 
                    color: '#ffb300',
                    fontSize: '0.85rem'
                  }}>
                    Enter the amount of ETH you want to spend
                  </small>
                </div>
              ) : (
                <div className="input-group" style={{ 
                  position: 'relative', 
                  marginBottom: '15px',
                  marginTop: '15px',
                  maxWidth: '100%'
                }}>
                  <label htmlFor="tokenAmount" style={{ 
                    display: 'block', 
                    marginBottom: '8px', 
                    fontWeight: 'bold',
                    color: '#ffb300'
                  }}>
                    {tokenDetails.symbol} Amount:
                  </label>
                  <div style={{ 
                    position: 'relative',
                    width: '100%'
                  }}>
                    <input
                      id="tokenAmount"
                      type="number"
                      value={tokenAmount}
                      onChange={(e) => setTokenAmount(e.target.value)}
                      placeholder="100"
                      step="1"
                      min="0"
                      style={{ 
                        width: '100%',
                        padding: '12px 15px 12px 15px',
                        paddingRight: '80px',
                        fontSize: '16px',
                        border: '2px solid #ffb300',
                        borderRadius: '8px',
                        backgroundColor: '#1a1a1a',
                        color: '#ffb300',
                        boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.1)',
                        transition: 'border-color 0.2s ease',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                      onFocus={(e) => {
                        e.target.style.borderColor = '#f1c40f';
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = '#ffb300';
                      }}
                    />
                    <button 
                      className="max-button"
                      onClick={() => tokenBalance && setTokenAmount(ethers.formatUnits(tokenBalance, tokenDecimals))}
                      style={{
                        position: 'absolute',
                        right: '8px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        backgroundColor: '#ffb300',
                        color: '#000',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '3px 8px',
                        fontSize: '12px',
                        cursor: 'pointer',
                        zIndex: 1
                      }}
                    >
                      MAX
                    </button>
                    <div style={{ 
                      position: 'absolute', 
                      right: '50px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: '#ffb300',
                      pointerEvents: 'none',
                      padding: '0 5px',
                      borderRadius: '4px'
                    }}>
                      {tokenDetails.symbol}
                    </div>
                  </div>
                  <small style={{ 
                    display: 'block', 
                    marginTop: '5px', 
                    color: '#ffb300',
                    fontSize: '0.85rem'
                  }}>
                    Enter the amount of {tokenDetails.symbol} you want to sell
                  </small>
                </div>
              )}
              
              <div className="slippage-selector" style={{
                marginBottom: '20px'
              }}>
                <label htmlFor="slippage" style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontWeight: 'bold',
                  color: '#ffb300'
                }}>
                  Slippage Tolerance:
                </label>
                <select
                  id="slippage"
                  value={slippage}
                  onChange={(e) => setSlippage(parseInt(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '10px 15px',
                    fontSize: '16px',
                    border: '2px solid #ffb300',
                    borderRadius: '8px',
                    backgroundColor: '#1a1a1a',
                    color: '#ffb300',
                    cursor: 'pointer'
                  }}
                >
                  <option value="1">1%</option>
                  <option value="2">2%</option>
                  <option value="5">5%</option>
                  <option value="10">10%</option>
                  <option value="15">15%</option>
                </select>
                <small style={{ 
                  display: 'block', 
                  marginTop: '5px',
                  color: '#ffb300',
                  fontSize: '0.85rem'
                }}>
                  Higher slippage may be needed for tokens with low liquidity
                </small>
              </div>
              <button
                onClick={executeTrade}
                disabled={isTrading || isApproving || 
                         (tradeMode === 'buy' && (!ethAmount || parseFloat(ethAmount) <= 0)) || 
                         (tradeMode === 'sell' && (!tokenAmount || parseFloat(tokenAmount) <= 0))}
                className="execute-button"
                style={{
                  width: '100%',
                  padding: '15px',
                  fontSize: '18px',
                  backgroundColor: '#ffb300',
                  color: '#000',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontFamily: "'Chewy', cursive",
                  marginTop: '20px',
                  marginBottom: '15px'
                }}
              >
                {isApproving ? 'Approving...' : 
                 isTrading ? 'Processing...' :
                 tradeMode === 'buy' ? 
                   `Buy ${tokenDetails.symbol}` : 
                   `Sell ${tokenDetails.symbol}`}
              </button>
              
              {tradeError && <div className="error-message">{tradeError}</div>}
              
              {transactionHash && (
                <div className="tx-hash">
                  <p>Transaction hash: {transactionHash.substring(0, 10)}...{transactionHash.substring(58)}</p>
                  <a
                    href={`https://basescan.org/tx/${transactionHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'inline-block',
                      padding: '8px 12px',
                      backgroundColor: '#ffb300',
                      color: '#000',
                      textDecoration: 'none',
                      borderRadius: '4px',
                      marginTop: '10px',
                      fontFamily: "'Chewy', cursive",
                      fontSize: '14px'
                    }}
                  >
                    View on Basescan
                  </a>
                </div>
              )}
              
              {tradeSuccess && (
                <div className="success-message">
                  Transaction successful! You've {tradeMode === 'buy' ? 'bought' : 'sold'} {tokenDetails.symbol}.
                </div>
              )}
            </div>
          )}
        </div>
        
        {/* Shill Modal Popup */}
        {showShillModal && shillText && (
          <div className="modal-overlay">
            <div className="modal-content shill-modal">
              <h3 style={{ color: '#ffb300', textAlign: 'center' }}>🚀 Nice Buy! Share It With The World!</h3>
              <div className="shill-text-box" style={{
                background: '#333',
                border: '1px solid #ffb300',
                padding: '15px',
                borderRadius: '8px',
                marginBottom: '20px',
                color: '#ffb300'
              }}>
                <p>{shillText}</p>
              </div>
              <div className="shill-actions" style={{
                display: 'flex',
                gap: '10px',
                marginBottom: '20px'
              }}>
                <button 
                  onClick={copyShillText} 
                  className="copy-button"
                  style={{
                    flex: '1',
                    background: '#ffb300',
                    color: '#000',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '10px',
                    cursor: 'pointer',
                    fontFamily: "'Chewy', cursive"
                  }}
                >
                  Copy Text
                </button>
                <button 
                  onClick={shareToTwitter} 
                  className="twitter-button"
                  style={{
                    flex: '1',
                    background: '#1DA1F2',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '10px',
                    cursor: 'pointer',
                    fontFamily: "'Chewy', cursive"
                  }}
                >
                  <span role="img" aria-label="Twitter">🐦</span> Post to Twitter
                </button>
              </div>
              <button 
                onClick={() => setShowShillModal(false)} 
                className="close-modal-button"
                style={{
                  width: '100%',
                  background: '#333',
                  color: '#ffb300',
                  border: '1px solid #ffb300',
                  borderRadius: '6px',
                  padding: '10px',
                  cursor: 'pointer',
                  fontFamily: "'Chewy', cursive"
                }}
              >
                Close
              </button>
            </div>
          </div>
        )}
        
        {/* Chart Embed */}
        <div className="token-chart-container" style={{ width: '100%' }}>
          <iframe 
            src={`https://dexscreener.com/base/${poolAddress || contractAddress}?embed=1&loadChartSettings=0&trades=0&tabs=0&info=0&chartLeftToolbar=0&chartDefaultOnMobile=1&chartTheme=dark&theme=light&chartStyle=0&chartType=usd&interval=15`}
            style={{
              width: '100%',
              height: '800px',
              border: 'none',
              backgroundColor: '#000000'
            }}
            title={`${tokenDetails.name} price chart`}
          />
        </div>
      </div>
    );
  }

  // Safety fallback - should never reach here if logic above is correct
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
        Something went wrong
      </div>
      
      <button 
        onClick={() => navigate('/')} 
        className="back-button"
      >
        ← Go to Dashboard
      </button>
    </div>
  );
}

export default TokenDetailPage;