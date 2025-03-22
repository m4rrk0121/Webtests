import React from 'react';
import { Route, HashRouter as Router, Routes } from 'react-router-dom';
import './App.css';
import CollectFees from './components/CollectFees';
import DeployToken from './components/DeployToken';
import Home from './components/Home';
import Navbar from './components/Navbar';
import TokenDashboard from './components/TokenDashboard';
import TokenDetailPage from './components/TokenDetailPage';
import { WebSocketProvider } from './context/WebSocketContext';

function App() {
  return (
    <WebSocketProvider>
      <Router>
        <div className="App">
          <Navbar />
          <div className="content-container">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/dashboard" element={<TokenDashboard />} />
              <Route path="/token/:contractAddress" element={<TokenDetailPage />} />
              <Route path="/collect-fees" element={<CollectFees />} />
              <Route path="/deploy-token" element={<DeployToken />} />
              <Route path="/update-token-info" element={<div className="placeholder-page"><h1>Token Info Updates Coming Soon</h1></div>} />
            </Routes>
          </div>
        </div>
      </Router>
    </WebSocketProvider>
  );
}


export default App;