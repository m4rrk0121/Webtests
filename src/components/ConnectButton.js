const ConnectButton = () => {
  const kitResult = useOnchainKit();
  console.log("Full Onchain Kit result:", kitResult);
  
  // Destructure with defaults to prevent errors
  const { 
    connect = () => console.log("Connect function not available"), 
    disconnect = () => console.log("Disconnect function not available"), 
    isConnected = false, 
    address = "" 
  } = kitResult || {};
  
  const handleClick = async () => {
    console.log("Button clicked");
    try {
      if (isConnected) {
        console.log("Calling disconnect function");
        await disconnect();
      } else {
        console.log("Calling connect function");
        await connect();
      }
      console.log("Function call completed");
    } catch (error) {
      console.error("Error during wallet connection:", error);
    }
  };
  
  return (
    <button
      onClick={handleClick}
      style={{
        background: '#0052ff',
        color: 'white',
        border: 'none',
        borderRadius: '6px',
        padding: '10px 16px',
        cursor: 'pointer',
        fontWeight: 'bold',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px'
      }}
    >
      {isConnected ? 
        `${address?.substring(0, 6)}...${address?.substring(address?.length - 4)}` : 
        'Connect Wallet'}
    </button>
  );
};