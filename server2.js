const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const util = require('util');
const exec = util.promisify(require('child_process').exec);

const app = express();


const uploadsDir = 'uploads';
if (!fs.existsSync(uploadsDir)){
    fs.mkdirSync(uploadsDir);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed!'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024
  }
});


async function scanImage(imagePath) {
  try {
  
    const { stdout, stderr } = await exec(`zbarimg --quiet --raw ${imagePath}`);
    
   
    if (stdout) {
      const results = stdout.trim().split('\n');
      
     
      if (results.length > 0) {
       
        const isQR = results[0].startsWith('QR-Code:');
        const data = isQR ? results[0].substring(8) : results[0];
        
        return {
          type: isQR ? 'QR Code' : 'Barcode',
          data: data
        };
      }
    }
    
    throw new Error('No valid barcode or QR code detected');
  } catch (error) {
    if (error.stderr) {
      throw new Error(`Scanning failed: ${error.stderr}`);
    }
    throw error;
  }
}

app.post('/scan', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    console.log('Processing file:', req.file.filename);

    try {
      const result = await scanImage(req.file.path);
      cleanup(req.file.path);
      return res.json(result);
    } catch (error) {
      cleanup(req.file.path);
      return res.status(400).json({
        error: 'Could not detect any valid barcode or QR code',
        details: error.message
      });
    }

  } catch (error) {
    if (req.file) cleanup(req.file.path);
    return res.status(500).json({
      error: 'Server error',
      details: error.message
    });
  }
});

function cleanup(filePath) {
  fs.unlink(filePath, (err) => {
    if (err) console.error('Error cleaning up file:', err);
  });
}

app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    return res.status(400).json({
      error: 'File upload error',
      details: error.message
    });
  }
  res.status(500).json({
    error: 'Server error',
    details: error.message
  });
});


app.get('/test-zbar', async (req, res) => {
  try {
    const { stdout, stderr } = await exec('zbarimg --version');
    res.json({
      status: 'success',
      version: stdout.trim()
    });
  } catch (error) {
    res.status(500).json({
      error: 'ZBar not properly installed',
      details: error.message
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Testing ZBar installation...`);
  exec('zbarimg --version')
    .then(({stdout}) => console.log(`ZBar installed: ${stdout.trim()}`))
    .catch(err => console.error('ZBar not found. Please install ZBar first.'));
});