const multer = require('multer');

// Configure multer for memory storage
const upload = multer({ storage: multer.memoryStorage() });

// Simple test handler
module.exports = async function handler(req, res) {
    console.log('Test upload handler called');
    console.log('Method:', req.method);
    console.log('Headers:', req.headers);
    
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    return new Promise((resolve) => {
        upload.fields([{ name: 'balanceSheetFile', maxCount: 1 }, { name: 'incomeStatementFile', maxCount: 1 }])(req, res, async (err) => {
            console.log('Multer processing started');
            
            if (err) {
                console.error('Multer error:', err);
                res.status(400).json({ error: 'Error uploading files', details: err.message });
                return resolve();
            }
            
            console.log('Files received:', req.files);
            
            if (!req.files || !req.files.balanceSheetFile || !req.files.incomeStatementFile) {
                console.log('Missing files');
                res.status(400).json({ error: 'Both balance sheet and income statement files are required' });
                return resolve();
            }
            
            try {
                const balanceSheetFile = req.files.balanceSheetFile[0];
                const incomeStatementFile = req.files.incomeStatementFile[0];
                
                console.log('File details:', {
                    balanceSheet: {
                        filename: balanceSheetFile.originalname,
                        size: balanceSheetFile.size,
                        mimetype: balanceSheetFile.mimetype
                    },
                    incomeStatement: {
                        filename: incomeStatementFile.originalname,
                        size: incomeStatementFile.size,
                        mimetype: incomeStatementFile.mimetype
                    }
                });
                
                // Simple response without processing
                res.status(200).json({
                    success: true,
                    message: 'Files received successfully',
                    files: {
                        balanceSheet: {
                            name: balanceSheetFile.originalname,
                            size: balanceSheetFile.size
                        },
                        incomeStatement: {
                            name: incomeStatementFile.originalname,
                            size: incomeStatementFile.size
                        }
                    }
                });
                
            } catch (error) {
                console.error('Processing error:', error);
                res.status(500).json({
                    error: 'Processing failed',
                    message: error.message,
                    stack: error.stack
                });
            }
            
            resolve();
        });
    });
}