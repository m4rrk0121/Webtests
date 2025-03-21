// This script helps recover from React initialization failures
(function() {
  // Check if we're on a token detail page
  var isTokenPage = window.location.pathname.indexOf('/token/') === 0;
  
  // If we're on a token page, extract the contract address
  var contractAddress = '';
  if (isTokenPage) {
    contractAddress = window.location.pathname.split('/token/')[1];
  }
  
  // Set a timeout to detect if React fails to render
  var recoveryTimer = setTimeout(function() {
    // Check if React has rendered anything
    var rootElement = document.getElementById('root');
    var hasReactContent = rootElement && rootElement.childElementCount > 0;
    
    // If no React content after 5 seconds, show emergency fallback
    if (!hasReactContent) {
      console.log('React failed to initialize, showing emergency fallback');
      showEmergencyFallback(contractAddress);
    }
  }, 5000);
  
  // Function to show emergency content if React fails
  function showEmergencyFallback(address) {
    var rootElement = document.getElementById('root');
    if (!rootElement) return;
    
    // Clear any existing content
    rootElement.innerHTML = '';
    
    // Create emergency UI
    var emergencyUI = document.createElement('div');
    emergencyUI.style.backgroundColor = '#000000';
    emergencyUI.style.color = '#ffb300';
    emergencyUI.style.fontFamily = "'Chewy', cursive";
    emergencyUI.style.minHeight = '100vh';
    emergencyUI.style.display = 'flex';
    emergencyUI.style.flexDirection = 'column';
    emergencyUI.style.justifyContent = 'center';
    emergencyUI.style.alignItems = 'center';
    emergencyUI.style.padding = '20px';
    emergencyUI.style.textAlign = 'center';
    
    var title = document.createElement('h1');
    title.textContent = 'Jungle Token Dashboard';
    title.style.color = '#ffb300';
    title.style.marginBottom = '20px';
    
    var message = document.createElement('p');
    message.textContent = 'We encountered a problem loading the application.';
    message.style.fontSize = '18px';
    message.style.marginBottom = '30px';
    
    var actionButton = document.createElement('a');
    actionButton.textContent = 'Return to Homepage';
    actionButton.href = '/';
    actionButton.style.backgroundColor = '#ffb300';
    actionButton.style.color = '#000000';
    actionButton.style.padding = '10px 20px';
    actionButton.style.borderRadius = '5px';
    actionButton.style.textDecoration = 'none';
    actionButton.style.fontWeight = 'bold';
    actionButton.style.fontSize = '16px';
    
    emergencyUI.appendChild(title);
    emergencyUI.appendChild(message);
    emergencyUI.appendChild(actionButton);
    
    rootElement.appendChild(emergencyUI);
  }
  
  // Clear the timer if React manages to render
  window.addEventListener('load', function() {
    // Give React a little extra time after load
    setTimeout(function() {
      clearTimeout(recoveryTimer);
    }, 1000);
  });
})();