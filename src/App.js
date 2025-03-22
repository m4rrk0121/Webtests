import React from 'react';
import { Route, HashRouter as Router, Routes } from 'react-router-dom';
import './App.css';
import TokenDashboard from './components/TokenDashboard';
import TokenDetailPage from './components/TokenDetailPage';
import { WebSocketProvider } from './context/WebSocketContext';

function App() {
  return (
    <WebSocketProvider>
      <Router>
        <div className="App">
          <Routes>
            <Route path="/" element={<TokenDashboard />} />
            <Route path="/token/:contractAddress" element={<TokenDetailPage />} />
          </Routes>
        </div>
      </Router>
    </WebSocketProvider>
  );
}

export default App;