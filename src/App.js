import React from 'react';
import { Route, BrowserRouter as Router, Routes } from 'react-router-dom';
import ServerStatusMonitor from './components/ServerStatusMonitor';
import TokenDashboard from './components/TokenDashboard';
import TokenDetailPage from './components/TokenDetailPage';
import { WebSocketProvider } from './context/WebSocketContext';

function App() {
  return (
    <WebSocketProvider>
      <Router>
        <Routes>
          <Route path="/" element={<TokenDashboard />} />
          <Route path="/token/:contractAddress" element={<TokenDetailPage />} />
        </Routes>
        
        {/* Add the server status monitor - enable during development */}
        {process.env.NODE_ENV !== 'production' && (
          <ServerStatusMonitor position="bottom-right" />
        )}
      </Router>
    </WebSocketProvider>
  );
}

export default App;