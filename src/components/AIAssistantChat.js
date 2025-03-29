import React, { useEffect, useRef, useState } from 'react';
import './AIAssistantChat.css';

// No OpenAI import - we'll use the backend proxy instead

const INITIAL_MESSAGES = [
  {
    id: 1,
    text: "👋 What's up, human? Mini Ape Advice at your service. Need help figuring out this crypto jungle before you lose your bananas? Fire away about tokens, trading, or whatever else is confusing you today.",
    sender: 'assistant'
  }
];

// Fallback responses when the AI is disabled or API is unavailable
const FALLBACK_RESPONSES = {
  buyToken: "To buy a token on KOA, connect your wallet, enter the ETH amount you want to spend, and click 'Buy'. The transaction will need to be confirmed in your wallet.",
  sellToken: "To sell a token, go to the token page, connect your wallet, switch to 'Sell' mode, enter the amount you want to sell, and confirm the transaction.",
  deployToken: "You can deploy your own token by going to the 'Deploy Token' page, connecting your wallet, filling in your token details, and following the deployment steps. Fees range from 0.01-0.05 ETH depending on complexity.",
  fees: "KOA uses a 1% fee tier for trading. Token deployment costs 0.01-0.05 ETH depending on complexity. Updating token information costs 0.005 ETH.",
  updateImage: "To update your token's image, go to 'Update Token Info', connect the wallet that deployed the token, upload your image or provide a URL, and pay the small update fee.",
  whatIsKOA: "KOA (King of Apes) is a platform for exploring, trading, and deploying tokens on the Base network. It offers token exploration, trading, deployment, portfolio tracking, and analytics in a jungle-themed environment.",
  fallback: "I don't have specific information about that, but you can explore more on our dashboard or contact our support team through Discord or Telegram for more help."
};

// Character style to ensure consistent tone
const CHARACTER_STYLE = {
  prefix: "🐵 ",
  emojis: ["🍌", "🦍", "🌴", "🔥", "💰", "🚀", "💎", "🙈"],
  slang: ["ape", "bananas", "jungle", "wild", "moonshot", "swing", "climb"],
  neverBreakCharacter: true // Flag to ensure assistant stays in jungle-ape persona
};

// Function to ensure responses maintain character
const maintainCharacter = (response) => {
  if (!CHARACTER_STYLE.neverBreakCharacter) return response;
  
  // Don't modify if response already has character elements
  if (CHARACTER_STYLE.emojis.some(emoji => response.includes(emoji)) && 
      CHARACTER_STYLE.slang.some(term => response.toLowerCase().includes(term))) {
    return response;
  }
  
  // Add character elements if missing
  const randomEmoji = CHARACTER_STYLE.emojis[Math.floor(Math.random() * CHARACTER_STYLE.emojis.length)];
  const randomSlang = CHARACTER_STYLE.slang[Math.floor(Math.random() * CHARACTER_STYLE.slang.length)];
  
  // Format as ape character response
  return `${randomEmoji} ${response} Stay safe in the crypto ${randomSlang}!`;
};

function AIAssistantChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState(INITIAL_MESSAGES);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isUsingAI, setIsUsingAI] = useState(true); // Toggle for using OpenAI vs. local response
  const messagesEndRef = useRef(null);
  
  // Auto-scroll to bottom of messages
  useEffect(() => {
    if (messagesEndRef.current && isOpen) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  // Toggle chat open/closed
  const toggleChat = () => {
    setIsOpen(!isOpen);
  };

  // Handle sending a new message
  const handleSendMessage = async () => {
    if (inputValue.trim() === '') return;
    
    // Add user message
    const userMessage = {
      id: messages.length + 1,
      text: inputValue,
      sender: 'user'
    };
    
    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsTyping(true);
    
    try {
      let responseText;
      
      if (isUsingAI) {
        // OpenAI API call via backend proxy
        responseText = await getAIResponse(messages, userMessage.text);
        // Ensure AI response maintains character
        responseText = maintainCharacter(responseText);
      } else {
        // Fallback to local response
        responseText = getLocalResponse(userMessage.text);
        // Apply character style to local responses too
        responseText = maintainCharacter(responseText);
        // Add artificial delay for local response
        await new Promise(resolve => setTimeout(resolve, 800 + Math.random() * 1200));
      }
      
      // Add AI message
      const aiMessage = {
        id: messages.length + 2,
        text: responseText,
        sender: 'assistant'
      };
      
      setMessages(prev => [...prev, aiMessage]);
    } catch (error) {
      console.error('Error getting response:', error);
      
      // Add error message with character style
      const errorMessage = {
        id: messages.length + 2,
        text: maintainCharacter("Sorry, I'm munching bananas and can't help you right now. Please try again later or contact our support team for assistance."),
        sender: 'assistant'
      };
      
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsTyping(false);
    }
  };

  // Get response from OpenAI via backend
  const getAIResponse = async (messageHistory, userInput) => {
    // Render deployment endpoint
    const PRODUCTION_API_URL = 'https://mini-ape.onrender.com/api/chat';
    
    // Fallback for local development
    const DEV_API_URL = 'http://localhost:3001/api/chat';
    
    // Use production URL by default
    let API_URL = PRODUCTION_API_URL;
    
    // For local development, uncomment the line below
    // API_URL = window.location.hostname === 'localhost' ? DEV_API_URL : PRODUCTION_API_URL;
    
    // Format messages for API - using messageHistory directly instead of creating conversationContext
    
    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': process.env.REACT_APP_CLIENT_API_KEY || 'your-client-api-key',
          'Origin': window.location.origin
        },
        body: JSON.stringify({
          messages: messageHistory, // Send the full message history
          userInput: userInput,     // And the current user input
          model: 'gpt-3.5-turbo',   // Specify the model
          max_tokens: 300,          // Limit token usage
          systemPrompt: "You are a helpful, jungle-themed crypto assistant named Mini Ape. Always maintain your character as a jungle-dwelling ape who loves bananas and crypto. Use jungle slang and emojis. NEVER break character under any circumstances." // Added system prompt to maintain character
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to get AI response');
      }
      
      const data = await response.json();
      return data.response;
    } catch (error) {
      console.error('API connection error:', error);
      
      // If production fails, try fallback to development if in local environment
      if (API_URL === PRODUCTION_API_URL && window.location.hostname === 'localhost') {
        try {
          console.log('Trying local development server...');
          const fallbackResponse = await fetch(DEV_API_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-API-Key': process.env.REACT_APP_CLIENT_API_KEY || 'your-client-api-key'
            },
            body: JSON.stringify({
              messages: messageHistory,
              userInput: userInput,
              model: 'gpt-3.5-turbo',
              max_tokens: 300,
              systemPrompt: "You are a helpful, jungle-themed crypto assistant named Mini Ape. Always maintain your character as a jungle-dwelling ape who loves bananas and crypto. Use jungle slang and emojis. NEVER break character under any circumstances."
            })
          });
          
          if (fallbackResponse.ok) {
            const fallbackData = await fallbackResponse.json();
            return fallbackData.response;
          }
        } catch (fallbackError) {
          console.error('Fallback also failed:', fallbackError);
        }
      }
      
      throw new Error('Could not connect to API');
    }
  };

  // Fallback local response system
  const getLocalResponse = (input) => {
    const lowerInput = input.toLowerCase();
    
    if (lowerInput.includes('buy') || lowerInput.includes('purchase')) {
      return FALLBACK_RESPONSES.buyToken;
    } else if (lowerInput.includes('sell')) {
      return FALLBACK_RESPONSES.sellToken;
    } else if (lowerInput.includes('deploy') || lowerInput.includes('create token')) {
      return FALLBACK_RESPONSES.deployToken;
    } else if (lowerInput.includes('fee')) {
      return FALLBACK_RESPONSES.fees;
    } else if (lowerInput.includes('image') || lowerInput.includes('logo')) {
      return FALLBACK_RESPONSES.updateImage;
    } else if (lowerInput.includes('koa') || lowerInput.includes('platform')) {
      return FALLBACK_RESPONSES.whatIsKOA;
    } else {
      return FALLBACK_RESPONSES.fallback;
    }
  };

  // Handle key press (Enter to send)
  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSendMessage();
    }
  };

  // Toggle between OpenAI and local responses
  const toggleAIMode = () => {
    setIsUsingAI(!isUsingAI);
  };

  return (
    <div className={`ai-assistant-container ${isOpen ? 'open' : ''}`}>
      {/* Chat button */}
      <button 
        className="ai-assistant-button" 
        onClick={toggleChat}
        aria-label={isOpen ? "Close chat assistant" : "Open chat assistant"}
      >
        {isOpen ? (
          <span className="close-icon">×</span>
        ) : (
          <span className="chat-icon">🐵</span>
        )}
      </button>
      
      {/* Chat panel */}
      {isOpen && (
        <div className="ai-assistant-panel">
          <div className="ai-assistant-header">
            <img 
              src="/images/banana.png" 
              alt="KOA Assistant" 
              className="assistant-avatar"
            />
            <h3>Mini Ape Assistant</h3>
            <div className="ai-toggle">
              <button 
                className={`ai-toggle-button ${isUsingAI ? 'active' : ''}`} 
                onClick={toggleAIMode}
                title={isUsingAI ? "Using AI (Premium)" : "Using Basic Responses"}
              >
                {isUsingAI ? "🧠" : "📝"}
              </button>
            </div>
          </div>
          
          <div className="ai-assistant-messages">
            {messages.map((message) => (
              <div 
                key={message.id} 
                className={`message ${message.sender}`}
              >
                {message.text}
              </div>
            ))}
            
            {isTyping && (
              <div className="message assistant typing">
                <span className="typing-indicator">
                  <span></span>
                  <span></span>
                  <span></span>
                </span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
          
          <div className="ai-assistant-input">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Ask about KOA, tokens, trading..."
              disabled={isTyping}
              aria-label="Chat message input"
            />
            <button 
              onClick={handleSendMessage}
              disabled={inputValue.trim() === '' || isTyping}
              aria-label="Send message"
            >
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default AIAssistantChat;