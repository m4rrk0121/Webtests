import { ethers } from 'ethers';
import React, { useCallback, useEffect, useState } from 'react';
import './modal.css'; // Make sure to create this CSS file



/* global BigInt */

// Helper function for safe BigInt conversion
const safeBigInt = (value) => {
  if (typeof BigInt !== 'undefined') {
    return BigInt(value);
  }
  // Fallback for environments without BigInt
  return Number(value);
};
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

// Pre-defined contract information for token deployment
const TOKEN_DEPLOYER_ADDRESS = '0xb51F74E6d8568119061f59Fd7f98824F1e666AC1';
const TOKEN_DEPLOYER_ABI = [
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "_name",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "_symbol",
        "type": "string"
      },
      {
        "internalType": "uint256",
        "name": "_supply",
        "type": "uint256"
      },
      {
        "internalType": "int24",
        "name": "_initialTick",
        "type": "int24"
      },
      {
        "internalType": "uint24",
        "name": "_fee",
        "type": "uint24"
      },
      {
        "internalType": "bytes32",
        "name": "_salt",
        "type": "bytes32"
      },
      {
        "internalType": "address",
        "name": "_deployer",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "_recipient",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "_recipientAmount",
        "type": "uint256"
      }
    ],
    "name": "deployToken",
    "outputs": [
      {
        "internalType": "address",
        "name": "tokenAddress",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "tokenId",
        "type": "uint256"
      }
    ],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "_sender",
        "type": "address"
      },
      {
        "internalType": "string",
        "name": "_name",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "_symbol",
        "type": "string"
      },
      {
        "internalType": "uint256",
        "name": "_supply",
        "type": "uint256"
      }
    ],
    "name": "generateSalt",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "salt",
        "type": "bytes32"
      },
      {
        "internalType": "address",
        "name": "predictedAddress",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "weth",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
];

// Fixed recipient wallet for 1% allocation
const RECIPIENT_WALLET = "0xc5C216E6E60ccE2d189Bcce5f6ebFFDE1e8ce926";

  // Default deployment fee
const DEFAULT_DEPLOYMENT_FEE = ethers.parseEther("0.0005");

// Fixed target market cap in USD
const TARGET_MARKET_CAP_USD = 14000;

// Fixed fee tier (1%)
const FEE_TIER = 10000;

// Fixed tick spacing for 1% fee tier
const TICK_SPACING = 200;

// Helper function to fetch ETH price from CoinGecko
async function fetchEthPrice() {
  try {
    const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
    const data = await response.json();
    if (data.ethereum && data.ethereum.usd) {
      return data.ethereum.usd;
    }
    throw new Error("Invalid response format");
  } catch (error) {
    console.error("Error fetching ETH price:", error);
    return 3000; // Default fallback price
  }
}

// Function to calculate the tick for a target market cap
function calculateTickForMarketCap(targetMarketCapUSD, tokenSupply, ethPriceUSD, tickSpacing) {
  // Calculate required token price in USD
  const tokenPriceUSD = targetMarketCapUSD / tokenSupply;
  
  // Convert to ETH price
  const tokenPriceETH = tokenPriceUSD / ethPriceUSD;
  
  // Calculate exact tick using the Uniswap V3 formula
  // price = 1.0001^tick
  // so tick = log(price) / log(1.0001)
  const exactTick = Math.log(tokenPriceETH) / Math.log(1.0001);
  
  // Round to the nearest valid tick (multiple of tick spacing)
  const validTick = Math.round(exactTick / tickSpacing) * tickSpacing;
  
  // Calculate the actual price and market cap with this tick
  const actualPriceETH = Math.pow(1.0001, validTick);
  const actualPriceUSD = actualPriceETH * ethPriceUSD;
  const actualMarketCapUSD = actualPriceUSD * tokenSupply;
  
  return {
    validTick,
    exactTick,
    actualPriceETH,
    actualPriceUSD,
    actualMarketCapUSD
  };
}

// Generate shill text for the new token
function generateShillText(tokenName, tokenSymbol, tokenAddress, marketCapUSD) {
  const formattedMarketCap = marketCapUSD ? `$${marketCapUSD.toLocaleString()}` : "$14,000";
  
  const shillTexts = [
    `🔥 Just deployed ${tokenName} (${tokenSymbol}) on Base! Initial market cap of ${formattedMarketCap}. This is going to be HUGE! Check it out: https://basescan.org/address/${tokenAddress} #Base #DeFi #${tokenSymbol}`,
    
    `🚀 ${tokenSymbol} has launched on Base! Get in early on the next moonshot with a starting market cap of only ${formattedMarketCap}! LP is set, ready for takeoff! https://basescan.org/address/${tokenAddress} #Crypto #Base #${tokenSymbol}`,
    
    `💎 ${tokenName} (${tokenSymbol}) is now LIVE on Base! Perfect entry point at ${formattedMarketCap} mcap. Diamond hands will be rewarded! https://basescan.org/address/${tokenAddress} #BaseChain #${tokenSymbol} #100x`,
    
    `⚡️ NEW GEM ALERT: ${tokenSymbol} token just deployed on Base with ${formattedMarketCap} starting mcap! Early adopters win! https://basescan.org/address/${tokenAddress} #BaseGems #${tokenSymbol} #CryptoGems`
  ];
  
  // Randomly select one of the shill texts
  return shillTexts[Math.floor(Math.random() * shillTexts.length)];
}

function DeployToken() {
  // State variables for token deployment
  const [tokenName, setTokenName] = useState('');
  const [tokenSymbol, setTokenSymbol] = useState('');
  const [tokenSupply, setTokenSupply] = useState('100000');
  const [feeClaimerAddress, setFeeClaimerAddress] = useState('');
  
  // Wallet connection state
  const [wallet, setWallet] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState('');
  
  // Transaction state
  const [isExecuting, setIsExecuting] = useState(false);
  const [txHash, setTxHash] = useState('');
  const [txResult, setTxResult] = useState(null);
  
  // Gas and fee state
  const [gasPrice, setGasPrice] = useState('');
  const [customGasPrice, setCustomGasPrice] = useState('');
  const [useCustomGas, setUseCustomGas] = useState(true); // Auto-check custom gas box
  const [deploymentFee, setDeploymentFee] = useState('0.0005');
  const [useCustomFee, setUseCustomFee] = useState(false);
  
  // Salt and market cap state
  const [generatedSalt, setGeneratedSalt] = useState(null);
  const [predictedAddress, setPredictedAddress] = useState('');
  const [ethPriceUSD, setEthPriceUSD] = useState(null);
  const [initialTick, setInitialTick] = useState(null);
  const [marketCapStats, setMarketCapStats] = useState(null);
  const [isGeneratingSalt, setIsGeneratingSalt] = useState(false);
  const [saltGenerationCount, setSaltGenerationCount] = useState(0);

  // Shill text state
  const [shillText, setShillText] = useState('');
  const [showShillText, setShowShillText] = useState(false);

  // Base network chain ID (mainnet)
  const BASE_CHAIN_ID = 8453;

  // Function to switch to Base network
  const switchToBaseNetwork = async () => {
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0x' + BASE_CHAIN_ID.toString(16) }],
      });
      return true;
    } catch (switchError) {
      // This error code indicates that the chain has not been added to MetaMask
      if (switchError.code === 4902) {
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [
              {
                chainId: '0x' + BASE_CHAIN_ID.toString(16),
                chainName: 'Base',
                nativeCurrency: {
                  name: 'ETH',
                  symbol: 'ETH',
                  decimals: 18
                },
                rpcUrls: ['https://mainnet.base.org'],
                blockExplorerUrls: ['https://basescan.org']
              }
            ],
          });
          return true;
        } catch (addError) {
          setError('Failed to add Base network: ' + addError.message);
          return false;
        }
      } else {
        setError('Failed to switch to Base network: ' + switchError.message);
        return false;
      }
    }
  };

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
      const network = await provider.getNetwork();
      
      // Check if we're on Base network
      if (network.chainId !== BigInt(BASE_CHAIN_ID)) {
        const userConfirmed = window.confirm(
          'This application requires the Base network. Would you like to switch to Base?'
        );
        
        if (userConfirmed) {
          const switched = await switchToBaseNetwork();
          if (!switched) {
            setIsConnecting(false);
            return;
          }
          // Re-initialize provider after network switch
          await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for network switch to complete
        } else {
          setError('Please connect to Base network to use this application.');
          setIsConnecting(false);
          return;
        }
      }
      
      // Re-initialize after potential network switch
      const updatedProvider = new ethers.BrowserProvider(window.ethereum);
      const signer = await updatedProvider.getSigner();
      const chainId = await updatedProvider.getNetwork();
      
      // Get current gas price
      const currentGasPrice = await updatedProvider.getFeeData();
      const currentGasPriceGwei = ethers.formatUnits(currentGasPrice.gasPrice || 0, 'gwei');
      setGasPrice(currentGasPriceGwei);
      setCustomGasPrice(currentGasPriceGwei); // Set default custom gas price to current gas price
      
      const walletInfo = {
        address: accounts[0],
        chainId: chainId.chainId,
        signer: signer,
        provider: updatedProvider
      };
      
      setWallet(walletInfo);
      setFeeClaimerAddress(accounts[0]); // Default fee claimer to connected wallet
      
      // Fetch ETH price when wallet connects
      const ethPrice = await fetchEthPrice();
      setEthPriceUSD(ethPrice);
      
      setIsConnecting(false);
    } catch (err) {
      setError('Failed to connect wallet: ' + err.message);
      setIsConnecting(false);
    }
  };

  // Disconnect wallet
  const disconnectWallet = () => {
    setWallet(null);
    setTxResult(null);
    setTxHash('');
    setGeneratedSalt(null);
    setPredictedAddress('');
    setShowShillText(false);
    setShillText('');
  };

// Modified generateSalt function - returns initialTick and marketCapStats
const generateSalt = async () => {
  if (!wallet || !tokenName || !tokenSymbol || !tokenSupply) {
    setError('Please connect wallet and provide token details');
    return { success: false }; // Return object with success status
  }

  try {
    setIsGeneratingSalt(true);
    setError('');
    
    const contract = new ethers.Contract(
      TOKEN_DEPLOYER_ADDRESS,
      TOKEN_DEPLOYER_ABI,
      wallet.signer
    );
    
    // Call the contract's generateSalt function
    const parsedSupply = ethers.parseEther(tokenSupply);
    
    // Increment the salt generation count (for UI feedback)
    setSaltGenerationCount(prevCount => prevCount + 1);
    
    const result = await contract.generateSalt(
      wallet.address,
      tokenName,
      tokenSymbol,
      parsedSupply
    );
    
    const salt = result[0];
    const predictedAddr = result[1];
    
    setGeneratedSalt(salt);
    setPredictedAddress(predictedAddr);
    
    // Calculate market cap statistics based on the generated salt
    let tickValue = null;
    let marketCapData = null;
    
    if (ethPriceUSD) {
      // Calculate 99% for LP (1% goes to recipient)
      const effectiveSupply = parseFloat(tokenSupply) * 0.99;
      
      // Calculate initial tick
      const tickResult = calculateTickForMarketCap(
        TARGET_MARKET_CAP_USD,
        effectiveSupply,
        ethPriceUSD,
        TICK_SPACING
      );
      
      tickValue = tickResult.validTick;
      marketCapData = {
        targetMarketCap: TARGET_MARKET_CAP_USD,
        actualMarketCap: Math.round(tickResult.actualMarketCapUSD),
        tokenPriceUSD: tickResult.actualPriceUSD,
        tokenPriceETH: tickResult.actualPriceETH
      };
      
      // Update the state
      setInitialTick(tickValue);
      setMarketCapStats(marketCapData);
    }
    
    setIsGeneratingSalt(false);
    
    // Return all the calculated values along with success status
    return { 
      success: true,
      salt: salt,
      predictedAddress: predictedAddr,
      initialTick: tickValue,
      marketCapStats: marketCapData
    };
  } catch (err) {
    setError('Failed to generate salt: ' + err.message);
    setIsGeneratingSalt(false);
    return { success: false };
  }
};

// Modified deployToken function to use the returned values from generateSalt
const deployToken = async () => {
  if (!wallet) {
    setError('Please connect your wallet first');
    return;
  }

  // Validate inputs
  if (!tokenName || !tokenSymbol || !tokenSupply) {
    setError('Token name, symbol, and supply are required');
    return;
  }

  // Automatically generate salt if not already done
  let saltData = null;
  let tickToUse = initialTick;
  
  if (!generatedSalt) {
    saltData = await generateSalt();
    if (!saltData.success) {
      return; // Exit if salt generation failed
    }
    // Use the returned initialTick value directly
    tickToUse = saltData.initialTick;
  }

  if (!tickToUse) {
    setError('Initial tick calculation failed. Please try again.');
    return;
  }

  // Only fetch ETH price if not already done
  let ethPrice = ethPriceUSD;
  if (!ethPrice) {
    try {
      ethPrice = await fetchEthPrice();
      setEthPriceUSD(ethPrice);
    } catch (err) {
      setError('Failed to fetch ETH price: ' + err.message);
      return;
    }
  }

  try {
    setIsExecuting(true);
    setError('');
    setTxResult(null);
    setShowShillText(false);
    
    const contract = new ethers.Contract(
      TOKEN_DEPLOYER_ADDRESS,
      TOKEN_DEPLOYER_ABI,
      wallet.signer
    );
    
    // Calculate 1% for recipient wallet
    const parsedSupply = ethers.parseEther(tokenSupply);
    const onePercentAmount = parsedSupply * safeBigInt(1) / safeBigInt(100);
    
    // Prepare transaction options
    const options = {
      value: useCustomFee 
        ? ethers.parseEther(deploymentFee || '0.0005') 
        : DEFAULT_DEPLOYMENT_FEE
    };
    
    if (useCustomGas && customGasPrice) {
      options.gasPrice = ethers.parseUnits(customGasPrice, 'gwei');
    }
    
    // Set high gas limit for deployment
    options.gasLimit = 8000000;
    
    // Use either the stored salt or the newly generated one
    const saltToUse = saltData ? saltData.salt : generatedSalt;
    
    // Call the deployToken function
    const tx = await contract.deployToken(
      tokenName,
      tokenSymbol,
      parsedSupply,
      tickToUse, // Use the local variable instead of state
      FEE_TIER, // Fixed 1% fee tier
      saltToUse,
      feeClaimerAddress || wallet.address, // Fee claimer (defaults to connected wallet)
      RECIPIENT_WALLET, // Fixed recipient wallet
      onePercentAmount, // 1% to recipient wallet
      options
    );
    
    setTxHash(tx.hash);
    
    // Wait for transaction to be mined
    const receipt = await tx.wait();
    
    // Try to extract token address and token ID from events
    let tokenAddress = '';
    let tokenId = '';
    
    // Look for TokenCreated event
    for (const log of receipt.logs) {
      try {
        const iface = new ethers.Interface([
          "event TokenCreated(address tokenAddress, uint256 lpNftId, address deployer, string name, string symbol, uint256 supply, address recipient, uint256 recipientAmount)"
        ]);
        
        const parsedLog = iface.parseLog({
          topics: log.topics,
          data: log.data
        });
        
        if (parsedLog && parsedLog.name === "TokenCreated") {
          tokenAddress = parsedLog.args.tokenAddress;
          tokenId = parsedLog.args.lpNftId.toString();
          break;
        }
      } catch (e) {
        // Not the event we're looking for
        continue;
      }
    }
    
    const txResultData = {
      success: true,
      hash: receipt.hash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString(),
      tokenAddress,
      tokenId
    };
    
    setTxResult(txResultData);
    
    // Generate shill text for the new token
    if (tokenAddress) {
      // Use either the stored marketCapStats or the newly generated one
      const marketCapValue = saltData && saltData.marketCapStats 
        ? saltData.marketCapStats.actualMarketCap 
        : (marketCapStats ? marketCapStats.actualMarketCap : TARGET_MARKET_CAP_USD);
        
      const generatedShillText = generateShillText(tokenName, tokenSymbol, tokenAddress, marketCapValue);
      setShillText(generatedShillText);
      setShowShillText(true);
    }
    
    setIsExecuting(false);
  } catch (err) {
    setError('Transaction failed: ' + err.message);
    setIsExecuting(false);
  }
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

// Check transaction status
const checkTransactionStatus = useCallback(async () => {
  if (!txHash || !wallet || !wallet.provider) {
    return;
  }

  try {
    const receipt = await wallet.provider.getTransactionReceipt(txHash);
    
    if (receipt) {
      setTxResult(prevResult => ({
        ...prevResult,
        status: receipt.status === 1 ? 'Confirmed' : 'Failed',
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString()
      }));
    } else {
      setTxResult(prevResult => ({
        ...prevResult,
        status: 'Pending'
      }));
    }
  } catch (err) {
    console.error('Error checking transaction:', err);
  }
}, [txHash, wallet, setTxResult]); // Add dependencies

// Effect to check transaction status periodically
useEffect(() => {
  if (txHash && wallet) {
    const interval = setInterval(checkTransactionStatus, 5000);
    return () => clearInterval(interval);
  }
}, [txHash, wallet, checkTransactionStatus]); 

// Effect to monitor network changes
useEffect(() => {
  if (window.ethereum && wallet) {
    const handleChainChanged = async (chainId) => {
      // Convert chainId from hex to decimal and compare with BASE_CHAIN_ID
      const chainIdDecimal = parseInt(chainId, 16);
      
      if (chainIdDecimal !== BASE_CHAIN_ID) {
        const userConfirmed = window.confirm(
          'This application requires the Base network. Would you like to switch back to Base?'
        );
        
        if (userConfirmed) {
          await switchToBaseNetwork();
        } else {
          setError('Please connect to Base network to use this application. Some features may not work correctly.');
        }
      } else {
        // Clear any network-related errors if we're now on the correct network
        setError('');
      }
    };
    
    // Subscribe to chainChanged event
    window.ethereum.on('chainChanged', handleChainChanged);
    
    // Clean up listener
    return () => {
      window.ethereum.removeListener('chainChanged', handleChainChanged);
    };
  }
}, [wallet]);

return (
  <div className="contract-interaction">
    <h1>Deploy New Token</h1>
    
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
        <h3>Deploy New Token</h3>
        <p>
          This will deploy a new token with a Uniswap V3 pool. The token will have a 
          target market cap of ${TARGET_MARKET_CAP_USD} and use a 1% fee tier.
        </p>
        
        <div className="token-form-section">
          <div className="token-data-row">
            <div className="form-group">
              <label htmlFor="tokenName">Token Name:</label>
              <input
                id="tokenName"
                type="text"
                value={tokenName}
                onChange={(e) => setTokenName(e.target.value)}
                placeholder="My Token"
                required
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="tokenSymbol">Token Symbol:</label>
              <input
                id="tokenSymbol"
                type="text"
                value={tokenSymbol}
                onChange={(e) => setTokenSymbol(e.target.value)}
                placeholder="TKN"
                required
              />
            </div>
          </div>
          
          <div className="token-data-row">
            <div className="form-group">
              <label htmlFor="tokenSupply">Total Supply (tokens):</label>
              <input
                id="tokenSupply"
                type="text"
                value={tokenSupply}
                onChange={(e) => setTokenSupply(e.target.value)}
                placeholder="100000"
                required
              />
              <small>Default: 100,000 tokens</small>
            </div>
            
            <div className="form-group">
              <label htmlFor="feeClaimerAddress">Fee Claimer Address:</label>
              <input
                id="feeClaimerAddress"
                type="text"
                value={feeClaimerAddress}
                onChange={(e) => setFeeClaimerAddress(e.target.value)}
                placeholder={wallet.address}
              />
              <small>This address will receive LP fees. Defaults to your wallet address.</small>
            </div>
          </div>
        </div>
        
        <div className="deployment-details">
          <h4>Deployment Details</h4>
          <p>• Fee Tier: 1% (fixed)</p>
          {ethPriceUSD && <p>• Current ETH Price: ${ethPriceUSD.toFixed(2)}</p>}
          {initialTick && <p>• Calculated Initial Tick: {initialTick}</p>}
          {marketCapStats && (
            <>
              <p>• Target Market Cap: ${marketCapStats.targetMarketCap}</p>
              <p>• Actual Market Cap: ${marketCapStats.actualMarketCap}</p>
              <p>• Token Price: ${marketCapStats.tokenPriceUSD.toFixed(8)} (${marketCapStats.tokenPriceETH.toFixed(8)} ETH)</p>
            </>
          )}
        </div>
        
        <div className="checkbox-wrapper">
          <label className="checkbox-container">
            Override default buy amount (0.0005 ETH)
            <input 
              type="checkbox" 
              checked={useCustomFee} 
              onChange={(e) => setUseCustomFee(e.target.checked)} 
            />
            <span className="checkmark"></span>
          </label>
        </div>
        
        {useCustomFee && (
          <div className="form-group">
            <label htmlFor="deploymentFee">Custom buy amount (ETH):</label>
            <input
              id="deploymentFee"
              type="text"
              value={deploymentFee}
              onChange={(e) => setDeploymentFee(e.target.value)}
              placeholder="0.0005"
            />
            <small>Enter the amount of ETH you want to send with deployment</small>
          </div>
        )}
        
        {/* Salt generation info section */}
        {generatedSalt && (
          <div className="salt-result">
            <p>Salt Generated: {`${generatedSalt.substring(0, 10)}...${generatedSalt.substring(58)}`}</p>
            <p>Predicted Token Address: {predictedAddress}</p>
          </div>
        )}
        {isGeneratingSalt && (
          <div className="generating-message">
            <p>Generating Salt... (Attempt {saltGenerationCount})</p>
          </div>
        )}
        
        <div className="gas-options">
          <div className="checkbox-wrapper">
            <label className="checkbox-container">
              Use custom gas price
              <input 
                type="checkbox" 
                checked={useCustomGas} 
                onChange={(e) => setUseCustomGas(e.target.checked)} 
              />
              <span className="checkmark"></span>
            </label>
          </div>
          
          {useCustomGas && (
            <div className="form-group">
              <label htmlFor="gasPrice">Gas Price (Gwei):</label>
              <input
                id="gasPrice"
                type="text"
                value={customGasPrice}
                onChange={(e) => setCustomGasPrice(e.target.value)}
                placeholder={gasPrice}
              />
            </div>
          )}
          
          {gasPrice && (
            <div className="current-gas">
              Current network gas price: {gasPrice} Gwei
            </div>
          )}
        </div>
        
        <button
          onClick={deployToken}
          disabled={isExecuting || !wallet || !tokenName || !tokenSymbol || !tokenSupply}
          className="execute-button deploy-button"
        >
          {isExecuting ? 'Deploying Token...' : 'Deploy Token'}
        </button>
        
        {error && (
          <div className="error-message">
            {error}
          </div>
        )}
        
        {txHash && (
          <div className="tx-hash">
            Transaction hash: {txHash}
            {!txResult && <div className="pending-indicator">Transaction pending...</div>}
          </div>
        )}
        
        {txResult && txResult.success && (
          <div className="success-message">
            <h4>Transaction successful!</h4>
            <div className="tx-details">
              <p>Transaction hash: {txResult.hash}</p>
              <p>Block number: {txResult.blockNumber}</p>
              <p>Gas used: {txResult.gasUsed}</p>
              {txResult.status && <p>Status: {txResult.status}</p>}
              {txResult.tokenAddress && (
                <>
                  <p>Token address: {txResult.tokenAddress}</p>
                  <a 
                    href={`https://basescan.org/address/${txResult.tokenAddress}`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="explorer-link"
                  >
                    View on BaseScan
                  </a>
                </>
              )}
              {txResult.tokenId && <p>Position ID: {txResult.tokenId}</p>}
            </div>
          </div>
        )}
        
        {/* Shill Text Modal Popup */}
        {showShillText && shillText && (
          <div className="modal-overlay">
            <div className="modal-content shill-modal">
              <h3>🚀 Your Token Is Live!</h3>
              <div className="shill-text-box">
                <p>{shillText}</p>
              </div>
              <div className="shill-actions">
                <button 
                  onClick={copyShillText} 
                  className="copy-button"
                >
                  Copy Text
                </button>
                <button 
                  onClick={shareToTwitter} 
                  className="twitter-button"
                >
                  <span role="img" aria-label="Twitter">🐦</span> Post to Twitter
                </button>
              </div>
              <button 
                onClick={() => setShowShillText(false)} 
                className="close-modal-button"
              >
                Close
              </button>
            </div>
          </div>
        )}

        <div className="connection-info">
          <p>Connected to chain ID: {wallet.chainId.toString()}</p>
          <p>Connected address: {wallet.address}</p>
        </div>
      </div>
    ) : (
      <div className="connect-prompt">
        <p>Please connect your wallet to deploy a token</p>
      </div>
    )}
  </div>
);
}

export default DeployToken;