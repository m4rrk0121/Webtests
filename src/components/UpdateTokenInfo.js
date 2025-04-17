import axios from 'axios';
import React, { useState, useRef } from 'react';

const API_BASE_URL = 'https://websocketv2.onrender.com';

// Valid image URL patterns for validation
const VALID_IMAGE_PATTERNS = [
  /^https?:\/\/.*\.(jpg|jpeg|png|gif|webp)$/i,
  /^https:\/\/i\.ibb\.co\/\w+\/.+$/,
  /^https:\/\/ibb\.co\/\w+$/,
  /^https:\/\/i\.postimg\.cc\/.*\.(jpg|jpeg|png|gif|webp)$/i
];

// Cloudinary configuration
const CLOUDINARY_UPLOAD_URL = "https://api.cloudinary.com/v1_1/dma0a4o3u/image/upload";
const CLOUDINARY_UPLOAD_PRESET = "ml_default";

const MAX_FILE_SIZE = 256 * 1024; // 256KB in bytes

const ADMIN_WALLET = '0xdC4f199518036b1ed1675dd645e5892A4Cf240c8';

function UpdateTokenInfo() {
  // Form state
  const [contractAddress, setContractAddress] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [imagePreview, setImagePreview] = useState(null);
  const [isValidatingImage, setIsValidatingImage] = useState(false);
  
  // Transaction state
  const [isProcessing, setIsProcessing] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  
  // Refs
  const contractAddressTimeoutRef = useRef(null);
  const imageUrlTimeoutRef = useRef(null);

  // Add file upload state
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [cloudinaryData, setCloudinaryData] = useState(null);

  // Token info state
  const [tokenInfo, setTokenInfo] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasPermission, setHasPermission] = useState(false);
  const [connectedWallet, setConnectedWallet] = useState(null);

  const handleInputChange = (field, value) => {
    setTokenInfo(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const validateImageDimensions = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          if (img.width !== img.height) {
            reject(new Error('Image must be square (equal width and height)'));
          } else {
            resolve(true);
          }
        };
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = e.target.result;
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  };

  const handleFileChange = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    try {
      // Check file size
      if (file.size > MAX_FILE_SIZE) {
        alert('File size must be less than 256KB');
        event.target.value = null;
        return;
      }

      // Check file type
      if (!file.type.startsWith('image/')) {
        alert('Please select an image file');
        event.target.value = null;
        return;
      }

      // Check image dimensions
      await validateImageDimensions(file);
      
      setSelectedFile(file);
    } catch (error) {
      alert(error.message);
      event.target.value = null;
      setSelectedFile(null);
    }
  };

  const handleFetchToken = async () => {
    if (!contractAddress) {
      setError('Please enter a contract address');
      return;
    }
    
    try {
      setIsProcessing(true);
      setError('');
      const response = await axios.get(`${API_BASE_URL}/api/token/${contractAddress}`);
      const data = response.data;
      
      if (data) {
        setTokenInfo({
          contractAddress: data.contractAddress,
          name: data.name,
          symbol: data.symbol,
          description: data.description || '',
          website: data.website || '',
          twitter: data.twitter || '',
          telegram: data.telegram || '',
          image: data.image || null,
          deployer: data.deployer || ''
        });

        // Check permission only if wallet is connected
        if (connectedWallet) {
          const hasAccess = data.deployer?.toLowerCase() === connectedWallet?.toLowerCase();
          setHasPermission(hasAccess);
        } else {
          setHasPermission(false);
        }
      } else {
        setError('Failed to fetch token info');
      }
    } catch (error) {
      console.error('Error fetching token:', error);
      setError('Error fetching token information');
    } finally {
      setIsProcessing(false);
    }
  };

  // Add useEffect to check wallet permission when tokenInfo or connectedWallet changes
  useEffect(() => {
    const checkPermission = () => {
      if (!connectedWallet || !tokenInfo?.deployer) return false;
      return connectedWallet.toLowerCase() === tokenInfo.deployer.toLowerCase() || 
             connectedWallet.toLowerCase() === ADMIN_WALLET.toLowerCase();
    };
    
    setHasPermission(checkPermission());
  }, [connectedWallet, tokenInfo]);

  // Update the connectWallet function to store the connected address
  const connectWallet = async () => {
    try {
      if (window.ethereum) {
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        const connectedAddress = accounts[0];
        setConnectedWallet(connectedAddress);
        
        // Listen for account changes
        window.ethereum.on('accountsChanged', (newAccounts) => {
          if (newAccounts.length > 0) {
            setConnectedWallet(newAccounts[0]);
          } else {
            setConnectedWallet(null);
          }
        });

        return connectedAddress;
      } else {
        alert('Please install MetaMask to connect your wallet');
        return null;
      }
    } catch (error) {
      console.error('Error connecting wallet:', error);
      alert('Failed to connect wallet');
      return null;
    }
  };

  // Disconnect wallet
  const disconnectWallet = () => {
    setConnectedWallet(null);
    setHasPermission(false);
    setSuccess(false);
  };

  // Fetch token information
  const fetchTokenInfo = async (address) => {
    try {
      setIsLoading(true);
      const response = await axios.get(`${API_BASE_URL}/api/token/${address}`);
      const data = response.data;
      
      if (data) {
        setTokenInfo({
          contractAddress: data.contractAddress,
          name: data.name,
          symbol: data.symbol,
          description: data.description || '',
          website: data.website || '',
          twitter: data.twitter || '',
          telegram: data.telegram || '',
          image: data.image || null,
          deployer: data.deployer || ''
        });

        // Only check permission if we have a connected wallet
        if (connectedWallet) {
          const hasAccess = data.deployer?.toLowerCase() === connectedWallet?.toLowerCase();
          setHasPermission(hasAccess);
        }
      }
    } catch (error) {
      console.error('Error fetching token info:', error);
      setError('Failed to fetch token information');
    } finally {
      setIsLoading(false);
    }
  };

  // Validate image URL
  const validateImageUrl = async (url) => {
    setIsValidatingImage(true);
    setImagePreview(null);
    
    // Basic URL pattern validation
    const isValidFormat = VALID_IMAGE_PATTERNS.some(pattern => pattern.test(url));
    
    if (!isValidFormat) {
      setError('Please enter a valid image URL');
      setIsValidatingImage(false);
      return false;
    }
    
    // Try to load the image
    try {
      const img = new Image();
      img.onload = () => {
        // Additional size check
        if (img.width > 0 && img.height > 0) {
          setImagePreview(url);
          setError('');
        } else {
          setError('Invalid image dimensions');
        }
        setIsValidatingImage(false);
      };
      
      img.onerror = () => {
        setError('Could not load image from URL');
        setIsValidatingImage(false);
      };
      img.src = url;
    } catch (err) {
      setError('Error validating image: ' + err.message);
      setIsValidatingImage(false);
      return false;
    }
  };

  // Upload image to Cloudinary
  const uploadImage = async () => {
    if (!selectedFile) return null;
    
    try {
      setIsUploading(true);
      setError('');
      
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
      
      console.log('Uploading to Cloudinary...', {
        url: CLOUDINARY_UPLOAD_URL,
        preset: CLOUDINARY_UPLOAD_PRESET
      });
      
      const response = await axios.post(
        CLOUDINARY_UPLOAD_URL,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data'
          },
          onUploadProgress: (progressEvent) => {
            const progress = Math.round(
              (progressEvent.loaded * 100) / progressEvent.total
            );
            setUploadProgress(progress);
          }
        }
      );
      
      console.log('Upload successful:', response.data);
      setCloudinaryData(response.data);
      setIsUploading(false);
      return response.data;
    } catch (err) {
      console.error('Error uploading image:', err.response?.data || err);
      setError('Failed to upload image. Please try again.');
      setIsUploading(false);
      return null;
    }
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    console.log('Form submission started');
    
    if (!tokenInfo?.contractAddress) {
      setError('Contract address is required');
      return;
    }

    try {
      setIsProcessing(true);
      setError('');
      console.log('Current token info:', tokenInfo);
      
      // Upload image if a file is selected
      let finalImageUrl = tokenInfo.image?.url;
      let cloudinaryData = null;
      
      if (selectedFile) {
        console.log('Uploading new image file:', selectedFile.name);
        const uploadResult = await uploadImage();
        if (!uploadResult) {
          setError('Failed to upload image');
          setIsProcessing(false);
          return;
        }
        console.log('Image upload successful:', uploadResult);
        finalImageUrl = uploadResult.secure_url;
        cloudinaryData = uploadResult;
      }

      // Prepare token data matching the exact structure from backend
      const tokenData = {
        contractAddress: tokenInfo.contractAddress,
        name: tokenInfo.name,
        symbol: tokenInfo.symbol,
        description: tokenInfo.description || '',
        website: tokenInfo.website || '',
        twitter: tokenInfo.twitter || '',
        telegram: tokenInfo.telegram || '',
        image: selectedFile ? {
          url: cloudinaryData?.secure_url || '',
          cloudinary_id: cloudinaryData?.public_id || '',
          asset_id: cloudinaryData?.asset_id || '',
          version: cloudinaryData?.version || '',
          format: cloudinaryData?.format || '',
          resource_type: 'image'
        } : tokenInfo.image
      };

      console.log('Sending token update with data:', JSON.stringify(tokenData, null, 2));
      
      // Send update to backend
      const response = await axios.post(
        'https://websocketv2.onrender.com/api/update-token-info-url',
        tokenData,
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      console.log('Backend response:', response.data);

      if (response.data.success) {
        setSuccess(true);
        // Refresh token info
        await fetchTokenInfo(tokenInfo.contractAddress);
        console.log('Token info updated successfully');
      } else {
        throw new Error(response.data.message || 'Failed to update token information');
      }
    } catch (err) {
      console.error('Error processing update:', err);
      if (err.response) {
        console.error('Error response:', {
          data: err.response.data,
          status: err.response.status,
          headers: err.response.headers
        });
        setError(`Server error: ${err.response.data.message || err.response.statusText}`);
      } else if (err.request) {
        console.error('No response received:', err.request);
        setError('No response received from server. Please try again.');
      } else {
        console.error('Error details:', err.message);
        setError(`Error: ${err.message}`);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  // Add a connect button if wallet is not connected
  const renderConnectButton = () => (
    <button
      onClick={connectWallet}
      style={{
        width: '100%',
        padding: '1rem',
        borderRadius: '8px',
        border: 'none',
        background: '#ffa500',
        color: '#000',
        cursor: 'pointer',
        fontWeight: 'bold',
        fontSize: '1rem'
      }}
    >
      Connect Wallet
    </button>
  );

  // Update the submit button section
  const renderSubmitButton = () => {
    if (!connectedWallet) {
      return renderConnectButton();
    }

    return (
      <button
        onClick={handleSubmit}
        disabled={isProcessing || !hasPermission}
        style={{
          width: '100%',
          padding: '1rem',
          borderRadius: '8px',
          border: 'none',
          background: !hasPermission ? '#666' : '#ffa500',
          color: !hasPermission ? '#999' : '#000',
          cursor: !hasPermission ? 'not-allowed' : (isProcessing ? 'not-allowed' : 'pointer'),
          fontWeight: 'bold',
          fontSize: '1rem',
          opacity: isProcessing ? 0.7 : 1
        }}
      >
        {isProcessing ? 'Updating...' : (
          !hasPermission ? 'No Permission to Update' : 'Update Token Information'
        )}
      </button>
    );
  };

  return (
    <div style={{
      padding: '2rem',
      maxWidth: '800px',
      margin: '0 auto',
      color: '#fff'
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        marginBottom: '2rem',
        gap: '1rem',
        width: '100%'
      }}>
        <input
          type="text"
          value={contractAddress}
          onChange={(e) => setContractAddress(e.target.value)}
          placeholder="Enter contract address"
          style={{
            flex: 1,
            padding: '0.75rem',
            borderRadius: '8px',
            border: '1px solid #ffa500',
            background: 'transparent',
            color: '#fff',
            fontSize: '1rem',
            width: 'calc(100% - 150px)' // Account for button width
          }}
        />
        <button
          onClick={handleFetchToken}
          style={{
            padding: '0.75rem 1.5rem',
            borderRadius: '8px',
            border: 'none',
            background: '#ffa500',
            color: '#000',
            cursor: 'pointer',
            fontWeight: 'bold',
            fontSize: '1rem',
            minWidth: '150px'
          }}
        >
          Fetch Token Info
        </button>
      </div>

      {tokenInfo && (
        <div style={{
          background: 'rgba(255, 165, 0, 0.1)',
          borderRadius: '12px',
          padding: '2rem',
          marginBottom: '2rem',
          width: '100%',
          boxSizing: 'border-box'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '1.5rem',
            marginBottom: '2rem'
          }}>
            {tokenInfo.image?.url && (
              <img
                src={tokenInfo.image.url}
                alt={`${tokenInfo.name} logo`}
                style={{
                  width: '80px',
                  height: '80px',
                  borderRadius: '12px',
                  border: '2px solid #ffa500'
                }}
              />
            )}
            <div>
              <h2 style={{ margin: '0', color: '#ffa500' }}>{tokenInfo.name}</h2>
              <p style={{ margin: '0.5rem 0 0', opacity: 0.8 }}>{tokenInfo.symbol}</p>
            </div>
          </div>

          {/* Add deployer wallet info */}
          <div style={{
            background: 'rgba(255, 165, 0, 0.05)',
            padding: '1rem',
            borderRadius: '8px',
            marginBottom: '2rem',
            border: '1px solid rgba(255, 165, 0, 0.2)'
          }}>
            <p style={{ 
              margin: '0',
              color: '#ffa500',
              fontSize: '0.9rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              <span style={{ opacity: 0.8 }}>Only deployer wallet</span>
              <code style={{ 
                background: 'rgba(255, 165, 0, 0.1)',
                padding: '0.25rem 0.5rem',
                borderRadius: '4px',
                fontFamily: 'monospace'
              }}>
                {tokenInfo.deployer || 'Unknown'}
              </code>
              <span style={{ opacity: 0.8 }}>is able to update token information.</span>
            </p>
          </div>

          {/* Add permission warning if needed */}
          {!hasPermission && connectedWallet && (
            <div style={{
              background: 'rgba(255, 0, 0, 0.1)',
              border: '1px solid rgba(255, 0, 0, 0.3)',
              borderRadius: '8px',
              padding: '1rem',
              marginBottom: '2rem',
              color: '#ff4444',
              textAlign: 'center'
            }}>
              You are unable to update this token because you did not deploy the token - please contact support
            </div>
          )}

          <div style={{ display: 'grid', gap: '1.5rem', width: '100%' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: '#ffa500' }}>
                Description
              </label>
              <textarea
                value={tokenInfo.description || ''}
                onChange={(e) => handleInputChange('description', e.target.value)}
                placeholder="Enter token description"
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  borderRadius: '8px',
                  border: '1px solid #ffa500',
                  background: 'transparent',
                  color: '#fff',
                  minHeight: '100px',
                  fontSize: '1rem',
                  boxSizing: 'border-box',
                  resize: 'vertical'
                }}
              />
            </div>

            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', 
              gap: '1.5rem',
              width: '100%'
            }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: '#ffa500' }}>
                  Website URL
                </label>
                <input
                  type="url"
                  value={tokenInfo.website || ''}
                  onChange={(e) => handleInputChange('website', e.target.value)}
                  placeholder="https://example.com"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '8px',
                    border: '1px solid #ffa500',
                    background: 'transparent',
                    color: '#fff',
                    fontSize: '1rem',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: '#ffa500' }}>
                  Twitter URL
                </label>
                <input
                  type="url"
                  value={tokenInfo.twitter || ''}
                  onChange={(e) => handleInputChange('twitter', e.target.value)}
                  placeholder="https://twitter.com/username"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '8px',
                    border: '1px solid #ffa500',
                    background: 'transparent',
                    color: '#fff',
                    fontSize: '1rem',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: '#ffa500' }}>
                  Telegram URL
                </label>
                <input
                  type="url"
                  value={tokenInfo.telegram || ''}
                  onChange={(e) => handleInputChange('telegram', e.target.value)}
                  placeholder="https://t.me/username"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '8px',
                    border: '1px solid #ffa500',
                    background: 'transparent',
                    color: '#fff',
                    fontSize: '1rem',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: '#ffa500' }}>
                Token Image
              </label>
              <div style={{ 
                display: 'flex', 
                flexDirection: 'column', 
                gap: '1rem',
                padding: '1.5rem',
                border: '1px dashed #ffa500',
                borderRadius: '8px',
                width: '100%',
                boxSizing: 'border-box'
              }}>
                <p style={{ margin: '0', opacity: 0.8 }}>You can upload a new image in two ways:</p>
                <ol style={{ margin: '0', paddingLeft: '1.5rem', opacity: 0.8 }}>
                  <li>Upload an image file directly (JPG, PNG, GIF, WebP)</li>
                  <li>Provide an image URL</li>
                </ol>
                <div style={{ fontSize: '0.875rem', opacity: 0.6 }}>
                  <p style={{ margin: '0 0 0.5rem 0' }}>Requirements:</p>
                  <ul style={{ margin: '0', paddingLeft: '1.5rem' }}>
                    <li>Maximum file size: 256KB</li>
                    <li>Image must be square (equal width and height)</li>
                    <li>Supported formats: JPG, PNG, GIF, WebP</li>
                  </ul>
                </div>
                
                <div style={{ 
                  display: 'grid',
                  gridTemplateColumns: 'minmax(auto, 1fr) auto minmax(auto, 1fr)',
                  gap: '1rem',
                  alignItems: 'center',
                  width: '100%'
                }}>
                  <input
                    type="file"
                    onChange={handleFileChange}
                    accept="image/*"
                    style={{
                      color: '#fff',
                      width: '100%'
                    }}
                  />
                  <span style={{ opacity: 0.6 }}>or</span>
                  <input
                    type="url"
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    placeholder="Enter image URL"
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      borderRadius: '8px',
                      border: '1px solid #ffa500',
                      background: 'transparent',
                      color: '#fff',
                      fontSize: '1rem',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div style={{ marginTop: '2rem', width: '100%' }}>
            {renderSubmitButton()}
          </div>
        </div>
      )}

      {error && (
        <div style={{
          color: '#ff4444',
          marginBottom: '1rem',
          padding: '1rem',
          background: 'rgba(255, 68, 68, 0.1)',
          borderRadius: '8px'
        }}>
          {error}
        </div>
      )}

      {success && (
        <div style={{
          color: '#44ff44',
          marginBottom: '1rem',
          padding: '1rem',
          background: 'rgba(68, 255, 68, 0.1)',
          borderRadius: '8px'
        }}>
          Token information updated successfully!
        </div>
      )}
    </div>
  );
}

export default UpdateTokenInfo;