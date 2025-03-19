import React from 'react';

function ScrollingBanner({ messages }) {
  return (
    <div className="scrolling-banner-container">
      <div className="scrolling-banner">
        {messages.map((message, index) => (
          <span key={index}>{message} • </span>
        ))}
        {/* Duplicate the messages to ensure smooth looping */}
        {messages.map((message, index) => (
          <span key={`dup-${index}`}>{message} • </span>
        ))}
      </div>
    </div>
  );
}

export default ScrollingBanner;