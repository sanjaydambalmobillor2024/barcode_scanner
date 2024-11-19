const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const Quagga = require('@ericblade/quagga2');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

// Configure Multer for file uploads
const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 5 * 1024 * 1024 }, // Limit file size to 5MB
});

// Route to display the file upload form
app.get('/', (req, res) => {
  res.send(`
    <h1>Barcode Decoder</h1>
    <form action="/decode" method="post" enctype="multipart/form-data">
      <input type="file" name="barcode" accept="image/*" required />
      <button type="submit">Decode Barcode</button>
    </form>
  `);
});

// Route to handle barcode decoding
app.post('/decode', upload.single('barcode'), async (req, res) => {
  const filePath = path.resolve(__dirname, req.file.path);
  const preprocessedPath = `${filePath}_processed.png`; // Unique output file name

  try {
    // Preprocess the image using Sharp
    await sharp(filePath)
    .resize({ width: 800, height: 800, fit: 'inside' })
    .modulate({ brightness: 1.2, contrast: 1.5 }) // Enhance brightness and contrast
    .grayscale()
    .toFile(preprocessedPath);
  
  // Decode the barcode using Quagga
  Quagga.decodeSingle(
    {
      src: preprocessedPath,
      numOfWorkers: 0,
      inputStream: { size: 800 },
      decoder: {
        readers: [
          'code_128_reader',
          'ean_reader',
          'ean_8_reader',
          'code_39_reader',
          'upc_reader',
          'upc_e_reader',
          'codabar_reader',
          'i2of5_reader',
          '2of5_reader',
          'code_93_reader',
        ],
      },
    },
    (result) => {
      // Clean up files
      fs.unlinkSync(filePath);
      fs.unlinkSync(preprocessedPath);
  
      if (result && result.codeResult) {
        res.send(`<h1>Decoded Text:</h1><p>${result.codeResult.code}</p>`);
      } else {
        console.error("Decode failed:", result);
        res.status(400).send('<h1>Error:</h1><p>Failed to decode barcode.</p>');
      }
    }
  
    );
  } catch (err) {
    // Clean up the uploaded file in case of an error
    fs.unlinkSync(filePath);
    if (fs.existsSync(preprocessedPath)) {
      fs.unlinkSync(preprocessedPath);
    }
    res.status(500).send(`<h1>Error:</h1><p>${err.message}</p>`);
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
