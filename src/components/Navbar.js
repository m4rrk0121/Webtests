import React from 'react';
import { Link, useLocation } from 'react-router-dom';

function Navbar() {
  const location = useLocation();
  
  // Function to check if a path is active
  const isActive = (path) => {
    return location.pathname === path;
  };

  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <h2>KOA</h2>
      </div>
      <div className="navbar-menu">
        <Link 
          to="/" 
          className={`navbar-item ${isActive('/') ? 'active' : ''}`}
        >
          Home
        </Link>
        <Link 
          to="/dashboard" 
          className={`navbar-item ${isActive('/dashboard') ? 'active' : ''}`}
        >
          Token Dashboard
        </Link>
        <Link 
          to="/deploy-token" 
          className={`navbar-item ${isActive('/deploy-token') ? 'active' : ''}`}
        >
          Deploy Token
        </Link>
        <Link 
          to="/collect-fees" 
          className={`navbar-item ${isActive('/collect-fees') ? 'active' : ''}`}
        >
          Collect Fees
        </Link>
        <Link 
          to="/update-token-info" 
          className={`navbar-item ${isActive('/update-token-info') ? 'active' : ''}`}
        >
          Update Token Info
        </Link>
      </div>
    </nav>
  );
}

export default Navbar;