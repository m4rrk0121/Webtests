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
    // Get environment-appropriate WebSocket URL
    const SOCKET_URL = process.env.NODE_ENV === 'production'
      ? 'https://websocket-okv9.onrender.com'  // Production URL
      : 'http://localhost:4004';               // Development URL
      
    console.log(`[WebSocketContext] Connecting to WebSocket server at: ${SOCKET_URL}`);
    
    // Initialize socket connection
    socketRef.current = io(SOCKET_URL, {
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 20000
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
    });
    
    socketRef.current.on('disconnect', (reason) => {
      console.log('[WebSocketContext] Disconnected from WebSocket server. Reason:', reason);
      setIsConnected(false);
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
      socketRef.current.connect();
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