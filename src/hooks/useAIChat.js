// src/hooks/useAIChat.js
import { useState } from 'react';

// API client for the backend proxy
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';
const API_KEY = process.env.REACT_APP_CLIENT_API_KEY;

/**
 * Custom hook for handling AI chat functionality
 */
export const useAIChat = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [usageStats, setUsageStats] = useState(null);

  /**
   * Get AI response from the backend proxy
   * @param {Array} messageHistory - Previous messages in the conversation
   * @param {String} userInput - The latest user message
   * @param {Object} options - Additional options for the API call
   * @returns {Promise<String>} - The AI response text
   */
  const getAIResponse = async (messageHistory, userInput, options = {}) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${API_URL}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': API_KEY
        },
        body: JSON.stringify({
          messages: messageHistory,
          userInput,
          model: options.model || 'gpt-3.5-turbo',
          temperature: options.temperature || 0.7,
          max_tokens: options.max_tokens || 300
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to get AI response');
      }
      
      const data = await response.json();
      
      // Update usage stats if available
      if (data.usage) {
        setUsageStats(prevStats => ({
          ...prevStats,
          lastRequestTokens: data.usage.total_tokens,
          totalTokens: (prevStats?.totalTokens || 0) + data.usage.total_tokens
        }));
      }
      
      return data.response;
    } catch (err) {
      setError(err.message || 'An error occurred while getting the AI response');
      // Return a fallback response when API fails
      return "Sorry, I'm having trouble connecting right now. Please try again later or contact our support team for assistance.";
    } finally {
      setIsLoading(false);
    }
  };
  
  /**
   * Get usage statistics for the AI service
   */
  const getUsageStats = async () => {
    try {
      const response = await fetch(`${API_URL}/api/usage`, {
        headers: {
          'X-API-Key': API_KEY
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch usage stats');
      }
      
      const data = await response.json();
      setUsageStats(data);
      return data;
    } catch (err) {
      setError(err.message);
      return null;
    }
  };
  
  // Fallback local response system (used when API is unavailable)
  const getLocalResponse = (input) => {
    const lowerInput = input.toLowerCase();
    
    if (lowerInput.includes('buy') || lowerInput.includes('purchase')) {
      return "To buy a token on KOA, connect your wallet, enter the ETH amount you want to spend, and click 'Buy'. The transaction will need to be confirmed in your wallet.";
    } else if (lowerInput.includes('sell')) {
      return "To sell a token, go to the token page, connect your wallet, switch to 'Sell' mode, enter the amount you want to sell, and confirm the transaction.";
    } else if (lowerInput.includes('deploy') || lowerInput.includes('create token')) {
      return "You can deploy your own token by going to the 'Deploy Token' page, connecting your wallet, filling in your token details, and following the deployment steps. Fees range from 0.01-0.05 ETH depending on complexity.";
    } else if (lowerInput.includes('fee')) {
      return "KOA uses a 1% fee tier for trading. Token deployment costs 0.01-0.05 ETH depending on complexity. Updating token information costs 0.005 ETH.";
    } else if (lowerInput.includes('image') || lowerInput.includes('logo')) {
      return "To update your token's image, go to 'Update Token Info', connect the wallet that deployed the token, upload your image or provide a URL, and pay the small update fee.";
    } else if (lowerInput.includes('koa') || lowerInput.includes('platform')) {
      return "KOA (King of Apes) is a platform for exploring, trading, and deploying tokens on the Base network. It offers token exploration, trading, deployment, portfolio tracking, and analytics in a jungle-themed environment.";
    } else {
      return "I don't have specific information about that, but you can explore more on our dashboard or contact our support team through Discord or Telegram for more help.";
    }
  };

  return {
    isLoading,
    error,
    usageStats,
    getAIResponse,
    getLocalResponse,
    getUsageStats
  };
};

export default useAIChat;