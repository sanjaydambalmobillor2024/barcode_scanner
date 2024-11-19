const express = require('express');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data'); // Ensure FormData is required

// Create an Express application
const app = express();
const port = 3000;

// Set up multer to handle image file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Endpoint to upload an image and analyze it with ZXing Web API
app.post('/upload', upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).send('No image uploaded.');
  }

  try {
    // Create a FormData instance to send the image file
    const formData = new FormData();
    formData.append('file', req.file.buffer, 'image.png');

    // Send a POST request to ZXing API for barcode/QR code detection
    const response = await axios.post('https://api.qrserver.com/v1/read-qr-code/', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          ...formData.getHeaders(), // Ensure headers are set correctly
        },
      });
      

    // Log the raw response from ZXing API
    console.log('ZXing API response:', response.data);

    // Check if the ZXing API response contains decoded data
    if (response.data && response.data[0] && response.data[0].symbol[0].data) {
      return res.status(200).json({
        message: 'Barcode detected',
        data: response.data[0].symbol[0].data,
      });
    } else {
      return res.status(404).json({
        message: 'No barcode found in the image',
      });
    }
  } catch (error) {
    // Log detailed error information
    console.error('Error processing image:', error);
    return res.status(500).send('Error processing image');
  }
});

// Start the Express server
app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
