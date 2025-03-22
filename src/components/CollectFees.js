import { ethers } from 'ethers';
import React, { useCallback, useEffect, useState } from 'react';
import './modal.css';

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
      
      // Get current gas price
      const currentGasPrice = await provider.getFeeData();
      setGasPrice(ethers.formatUnits(currentGasPrice.gasPrice || 0, 'gwei'));
      
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
      const receipt = await tx.wait();
      
      // Set transaction result
      setTxResult({
        success: true,
        hash: receipt.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
        explorerUrl: getExplorerUrl(receipt.hash)
      });
      
      setIsExecuting(false);
    } catch (err) {
      setError('Transaction failed: ' + err.message);
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
      const interval = setInterval(checkTransactionStatus, 5000);
      return () => clearInterval(interval);
    }
  }, [txHash, wallet, checkTransactionStatus]);

  return (
    <div className="contract-interaction">
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