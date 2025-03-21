// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { MongoClient } = require('mongodb');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors({
  origin: ["http://localhost:3000", "http://localhost:3001", "http://localhost:4004"],
  credentials: true
}));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ["http://localhost:3000", "http://localhost:3001", "http://localhost:4004"],
    methods: ["GET", "POST"],
    credentials: true,
    allowedHeaders: ["my-custom-header"]
  },
  transports: ['websocket', 'polling']
});

// MongoDB connection
const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri);

async function startServer() {
  try {
    await client.connect();
    console.log('Connected to MongoDB');
    
    const db = client.db(); // Your database name is included in the connection string
    const tokensCollection = db.collection('tokenprices'); // Use the tokenprices collection
    
    // Check available fields in the collection
    const sampleToken = await tokensCollection.findOne({});
    console.log('Sample token structure:', JSON.stringify(sampleToken, null, 2));
    console.log('Available fields:', Object.keys(sampleToken || {}).join(', '));
    
    // Set up WebSocket connection handlers
    io.on('connection', (socket) => {
      console.log('Client connected:', socket.id);
      
      // Send initial data when client connects
      sendInitialData(socket, db);
      
      // Handle get-tokens event for sorting and pagination
      socket.on('get-tokens', async (params) => {
        console.log('SORT DEBUG - Original params:', JSON.stringify(params));
        
        try {
          // Build sorting query based on parameters
          let sortQuery = {};
          
          // FIXED: Use the exact sort field value from the client, not trying to transform it
          if (params.sort === 'marketCap') {
            console.log('Sorting by market cap (fdv_usd)');
            sortQuery.fdv_usd = params.direction === 'asc' ? 1 : -1;
          } else if (params.sort === 'volume') {
            console.log('Sorting by volume (volume_usd)');
            sortQuery.volume_usd = params.direction === 'asc' ? 1 : -1;
          } else {
            // Default to price sort
            console.log('Sorting by price (price_usd)');
            sortQuery.price_usd = params.direction === 'asc' ? 1 : -1;
          }
          
          const page = params.page || 1;
          const pageSize = 10; // Adjust as needed
          
          console.log(`Using sort query:`, sortQuery);
          
          // Test direct sort to verify sorting works
          const testTokens = await tokensCollection.find()
            .sort({ price_usd: -1 })
            .limit(3)
            .toArray();
            
          if (testTokens.length > 0) {
            console.log('TEST SORT - Sample tokens by price:', testTokens.map(t => ({
              name: t.name,
              price: t.price_usd
            })));
          }
          
          // Fetch tokens with sorting and pagination
          const tokens = await tokensCollection.find()
            .sort(sortQuery)
            .skip((page - 1) * pageSize)
            .limit(pageSize)
            .toArray();
          
          console.log(`Found ${tokens.length} tokens with the applied sort`);
          
          // Log the first token for debugging
          if (tokens.length > 0) {
            console.log('First token data (sample):', {
              name: tokens[0].name,
              price_usd: tokens[0].price_usd,
              fdv_usd: tokens[0].fdv_usd,
              volume_usd: tokens[0].volume_usd
            });
          } else {
            console.log('No tokens found with the current sort criteria');
          }
          
          // Ensure all tokens have required fields with defaults if needed
          const transformedTokens = tokens.map(token => {
            const transformed = { ...token };
            
            // Ensure all required fields exist with defaults if needed
            transformed.price_usd = transformed.price_usd || 0;
            transformed.fdv_usd = transformed.fdv_usd || 0;
            transformed.volume_usd = transformed.volume_usd || 0;
            
            return transformed;
          });
            
          const totalCount = await tokensCollection.countDocuments();
          const totalPages = Math.ceil(totalCount / pageSize);
          
          // Send response back to client
          socket.emit('tokens-list-update', {
            tokens: transformedTokens,
            totalPages
          });
        } catch (err) {
          console.error('Error fetching tokens:', err);
          console.error('Error details:', err.stack);
          socket.emit('error', { message: 'Failed to fetch tokens' });
        }
      });
      
      socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
      });
    });
    
    // Set up MongoDB Change Stream
    const changeStream = tokensCollection.watch();
    
    changeStream.on('change', (change) => {
      console.log('Change detected:', change.operationType);
      
      if (change.operationType === 'update' || 
          change.operationType === 'replace' || 
          change.operationType === 'insert') {
        
        // Fetch the updated document
        tokensCollection.findOne({ _id: change.documentKey._id })
          .then(updatedToken => {
            if (!updatedToken) return;
            
            // Ensure all required fields exist with defaults if needed
            const transformedToken = { ...updatedToken };
            transformedToken.price_usd = transformedToken.price_usd || 0;
            transformedToken.fdv_usd = transformedToken.fdv_usd || 0;
            transformedToken.volume_usd = transformedToken.volume_usd || 0;
            
            // Broadcast to all connected clients
            io.emit('token-update', transformedToken);
          })
          .catch(err => {
            console.error('Error fetching updated document:', err);
          });
      }
    });
    
    // Set up top tokens change stream
    const topTokensChangeStream = tokensCollection.watch();
    
    topTokensChangeStream.on('change', async (change) => {
      try {
        const topMarketCapToken = await tokensCollection.find().sort({ fdv_usd: -1 }).limit(1).toArray();
        const topVolumeToken = await tokensCollection.find().sort({ volume_usd: -1 }).limit(1).toArray();
        
        if (topMarketCapToken.length > 0 && topVolumeToken.length > 0) {
          // Ensure all required fields exist with defaults if needed
          const transformedMarketCapToken = { ...topMarketCapToken[0] };
          transformedMarketCapToken.price_usd = transformedMarketCapToken.price_usd || 0;
          transformedMarketCapToken.fdv_usd = transformedMarketCapToken.fdv_usd || 0;
          transformedMarketCapToken.volume_usd = transformedMarketCapToken.volume_usd || 0;
          
          const transformedVolumeToken = { ...topVolumeToken[0] };
          transformedVolumeToken.price_usd = transformedVolumeToken.price_usd || 0;
          transformedVolumeToken.fdv_usd = transformedVolumeToken.fdv_usd || 0;
          transformedVolumeToken.volume_usd = transformedVolumeToken.volume_usd || 0;
          
          io.emit('top-tokens-update', {
            topMarketCapToken: transformedMarketCapToken,
            topVolumeToken: transformedVolumeToken
          });
        }
      } catch (err) {
        console.error('Error fetching top tokens:', err);
      }
    });
    
    // Start the server
    const PORT = process.env.PORT || 4003;
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
    
  } catch (err) {
    console.error('Failed to connect to MongoDB:', err);
  }
}

async function sendInitialData(socket, db) {
  try {
    const tokensCollection = db.collection('tokenprices');
    
    // Send initial top tokens data
    const topMarketCapToken = await tokensCollection.find().sort({ fdv_usd: -1 }).limit(1).toArray();
    const topVolumeToken = await tokensCollection.find().sort({ volume_usd: -1 }).limit(1).toArray();
    
    if (topMarketCapToken.length > 0 && topVolumeToken.length > 0) {
      // Ensure all required fields exist with defaults if needed
      const transformedMarketCapToken = { ...topMarketCapToken[0] };
      transformedMarketCapToken.price_usd = transformedMarketCapToken.price_usd || 0;
      transformedMarketCapToken.fdv_usd = transformedMarketCapToken.fdv_usd || 0;
      transformedMarketCapToken.volume_usd = transformedMarketCapToken.volume_usd || 0;
      
      const transformedVolumeToken = { ...topVolumeToken[0] };
      transformedVolumeToken.price_usd = transformedVolumeToken.price_usd || 0;
      transformedVolumeToken.fdv_usd = transformedVolumeToken.fdv_usd || 0;
      transformedVolumeToken.volume_usd = transformedVolumeToken.volume_usd || 0;
      
      socket.emit('top-tokens-update', {
        topMarketCapToken: transformedMarketCapToken,
        topVolumeToken: transformedVolumeToken
      });
    } else {
      console.log('No top tokens found in initial data load');
    }
    
    // Send initial tokens list (paginated)
    const tokens = await tokensCollection.find()
      .sort({ fdv_usd: -1 })
      .limit(10) // Default page size
      .toArray();
      
    if (tokens.length > 0) {
      console.log('Initial data - First token (sample):', {
        name: tokens[0].name,
        price_usd: tokens[0].price_usd,
        fdv_usd: tokens[0].fdv_usd,
        volume_usd: tokens[0].volume_usd
      });
    } else {
      console.log('No tokens found in initial data load');
    }
    
    // Ensure all tokens have required fields with defaults if needed
    const transformedTokens = tokens.map(token => {
      const transformed = { ...token };
      
      // Ensure all required fields exist with defaults if needed
      transformed.price_usd = transformed.price_usd || 0;
      transformed.fdv_usd = transformed.fdv_usd || 0;
      transformed.volume_usd = transformed.volume_usd || 0;
      
      return transformed;
    });
      
    const totalCount = await tokensCollection.countDocuments();
    const totalPages = Math.ceil(totalCount / 10);
    
    socket.emit('tokens-list-update', {
      tokens: transformedTokens,
      totalPages
    });
    
  } catch (err) {
    console.error('Error sending initial data:', err);
  }
}

startServer().catch(console.error);