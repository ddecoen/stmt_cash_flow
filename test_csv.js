const fs = require('fs');
const csv = require('csv-parser');
const { Readable } = require('stream');

// Import the functions from upload.js
const uploadModule = require('./api/upload.js');

// Read the sample files
const balanceSheetBuffer = fs.readFileSync('./sample_netsuite_balance_sheet.csv');
const incomeStatementBuffer = fs.readFileSync('./sample_netsuite.csv');

// Parse CSV function (copied from upload.js)
function parseCSVFile(fileBuffer, fileType) {
    return new Promise((resolve, reject) => {
        try {
            if (!fileBuffer || fileBuffer.length === 0) {
                throw new Error(`Empty file buffer for ${fileType}`);
            }
            
            const records = [];
            const stream = Readable.from(fileBuffer.toString());
            
            stream
                .pipe(csv())
                .on('data', (data) => {
                    records.push(data);
                })
                .on('end', () => {
                    console.log(`Parsed ${records.length} records from ${fileType}`);
                    resolve(records);
                })
                .on('error', (error) => {
                    console.error(`Error parsing ${fileType}:`, error);
                    reject(error);
                });
        } catch (error) {
            console.error(`Error setting up CSV parser for ${fileType}:`, error);
            reject(error);
        }
    });
}

// Test the CSV generation
async function testCSVGeneration() {
    try {
        console.log('Testing CSV generation...');
        
        // Parse the sample files
        const [balanceSheetRecords, incomeStatementRecords] = await Promise.all([
            parseCSVFile(balanceSheetBuffer, 'balanceSheet'),
            parseCSVFile(incomeStatementBuffer, 'incomeStatement')
        ]);
        
        console.log('Sample data parsed successfully');
        console.log('Balance sheet records:', balanceSheetRecords.length);
        console.log('Income statement records:', incomeStatementRecords.length);
        
        // Test if we can access the functions (they might not be exported)
        console.log('Available exports:', Object.keys(uploadModule));
        
    } catch (error) {
        console.error('Test failed:', error);
    }
}

testCSVGeneration();
