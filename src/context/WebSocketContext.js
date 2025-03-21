import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';

// Create WebSocket context
const WebSocketContext = createContext(null);

export const WebSocketProvider = ({ children }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const socketRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const listenerMapRef = useRef(new Map());
  const MAX_RECONNECT_ATTEMPTS = 5;
  const RECONNECT_INTERVAL = 3000; // 3 seconds
  
  // Websocket URL - use environment variable in production
  const SOCKET_URL = process.env.REACT_APP_WEBSOCKET_URL || 'https://websocket-okv9.onrender.com';
  
  // Helper function to log with timestamp
  const logWithTimestamp = (message, level = 'log') => {
    const timestamp = new Date().toISOString();
    if (level === 'error') {
      console.error(`[${timestamp}] WebSocket: ${message}`);
    } else {
      console.log(`[${timestamp}] WebSocket: ${message}`);
    }
  };

  // Initialize WebSocket connection
  const initializeSocket = useCallback(() => {
    if (socketRef.current) {
      logWithTimestamp('Cleaning up existing socket connection');
      socketRef.current.removeAllListeners();
      socketRef.current.close();
      socketRef.current = null;
    }

    logWithTimestamp(`Connecting to WebSocket at ${SOCKET_URL}`);
    
    // Create socket with reconnection options
    socketRef.current = io(SOCKET_URL, {
      reconnection: true,
      reconnectionAttempts: 3,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      transports: ['websocket', 'polling']
    });

    // Connection established
    socketRef.current.on('connect', () => {
      logWithTimestamp('Connected to WebSocket server');
      setIsConnected(true);
      setReconnectAttempts(0);
      
      // Re-register all existing event listeners
      listenerMapRef.current.forEach((callbacks, event) => {
        callbacks.forEach(callback => {
          socketRef.current.on(event, callback);
        });
      });
    });

    // Connection error
    socketRef.current.on('connect_error', (error) => {
      logWithTimestamp(`Connection error: ${error.message}`, 'error');
      handleDisconnect();
    });

    // Disconnection
    socketRef.current.on('disconnect', (reason) => {
      logWithTimestamp(`Disconnected from WebSocket server: ${reason}`);
      handleDisconnect();
    });

  }, []);

  // Handle disconnect and reconnection
  const handleDisconnect = () => {
    setIsConnected(false);
    
    // Only try manual reconnect if socket.io reconnection fails
    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      logWithTimestamp(`Attempting to reconnect (${reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS})...`);
      clearTimeout(reconnectTimerRef.current);
      
      reconnectTimerRef.current = setTimeout(() => {
        setReconnectAttempts(prev => prev + 1);
        initializeSocket();
      }, RECONNECT_INTERVAL);
    } else {
      logWithTimestamp('Maximum reconnection attempts reached. Falling back to HTTP polling.', 'error');
      // Application should handle fallback to HTTP polling
    }
  };

  // Initialize socket on component mount
  useEffect(() => {
    initializeSocket();
    
    // Clean up on unmount
    return () => {
      logWithTimestamp('Cleaning up WebSocket connection');
      clearTimeout(reconnectTimerRef.current);
      
      if (socketRef.current) {
        socketRef.current.removeAllListeners();
        socketRef.current.close();
      }
    };
  }, [initializeSocket]);

  // Emit an event to the server
  const emit = useCallback((event, data, callback) => {
    if (socketRef.current && isConnected) {
      logWithTimestamp(`Emitting event: ${event}`);
      socketRef.current.emit(event, data, callback);
      return true;
    } else {
      logWithTimestamp(`Failed to emit event: ${event} - Socket not connected`, 'error');
      return false;
    }
  }, [isConnected]);

  // Add event listener
  const addListener = useCallback((event, callback) => {
    // Store callback in our map for reconnect purposes
    if (!listenerMapRef.current.has(event)) {
      listenerMapRef.current.set(event, []);
    }
    listenerMapRef.current.get(event).push(callback);
    
    // Add listener to socket if connected
    if (socketRef.current) {
      socketRef.current.on(event, callback);
      logWithTimestamp(`Added listener for event: ${event}`);
    }
  }, []);

  // Remove event listener
  const removeListener = useCallback((event, callback) => {
    // Remove from our map
    if (listenerMapRef.current.has(event)) {
      const callbacks = listenerMapRef.current.get(event);
      const index = callbacks.indexOf(callback);
      if (index !== -1) {
        callbacks.splice(index, 1);
        if (callbacks.length === 0) {
          listenerMapRef.current.delete(event);
        } else {
          listenerMapRef.current.set(event, callbacks);
        }
      }
    }
    
    // Remove from socket if connected
    if (socketRef.current) {
      socketRef.current.off(event, callback);
      logWithTimestamp(`Removed listener for event: ${event}`);
    }
  }, []);

  // Manual reconnect function
  const reconnect = useCallback(() => {
    logWithTimestamp('Manual reconnection initiated');
    setReconnectAttempts(0);
    initializeSocket();
  }, [initializeSocket]);

  // Context value
  const contextValue = {
    isConnected,
    emit,
    addListener,
    removeListener,
    reconnect,
    reconnectAttempts
  };

  return (
    <WebSocketContext.Provider value={contextValue}>
      {children}
    </WebSocketContext.Provider>
  );
};

// Custom hook to use the WebSocket context
export const useWebSocket = () => {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
};