import {
  Address,
  Avatar,
  EthBalance,
  Identity,
  Name
} from '@coinbase/onchainkit/identity';
import {
  ConnectWallet,
  Wallet,
  WalletDropdown,
  WalletDropdownDisconnect
} from '@coinbase/onchainkit/wallet';
import { ethers } from 'ethers';
import React, { useCallback, useEffect, useState } from 'react';
import { useAccount, useChainId } from 'wagmi';
import './modal.css';

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
  // Use Wagmi hooks for wallet connection
  const { 
    address, 
    isConnected, 
    connector 
  } = useAccount();
  const { chain } = useChainId ();

  // Transaction state
  const [isExecuting, setIsExecuting] = useState(false);
  const [txHash, setTxHash] = useState('');
  const [txResult, setTxResult] = useState(null);
  
  // Gas state
  const [gasPrice, setGasPrice] = useState('');
  
  // Modal state
  const [showModal, setShowModal] = useState(false);
  
  // Shill text state
  const [shillText, setShillText] = useState('');
  const [showShillText, setShowShillText] = useState(false);
  
  // For random banana background
  const [randomElements, setRandomElements] = useState([]);
  
  // Error state
  const [error, setError] = useState('');

  // Create ethers provider and signer
  const [ethersProvider, setEthersProvider] = useState(null);
  const [signer, setSigner] = useState(null);

  // Setup provider and signer when connection changes
  useEffect(() => {
    const setupProvider = async () => {
      if (isConnected && connector) {
        try {
          // Get the provider from the connector
          const provider = await connector.getProvider();
          
          // Create ethers provider
          const newEthersProvider = new ethers.BrowserProvider(provider);
          setEthersProvider(newEthersProvider);
          
          // Create signer
          const newSigner = await newEthersProvider.getSigner();
          setSigner(newSigner);
          
          // Get gas price
          try {
            const feeData = await newEthersProvider.getFeeData();
            if (feeData && feeData.gasPrice) {
              setGasPrice(ethers.formatUnits(feeData.gasPrice, 'gwei'));
            }
          } catch (error) {
            console.error('Error getting gas price:', error);
          }
        } catch (error) {
          console.error('Error setting up provider/signer:', error);
          setError('Failed to initialize wallet connection');
        }
      } else {
        // Clear provider and signer if wallet disconnected
        setEthersProvider(null);
        setSigner(null);
      }
    };
    
    setupProvider();
  }, [isConnected, connector]);

  // Generate shill text for fee collection
  function generateFeeCollectionShillText() {
    try {
      const shillTexts = [
        `🍌 Just collected my staking rewards on King of Apes! Passive income while I sleep - this is the way! Check it out: https://kingofapes.fun/ #KingOfApes #PassiveIncome #DeFi #Base`,
        
        `💰 Another day, another fee collection on King of Apes! Loving these $KOA rewards! Join the kingdom: https://kingofapes.fun/ #KingOfApes #DeFi #YieldFarming #Base`,
        
        `🐒 Fee collection day on King of Apes! My LP position keeps generating rewards. So easy to claim with one click! https://kingofapes.fun/ #KingOfApes #Rewards #DeFi #Base`,
        
        `⚡️ Just collected fees on King of Apes platform! My token is working for me 24/7. Want passive income too? https://kingofapes.fun/ #KingOfApes #DeFi #PassiveIncome #Base`
      ];
      
      return shillTexts[Math.floor(Math.random() * shillTexts.length)];
    } catch (error) {
      console.error("Error generating shill text:", error);
      return `Just collected my fees on King of Apes! Check it out: https://kingofapes.fun/`;
    }
  }

  // Get the explorer URL for the transaction
  const getExplorerUrl = (txHash) => {
    return `https://basescan.org/tx/${txHash}`;
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
          textArea.style.position = "fixed";
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

  // Execute collectAllFees function
  const collectAllFees = async () => {
    if (!isConnected || !signer) {
      setError('Please connect your wallet first');
      return;
    }

    try {
      setIsExecuting(true);
      setError('');
      setTxResult(null);
      setShowShillText(false);
      
      const contract = new ethers.Contract(
        FEE_COLLECTOR_ADDRESS,
        FEE_COLLECTOR_ABI,
        signer
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

        // Generate shill text for the fee collection
        const generatedShillText = generateFeeCollectionShillText();
        setShillText(generatedShillText);
        setShowShillText(true);
        
        // Play a sound effect
        try {
          const sound = new Audio('/Tarzan.mp3');
          sound.volume = 0.7;
          sound.play();
        } catch (e) {
          console.log("Error playing sound:", e);
        }
      } catch (waitError) {
        console.error('Error waiting for transaction:', waitError);
        
        // Try to get receipt manually
        try {
          const receipt = await ethersProvider.getTransactionReceipt(tx.hash);
          if (receipt) {
            setTxResult({
              success: receipt.status === 1,
              hash: receipt.hash,
              blockNumber: receipt.blockNumber,
              gasUsed: receipt.gasUsed.toString(),
              explorerUrl: getExplorerUrl(receipt.hash)
            });

            // Generate shill text if transaction was successful
            if (receipt.status === 1) {
              const generatedShillText = generateFeeCollectionShillText();
              setShillText(generatedShillText);
              setShowShillText(true);
            }
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

  // Generate random bananas effect
  useEffect(() => {
    const getRandomPosition = () => ({
      x: Math.random() * 80,
      y: Math.random() * 80,
    });

    const numElements = 15;
    const elements = [];
    const bananaImage = '/images/banana.png';
    
    for (let i = 0; i < numElements; i++) {
      const position = getRandomPosition();
      const willZoom = Math.random() > 0.5;
      
      elements.push({
        id: i,
        image: bananaImage,
        x: position.x,
        y: position.y,
        size: 30 + Math.random() * 50,
        animation: 2 + Math.random() * 5,
        delay: Math.random() * 5,
        zoom: willZoom
      });
    }
    
    setRandomElements(elements);
  }, []);

  // Reposition bananas periodically
  useEffect(() => {
    const getRandomPosition = () => ({
      x: Math.random() * 80,
      y: Math.random() * 80,
    });

    const intervalId = setInterval(() => {
      setRandomElements(prevElements => {
        const newElements = [...prevElements];
        const numToMove = Math.floor(Math.random() * 3) + 1;
        
        for (let i = 0; i < numToMove; i++) {
          const randomIndex = Math.floor(Math.random() * newElements.length);
          const newPosition = getRandomPosition();
          
          newElements[randomIndex] = {
            ...newElements[randomIndex],
            x: newPosition.x,
            y: newPosition.y,
            size: 30 + Math.random() * 50,
            animation: 2 + Math.random() * 5,
            delay: Math.random() * 5,
            zoom: Math.random() < 0.1 ? !newElements[randomIndex].zoom : newElements[randomIndex].zoom
          };
        }
        
        return newElements;
      });
    }, 4000);
    
    return () => clearInterval(intervalId);
  }, []);

  // Check transaction status
  const checkTransactionStatus = useCallback(async () => {
    if (!txHash || !ethersProvider) return;

    try {
      const receipt = await ethersProvider.getTransactionReceipt(txHash);
      
      if (receipt) {
        const isConfirmed = receipt.status === 1;
        
        setTxResult(prevResult => ({
          ...prevResult,
          status: isConfirmed ? 'Confirmed' : 'Failed',
          blockNumber: receipt.blockNumber,
          gasUsed: receipt.gasUsed.toString(),
          explorerUrl: getExplorerUrl(txHash)
        }));
        
        if (isConfirmed && !showShillText) {
          const generatedShillText = generateFeeCollectionShillText();
          setShillText(generatedShillText);
          setShowShillText(true);
        }
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
  }, [txHash, ethersProvider, showShillText]);

  // Effect to check transaction status periodically
  useEffect(() => {
    if (txHash && ethersProvider) {
      checkTransactionStatus();
      const interval = setInterval(checkTransactionStatus, 5000);
      return () => clearInterval(interval);
    }
  }, [txHash, ethersProvider, checkTransactionStatus]);

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
        <Wallet>
          <ConnectWallet>
            <Avatar className="h-6 w-6" />
            <Name />
          </ConnectWallet>
          <WalletDropdown>
            <Identity className="px-4 pt-3 pb-2" hasCopyAddressOnClick>
              <Avatar />
              <Name />
              <Address />
              <EthBalance />
            </Identity>
            <WalletDropdownDisconnect />
          </WalletDropdown>
        </Wallet>
      </div>

      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      {isConnected ? (
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
            <p>Connected to chain ID: {chain?.id?.toString() || 'Unknown'}</p>
            <p>Connected address: {address}</p>
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
              >
                View on Basescan
              </a>
            </div>
            
            <div className="tx-details">
              <p>Transaction hash: {txResult.hash}</p>
              <p>Block number: {txResult.blockNumber}</p>
              <p>Gas used: {txResult.gasUsed}</p>
              {txResult.status && <p>Status: <span className={`status-${txResult.status.toLowerCase()}`}>{txResult.status}</span></p>}
            </div>
            
            {/* Shill Section */}
            {showShillText && shillText && (
              <div className="shill-section">
                <h4>Share Your Success</h4>
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
                    🐦 Post to Twitter
                  </button>
                </div>
              </div>
            )}
            
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