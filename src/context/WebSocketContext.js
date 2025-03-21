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
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const socketRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const MAX_RECONNECT_ATTEMPTS = 5;

  useEffect(() => {
    // Connection URL based on environment
    const SOCKET_URL = process.env.NODE_ENV === 'production'
      ? 'https://websocket-okv9.onrender.com'
      : 'http://localhost:4003';
    
    console.log(`Setting up WebSocket connection to ${SOCKET_URL}`);
    
    // Create socket connection with better reconnection options
    const socket = io(SOCKET_URL, {
      withCredentials: false,
      transports: ['websocket', 'polling'], // Try websocket first, fallback to polling
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000
    });
    
    socketRef.current = socket;
    
    // Set up connection event handlers
    socket.on('connect', () => {
      console.log('WebSocket connected');
      setIsConnected(true);
      setReconnectAttempts(0);
      
      // Clear any reconnect timeout if it exists
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    });
    
    socket.on('disconnect', (reason) => {
      console.log(`WebSocket disconnected: ${reason}`);
      setIsConnected(false);
      
      // These reasons will trigger a reconnect by Socket.IO
      if (reason === 'io server disconnect' || reason === 'transport close') {
        // Server disconnected us, need to manually reconnect
        socket.connect();
      }
      
      // Set up additional manual reconnect as backup
      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectTimeoutRef.current = setTimeout(() => {
          setReconnectAttempts(prev => prev + 1);
          console.log(`Manual reconnect attempt ${reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS}`);
          socket.connect();
        }, 2000);
      } else {
        console.log('Falling back to HTTP polling');
      }
    });
    
    socket.on('connect_error', (err) => {
      console.error('WebSocket connection error:', err);
      setIsConnected(false);
      
      // Similar manual reconnect as backup
      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectTimeoutRef.current = setTimeout(() => {
          setReconnectAttempts(prev => prev + 1);
          console.log(`Manual reconnect attempt after error ${reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS}`);
          socket.connect();
        }, 2000);
      }
    });
    
    // Ping the server regularly to keep connection alive
    const pingInterval = setInterval(() => {
      if (socket.connected) {
        socket.emit('ping');
      }
    }, 30000); // 30 seconds
    
    // Clean up on unmount
    return () => {
      console.log('Cleaning up WebSocket connection');
      clearInterval(pingInterval);
      
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      
      // Only disconnect if we have a connection
      if (socket.connected) {
        socket.disconnect();
      }
    };
  }, [reconnectAttempts]);
  
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
    reconnectAttempts,
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