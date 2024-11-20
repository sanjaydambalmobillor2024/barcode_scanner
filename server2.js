const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const sharp = require('sharp');
const imagemagick = require('imagemagick');

// Set up express
const app = express();

// Ensure uploads directory exists
const uploadsDir = 'uploads';
if (!fs.existsSync(uploadsDir)){
    fs.mkdirSync(uploadsDir);
}

// Configure multer for file uploads
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
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Preprocessing configurations
const preprocessingConfigs = [
    {
      name: 'auto_rotate',
      process: async (imagePath) => {
        const outputPath = `${imagePath}_rotated.png`;
        await applyImageMagickProcessing(imagePath, outputPath, ['-auto-orient']);
        return outputPath;
      }
    },
    {
      name: 'rotation_sequence',
      process: async (imagePath) => {
        const outputPath = `${imagePath}_rotation_sequence.png`;
        await applyImageMagickProcessing(imagePath, outputPath, ['-deskew', '40%']);
        return outputPath;
      }
    },
    {
      name: 'sharpening',
      process: async (imagePath) => {
        const outputPath = `${imagePath}_sharpen.png`;
        await applyImageMagickProcessing(imagePath, outputPath, ['-sharpen', '0x3']);
        return outputPath;
      }
    },
    {
      name: 'contrast_enhancement',
      process: async (imagePath) => {
        const outputPath = `${imagePath}_contrast_enhance.png`;
        await applyImageMagickProcessing(imagePath, outputPath, ['-contrast', '-contrast']);
        return outputPath;
      }
    },
    {
      name: 'adaptive_sharpen',
      process: async (imagePath) => {
        const outputPath = `${imagePath}_adaptive_sharpen.png`;
        await applyImageMagickProcessing(imagePath, outputPath, ['-adaptive-sharpen', '0x2']);
        return outputPath;
      }
    },
    {
      name: 'basic_enhancement',
      process: async (imagePath) => {
        const outputPath = `${imagePath}_basic_enhance.png`;
        await applyImageMagickProcessing(imagePath, outputPath, ['-resize', '1500x1500', '-sharpen', '0x1.5']);
        return outputPath;
      }
    },
    {
      name: 'gaussian_blur_light',
      process: async (imagePath) => {
        const outputPath = `${imagePath}_gaussian_blur_light.png`;
        await applyImageMagickProcessing(imagePath, outputPath, ['-resize', '2000x2000', '-blur', '0x2', '-sharpen', '0x1.5']);
        return outputPath;
      }
    },
    {
      name: 'median_blur',
      process: async (imagePath) => {
        const outputPath = `${imagePath}_median_blur.png`;
        await applyImageMagickProcessing(imagePath, outputPath, ['-resize', '2000x2000', '-median', '3']);
        return outputPath;
      }
    },
    {
      name: 'adaptive_blur',
      process: async (imagePath) => {
        const outputPath = `${imagePath}_adaptive_blur.png`;
        await applyImageMagickProcessing(imagePath, outputPath, ['-resize', '2000x2000', '-blur', '0x3', '-sharpen', '0x2']);
        return outputPath;
      }
    },
    {
      name: 'bilateral_filter_denoising',
      process: async (imagePath) => {
        const outputPath = `${imagePath}_bilateral_filter.png`;
        await applyImageMagickProcessing(imagePath, outputPath, ['-resize', '2000x2000', '-adaptive-sharpen', '0x1']);
        return outputPath;
      }
    }
];

// Function to apply ImageMagick transformations
async function applyImageMagickProcessing(inputPath, outputPath, args) {
  try {
    const command = `convert ${inputPath} ${args.join(' ')} ${outputPath}`;
    await exec(command);
  } catch (error) {
    console.error(`Error during ImageMagick processing: ${error.message}`);
    throw error;
  }
}

// Function to preprocess image
async function preprocessImage(inputPath, config) {
  const outputPath = `${inputPath}_${config.name}.png`;
  
  try {
    return await config.process(inputPath);
  } catch (error) {
    console.error(`Preprocessing failed for ${config.name}:`, error);
    throw error;
  }
}

// Function to parse ZBar output
function parseZbarOutput(stdout) {
  const results = stdout.trim().split('\n');
  const codes = results.map(result => {
    const isQR = result.startsWith('QR-Code:');
    const data = isQR ? result.substring(8) : result;
    return {
      type: isQR ? 'QR Code' : 'Barcode',
      data: data
    };
  });

  return codes.length === 1 ? codes[0] : { type: 'Multiple', codes };
}

// Helper function to attempt scanning with different ZBar options
async function attemptScan(imagePath) {
  const zbarOptions = [
    '--quiet --raw',
    '--quiet --raw -S*.enable --set *.disable-cache=true',
    '--quiet --raw -S*.enable --set *.y-density=500',
    '--quiet --raw -Sdisable -Sqrcode.enable --set qrcode.y-density=500'
  ];

  for (const options of zbarOptions) {
    try {
      const { stdout } = await exec(`zbarimg ${options} "${imagePath}"`);
      if (stdout) {
        return parseZbarOutput(stdout);
      }
    } catch (error) {
      console.log(`Scan attempt failed with options ${options}`);
    }
  }
  return null;
}

// Enhanced scan function with rotation handling
async function scanImage(imagePath) {
  let processedFiles = [];
  let results = [];
  let successfulScan = false;

  // Organize configs by priority
  const rotationConfigs = preprocessingConfigs.filter(config => 
    config.name.includes('rotate') || config.name.includes('rotation')
  );
  
  const enhancementConfigs = preprocessingConfigs.filter(config => 
    config.name === 'sharpening' || config.name === 'contrast_enhancement' || config.name === 'adaptive_sharpen'
  );
  
  const blurConfigs = preprocessingConfigs.filter(config => 
    config.name.includes('blur') || config.name === 'bilateral_filter_denoising'
  );

  const orderedConfigs = [...rotationConfigs, ...enhancementConfigs, ...blurConfigs];
  const rotationAngles = [0, 90, 180, 270];

  try {
    // Try original image first
    const originalResult = await attemptScan(imagePath);
    if (originalResult) {
      return originalResult;
    }

    // Try auto-rotation
    for (const config of rotationConfigs) {
      try {
        const rotatedPath = await preprocessImage(imagePath, config);
        processedFiles.push(rotatedPath);
        
        const result = await attemptScan(rotatedPath);
        if (result) {
          results.push({
            method: config.name,
            result: result
          });
          successfulScan = true;
          break;
        }
      } catch (error) {
        console.log(`Auto-rotation attempt failed: ${error.message}`);
      }
    }

    // Try manual rotations if auto-rotation fails
    if (!successfulScan) {
      for (const angle of rotationAngles) {
        try {
          const rotatedPath = `${imagePath}_manual_rotation_${angle}.png`;
          await applyImageMagickProcessing(imagePath, rotatedPath, ['-rotate', angle.toString()]);
          processedFiles.push(rotatedPath);

          const result = await attemptScan(rotatedPath);
          if (result) {
            results.push({
              method: `manual_rotation_${angle}`,
              result: result
            });
            successfulScan = true;
            break;
          }
        } catch (error) {
          console.log(`Manual rotation ${angle}° failed: ${error.message}`);
        }
      }
    }

    // Try other preprocessing methods if rotation fails
    if (!successfulScan) {
      for (const config of orderedConfigs) {
        if (config.name.includes('rotate') || config.name.includes('rotation')) continue;
        
        try {
          const processedPath = await preprocessImage(imagePath, config);
          processedFiles.push(processedPath);

          const result = await attemptScan(processedPath);
          if (result) {
            results.push({
              method: config.name,
              result: result
            });
            successfulScan = true;
            break;
          }
        } catch (error) {
          console.log(`Preprocessing failed for ${config.name}: ${error.message}`);
        }
      }
    }

    if (results.length > 0) {
      return results[0].result;
    }

    throw new Error('No valid barcode or QR code detected after all attempts');
  } finally {
    // Cleanup processed files
    processedFiles.forEach(file => {
      fs.unlink(file, (err) => {
        if (err) console.error(`Error cleaning up processed file ${file}:`, err);
      });
    });
  }
}

// Route handler for scanning images
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

// Cleanup function
function cleanup(filePath) {
  fs.unlink(filePath, (err) => {
    if (err) console.error('Error cleaning up file:', err);
  });
}

// Error handling middleware
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

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});