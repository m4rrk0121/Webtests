import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';

// Create context
const WebSocketContext = createContext(null);

// Hook to use the WebSocket context
export function useWebSocket() {
  return useContext(WebSocketContext);
}

// Provider component
export function WebSocketProvider({ children }) {
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);

  useEffect(() => {
    // Connection URL based on environment
    const SOCKET_URL = process.env.NODE_ENV === 'production'
      ? 'https://websocket-okv9.onrender.com'
      : 'http://localhost:4003';
    
    console.log(`Setting up WebSocket connection to ${SOCKET_URL}`);
    
    // Create socket connection
    const socket = io(SOCKET_URL, {
      withCredentials: false,
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });
    
    socketRef.current = socket;
    
    // Set up connection event handlers
    socket.on('connect', () => {
      console.log('WebSocket connected');
      setIsConnected(true);
      
      // Clear any reconnect timeout if it exists
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    });
    
    socket.on('disconnect', () => {
      console.log('WebSocket disconnected');
      setIsConnected(false);
      
      // Set up reconnect timeout
      reconnectTimeoutRef.current = setTimeout(() => {
        console.log('Attempting to reconnect...');
        socket.connect();
      }, 2000);
    });
    
    socket.on('connect_error', (err) => {
      console.error('WebSocket connection error:', err);
      setIsConnected(false);
    });
    
    // Clean up on unmount
    return () => {
      console.log('Cleaning up WebSocket connection');
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      socket.disconnect();
    };
  }, []);
  
  // Methods to interact with the socket
  const emit = (event, data) => {
    if (socketRef.current && isConnected) {
      console.log(`Emitting event: ${event}`, data);
      socketRef.current.emit(event, data);
      return true;
    } else {
      console.warn(`Cannot emit event: ${event} - socket is not connected`);
      return false;
    }
  };
  
  const addListener = (event, callback) => {
    if (socketRef.current) {
      console.log(`Adding listener for event: ${event}`);
      socketRef.current.on(event, callback);
      return true;
    }
    return false;
  };
  
  const removeListener = (event, callback) => {
    if (socketRef.current) {
      console.log(`Removing listener for event: ${event}`);
      socketRef.current.off(event, callback);
      return true;
    }
    return false;
  };
  
  // Manually reconnect if needed
  const reconnect = () => {
    if (socketRef.current && !isConnected) {
      console.log('Manually reconnecting...');
      socketRef.current.connect();
    }
  };
  
  // Expose the socket and helper methods to consumers
  const value = {
    socket: socketRef.current,
    isConnected,
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
}