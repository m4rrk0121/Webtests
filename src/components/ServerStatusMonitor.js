import React, { useState, useEffect } from 'react';
import { useWebSocket } from '../context/WebSocketContext';

// This component can be added to your layout to monitor WebSocket connection status
const ServerStatusMonitor = ({ position = 'bottom-right' }) => {
  const { isConnected, reconnectAttempts, reconnect } = useWebSocket();
  const [isExpanded, setIsExpanded] = useState(false);
  const [lastPing, setLastPing] = useState(null);
  const [pingHistory, setPingHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  
  // Determine position styles
  let positionStyle = {};
  switch (position) {
    case 'top-left':
      positionStyle = { top: '20px', left: '20px' };
      break;
    case 'top-right':
      positionStyle = { top: '20px', right: '20px' };
      break;
    case 'bottom-left':
      positionStyle = { bottom: '20px', left: '20px' };
      break;
    case 'bottom-right':
    default:
      positionStyle = { bottom: '20px', right: '20px' };
      break;
  }
  
  // Track connection history
  useEffect(() => {
    const now = new Date();
    const newEntry = {
      timestamp: now.toISOString(),
      status: isConnected ? 'connected' : 'disconnected',
      reconnectAttempts
    };
    
    setPingHistory(prev => {
      // Keep last 10 entries
      const updated = [newEntry, ...prev].slice(0, 10);
      return updated;
    });
    
    setLastPing(now);
  }, [isConnected, reconnectAttempts]);

  return (
    <div style={{
      position: 'fixed',
      zIndex: 9999,
      ...positionStyle,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-end'
    }}>
      {/* Main status indicator */}
      <button 
        onClick={() => setIsExpanded(!isExpanded)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: isConnected ? 'rgba(0, 0, 0, 0.7)' : 'rgba(100, 0, 0, 0.8)',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          padding: '8px 12px',
          cursor: 'pointer',
          fontSize: '14px',
          boxShadow: '0 2px 10px rgba(0, 0, 0, 0.2)',
          transition: 'all 0.2s ease',
          backdropFilter: 'blur(4px)'
        }}
      >
        <div style={{
          width: '10px',
          height: '10px',
          borderRadius: '50%',
          background: isConnected ? '#00ff88' : '#ff4466',
          boxShadow: isConnected ? '0 0 10px #00ff88' : '0 0 10px #ff4466'
        }}></div>
        {isConnected ? 'Server Connected' : `Disconnected (Attempt ${reconnectAttempts})`}
      </button>
      
      {/* Expanded status panel */}
      {isExpanded && (
        <div style={{
          marginTop: '10px',
          background: 'rgba(0, 0, 0, 0.8)',
          borderRadius: '6px',
          padding: '10px 15px',
          color: 'white',
          backdropFilter: 'blur(8px)',
          boxShadow: '0 5px 15px rgba(0, 0, 0, 0.3)',
          width: '250px',
          fontSize: '14px'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '10px'
          }}>
            <div style={{ fontWeight: 'bold', fontSize: '16px' }}>Server Status</div>
            <button 
              onClick={() => setIsExpanded(false)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'white',
                cursor: 'pointer',
                fontSize: '14px',
                opacity: 0.7
              }}
            >
              ✕
            </button>
          </div>
          
          <div style={{ marginBottom: '10px' }}>
            <div>
              Status: <span style={{ 
                color: isConnected ? '#00ff88' : '#ff4466',
                fontWeight: 'bold'
              }}>
                {isConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
            
            <div>
              Last Check: {lastPing ? new Date(lastPing).toLocaleTimeString() : 'N/A'}
            </div>
            
            {!isConnected && (
              <div>
                Reconnect Attempts: {reconnectAttempts}
              </div>
            )}
          </div>
          
          <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
            <button
              onClick={reconnect}
              style={{
                background: '#333',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                padding: '5px 10px',
                cursor: 'pointer',
                fontSize: '12px',
                flex: 1
              }}
            >
              Reconnect Now
            </button>
            
            <button
              onClick={() => setShowHistory(!showHistory)}
              style={{
                background: '#333',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                padding: '5px 10px',
                cursor: 'pointer',
                fontSize: '12px',
                flex: 1
              }}
            >
              {showHistory ? 'Hide History' : 'Show History'}
            </button>
          </div>
          
          {showHistory && pingHistory.length > 0 && (
            <div style={{
              marginTop: '10px',
              maxHeight: '150px',
              overflowY: 'auto',
              fontSize: '12px'
            }}>
              <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>Connection History</div>
              {pingHistory.map((entry, index) => (
                <div 
                  key={index}
                  style={{
                    padding: '5px',
                    borderBottom: index < pingHistory.length - 1 ? '1px solid rgba(255,255,255,0.1)' : 'none'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{new Date(entry.timestamp).toLocaleTimeString()}</span>
                    <span style={{ 
                      color: entry.status === 'connected' ? '#00ff88' : '#ff4466',
                      fontWeight: 'bold'
                    }}>
                      {entry.status}
                    </span>
                  </div>
                  {entry.status === 'disconnected' && (
                    <div style={{ fontSize: '11px', opacity: 0.7 }}>
                      Attempt: {entry.reconnectAttempts}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ServerStatusMonitor;