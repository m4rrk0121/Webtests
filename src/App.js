import React from 'react';
import { Route, BrowserRouter as Router, Routes } from 'react-router-dom';
import './App.css';
import TokenDashboard from './components/TokenDashboard';
import TokenDetailPage from './components/TokenDetailPage';

function App() {
  return (
    <Router>
      <div className="App">
        <Routes>
          <Route path="/" element={<TokenDashboard />} />
          <Route path="/token/:contractAddress" element={<TokenDetailPage />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;