import { ethers } from 'ethers';
import React, { useCallback, useEffect, useState } from 'react';
import { useAccount, useChainId, useWalletClient } from 'wagmi';
import { writeContract, getPublicClient } from '@wagmi/core';
import { appKitInstance, wagmiConfig } from '../App'; // Import appKitInstance and wagmiConfig
import './modal.css';

/* global BigInt */

// Helper function for safe BigInt conversion with better browser compatibility
const safeBigInt = (value) => {
  if (typeof BigInt !== 'undefined') {
    try {
      return BigInt(value);
    } catch (error) {
      console.warn('Error converting to BigInt:', error);
      return Number(value);
    }
  }
  return Number(value);
};

// Improved cross-browser event management for wallet providers
const setupWalletEventListeners = (ethereum, handleChainChanged, handleAccountsChanged) => {
  // Clear any existing listeners first to prevent duplicates
  if (ethereum.removeListener) {
    ethereum.removeListener('chainChanged', handleChainChanged);
    ethereum.removeListener('accountsChanged', handleAccountsChanged);
  } else if (ethereum.removeEventListener) {
    ethereum.removeEventListener('chainChanged', handleChainChanged);
    ethereum.removeEventListener('accountsChanged', handleAccountsChanged);
  }
  
  // Set up listeners based on what the provider supports
  if (ethereum.on && typeof ethereum.on === 'function') {
    ethereum.on('chainChanged', handleChainChanged);
    ethereum.on('accountsChanged', handleAccountsChanged);
    return true;
  } else if (ethereum.addEventListener && typeof ethereum.addEventListener === 'function') {
    ethereum.addEventListener('chainChanged', handleChainChanged);
    ethereum.addEventListener('accountsChanged', handleAccountsChanged);
    return true;
  } else if (ethereum.addListener && typeof ethereum.addListener === 'function') {
    ethereum.addListener('chainChanged', handleChainChanged);
    ethereum.addListener('accountsChanged', handleAccountsChanged);
    return true;
  }
  
  console.warn('Could not set up wallet event listeners - provider may not support events');
  return false;
};

// Helper for determining if an address is valid across different wallets
const isValidAddress = (address) => {
  // Basic check if it's a string and starts with 0x
  if (typeof address !== 'string' || !address.startsWith('0x')) {
    return false;
  }
  
  // Check if it has the correct length (42 characters for standard Ethereum address)
  if (address.length !== 42) {
    return false;
  }
  
  // Check if it contains only valid hex characters after 0x
  const hexPart = address.slice(2);
  const hexRegex = /^[0-9a-fA-F]+$/;
  if (!hexRegex.test(hexPart)) {
    return false;
  }
  
  // If ethers is available, use its validation
  try {
    return ethers.isAddress(address);
  } catch (error) {
    // Fallback if ethers validation fails or isn't available
    return true;
  }
};

// Pre-defined contract information for token deployment
const TOKEN_DEPLOYER_ADDRESS = '0x9bd7dCc13c532F37F65B0bF078C8f83E037e7445';
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

// Launch Mode market caps
const LAUNCH_MODES = {
  ULTRA_DEGEN: {
    name: "Ultra Degen",
    marketCap: 1500,
    description: "Extreme risk, extreme reward. Launch at $1,500 market cap."
  },
  DEGEN: {
    name: "Degen",
    marketCap: 4000,
    description: "High risk, high reward. Launch at $4,000 market cap."
  },
  STANDARD: {
    name: "Standard",
    marketCap: 10000,
    description: "Balanced approach. Launch at $10,000 market cap."
  },
  BUILDER: {
    name: "Builder",
    marketCap: 14000,
    description: "Stable foundation. Launch at $14,000 market cap."
  }
};

// Fixed fee tier (1%)
const FEE_TIER = 10000;

// Fixed tick spacing for 1% fee tier
const TICK_SPACING = 200;

// Base network chain ID (mainnet)
const BASE_CHAIN_ID = 8453;

// Helper function to fetch ETH price from CoinGecko with better error handling
async function fetchEthPrice() {
  try {
    const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
    
    if (!response.ok) {
      console.warn(`Error fetching ETH price: HTTP ${response.status}`);
      return 3000; // Default fallback price
    }
    
    const data = await response.json();
    if (data && data.ethereum && data.ethereum.usd) {
      return data.ethereum.usd;
    }
    
    console.warn("Invalid response format from price API");
    return 3000; // Default fallback price
  } catch (error) {
    console.error("Error fetching ETH price:", error);
    return 3000; // Default fallback price
  }
}

// Function to calculate the tick for a target market cap
function calculateTickForMarketCap(targetMarketCapUSD, tokenSupply, ethPriceUSD, tickSpacing) {
  try {
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
  } catch (error) {
    console.error("Error calculating tick:", error);
    // Return safe fallback values
    return {
      validTick: 0, // Neutral tick as fallback
      exactTick: 0,
      actualPriceETH: 0.00001,
      actualPriceUSD: 0.00001 * (ethPriceUSD || 3000),
      actualMarketCapUSD: 0.00001 * (ethPriceUSD || 3000) * tokenSupply
    };
  }
}

// Generate shill text for the new token
function generateShillText(tokenName, tokenSymbol, tokenAddress, marketCapUSD, launchMode) {
  try {
    const formattedMarketCap = marketCapUSD ? `$${marketCapUSD.toLocaleString()}` : "$14,000";
    const modeTag = launchMode ? `#${launchMode}Mode` : "#Builder";
    
    const shillTexts = [
      `🔥 Just deployed ${tokenName} (${tokenSymbol}) on Base! Initial market cap of ${formattedMarketCap}. This is going to be HUGE! Check it out: https://basescan.org/address/${tokenAddress} #Base #DeFi #${tokenSymbol} ${modeTag}`,
      
      `🚀 ${tokenSymbol} has launched on Base in ${launchMode || "Builder"} mode! Get in early on the next moonshot with a starting market cap of only ${formattedMarketCap}! LP is set, ready for takeoff! https://basescan.org/address/${tokenAddress} #Crypto #Base #${tokenSymbol} ${modeTag}`,
      
      `💎 ${tokenName} (${tokenSymbol}) is now LIVE on Base! Perfect entry point at ${formattedMarketCap} mcap with ${launchMode || "Builder"} settings. Diamond hands will be rewarded! https://basescan.org/address/${tokenAddress} #BaseChain #${tokenSymbol} #100x ${modeTag}`,
      
      `⚡️ NEW GEM ALERT: ${tokenSymbol} token just deployed on Base with ${formattedMarketCap} starting mcap in ${launchMode || "Builder"} mode! Early adopters win! https://basescan.org/address/${tokenAddress} #BaseGems #${tokenSymbol} #CryptoGems ${modeTag}`
    ];
    
    // Randomly select one of the shill texts
    return shillTexts[Math.floor(Math.random() * shillTexts.length)];
  } catch (error) {
    console.error("Error generating shill text:", error);
    // Return a safe fallback
    return `${tokenName} (${tokenSymbol}) is now live on Base! Check it out: https://basescan.org/address/${tokenAddress}`;
  }
}

// Add mobile detection helper
const isMobile = () => {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
};

function DeployToken() {
  // State variables for token deployment
  const [tokenName, setTokenName] = useState('');
  const [tokenSymbol, setTokenSymbol] = useState('');
  const [tokenSupply, setTokenSupply] = useState('100000');
  const [feeClaimerAddress, setFeeClaimerAddress] = useState('');
  const [modalWasManuallyClosed, setModalWasManuallyClosed] = useState(false);
  
  // Launch mode selection
  const [launchMode, setLaunchMode] = useState('ULTRA_DEGEN');
  const [targetMarketCap, setTargetMarketCap] = useState(LAUNCH_MODES.ULTRA_DEGEN.marketCap);
  
  // Use wagmi hooks for wallet connection
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const chainId = useChainId();
  
  // State for ethers provider and signer
  const [signer, setSigner] = useState(null);
  const [provider, setProvider] = useState(null);
  
  // Error state
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
  
  // Banana animation state
  const [randomElements, setRandomElements] = useState([]);
  
  // Define the handleAccountsChanged function that was missing
  const handleAccountsChanged = useCallback(async (accounts) => {
    if (accounts.length === 0) {
      // User disconnected their wallet
      console.log('Wallet disconnected');
      // No need to explicitly disconnect since wagmi will handle this
    } else if (accounts[0] !== address) {
      // Account changed
      console.log('Account changed to:', accounts[0]);
      // wagmi will automatically update the account
    }
  }, [address]);
  
  // Set up ethers provider and signer from walletClient
  useEffect(() => {
    const setupSigner = async () => {
      if (walletClient && isConnected) {
        try {
          // Create ethers provider and signer from walletClient
          const ethersProvider = new ethers.BrowserProvider(walletClient);
          const ethersSigner = await ethersProvider.getSigner();
          
          setSigner(ethersSigner);
          setProvider(ethersProvider);
          
          // Get gas price
          try {
            const feeData = await ethersProvider.getFeeData();
            if (feeData && feeData.gasPrice) {
              setGasPrice(ethers.formatUnits(feeData.gasPrice, 'gwei'));
              setCustomGasPrice(ethers.formatUnits(feeData.gasPrice, 'gwei'));
            }
          } catch (error) {
            console.error('Error getting gas price:', error);
          }
          
          // Set fee claimer address to connected address if not set
          if (!feeClaimerAddress) {
            setFeeClaimerAddress(address);
          }
          
          // Fetch ETH price
          try {
            const ethPrice = await fetchEthPrice();
            setEthPriceUSD(ethPrice);
          } catch (ethPriceError) {
            console.error('Error fetching ETH price:', ethPriceError);
            setEthPriceUSD(3000);
          }
        } catch (error) {
          console.error('Error setting up provider/signer:', error);
        }
      }
    };
    
    setupSigner();
  }, [walletClient, isConnected, address, feeClaimerAddress]);
  
  // Generate random bananas effect
  useEffect(() => {
    // Function to generate random position within viewport
    const getRandomPosition = () => {
      return {
        x: Math.random() * 80, // 0-80% of viewport width
        y: Math.random() * 80, // 0-80% of viewport height
      };
    };

    // Number of elements to create
    const numElements = 15; // Adjust to control number of bananas
    const elements = [];
    
    // Use public URL for banana image
    const bananaImage = '/images/banana.png'; // Path relative to public folder
    
    for (let i = 0; i < numElements; i++) {
      const position = getRandomPosition();
      
      // Randomly decide if this banana will zoom
      const willZoom = Math.random() > 0.5;
      
      elements.push({
        id: i,
        image: bananaImage,
        x: position.x,
        y: position.y,
        size: 30 + Math.random() * 50, // Random size between 30px-80px
        animation: 2 + Math.random() * 5, // Random animation duration
        delay: Math.random() * 5, // Random delay
        zoom: willZoom // Whether this banana will zoom
      });
    }
    
    setRandomElements(elements);
  }, []); // Empty dependency array means this runs once on component mount

  // Add second useEffect for repositioning bananas over time
  useEffect(() => {
    // Function to generate a new random position
    const getRandomPosition = () => {
      return {
        x: Math.random() * 80,
        y: Math.random() * 80,
      };
    };
    
    // Set up an interval to change positions of random bananas
    const intervalId = setInterval(() => {
      setRandomElements(prevElements => {
        // Create a copy of the elements array
        const newElements = [...prevElements];
        
        // Randomly select 1-3 bananas to move
        const numToMove = Math.floor(Math.random() * 3) + 1;
        
        for (let i = 0; i < numToMove; i++) {
          // Pick a random banana
          const randomIndex = Math.floor(Math.random() * newElements.length);
          
          // Give it a new position
          const newPosition = getRandomPosition();
          newElements[randomIndex] = {
            ...newElements[randomIndex],
            x: newPosition.x,
            y: newPosition.y,
            // Optionally change other properties
            size: 30 + Math.random() * 50,
            animation: 2 + Math.random() * 5,
            delay: Math.random() * 5,
            // Occasionally change zoom property (10% chance)
            zoom: Math.random() < 0.1 ? !newElements[randomIndex].zoom : newElements[randomIndex].zoom
          };
        }
        
        return newElements;
      });
    }, 4000); // Change positions every 4 seconds
    
    // Clear interval on component unmount
    return () => clearInterval(intervalId);
  }, []);
  
  // Modified switchToBaseNetwork function with useCallback
  const switchToBaseNetwork = useCallback(async () => {
    try {
      // This will be handled by wagmi/RainbowKit automatically
      // If we need custom chain switching logic, we can use wagmi's useSwitchChain hook
      return true;
    } catch (error) {
      console.error('Error switching to Base network:', error);
      setError('Failed to switch to Base network: ' + (error.message || 'Unknown error'));
      return false;
    }
  }, []);
  
  // Modified generateSalt function
  const generateSalt = async () => {
    if (!isConnected || !signer || !tokenName || !tokenSymbol || !tokenSupply) {
      setError('Please connect wallet and provide token details');
      return { success: false };
    }

    try {
      setIsGeneratingSalt(true);
      setError('');

      // Create contract instance
      let contract;
      try {
        contract = new ethers.Contract(
          TOKEN_DEPLOYER_ADDRESS,
          TOKEN_DEPLOYER_ABI,
          signer
        );
      } catch (contractError) {
        console.error('Error creating contract instance:', contractError);
        throw new Error('Failed to create contract instance: ' + contractError.message);
      }

      // Parse supply with ethers v6
      let parsedSupply;
      try {
        parsedSupply = ethers.parseEther(tokenSupply);
      } catch (parseError) {
        console.error('Error parsing supply:', parseError);
        throw new Error('Failed to parse token supply: ' + parseError.message);
      }

      // Increment the salt generation count
      setSaltGenerationCount(prevCount => prevCount + 1);

      let result;
      try {
        result = await contract.generateSalt(
          address,
          tokenName,
          tokenSymbol,
          parsedSupply
        );
      } catch (saltError) {
        console.error('Error calling generateSalt:', saltError);
        throw new Error('Failed to generate salt. The contract may have rejected the request: ' + saltError.message);
      }

      // Extract salt and predicted address from result
      let salt = result[0];
      let predictedAddr = result[1];

      if (!salt || !predictedAddr) {
        throw new Error('Invalid salt or address returned from contract');
      }

      setGeneratedSalt(salt);
      setPredictedAddress(predictedAddr);

      // Calculate market cap statistics based on the generated salt
      let tickValue = null;
      let marketCapData = null;

      if (ethPriceUSD) {
        // Calculate 99% for LP (1% goes to recipient)
        const effectiveSupply = parseFloat(tokenSupply) * 0.99;
        
        // Calculate initial tick based on the selected launch mode
        const tickResult = calculateTickForMarketCap(
          targetMarketCap,
          effectiveSupply,
          ethPriceUSD,
          TICK_SPACING
        );
        
        tickValue = tickResult.validTick;
        marketCapData = {
          targetMarketCap: targetMarketCap,
          actualMarketCap: Math.round(tickResult.actualMarketCapUSD),
          tokenPriceUSD: tickResult.actualPriceUSD,
          tokenPriceETH: tickResult.actualPriceETH
        };
        
        // Update the state
        setInitialTick(tickValue);
        setMarketCapStats(marketCapData);
      }

      setIsGeneratingSalt(false);

      return { 
        success: true,
        salt: salt,
        predictedAddress: predictedAddr,
        initialTick: tickValue,
        marketCapStats: marketCapData
      };
    } catch (err) {
      console.error('Salt generation error:', err);
      setError('Failed to generate salt: ' + (err.message || 'Unknown error'));
      setIsGeneratingSalt(false);
      return { success: false };
    }
  };

  // Function to generate a random salt
  const generateRandomSalt = () => {
    const bytes = new Uint8Array(32);
    window.crypto.getRandomValues(bytes);
    return '0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  };

  // Function to get a valid salt for mobile deployment
  const getValidSaltForMobile = async (contract, address, tokenName, tokenSymbol, parsedSupply) => {
    try {
      // Get WETH address first
      const wethAddress = await contract.weth();
      
      // Try up to 15 times to get a valid salt
      let attempts = 0;
      const maxAttempts = 15;
      
      while (attempts < maxAttempts) {
        // Generate a random salt
        const salt = generateRandomSalt();
        
        // Call generateSalt to get the predicted address
        const [generatedSalt, predictedAddress] = await contract.generateSalt(
          address,
          tokenName,
          tokenSymbol,
          parsedSupply
        );
        
        // Check if the predicted address is valid
        if (predictedAddress.toLowerCase() < wethAddress.toLowerCase()) {
          console.log(`Found valid salt after ${attempts + 1} attempts`);
          return generatedSalt;
        }
        
        attempts++;
        console.log(`Attempt ${attempts} failed - address ${predictedAddress} is not lower than WETH ${wethAddress}`);
      }
      
      throw new Error(`Failed to generate valid salt after ${maxAttempts} attempts`);
    } catch (err) {
      console.error('Error generating salt:', err);
      throw new Error('Failed to generate valid salt: ' + (err.message || 'Unknown error'));
    }
  };

  // Updated deployToken function
  const deployToken = async () => {
    if (!isConnected || !signer) {
      setError('Please connect your wallet first');
      return;
    }

    // Validate inputs
    if (!tokenName || !tokenSymbol || !tokenSupply) {
      setError('Token name, symbol, and supply are required');
      return;
    }

    // Additional input validation
    if (tokenName.length > 64) {
      setError('Token name is too long (maximum 64 characters)');
      return;
    }

    if (tokenSymbol.length > 10) {
      setError('Token symbol is too long (maximum 10 characters)');
      return;
    }

    // Validate token supply format
    if (!/^\d+(\.\d+)?$/.test(tokenSupply)) {
      setError('Token supply must be a valid number');
      return;
    }

    // Validate fee claimer address if provided
    if (feeClaimerAddress && !isValidAddress(feeClaimerAddress)) {
      setError('Invalid fee claimer address format');
      return;
    }

    // Automatically generate salt if not already done
    let saltResult = null;
    let tickToUse = initialTick;
    
    if (!generatedSalt) {
      setError(''); // Clear any existing errors
      try {
        saltResult = await generateSalt();
        if (!saltResult || !saltResult.success) {
          setError('Failed to generate salt. Please try again.');
          return;
        }
        // Use the returned initialTick value directly
        tickToUse = saltResult.initialTick;
      } catch (saltError) {
        console.error('Error generating salt:', saltError);
        setError('Failed to generate salt: ' + (saltError.message || 'Unknown error'));
        return;
      }
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
        console.warn('Failed to fetch ETH price, using default value:', err);
        ethPrice = 3000; // Default fallback price
        setEthPriceUSD(ethPrice);
      }
    }

    try {
      setIsExecuting(true);
      setError('');
      setTxResult(null);
      setShowShillText(false);
      
      // Get the public client
      const publicClient = getPublicClient(wagmiConfig);
      if (!publicClient) {
        throw new Error('Failed to get public client');
      }

      // Calculate token supply
      let parsedSupply;
      try {
        parsedSupply = ethers.parseEther(tokenSupply);
      } catch (parseError) {
        console.error('Error parsing supply:', parseError);
        throw new Error('Failed to parse token supply: ' + parseError.message);
      }
      
      // Safely calculate 1% amount
      let onePercentAmount;
      try {
        onePercentAmount = parsedSupply * BigInt(1) / BigInt(100);
      } catch (calcError) {
        console.error('Error calculating percentage with BigInt:', calcError);
        onePercentAmount = parsedSupply / 100n;
      }

      // Handle null values for function parameters
      const feeClaimerToUse = feeClaimerAddress || address;
      const saltToUse = generatedSalt;

      // For mobile devices, use the same transaction format but different sending method
      if (isMobile()) {
        try {
          // Create contract instance for mobile deployment
          const contract = new ethers.Contract(
            TOKEN_DEPLOYER_ADDRESS,
            TOKEN_DEPLOYER_ABI,
            signer
          );

          // Get a valid salt for mobile deployment
          const validSalt = await getValidSaltForMobile(
            contract,
            address,
            tokenName,
            tokenSymbol,
            parsedSupply
          );

          // Get tick spacing for the fee tier
          const tickSpacing = 200; // Fixed tick spacing for 1% fee tier
          if (!tickSpacing) {
            throw new Error('Failed to get tick spacing');
          }

          // Ensure initial tick is valid
          if (tickToUse % tickSpacing !== 0) {
            // Round to nearest valid tick
            tickToUse = Math.round(tickToUse / tickSpacing) * tickSpacing;
          }

          // Log the function parameters for debugging
          console.log('Function Parameters:', {
            tokenName,
            tokenSymbol,
            parsedSupply: parsedSupply.toString(),
            tickToUse,
            FEE_TIER,
            validSalt,
            feeClaimerToUse,
            RECIPIENT_WALLET,
            onePercentAmount: onePercentAmount.toString(),
            tickSpacing: tickSpacing.toString()
          });

          // For Safari/MetaMask mobile, use a simpler transaction format
          const txParams = {
            from: address,
            to: TOKEN_DEPLOYER_ADDRESS,
            data: contract.interface.encodeFunctionData('deployToken', [
              tokenName,
              tokenSymbol,
              parsedSupply,
              tickToUse,
              FEE_TIER,
              validSalt,
              feeClaimerToUse,
              RECIPIENT_WALLET,
              onePercentAmount
            ]),
            value: useCustomFee 
              ? ethers.parseEther(deploymentFee || '0.0005') 
              : DEFAULT_DEPLOYMENT_FEE,
            gasLimit: 500000,
            gasPrice: useCustomGas 
              ? ethers.parseUnits(customGasPrice || '1', 'gwei')
              : undefined
          };

          // Log the transaction parameters for debugging
          console.log('Transaction Parameters:', {
            ...txParams,
            data: txParams.data,
            value: txParams.value.toString(),
            gasPrice: txParams.gasPrice ? txParams.gasPrice.toString() : undefined
          });

          // Send the transaction using walletClient
          if (!walletClient) {
            throw new Error('Wallet client not available');
          }

          const txResponse = await walletClient.sendTransaction(txParams);
          console.log('Transaction Response:', txResponse);

          setTxHash(txResponse.hash);

          // Wait for transaction with timeout
          const receipt = await Promise.race([
            provider.waitForTransaction(txResponse.hash),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Transaction confirmation timeout')), 30000)
            )
          ]);

          console.log('Transaction Receipt:', receipt);

          if (receipt.status === 1) {
            // Transaction successful
            setTxResult({
              success: true,
              hash: receipt.hash,
              blockNumber: receipt.blockNumber,
              gasUsed: receipt.gasUsed.toString(),
              explorerUrl: `https://basescan.org/tx/${receipt.hash}`
            });
            
            // Generate and show shill text
            const generatedShillText = generateShillText(
              tokenName, 
              tokenSymbol, 
              receipt.hash, 
              marketCapStats ? marketCapStats.actualMarketCap : targetMarketCap, 
              LAUNCH_MODES[launchMode].name
            );
            setShillText(generatedShillText);
            setShowShillText(true);
          } else {
            throw new Error('Transaction failed on-chain');
          }
        } catch (err) {
          console.error('Mobile transaction error:', err);
          throw new Error('Failed to send transaction: ' + (err.message || 'Unknown error'));
        }
      } else {
        // For desktop, use the existing writeContract approach
        const { request } = await publicClient.simulateContract({
          address: TOKEN_DEPLOYER_ADDRESS,
          abi: TOKEN_DEPLOYER_ABI,
          functionName: 'deployToken',
          args: [
            tokenName,
            tokenSymbol,
            parsedSupply,
            tickToUse,
            FEE_TIER,
            await getValidSaltForMobile(
              new ethers.Contract(TOKEN_DEPLOYER_ADDRESS, TOKEN_DEPLOYER_ABI, signer),
              address,
              tokenName,
              tokenSymbol,
              parsedSupply
            ),
            feeClaimerToUse,
            RECIPIENT_WALLET,
            onePercentAmount
          ],
          value: useCustomFee 
            ? ethers.parseEther(deploymentFee || '0.0005') 
            : DEFAULT_DEPLOYMENT_FEE
        });

        // Send the transaction
        const hash = await writeContract(wagmiConfig, request);
        
        if (!hash) {
          throw new Error('Transaction hash not received');
        }
        
        setTxHash(hash);
        
        // Wait for transaction with timeout
        const receipt = await Promise.race([
          publicClient.waitForTransactionReceipt({ hash }),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Transaction confirmation timeout')), 30000)
          )
        ]);
        
        if (!receipt) {
          throw new Error('Transaction receipt not received');
        }

        if (receipt.status === 'success' || receipt.status === 1) {
          // Transaction successful
          setTxResult({
            success: true,
            hash: receipt.transactionHash || receipt.hash,
            blockNumber: receipt.blockNumber,
            gasUsed: receipt.gasUsed?.toString() || '0',
            explorerUrl: `https://basescan.org/tx/${receipt.transactionHash || receipt.hash}`
          });
          
          // Generate and show shill text
          const generatedShillText = generateShillText(
            tokenName, 
            tokenSymbol, 
            hash, 
            marketCapStats ? marketCapStats.actualMarketCap : targetMarketCap, 
            LAUNCH_MODES[launchMode].name
          );
          setShillText(generatedShillText);
          setShowShillText(true);
        } else {
          throw new Error('Transaction failed on-chain');
        }
      }
    } catch (err) {
      console.error('Token deployment error:', err);
      setError('Failed to deploy token: ' + (err.message || 'Unknown error'));
    } finally {
      setIsExecuting(false);
    }
  };

  // Copy shill text to clipboard
  const copyShillText = () => {
    try {
      navigator.clipboard.writeText(shillText).then(
        () => {
          alert('Shill text copied to clipboard!');
        },
        (err) => {
          console.error('Could not copy text: ', err);
          
          // Fallback for browsers without clipboard API
          const textArea = document.createElement("textarea");
          textArea.value = shillText;
          textArea.style.position = "fixed";  // Avoid scrolling to bottom
          document.body.appendChild(textArea);
          textArea.focus();
          textArea.select();
          
          try {
            document.execCommand('copy');
            alert('Shill text copied to clipboard!');
          } catch (execError) {
            console.error('Copy fallback failed:', execError);
            alert('Failed to copy. Please select and copy the text manually.');
          }
          
          document.body.removeChild(textArea);
        }
      );
    } catch (error) {
      console.error('Error copying to clipboard:', error);
      alert('Failed to copy. Please select and copy the text manually.');
    }
  };

  // Share to Twitter
  const shareToTwitter = () => {
    try {
      const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shillText)}`;
      window.open(twitterUrl, '_blank');
    } catch (error) {
      console.error('Error opening Twitter share:', error);
      alert('Failed to open Twitter. Please copy the text and share manually.');
    }
  };

  // Open Sigma buy bot
  const openSigmaBuyBot = () => {
    try {
      const sigmaUrl = "https://t.me/Sigma_buyBot?start=ref=1374068003";
      window.open(sigmaUrl, '_blank');
    } catch (error) {
      console.error('Error opening Sigma buy bot:', error);
      alert('Failed to open Sigma buy bot. Please visit the link manually.');
    }
  };

  // Open Dexscreener for the token
  const openDexscreener = () => {
    if (!txResult || !txResult.tokenAddress) {
      alert('Token address not available yet');
      return;
    }

    try {
      const dexscreenerUrl = `https://dexscreener.com/base/${txResult.tokenAddress}`;
      window.open(dexscreenerUrl, '_blank');
    } catch (error) {
      console.error('Error opening Dexscreener:', error);
      alert('Failed to open Dexscreener. Please visit the link manually.');
    }
  };

  // Enhanced transaction status checking for ethers v6 compatibility
  const checkTransactionStatus = useCallback(async () => {
    if (!txHash && provider) {
      return false;
    }

    try {
      // Get receipt using ethers v6 provider
      let receipt;
      try {
        receipt = await provider.getTransactionReceipt(txHash);
      } catch (receiptError) {
        console.error('Error getting transaction receipt:', receiptError);
        return false;
      }

      if (receipt) {
        // Determine status (in ethers v6, status is typically 1 for success, 0 for failure)
        let status = 'Unknown';
        
        if (receipt.status === 1) {
          status = 'Confirmed';
        } else if (receipt.status === 0) {
          status = 'Failed';
        }
        
        // Extract tokenAddress and tokenId from logs
        let tokenAddress = '';
        let tokenId = '';
        
        if (receipt.logs && receipt.logs.length > 0) {
          for (const log of receipt.logs) {
            try {
              const iface = new ethers.Interface([
                "event TokenCreated(address tokenAddress, uint256 lpNftId, address deployer, string name, string symbol, uint256 supply, address recipient, uint256 recipientAmount)"
              ]);
              
              // In ethers v6, parseLog takes the full log object
              const parsedLog = iface.parseLog(log);
              
              if (parsedLog && parsedLog.name === "TokenCreated") {
                // In ethers v6, args are accessed by index or name
                tokenAddress = parsedLog.args[0]; // First argument is tokenAddress
                tokenId = parsedLog.args[1].toString(); // Second argument is lpNftId
                break;
              }
            } catch (e) {
              // Not the event we're looking for
              continue;
            }
          }
        }
        
        setTxResult(prevResult => {
          const updatedResult = {
            ...prevResult,
            status,
            blockNumber: receipt.blockNumber,
            gasUsed: receipt.gasUsed ? receipt.gasUsed.toString() : 
                    (prevResult?.gasUsed || 'Unknown')
          };
          
          // Only update token info if we found it and it wasn't already set
          if (tokenAddress && !prevResult?.tokenAddress) {
            updatedResult.tokenAddress = tokenAddress;
          }
          
          if (tokenId && !prevResult?.tokenId) {
            updatedResult.tokenId = tokenId;
          }
          
          return updatedResult;
        });
        
        // If this is a confirmed transaction with token address, show shill text if not already shown
        // AND if the modal wasn't manually closed
        if (status === 'Confirmed' && tokenAddress && !showShillText && !modalWasManuallyClosed) {
          const marketCapValue = marketCapStats 
            ? marketCapStats.actualMarketCap 
            : targetMarketCap;
            
          const generatedShillText = generateShillText(
            tokenName, 
            tokenSymbol, 
            tokenAddress, 
            marketCapValue, 
            LAUNCH_MODES[launchMode].name
          );
          
          setShillText(generatedShillText);
          setShowShillText(true);
        }
        
        return true; // Receipt found and processed
      } else {
        // No receipt means still pending
        setTxResult(prevResult => ({
          ...prevResult,
          status: 'Pending'
        }));
        return false; // No receipt yet
      }
    } catch (err) {
      console.error('Error checking transaction:', err);
      return false;
    }
  }, [txHash, provider, launchMode, marketCapStats, showShillText, targetMarketCap, tokenName, tokenSymbol, modalWasManuallyClosed]);

  // Update target market cap when launch mode changes
  useEffect(() => {
    setTargetMarketCap(LAUNCH_MODES[launchMode].marketCap);

    // Re-calculate market cap stats if we have the necessary data
    if (ethPriceUSD && tokenSupply) {
      try {
        // Calculate 99% for LP (1% goes to recipient)
        const effectiveSupply = parseFloat(tokenSupply) * 0.99;
        
        // Calculate initial tick
        const tickResult = calculateTickForMarketCap(
          LAUNCH_MODES[launchMode].marketCap,
          effectiveSupply,
          ethPriceUSD,
          TICK_SPACING
        );
        
        // Update the state
        setInitialTick(tickResult.validTick);
        setMarketCapStats({
          targetMarketCap: LAUNCH_MODES[launchMode].marketCap,
          actualMarketCap: Math.round(tickResult.actualMarketCapUSD),
          tokenPriceUSD: tickResult.actualPriceUSD,
          tokenPriceETH: tickResult.actualPriceETH
        });
      } catch (error) {
        console.error('Error calculating market cap stats:', error);
        // Don't update state if calculation fails
      }
    }
  }, [launchMode, ethPriceUSD, tokenSupply]);

  // Main wallet event setup function
  const setupWalletEvents = useCallback(() => {
    const ethereum = window.ethereum || 
                  window.web3?.currentProvider || 
                  window.injectedWeb3;
                  
    if (ethereum) {
      // Define chain change handler
      const handleChainChanged = async (chainId) => {
        // Convert chainId from hex to decimal
        let chainIdDecimal;
        try {
          // Handle different chainId formats
          if (typeof chainId === 'string' && chainId.startsWith('0x')) {
            chainIdDecimal = parseInt(chainId, 16);
          } else if (typeof chainId === 'number') {
            chainIdDecimal = chainId;
          } else if (typeof chainId === 'bigint') {
            chainIdDecimal = Number(chainId);
          } else {
            chainIdDecimal = parseInt(chainId);
          }
        } catch (error) {
          console.error('Error parsing chainId:', error);
          chainIdDecimal = -1; // Invalid chain ID
        }
        
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
          
          // Refresh wallet connection to ensure we have the latest data
          try {
            // Quietly refresh without full reconnect UI
            const provider = new ethers.BrowserProvider(ethereum);
            const signer = await provider.getSigner();
            
            setSigner(signer);
            setProvider(provider);
            
            // Refresh gas price
            const feeData = await provider.getFeeData();
            if (feeData && feeData.gasPrice) {
              const gasPriceGwei = ethers.formatUnits(feeData.gasPrice, 'gwei');
              setGasPrice(gasPriceGwei);
              setCustomGasPrice(gasPriceGwei);
            }
          } catch (refreshError) {
            console.error('Error refreshing wallet after chain change:', refreshError);
            // Don't show an error to the user, just log it
          }
        }
      };

      // Set up wallet event listeners
      setupWalletEventListeners(ethereum, handleChainChanged, handleAccountsChanged);
    }
  }, [handleAccountsChanged, switchToBaseNetwork]);

  // Set up wallet events when connected
  useEffect(() => {
    setupWalletEvents();

    // Cleanup function to remove event listeners
    return () => {
      const ethereum = window.ethereum || 
                      window.web3?.currentProvider || 
                      window.injectedWeb3;
                      
      if (ethereum) {
        // Remove listeners using whatever method is available
        if (ethereum.removeListener) {
          ethereum.removeListener('chainChanged', () => {});
          ethereum.removeListener('accountsChanged', () => {});
        } else if (ethereum.removeEventListener) {
          ethereum.removeEventListener('chainChanged', () => {});
          ethereum.removeEventListener('accountsChanged', () => {});
        }
      }
    };
  }, [setupWalletEvents]);

  // Effect to check transaction status periodically
  useEffect(() => {
    if (txHash && provider && !modalWasManuallyClosed) {
      // Initial check
      checkTransactionStatus();

      // Set up interval
      const interval = setInterval(() => {
        checkTransactionStatus()
          .then(found => {
            // If transaction is confirmed or failed, stop checking
            if (found) {
              clearInterval(interval);
            }
          })
          .catch(error => {
            console.error('Error in transaction check interval:', error);
          });
      }, 5000);

      // Clean up interval
      return () => clearInterval(interval);
    }
  }, [txHash, provider, checkTransactionStatus, modalWasManuallyClosed]);

  // Function to open the wallet connect modal
  const openConnectModal = () => {
    appKitInstance.open();
  };

  return (
    <div className="contract-interaction">
      {/* Random background bananas */}
      {randomElements.map(el => (
        <div 
          key={el.id}
          className={`floating-background-element ${el.zoom ? 'zoom' : 'no-zoom'}`}
          style={{
            left: `${el.x}%`,
            top: `${el.y}%`,
            animationDuration: `${el.animation}s`,
            animationDelay: `${el.delay}s`
          }}
        >
          <img 
            src={el.image} 
            alt="" 
            style={{
              height: `${el.size}px`,
              width: 'auto',
            }}
          />
        </div>
      ))}
      <h1>Deploy New Token</h1>

      {/* Wallet connection status display - no button here since we use the navbar button */}
      <div className="wallet-status">
        {isConnected ? (
          <div className="connected-status">
            <span className="wallet-address">
              Connected: {address ? `${address.substring(0, 6)}...${address.substring(address.length - 4)}` : ''}
            </span>
          </div>
        ) : (
          <div className="not-connected">
            <span>Wallet not connected</span>
          </div>
        )}
      </div>

      {isConnected ? (
        <div className="contract-form-container">
          <h3>Deploy New Token</h3>
          <p>
            This will deploy a new token with a Uniswap V3 pool. Select your launch mode below.
          </p>
          
          {/* Launch Mode Selector */}
          <div className="launch-mode-section">
            <h4>Select Launch Mode</h4>
            <div className="launch-mode-options">
              <div 
                className={`launch-mode-option ${launchMode === 'ULTRA_DEGEN' ? 'active' : ''}`}
                onClick={() => setLaunchMode('ULTRA_DEGEN')}
              >
                <div className="launch-mode-header">
                  <span className="launch-mode-icon">💎</span>
                  <h5>Ultra Degen</h5>
                </div>
                <p className="launch-mode-description">{LAUNCH_MODES.ULTRA_DEGEN.description}</p>
              </div>
              
              <div 
                className={`launch-mode-option ${launchMode === 'DEGEN' ? 'active' : ''}`}
                onClick={() => setLaunchMode('DEGEN')}
              >
                <div className="launch-mode-header">
                  <span className="launch-mode-icon">🔥</span>
                  <h5>Degen</h5>
                </div>
                <p className="launch-mode-description">{LAUNCH_MODES.DEGEN.description}</p>
              </div>
              
              <div 
                className={`launch-mode-option ${launchMode === 'STANDARD' ? 'active' : ''}`}
                onClick={() => setLaunchMode('STANDARD')}
              >
                <div className="launch-mode-header">
                  <span className="launch-mode-icon">⚖️</span>
                  <h5>Standard</h5>
                </div>
                <p className="launch-mode-description">{LAUNCH_MODES.STANDARD.description}</p>
              </div>
              
              <div 
                className={`launch-mode-option ${launchMode === 'BUILDER' ? 'active' : ''}`}
                onClick={() => setLaunchMode('BUILDER')}
              >
                <div className="launch-mode-header">
                  <span className="launch-mode-icon">🏗️</span>
                  <h5>Builder</h5>
                </div>
                <p className="launch-mode-description">{LAUNCH_MODES.BUILDER.description}</p>
              </div>
            </div>
          </div>
            
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
                  placeholder={address}
                />
                <small>This address will receive LP fees. Defaults to your wallet address.</small>
              </div>
            </div>
          </div>
          
          <div className="deployment-details">
            <h4>Deployment Details</h4>
            <p>• Fee Tier: 1% (fixed)</p>
            <p>• Launch Mode: {LAUNCH_MODES[launchMode].name} (${LAUNCH_MODES[launchMode].marketCap} target)</p>
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
            disabled={isExecuting || !signer || !tokenName || !tokenSymbol || !tokenSupply}
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
                      href={txResult.explorerUrl} 
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
                  <button 
                    onClick={openSigmaBuyBot} 
                    className="sigma-button"
                  >
                    <span role="img" aria-label="Robot">🤖</span> Buy with Sigma
                  </button>
                  <button 
                    onClick={openDexscreener} 
                    className="dexscreener-button"
                  >
                    <span role="img" aria-label="Chart">📊</span> Dexscreener
                  </button>
                </div>
                <button 
                  onClick={() => {
                    // First, clear all intervals to stop periodic checks
                    for (let i = 1; i < 10000; i++) {
                      window.clearInterval(i);
                    }
                    
                    // Force hide the modal with DOM manipulation
                    const modalOverlay = document.querySelector('.modal-overlay');
                    if (modalOverlay) {
                      modalOverlay.style.display = 'none';
                    }
                    
                    // Set internal state with slight delay
                    setTimeout(() => {
                      setModalWasManuallyClosed(true);
                      setShowShillText(false);
                    }, 100);
                  }} 
                  className="close-modal-button"
                >
                  Close
                </button>
              </div>
            </div>
          )}

          <div className="connection-info">
            <p>Connected to chain ID: {chainId}</p>
            <p>Connected address: {address}</p>
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
