// WebSocketContext.js
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';

const WebSocketContext = createContext(null);

export const useWebSocket = () => useContext(WebSocketContext);

export const WebSocketProvider = ({ children }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState(null);
  const socketRef = useRef(null);
  const listenersRef = useRef({});
  
  // Track connection attempts to implement exponential backoff
  const connectionAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;
  
  // Track event listeners for each client to prevent duplicates
  const socketEventCountRef = useRef({});
  
  // Store received token details updates to deduplicate
  const lastReceivedUpdatesRef = useRef({});

  useEffect(() => {
    // Keep the WebSocket URL consistent
    const SOCKET_URL = 'https://websocket-okv9.onrender.com';
      
    console.log(`[WebSocketContext] Connecting to WebSocket server at: ${SOCKET_URL}`);
    
    // Only create a new socket if one doesn't exist or if it's disconnected
    if (!socketRef.current) {
      // Initialize socket connection with improved connection parameters
      socketRef.current = io(SOCKET_URL, {
        reconnectionAttempts: maxReconnectAttempts,
        reconnectionDelay: 2000,
        timeout: 30000,
        transports: ['websocket', 'polling'],
        forceNew: true,
        autoConnect: true,
        extraHeaders: {
          "Origin": window.location.origin
        }
      });
      
      // Reset event counters
      socketEventCountRef.current = {};
    }
    
    // Cleanup function to prevent memory leaks
    const cleanupSocket = () => {
      // Reset all event listeners
      Object.keys(listenersRef.current).forEach(event => {
        listenersRef.current[event].forEach(callback => {
          if (socketRef.current) {
            socketRef.current.off(event, callback);
          }
        });
      });
      
      // Clear listeners ref
      listenersRef.current = {};
      
      // Reset event counts
      socketEventCountRef.current = {};
    };
    
    // Connection event handlers
    const handleConnect = () => {
      console.log('[WebSocketContext] Connected to WebSocket server with ID:', socketRef.current.id);
      setIsConnected(true);
      setConnectionError(null);
      connectionAttemptsRef.current = 0;
    };
    
    const handleConnectError = (err) => {
      console.error('[WebSocketContext] Socket connection error:', err);
      setIsConnected(false);
      setConnectionError(err.message || 'Connection error');
      console.log('[WebSocketContext] WebSocket connection failed, app will use HTTP polling fallback');
      connectionAttemptsRef.current++;
    };
    
    const handleDisconnect = (reason) => {
      console.log('[WebSocketContext] Disconnected from WebSocket server. Reason:', reason);
      setIsConnected(false);
      
      // Only reconnect if we haven't exceeded max attempts
      if (connectionAttemptsRef.current < maxReconnectAttempts) {
        // Only automatically reconnect for transport issues
        if (reason === 'io server disconnect' || reason === 'transport close') {
          console.log(`[WebSocketContext] Attempting to reconnect (attempt ${connectionAttemptsRef.current + 1} of ${maxReconnectAttempts})...`);
          
          // Add exponential backoff
          const delay = Math.min(2000 * Math.pow(1.5, connectionAttemptsRef.current), 10000);
          
          setTimeout(() => {
            if (socketRef.current) {
              socketRef.current.connect();
            }
          }, delay);
          
          connectionAttemptsRef.current++;
        }
      } else {
        console.log('[WebSocketContext] Max reconnection attempts reached. Please try manual reconnection.');
      }
    };
    
    const handleError = (error) => {
      console.error('[WebSocketContext] Socket error:', error);
    };
    
    // Make sure we only add these handlers once
    if (socketRef.current) {
      // First remove any existing handlers to prevent duplicates
      socketRef.current.off('connect', handleConnect);
      socketRef.current.off('connect_error', handleConnectError);
      socketRef.current.off('disconnect', handleDisconnect);
      socketRef.current.off('error', handleError);
      
      // Then add them back
      socketRef.current.on('connect', handleConnect);
      socketRef.current.on('connect_error', handleConnectError);
      socketRef.current.on('disconnect', handleDisconnect);
      socketRef.current.on('error', handleError);
    }
    
    // Clean up on unmount
    return () => {
      console.log('[WebSocketContext] Cleaning up WebSocket connection');
      
      cleanupSocket();
      
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []); // Empty dependency array ensures this runs only once
  
  // Method to send events to the WebSocket server
  const emit = (event, data, callback) => {
    if (socketRef.current && isConnected) {
      return socketRef.current.emit(event, data, callback);
    } else {
      console.warn(`[WebSocketContext] Attempted to emit '${event}' but socket is ${socketRef.current ? 'not connected' : 'null'}`);
      return false;
    }
  };
  
  // Method to add event listeners with duplicate prevention
  const addListener = (event, callback) => {
    if (!socketRef.current) return false;
    
    // Special handling for token-details-update to deduplicate messages
    if (event === 'token-details-update') {
      // Replace the callback with a deduplicating version
      const wrappedCallback = (data) => {
        // Create a simple signature for the update
        const tokenAddress = data?.contractAddress;
        if (!tokenAddress) {
          // If no address, just pass through
          return callback(data);
        }
        
        // Check if we've received this exact update recently (within last 3 seconds)
        const now = Date.now();
        const lastUpdate = lastReceivedUpdatesRef.current[tokenAddress];
        
        if (lastUpdate && (now - lastUpdate.timestamp < 3000)) {
          // Skip this update to avoid spam
          return;
        }
        
        // Record this update with timestamp
        lastReceivedUpdatesRef.current[tokenAddress] = {
          timestamp: now,
          data: data
        };
        
        // Pass the update to the original callback
        callback(data);
      };
      
      // Store a reference to the wrapped callback
      if (!listenersRef.current[event]) {
        listenersRef.current[event] = [];
      }
      
      // Store both the original and wrapped callback for cleanup
      listenersRef.current[event].push({
        original: callback,
        wrapped: wrappedCallback
      });
      
      // Add the wrapped listener
      socketRef.current.on(event, wrappedCallback);
      
      // Track the number of listeners for this event
      socketEventCountRef.current[event] = (socketEventCountRef.current[event] || 0) + 1;
      
      console.log(`[WebSocketContext] Added listener for ${event}. Total: ${socketEventCountRef.current[event]}`);
      
      return true;
    } else {
      // Standard event handling
      socketRef.current.on(event, callback);
      
      // Store the callback ref
      if (!listenersRef.current[event]) {
        listenersRef.current[event] = [];
      }
      listenersRef.current[event].push(callback);
      
      // Track the number of listeners
      socketEventCountRef.current[event] = (socketEventCountRef.current[event] || 0) + 1;
      
      return true;
    }
  };
  
  // Method to remove event listeners
  const removeListener = (event, callback) => {
    if (!socketRef.current) return false;
    
    if (callback) {
      // Handle token-details-update deduplication wrappers
      if (event === 'token-details-update' && listenersRef.current[event]) {
        // Find the wrapper for this callback
        const listenerEntry = listenersRef.current[event].find(entry => 
          entry.original === callback || entry.wrapped === callback
        );
        
        if (listenerEntry) {
          // Remove the wrapped listener
          socketRef.current.off(event, listenerEntry.wrapped);
          
          // Update listeners ref
          listenersRef.current[event] = listenersRef.current[event].filter(entry => 
            entry.original !== callback && entry.wrapped !== callback
          );
          
          // Decrement count
          if (socketEventCountRef.current[event]) {
            socketEventCountRef.current[event]--;
          }
          
          console.log(`[WebSocketContext] Removed listener for ${event}. Remaining: ${socketEventCountRef.current[event] || 0}`);
          
          return true;
        }
      } else {
        // Standard event handling
        socketRef.current.off(event, callback);
        
        // Update listeners ref
        if (listenersRef.current[event]) {
          listenersRef.current[event] = listenersRef.current[event].filter(cb => cb !== callback);
        }
        
        // Decrement count
        if (socketEventCountRef.current[event]) {
          socketEventCountRef.current[event]--;
        }
        
        return true;
      }
    } else {
      // Remove all listeners for this event
      socketRef.current.off(event);
      delete listenersRef.current[event];
      delete socketEventCountRef.current[event];
      
      return true;
    }
    
    return false;
  };
  
  // Force reconnection method with reset
  const reconnect = () => {
    if (socketRef.current) {
      console.log('[WebSocketContext] Forcing reconnection...');
      
      // Reset connection attempts 
      connectionAttemptsRef.current = 0;
      
      // Clean up existing listeners to prevent duplicates
      Object.keys(listenersRef.current).forEach(event => {
        if (event === 'token-details-update') {
          listenersRef.current[event].forEach(entry => {
            socketRef.current.off(event, entry.wrapped);
          });
        } else {
          listenersRef.current[event].forEach(callback => {
            socketRef.current.off(event, callback);
          });
        }
      });
      
      // Reset event tracking
      listenersRef.current = {};
      socketEventCountRef.current = {};
      
      // Disconnect and reconnect
      socketRef.current.disconnect();
      
      setTimeout(() => {
        if (socketRef.current) {
          socketRef.current.connect();
        }
      }, 1000);
      
      return true;
    }
    return false;
  };
  
  // Heartbeat check with rate limiting
  useEffect(() => {
    let heartbeatInterval;
    
    if (isConnected && socketRef.current) {
      heartbeatInterval = setInterval(() => {
        socketRef.current.emit('ping', null, () => {
          // Optional: check response time here
        });
      }, 30000); // 30 second heartbeat
    }
    
    return () => {
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
      }
    };
  }, [isConnected]);
  
  // Cleanup old token updates periodically
  useEffect(() => {
    const cleanupInterval = setInterval(() => {
      const now = Date.now();
      
      // Remove updates older than 30 seconds
      Object.keys(lastReceivedUpdatesRef.current).forEach(key => {
        const update = lastReceivedUpdatesRef.current[key];
        if (now - update.timestamp > 30000) {
          delete lastReceivedUpdatesRef.current[key];
        }
      });
    }, 60000); // Run every minute
    
    return () => {
      clearInterval(cleanupInterval);
    };
  }, []);
  
  const value = {
    socket: socketRef.current,
    isConnected,
    connectionError,
    emit,
    addListener,
    removeListener,
    reconnect
  };
  
  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
};

export default WebSocketContext;
