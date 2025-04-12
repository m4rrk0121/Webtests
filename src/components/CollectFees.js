
  const [shillText, setShillText] = useState('');
  const [showShillText, setShowShillText] = useState(false);
  
  // For random banana background
  const [randomElements, setRandomElements] = useState([]);
  
  // Error state
  const [error, setError] = useState('');

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

  // Simple function to handle the collect fees action
  const collectAllFees = () => {
    if (!isConnected) {
      setError('Please connect your wallet first');
      return;
    }

    setIsExecuting(true);
    setError('');
    setTxResult(null);
    setShowShillText(false);
    setModalShownForCurrentTx(false); // Reset for new transaction

    // Use the AppKit method that works across all platforms
    appKitInstance.sendTransaction({
      to: FEE_COLLECTOR_ADDRESS,
      data: '0x79c1bb78', // Function selector for collectAllFees()
    })
    .then(response => {
      // Handle successful transaction
      const hash = response?.hash || 'unknown';
      setTxHash(hash);
      
      // Set success result
      setTxResult({
        success: true,
        hash: hash,
        blockNumber: 'Pending',
        gasUsed: 'Pending',
        status: 'Submitted',
        explorerUrl: getExplorerUrl(hash)
      });
      
      // Only automatically show modal if it hasn't been shown for this transaction
      if (!modalShownForCurrentTx) {
        setShowModal(true);
        setModalShownForCurrentTx(true);
      }
      
      // Generate shill text
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
    })
    .catch(error => {
      console.error('Transaction error:', error);
      setError(`Transaction failed: ${error.message || 'Unknown error'}`);
    })
    .finally(() => {
      setIsExecuting(false);
    });
  };

  // Function to open wallet connect modal
  const openConnectModal = () => {
    appKitInstance.open();
  };

  // Close modal and prevent it from reappearing
  const handleCloseModal = () => {
    setShowModal(false);
  };

  // Effect to reset relevant state when modal is closed
  useEffect(() => {
    if (!showModal) {
      // Mark that the modal has been shown for the current transaction
      setModalShownForCurrentTx(true);
    }
  }, [showModal]);

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
            <button 
              onClick={openConnectModal}
              style={{
                backgroundColor: '#ffb300',
                color: '#000',
                border: 'none',
                borderRadius: '4px',
                padding: '5px 15px',
                marginLeft: '15px',
                cursor: 'pointer',
                fontFamily: "'Chewy', cursive",
                fontSize: '0.9rem'
              }}
            >
              Connect Wallet
            </button>
          </div>
        )}
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
              <h4>Transaction submitted!</h4>
              <div className="tx-details">
                <p>Transaction hash: {txResult.hash}</p>
                <p>Status: Transaction submitted</p>
              </div>
              <button 
                onClick={() => {
                  setModalShownForCurrentTx(false);
                  setShowModal(true);
                }}
                className="view-details-button"
                style={{ backgroundColor: '#ffb300', color: '#000', marginTop: '15px' }}
              >
                View Fee Collection Details
              </button>
            </div>
          )}

          <div className="connection-info">
            <p>Connected to chain ID: {chainId?.toString() || 'Unknown'}</p>
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
        <div className="modal-overlay" onClick={handleCloseModal}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>Fee Collection Results</h3>
            
            <div className="fee-results">
              <h4>Collected Fees</h4>
              <p>View transaction details on block explorer:</p>
              <a 
                href={txResult?.explorerUrl || "https://basescan.org"} 
                target="_blank" 
                rel="noopener noreferrer"
                className="explorer-link"
              >
                View on Basescan
              </a>
            </div>
            
            <div className="tx-details">
              <p>Transaction hash: {txResult?.hash || "Submitted"}</p>
              <p>Status: Transaction submitted</p>
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
              onClick={handleCloseModal}
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
