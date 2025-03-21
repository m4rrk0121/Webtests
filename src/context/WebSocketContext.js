import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';

// Create context
const WebSocketContext = createContext(null);

// Enum for connection states
const ConnectionState = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  ERROR: 'error'
};

// Hook to use the WebSocket context
export function useWebSocket() {
  return useContext(WebSocketContext);
}

// Provider component
export function WebSocketProvider({ children }) {
  // Connection state management
  const [connectionState, setConnectionState] = useState(ConnectionState.DISCONNECTED);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  
  // Refs for socket and timers
  const socketRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const connectionAttemptRef = useRef(null);
  
  // Configuration
  const MAX_RECONNECT_ATTEMPTS = 10;
  const RECONNECT_BASE_DELAY = 1000; // 1 second
  const RECONNECT_MAX_DELAY = 30000; // 30 seconds
  const PING_INTERVAL = 45000; // 45 seconds
  const CONNECTION_TIMEOUT = 25000; // 25 seconds

  // Exponential backoff calculation
  const calculateReconnectDelay = useCallback((attempts) => {
    const delay = Math.min(
      RECONNECT_BASE_DELAY * Math.pow(2, attempts),
      RECONNECT_MAX_DELAY
    );
    return delay + Math.random() * 1000; // Add jitter
  }, []);

  // Comprehensive connection setup
  const setupSocketConnection = useCallback(() => {
    // Cleanup any existing connection
    if (socketRef.current) {
      socketRef.current.disconnect();
    }

    // Connection URL based on environment
    const SOCKET_URL = process.env.NODE_ENV === 'production'
      ? 'https://websocket-okv9.onrender.com'
      : 'http://localhost:4003';
    
    console.log(`Attempting WebSocket connection to ${SOCKET_URL}`);
    
    // Reset connection state
    setConnectionState(ConnectionState.CONNECTING);
    
    // Create socket with enhanced options
    const socket = io(SOCKET_URL, {
      reconnection: true,
      reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
      reconnectionDelay: RECONNECT_BASE_DELAY,
      reconnectionDelayMax: RECONNECT_MAX_DELAY,
      timeout: CONNECTION_TIMEOUT,
      transports: ['websocket', 'polling'],
      forceNew: true, // Ensure a fresh connection
      withCredentials: false
    });
    
    socketRef.current = socket;

    // Connection success handler
    const onConnect = () => {
      console.log('WebSocket connected successfully');
      setConnectionState(ConnectionState.CONNECTED);
      setReconnectAttempts(0);
      
      // Clear any existing reconnect timers
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };

    // Connection error handler
    const onConnectError = (error) => {
      console.error('WebSocket connection error:', error);
      setConnectionState(ConnectionState.ERROR);
      
      // Trigger reconnection
      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        const delay = calculateReconnectDelay(reconnectAttempts);
        
        reconnectTimeoutRef.current = setTimeout(() => {
          setReconnectAttempts(prev => prev + 1);
          console.log(`Reconnection attempt ${reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS}`);
          setupSocketConnection();
        }, delay);
      } else {
        console.warn('Max reconnection attempts reached. Falling back to alternative communication.');
        setConnectionState(ConnectionState.DISCONNECTED);
      }
    };

    // Disconnection handler
    const onDisconnect = (reason) => {
      console.log(`WebSocket disconnected: ${reason}`);
      setConnectionState(ConnectionState.DISCONNECTED);
      
      // Automatic reconnection for certain disconnect reasons
      if (reason === 'io server disconnect' || reason === 'transport close') {
        setupSocketConnection();
      }
    };

    // Attach event listeners
    socket.on('connect', onConnect);
    socket.on('connect_error', onConnectError);
    socket.on('disconnect', onDisconnect);

    // Periodic ping to maintain connection
    const pingInterval = setInterval(() => {
      if (socket.connected) {
        socket.emit('ping', { timestamp: Date.now() });
      }
    }, PING_INTERVAL);

    // Connection attempt timeout
    connectionAttemptRef.current = setTimeout(() => {
      if (connectionState === ConnectionState.CONNECTING) {
        console.warn('Connection attempt timed out');
        onConnectError(new Error('Connection attempt timed out'));
      }
    }, CONNECTION_TIMEOUT);

    // Cleanup function
    return () => {
      clearInterval(pingInterval);
      clearTimeout(connectionAttemptRef.current);
      
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      
      socket.off('connect', onConnect);
      socket.off('connect_error', onConnectError);
      socket.off('disconnect', onDisconnect);
      
      socket.disconnect();
    };
  }, [reconnectAttempts, calculateReconnectDelay]);

  // Initial and dependency-driven connection setup
  useEffect(() => {
    const cleanup = setupSocketConnection();
    return cleanup;
  }, [setupSocketConnection]);

  // Methods to interact with the socket
  const emit = useCallback((event, data) => {
    if (socketRef.current && connectionState === ConnectionState.CONNECTED) {
      console.log(`Emitting event: ${event}`, data);
      socketRef.current.emit(event, data);
      return true;
    } else {
      console.warn(`Cannot emit event: ${event} - socket is not connected`);
      return false;
    }
  }, [connectionState]);

  const addListener = useCallback((event, callback) => {
    if (socketRef.current) {
      console.log(`Adding listener for event: ${event}`);
      socketRef.current.on(event, callback);
      return true;
    }
    return false;
  }, []);

  const removeListener = useCallback((event, callback) => {
    if (socketRef.current) {
      console.log(`Removing listener for event: ${event}`);
      socketRef.current.off(event, callback);
      return true;
    }
    return false;
  }, []);

  // Manually trigger reconnection
  const reconnect = useCallback(() => {
    if (!socketRef.current || connectionState !== ConnectionState.CONNECTED) {
      console.log('Manually triggering reconnection');
      setupSocketConnection();
    }
  }, [setupSocketConnection, connectionState]);

  // Expose socket methods and state
  const contextValue = {
    socket: socketRef.current,
    isConnected: connectionState === ConnectionState.CONNECTED,
    connectionState,
    reconnectAttempts,
    emit,
    addListener,
    removeListener,
    reconnect
  };

  return (
    <WebSocketContext.Provider value={contextValue}>
      {children}
    </WebSocketContext.Provider>
  );
}