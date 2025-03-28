import { ethers } from 'ethers';
import React, { useCallback, useEffect, useState } from 'react';
import './modal.css';

/* global BigInt */

// Helper function for safe BigInt conversion with better browser compatibility
const safeBigInt = (value) => {
  // Check if native BigInt is supported
  if (typeof BigInt !== 'undefined') {
    try {
      return BigInt(value);
    } catch (error) {
      console.warn('Error converting to BigInt:', error);
      // Fall back to Number for compatibility
      return Number(value);
    }
  }
  
  // Fallback for browsers without BigInt (like IE)
  return Number(value);
};

// Improved wallet detection system that works across browsers
const detectWalletProvider = () => {
  return new Promise((resolve) => {
    // Check for standard window.ethereum first
    if (window.ethereum) {
      resolve(window.ethereum);
      return;
    }
    
    // Check for legacy web3 provider
    if (window.web3 && window.web3.currentProvider) {
      resolve(window.web3.currentProvider);
      return;
    }
    
    // Check for injected providers with different names (some browsers/extensions use these)
    const injectedProviders = [
      'ethereum',
      'web3.currentProvider',
      'injectedWeb3',
      'injectedEthereum',
      'metamask',
      'trustwallet',
      'coinbase',
      'coinbaseWallet'
    ];
    
    for (const providerName of injectedProviders) {
      try {
        // Try to access through window object with bracket notation
        const providerParts = providerName.split('.');
        let potentialProvider = window;
        
        for (const part of providerParts) {
          if (potentialProvider && potentialProvider[part]) {
            potentialProvider = potentialProvider[part];
          } else {
            potentialProvider = null;
            break;
          }
        }
        
        if (potentialProvider && 
            (typeof potentialProvider.request === 'function' || 
             typeof potentialProvider.enable === 'function' ||
             typeof potentialProvider.sendAsync === 'function' ||
             typeof potentialProvider.send === 'function')) {
          resolve(potentialProvider);
          return;
        }
      } catch (e) {
        // Ignore errors, just try the next provider
        console.debug(`Error checking for ${providerName}:`, e);
      }
    }
    
    // Look for older Internet Explorer-specific wallet integrations
    if (window.external && typeof window.external.getProviderFromExtension === 'function') {
      try {
        const ieProvider = window.external.getProviderFromExtension();
        if (ieProvider) {
          resolve(ieProvider);
          return;
        }
      } catch (e) {
        console.debug('Error getting IE provider extension:', e);
      }
    }
    
    // No wallet provider found
    resolve(null);
  });
};

// Improved provider safety check function that's more compatible with different wallets
const checkProviderSafety = async (provider) => {
  try {
    // More lenient check for wallet providers
    
    // Check if the provider has basic required functionality
    if (!provider || typeof provider !== 'object') {
      console.warn('Invalid provider: Provider is not an object');
      return false;
    }
    
    // Check if the provider has a way to request accounts
    // Different wallets may implement this differently
    const hasRequestMethod = typeof provider.request === 'function' || 
                             typeof provider.enable === 'function' || 
                             (provider.sendAsync && typeof provider.sendAsync === 'function') ||
                             (provider.send && typeof provider.send === 'function');
    
    if (!hasRequestMethod) {
      console.warn('Potentially unsafe provider: No standard request method found');
      return false;
    }
    
    // Check for basic event subscription capability
    // Some providers use different event mechanisms
    const hasEventCapability = typeof provider.on === 'function' || 
                               typeof provider.addEventListener === 'function' ||
                               typeof provider.addListener === 'function';
    
    if (!hasEventCapability) {
      console.warn('Potentially unsafe provider: No event subscription method found');
      return false;
    }
    
    // Try to get chainId using whatever method is available
    let chainId = null;
    try {
      if (typeof provider.request === 'function') {
        chainId = await provider.request({ method: 'eth_chainId' });
      } else if (typeof provider.enable === 'function') {
        await provider.enable();
        chainId = provider.chainId || 
                 (provider.networkVersion ? '0x' + parseInt(provider.networkVersion).toString(16) : null);
      } else if (provider.sendAsync) {
        chainId = await new Promise((resolve, reject) => {
          provider.sendAsync({ method: 'eth_chainId', params: [] }, (error, response) => {
            if (error) reject(error);
            else resolve(response.result);
          });
        });
      } else if (provider.send) {
        const response = await provider.send('eth_chainId', []);
        chainId = response.result || response;
      }
    } catch (error) {
      console.warn('Error getting chainId, but continuing:', error);
      // Don't fail just because we couldn't get chainId
    }
    
    // More lenient chainId validation
    // We'll accept any non-empty chainId as valid
    if (!chainId && provider.chainId) {
      chainId = provider.chainId;
    }
    
    if (!chainId && provider.networkVersion) {
      chainId = '0x' + parseInt(provider.networkVersion).toString(16);
    }
    
    // If we still couldn't get a chainId, we'll assume it might be okay
    // Many providers only provide chainId after connecting
    
    return true;
  } catch (error) {
    console.error('Error checking provider safety:', error);
    // We'll be lenient and return true if the check itself fails
    // This helps with compatibility across browsers
    return true;
  }
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

// Pre-defined contract information for fee collection
const FEE_COLLECTOR_ADDRESS = '0xF3A8E91df4EE6f796410D528d56573B5FB4929B6';
const FEE_COLLECTOR_ABI = [
  {
    "inputs": [],
    "name": "collectAllFees",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "positionsCount",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "totalAmount0",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "totalAmount1",
        "type": "uint256"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];

function CollectFees() {
  // Wallet connection state
  const [wallet, setWallet] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState('');
  
  // Transaction state
  const [isExecuting, setIsExecuting] = useState(false);
  const [txHash, setTxHash] = useState('');
  const [txResult, setTxResult] = useState(null);
  
  // Gas state
  const [gasPrice, setGasPrice] = useState('');
  
  // Modal state
  const [showModal, setShowModal] = useState(false);
  
  // For random banana background
  const [randomElements, setRandomElements] = useState([]);

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

  // Enhanced account change handler for wallet
  const handleAccountsChanged = useCallback((accounts) => {
    if (accounts && accounts.length > 0 && accounts[0] !== wallet?.address) {
      // Account changed, update wallet state
      console.log('Account changed, reconnecting wallet');
      
      // Reconnect wallet to refresh all data
      connectWallet()
        .catch(error => {
          console.error('Error reconnecting after account change:', error);
          setError('Wallet account changed. Please refresh the page if you experience any issues.');
        });
    } else if (!accounts || accounts.length === 0) {
      // Wallet disconnected
      console.log('Wallet disconnected');
      disconnectWallet();
      setError('Wallet disconnected. Please connect again to continue.');
    }
  }, [wallet]);

  // Connect wallet with improved cross-browser compatibility
  const connectWallet = async () => {
    try {
      setIsConnecting(true);
      setError('');
      
      // Detect wallet provider using our helper function
      const ethereum = await detectWalletProvider();
      
      if (!ethereum) {
        setError('No Ethereum wallet detected. Please install MetaMask or another wallet.');
        setIsConnecting(false);
        return;
      }
      
      // Check provider safety
      const isProviderSafe = await checkProviderSafety(ethereum);
      if (!isProviderSafe) {
        setError('Potentially unsafe wallet provider detected. Please verify your wallet extension.');
        setIsConnecting(false);
        return;
      }
      
      // Try different methods to request accounts
      let accounts = [];
      
      try {
        // Modern method (EIP-1102)
        if (typeof ethereum.request === 'function') {
          accounts = await ethereum.request({ method: 'eth_requestAccounts' });
        } 
        // Legacy method
        else if (typeof ethereum.enable === 'function') {
          accounts = await ethereum.enable();
        }
        // Very old method (for Internet Explorer compatibility)
        else if (ethereum.sendAsync && typeof ethereum.sendAsync === 'function') {
          const response = await new Promise((resolve, reject) => {
            ethereum.sendAsync(
              { method: 'eth_requestAccounts', params: [] },
              (error, response) => {
                if (error) reject(error);
                else resolve(response);
              }
            );
          });
          accounts = response.result || [];
        }
        // Fallback for other providers
        else if (ethereum.send && typeof ethereum.send === 'function') {
          try {
            // Some providers expect this format
            const response = await ethereum.send('eth_requestAccounts', []);
            accounts = response.result || response || [];
          } catch (e) {
            // Others expect this format
            accounts = await ethereum.send({ method: 'eth_requestAccounts' });
          }
        }
      } catch (requestError) {
        console.error('Error requesting accounts:', requestError);
        
        // Fallback: try to get accounts without explicit permission if request failed
        if (ethereum.accounts) {
          accounts = ethereum.accounts;
        } else if (typeof ethereum.request === 'function') {
          try {
            accounts = await ethereum.request({ method: 'eth_accounts' });
          } catch (e) {
            console.error('Failed to get accounts:', e);
          }
        }
      }
      
      // If we still have no accounts, we can't continue
      if (!accounts || !accounts.length) {
        setError('Failed to get accounts from wallet. Please make sure your wallet is unlocked and try again.');
        setIsConnecting(false);
        return;
      }
      
      // Validate account format - be more lenient here
      const account = accounts[0];
      if (!account || (typeof account !== 'string') || !(account.startsWith('0x'))) {
        setError('Invalid account format received from wallet.');
        setIsConnecting(false);
        return;
      }
      
      // Create a provider that works with the available ethereum object - ethers v6 style
      let provider;
      try {
        // Use BrowserProvider for ethers v6
        provider = new ethers.BrowserProvider(ethereum);
      } catch (providerError) {
        console.error('Error creating BrowserProvider:', providerError);
        setError('Failed to connect to wallet provider. Please try a different browser or wallet.');
        setIsConnecting(false);
        return;
      }
      
      // Get network information
      let chainId;
      let network;
      
      try {
        network = await provider.getNetwork();
        chainId = network.chainId;
      } catch (networkError) {
        console.error('Error getting network:', networkError);
        
        // Try alternative methods to get chainId
        try {
          if (typeof ethereum.request === 'function') {
            const chainIdHex = await ethereum.request({ method: 'eth_chainId' });
            chainId = safeBigInt(chainIdHex);
          } else if (ethereum.chainId) {
            chainId = safeBigInt(ethereum.chainId);
          } else if (ethereum.networkVersion) {
            chainId = safeBigInt(ethereum.networkVersion);
          } else {
            chainId = safeBigInt(0);
            console.warn('Could not detect network chainId');
          }
        } catch (chainIdError) {
          console.error('Failed to get chainId:', chainIdError);
          chainId = safeBigInt(0);
        }
      }
      
      // Get signer (for v6 this is async)
      let signer;
      try {
        signer = await provider.getSigner();
      } catch (signerError) {
        console.error('Error getting signer:', signerError);
        setError('Failed to get signer from wallet. Please try a different browser or wallet.');
        setIsConnecting(false);
        return;
      }
      
      // Get current gas price with error handling
      let currentGasPriceGwei = '1.5'; // Default fallback gas price
      try {
        const feeData = await provider.getFeeData();
        if (feeData && feeData.gasPrice) {
          currentGasPriceGwei = ethers.formatUnits(feeData.gasPrice, 'gwei');
        }
      } catch (gasPriceError) {
        console.error('Error getting gas price:', gasPriceError);
        // Continue with the default gas price
      }
      
      setGasPrice(currentGasPriceGwei);
      
      const walletInfo = {
        address: account,
        chainId: chainId,
        signer: signer,
        provider: provider
      };
      
      setWallet(walletInfo);
      
      // Set up wallet event listeners
      setupWalletEventListeners(ethereum, 
        // Handle chain changes
        async (chainId) => {
          console.log('Chain changed to:', chainId);
          // Reconnect wallet to refresh network information
          try {
            const network = await provider.getNetwork();
            setWallet(prevWallet => ({
              ...prevWallet,
              chainId: network.chainId
            }));
          } catch (error) {
            console.error('Error updating chain info:', error);
          }
        }, 
        // Handle account changes
        handleAccountsChanged
      );
      
      setIsConnecting(false);
    } catch (err) {
      console.error('Wallet connection error:', err);
      setError('Failed to connect wallet: ' + (err.message || 'Unknown error'));
      setIsConnecting(false);
    }
  };

  // Disconnect wallet
  const disconnectWallet = () => {
    setWallet(null);
    setTxResult(null);
    setTxHash('');
    setShowModal(false);
  };

  // Get the explorer URL for the transaction
  const getExplorerUrl = (txHash) => {
    // Using Base Scan as the explorer
    return `https://basescan.org/tx/${txHash}`;
  };

  // Execute collectAllFees function
  const collectAllFees = async () => {
    if (!wallet) {
      setError('Please connect your wallet first');
      return;
    }

    try {
      setIsExecuting(true);
      setError('');
      setTxResult(null);
      
      const contract = new ethers.Contract(
        FEE_COLLECTOR_ADDRESS,
        FEE_COLLECTOR_ABI,
        wallet.signer
      );
      
      // Call the collectAllFees function with default gas price
      const tx = await contract.collectAllFees();
      setTxHash(tx.hash);
      
      // Wait for transaction to be mined
      try {
        const receipt = await tx.wait();
        
        // Set transaction result
        setTxResult({
          success: true,
          hash: receipt.hash,
          blockNumber: receipt.blockNumber,
          gasUsed: receipt.gasUsed.toString(),
          explorerUrl: getExplorerUrl(receipt.hash)
        });
      } catch (waitError) {
        console.error('Error waiting for transaction:', waitError);
        
        // Try to get receipt manually
        try {
          const receipt = await wallet.provider.getTransactionReceipt(tx.hash);
          if (receipt) {
            setTxResult({
              success: receipt.status === 1,
              hash: receipt.hash,
              blockNumber: receipt.blockNumber,
              gasUsed: receipt.gasUsed.toString(),
              explorerUrl: getExplorerUrl(receipt.hash)
            });
          } else {
            throw new Error('Transaction may be pending');
          }
        } catch (receiptError) {
          console.error('Error getting receipt:', receiptError);
          setTxResult({
            success: false,
            hash: tx.hash,
            status: 'Unknown',
            explorerUrl: getExplorerUrl(tx.hash)
          });
        }
      }
      
      setIsExecuting(false);
    } catch (err) {
      console.error('Transaction error:', err);
      
      // Try to extract useful error message
      let errorMessage = err.message || 'Unknown error';
      
      // Check for common error patterns
      if (errorMessage.includes('insufficient funds')) {
        errorMessage = 'Insufficient funds for transaction. Please check your balance.';
      } else if (errorMessage.includes('gas required exceeds allowance')) {
        errorMessage = 'Gas required exceeds your set limit.';
      } else if (errorMessage.includes('nonce')) {
        errorMessage = 'Transaction nonce error. Try refreshing the page and reconnecting your wallet.';
      } else if (errorMessage.includes('user denied') || errorMessage.includes('user rejected')) {
        errorMessage = 'Transaction was rejected in your wallet.';
      }
      
      setError('Transaction failed: ' + errorMessage);
      setIsExecuting(false);
    }
  };

  // Check transaction status - defined using useCallback to avoid dependency issues
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
          gasUsed: receipt.gasUsed.toString(),
          explorerUrl: getExplorerUrl(txHash)
        }));
      } else {
        setTxResult(prevResult => ({
          ...prevResult,
          status: 'Pending',
          explorerUrl: getExplorerUrl(txHash)
        }));
      }
    } catch (err) {
      console.error('Error checking transaction:', err);
    }
  }, [txHash, wallet]);

  // Effect to check transaction status periodically
  useEffect(() => {
    if (txHash && wallet) {
      // Do initial check
      checkTransactionStatus();
      
      // Then set up interval for repeated checks
      const interval = setInterval(checkTransactionStatus, 5000);
      return () => clearInterval(interval);
    }
  }, [txHash, wallet, checkTransactionStatus]);

  // Effect to clean up listeners when component unmounts
  useEffect(() => {
    return () => {
      // Clean up any event listeners on component unmount
      const ethereum = window.ethereum || 
                      window.web3?.currentProvider || 
                      window.injectedWeb3;
                      
      if (ethereum) {
        if (ethereum.removeListener) {
          ethereum.removeListener('chainChanged', () => {});
          ethereum.removeListener('accountsChanged', () => {});
        } else if (ethereum.removeEventListener) {
          ethereum.removeEventListener('chainChanged', () => {});
          ethereum.removeEventListener('accountsChanged', () => {});
        }
      }
    };
  }, []);

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
      
      <h1>Collect Fees</h1>
      
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
          <h2>Contract: {FEE_COLLECTOR_ADDRESS}</h2>
          <h3>Collect All Fees</h3>
          <p>
            This function will collect fees from all your positions in one transaction.
            It returns the number of positions processed and the total amounts collected.
          </p>
          
          {gasPrice && (
            <div className="gas-info">
              Current network gas price: {gasPrice} Gwei (using network default)
            </div>
          )}
          
          <button
            onClick={collectAllFees}
            disabled={isExecuting}
            className="execute-button"
          >
            {isExecuting ? 'Collecting Fees...' : 'Collect All Fees'}
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
              </div>
              <button 
                onClick={() => setShowModal(true)}
                className="close-modal-button"
                style={{ backgroundColor: '#ffb300', color: '#000', marginTop: '15px' }}
              >
                View Fee Collection Details
              </button>
            </div>
          )}

          <div className="connection-info">
            <p>Connected to chain ID: {wallet.chainId.toString()}</p>
            <p>Connected address: {wallet.address}</p>
          </div>
        </div>
      ) : (
        <div className="connect-prompt">
          <p>Please connect your wallet to collect fees</p>
        </div>
      )}
      
      {/* Fee Collection Results Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>Fee Collection Results</h3>
            
            <div className="fee-results">
              <h4>Collected Fees</h4>
              <p>View transaction details on block explorer:</p>
              <a 
                href={txResult.explorerUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="explorer-link"
                style={{
                  display: 'inline-block',
                  padding: '10px 15px',
                  backgroundColor: '#4CAF50',
                  color: 'white',
                  textDecoration: 'none',
                  borderRadius: '4px',
                  marginTop: '10px',
                  marginBottom: '20px'
                }}
              >
                View on Basescan
              </a>
            </div>
            
            <div className="tx-details">
              <p>Transaction hash: {txResult.hash}</p>
              <p>Block number: {txResult.blockNumber}</p>
              <p>Gas used: {txResult.gasUsed}</p>
              {txResult.status && <p>Status: {txResult.status}</p>}
            </div>
            
            <button 
              onClick={() => setShowModal(false)}
              className="close-modal-button"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default CollectFees;