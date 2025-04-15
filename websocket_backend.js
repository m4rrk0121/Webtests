const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { MongoClient } = require('mongodb');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Enhanced CORS configuration with expanded header allowlist
app.use(cors({
  origin: ["https://kingofapes.fun", "http://localhost:3000", "http://localhost:4003", "http://localhost:4004", "https://webtests-6it9.onrender.com", "https://www.kingofapes.fun"],
  credentials: true,
  methods: ["GET", "POST", "OPTIONS", "PUT", "DELETE"],
  allowedHeaders: [
    "Content-Type", 
    "Authorization", 
    "X-Requested-With", 
    "Cache-Control", 
    "Pragma", 
    "Expires", 
    "my-custom-header"
  ]
}));

const server = http.createServer(app);

// Enhanced Socket.io configuration
const io = new Server(server, {
  cors: {
    origin: ["https://kingofapes.fun", "http://localhost:3000", "http://localhost:4003", "http://localhost:4004", "https://webtests-6it9.onrender.com","https://www.kingofapes.fun"],
    methods: ["GET", "POST", "OPTIONS", "PUT", "DELETE"],
    credentials: true,
    allowedHeaders: [
      "Content-Type", 
      "Authorization", 
      "X-Requested-With", 
      "Cache-Control", 
      "Pragma", 
      "Expires", 
      "my-custom-header"
    ],
    preflightContinue: false,
    optionsSuccessStatus: 204
  },
  allowEIO3: true,
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000,
  upgradeTimeout: 30000,
  maxHttpBufferSize: 1e8
});

// MongoDB connection
const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri);

async function startServer() {
  try {
    await client.connect();
    console.log('Connected to MongoDB');
    
    const db = client.db('v2');
    const tokensCollection = db.collection('tokens');
    
    // Set up WebSocket connection handlers
    io.on('connection', (socket) => {
      console.log('Client connected:', socket.id);
      
      // Handle search-tokens event
      socket.on('search-tokens', async (params) => {
        try {
          console.log('Search request received:', params.query);
          
          // Create search query with multiple conditions
          const searchQuery = {
            $or: [
              { name: { $regex: params.query, $options: 'i' } },
              { symbol: { $regex: params.query, $options: 'i' } },
              { contractAddress: { $regex: params.query, $options: 'i' } }
            ]
          };

          // Exclude WETH and UNI-V3-POS tokens
          searchQuery.$and = [
            { symbol: { $ne: 'WETH' } },
            { symbol: { $ne: 'UNI-V3-POS' } }
          ];

          // Fetch all matching tokens (no pagination for search)
          const searchResults = await tokensCollection.find(searchQuery)
            .sort({ market_cap_usd: -1 })
            .toArray();

          console.log(`Found ${searchResults.length} tokens matching search query`);

          // Transform results to ensure all required fields
          const transformedResults = searchResults.map(token => ({
            ...token,
            price_usd: token.price_usd || 0,
            market_cap_usd: token.market_cap_usd || 0,
            volume_usd_24h: token.volume_usd_24h || 0,
            blockNumber: token.blockNumber || 0
          }));

          // Send search results back to client
          socket.emit('search-results', {
            tokens: transformedResults
          });
        } catch (err) {
          console.error('Error performing search:', err);
          socket.emit('error', { message: 'Failed to perform search' });
        }
      });

      // Handle get-tokens event for sorting and pagination
      socket.on('get-tokens', async (params) => {
        try {
          let sortQuery = {};
          
          if (params.sort === 'marketCap') {
            sortQuery.market_cap_usd = params.direction === 'asc' ? 1 : -1;
          } else if (params.sort === 'volume') {
            sortQuery.volume_usd_24h = params.direction === 'asc' ? 1 : -1;
          } else if (params.sort === 'blockNumber') {
            sortQuery.blockNumber = params.direction === 'asc' ? 1 : -1;
          } else {
            sortQuery.price_usd = params.direction === 'asc' ? 1 : -1;
          }
          
          const page = params.page || 1;
          const pageSize = 10;
          
          // Exclude WETH and UNI-V3-POS tokens
          const query = {
            symbol: { $nin: ['WETH', 'UNI-V3-POS'] }
          };

          const tokens = await tokensCollection.find(query)
            .sort(sortQuery)
            .skip((page - 1) * pageSize)
            .limit(pageSize)
            .toArray();
          
          const transformedTokens = tokens.map(token => ({
            ...token,
            price_usd: token.price_usd || 0,
            market_cap_usd: token.market_cap_usd || 0,
            volume_usd_24h: token.volume_usd_24h || 0,
            blockNumber: token.blockNumber || 0
          }));
            
          const totalCount = await tokensCollection.countDocuments(query);
          const totalPages = Math.ceil(totalCount / pageSize);
          
          socket.emit('tokens-list-update', {
            tokens: transformedTokens,
            totalPages
          });
        } catch (err) {
          console.error('Error fetching tokens:', err);
          socket.emit('error', { message: 'Failed to fetch tokens' });
        }
      });

      // Handle token details request
      socket.on('get-token-details', async (params) => {
        try {
          const token = await tokensCollection.findOne({ 
            contractAddress: params.contractAddress 
          });

          if (token) {
            const transformedToken = {
              ...token,
              price_usd: token.price_usd || 0,
              market_cap_usd: token.market_cap_usd || 0,
              volume_usd_24h: token.volume_usd_24h || 0,
              blockNumber: token.blockNumber || 0
            };
            socket.emit('token-details', transformedToken);
          } else {
            socket.emit('error', { message: 'Token not found' });
          }
        } catch (err) {
          console.error('Error fetching token details:', err);
          socket.emit('error', { message: 'Failed to fetch token details' });
        }
      });

      // Handle global statistics request
      socket.on('get-global-stats', async () => {
        try {
          const aggregateResult = await tokensCollection.aggregate([
            {
              $match: { symbol: { $nin: ['WETH', 'UNI-V3-POS'] } }
            },
            {
              $group: {
                _id: null,
                totalVolume: { $sum: { $ifNull: ["$volume_usd_24h", 0] } },
                totalMarketCap: { $sum: { $ifNull: ["$market_cap_usd", 0] } },
                totalTokens: { $sum: 1 }
              }
            }
          ]).toArray();
          
          const globalStats = aggregateResult[0] || {
            totalVolume: 0,
            totalMarketCap: 0,
            totalTokens: await tokensCollection.countDocuments({ 
              symbol: { $nin: ['WETH', 'UNI-V3-POS'] } 
            })
          };
          
          socket.emit('global-stats-update', globalStats);
        } catch (err) {
          console.error('Error calculating global stats:', err);
          socket.emit('error', { message: 'Failed to calculate global statistics' });
        }
      });

      // Handle disconnect
      socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
      });
    });

    // Set up MongoDB Change Stream
    const changeStream = tokensCollection.watch();
    
    changeStream.on('change', async (change) => {
      if (change.operationType === 'update' || 
          change.operationType === 'replace' || 
          change.operationType === 'insert') {
        
        const updatedToken = await tokensCollection.findOne({ 
          _id: change.documentKey._id 
        });

        if (updatedToken && !['WETH', 'UNI-V3-POS'].includes(updatedToken.symbol)) {
          const transformedToken = {
            ...updatedToken,
            price_usd: updatedToken.price_usd || 0,
            market_cap_usd: updatedToken.market_cap_usd || 0,
            volume_usd_24h: updatedToken.volume_usd_24h || 0,
            blockNumber: updatedToken.blockNumber || 0
          };
          
          io.emit('token-update', transformedToken);
        }
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

startServer().catch(console.error); 