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

  useEffect(() => {
    // Keep the WebSocket URL consistent
    const SOCKET_URL = 'https://websocket-okv9.onrender.com';
      
    console.log(`[WebSocketContext] Connecting to WebSocket server at: ${SOCKET_URL}`);
    
    // Initialize socket connection with improved connection parameters
    socketRef.current = io(SOCKET_URL, {
      reconnectionAttempts: 10,      // Increased from 5
      reconnectionDelay: 2000,       // Increased from 1000
      timeout: 30000,                // Increased from 20000
      transports: ['websocket', 'polling'],  // Try WebSocket first, then polling
      forceNew: true,                // Force a new connection
      autoConnect: true,             // Auto connect
      extraHeaders: {                // Add explicit CORS headers
        "Origin": window.location.origin
      }
    });
    
    // Connection event handlers
    socketRef.current.on('connect', () => {
      console.log('[WebSocketContext] Connected to WebSocket server with ID:', socketRef.current.id);
      setIsConnected(true);
      setConnectionError(null);
    });
    
    socketRef.current.on('connect_error', (err) => {
      console.error('[WebSocketContext] Socket connection error:', err);
      setIsConnected(false);
      setConnectionError(err.message || 'Connection error');
      console.log('[WebSocketContext] WebSocket connection failed, app will use HTTP polling fallback');
    });
    
    socketRef.current.on('disconnect', (reason) => {
      console.log('[WebSocketContext] Disconnected from WebSocket server. Reason:', reason);
      setIsConnected(false);
      
      // If the disconnect was unexpected, try to reconnect
      if (reason === 'io server disconnect' || reason === 'transport close') {
        console.log('[WebSocketContext] Attempting to reconnect...');
        socketRef.current.connect();
      }
    });
    
    socketRef.current.on('error', (error) => {
      console.error('[WebSocketContext] Socket error:', error);
    });
    
    // Clean up on unmount
    return () => {
      console.log('[WebSocketContext] Cleaning up WebSocket connection');
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
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
  
  // Method to add event listeners
  const addListener = (event, callback) => {
    if (socketRef.current) {
      socketRef.current.on(event, callback);
      
      // Store the callback ref so we can remove it later
      if (!listenersRef.current[event]) {
        listenersRef.current[event] = [];
      }
      listenersRef.current[event].push(callback);
      
      return true;
    }
    return false;
  };
  
  // Method to remove event listeners
  const removeListener = (event, callback) => {
    if (socketRef.current && callback) {
      socketRef.current.off(event, callback);
      
      // Update listeners ref
      if (listenersRef.current[event]) {
        listenersRef.current[event] = listenersRef.current[event].filter(cb => cb !== callback);
      }
      
      return true;
    } else if (socketRef.current && !callback) {
      // Remove all listeners for this event
      socketRef.current.off(event);
      delete listenersRef.current[event];
      return true;
    }
    return false;
  };
  
  // Force reconnection method
  const reconnect = () => {
    if (socketRef.current) {
      console.log('[WebSocketContext] Forcing reconnection...');
      socketRef.current.disconnect();
      setTimeout(() => {
        socketRef.current.connect();
      }, 1000); // Short delay before reconnecting
      return true;
    }
    return false;
  };
  
  // Heartbeat check to ensure connection is alive
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
