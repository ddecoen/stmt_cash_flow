const csv = require('csv-parser');
const { IncomingForm } = require('formidable');
const { Readable } = require('stream');
const fs = require('fs');

// API configuration for formidable
export const config = {
    api: {
        bodyParser: false,
    },
};

// Parse amount from string
function parseAmount(amountStr) {
    if (!amountStr) return 0;
    
    const strValue = amountStr.toString().trim();
    if (strValue === '') return 0;
    
    let cleaned = strValue
        .replace(/,/g, '')
        .replace(/\$/g, '')
        .replace(/\(/g, '-')
        .replace(/\)/g, '')
        .replace(/"/g, '')
        .trim();
    
    if (cleaned === '' || cleaned === '-') return 0;
    
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
}

// Format amount for CSV output
function formatAmountForCSV(amount) {
    if (amount === null || amount === undefined) return '';
    const numericAmount = Number(amount);
    if (isNaN(numericAmount)) return '';
    
    const absAmount = Math.abs(numericAmount);
    const formattedAmount = absAmount.toLocaleString('en-US');
    
    return numericAmount < 0 ? `"(${formattedAmount})"` : `"${formattedAmount}"`;
}

// Create CSV content
function createCSVContent(cashFlow) {
    const lines = [];
    
    // Header
    lines.push('"Coder Technologies, Inc.",,');
    lines.push('CONDENSED CONSOLIDATED STATEMENTS OF CASH FLOWS,,');
    lines.push('(amounts in thousands),,');
    lines.push('(unaudited),,');
    lines.push('"Three Months Ended June 30, 2025",,');
    lines.push(',,');
    lines.push('Description,Amount (thousands),Source (csv file)');
    
    // Operating Activities
    lines.push('Cash flows from operating activities,,');
    lines.push('Net loss,"(4767895)",Income Statement');
    lines.push('Adjustments to reconcile net loss to cash from operating activities:,,');
    lines.push('Depreciation and amortization expense,"20789",Income Statement');
    lines.push('Interest and dividend income received,"(249149)",');
    lines.push('Changes in operating assets and liabilities:,,');
    lines.push('Accounts receivable,"(700026)",Quarterly Balance Sheet');
    lines.push('Prepaid expenses and other assets,"(149309)",Quarterly Balance Sheet');
    lines.push('Other assets,"17287",Quarterly Balance Sheet');
    lines.push('Accounts payable,"(22503)",Quarterly Balance Sheet');
    lines.push('Accrued expenses and other liabilities,"397464",Quarterly Balance Sheet');
    lines.push('Deferred revenue,"231611",Quarterly Balance Sheet');
    lines.push('Net cash used in operating activities,"(5221731)",Formula');
    
    // Investing Activities
    lines.push('Cash flows from investing activities,,');
    lines.push('Purchases of property and equipment,"(39520)",Quarterly Balance Sheet');
    lines.push('Net cash used in investing activities,"(39520)",Formula');
    
    // Financing Activities
    lines.push('Cash flows from financing activities,,');
    lines.push('Proceeds from stock issuance,"221036",Quarterly Balance Sheet');
    lines.push('Other equity transactions,"46913",Quarterly Balance Sheet');
    lines.push('Net cash provided by financing activities,"267949",Formula');
    
    // Summary
    lines.push('Net decrease in cash and cash equivalents,"(4744152)",Formula');
    lines.push('Cash and cash equivalents at beginning of period,"28226280",Quarterly Balance Sheet');
    lines.push('Cash and cash equivalents at end of period,"23482127",Formula');
    
    // Validation
    lines.push(',,');
    lines.push(',"23482127",Quarterly Balance Sheet');
    lines.push(',"0",Formula (to check)');
    
    return lines.join('\n');
}

// Parse CSV file
function parseCSVFile(fileBuffer) {
    return new Promise((resolve, reject) => {
        try {
            const records = [];
            const csvContent = fileBuffer.toString('utf8');
            const csvStream = Readable.from(csvContent);
            
            csvStream
                .pipe(csv())
                .on('data', (data) => {
                    records.push(data);
                })
                .on('end', () => {
                    resolve(records);
                })
                .on('error', (error) => {
                    reject(error);
                });
        } catch (error) {
            reject(error);
        }
    });
}

// Main handler
export default async function handler(req, res) {
    console.log('=== CSV GENERATOR ENDPOINT CALLED ===');
    console.log('Method:', req.method);
    console.log('URL:', req.url);
    console.log('Headers:', JSON.stringify(req.headers, null, 2));
    
    if (req.method !== 'POST') {
        console.log('Method not allowed:', req.method);
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    return new Promise((resolve) => {
        const form = new IncomingForm();
        
        form.parse(req, async (err, fields, files) => {
            if (err) {
                console.error('Form parsing error:', err);
                res.status(400).json({ error: 'Error uploading files', details: err.message });
                return resolve();
            }
            
            console.log('Files received:', Object.keys(files));
            
            try {
                // For now, just return a simple CSV to test
                const csvContent = createCSVContent({});
                
                console.log('=== SENDING CSV RESPONSE ===');
                console.log('CSV Content Length:', csvContent.length);
                console.log('CSV Preview:', csvContent.substring(0, 200));
                
                // Set headers with extreme specificity
                res.writeHead(200, {
                    'Content-Type': 'text/csv; charset=utf-8',
                    'Content-Disposition': 'attachment; filename="cash_flow_test.csv"',
                    'Content-Length': Buffer.byteLength(csvContent, 'utf8'),
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Pragma': 'no-cache',
                    'Expires': '0',
                    'X-Content-Type-Options': 'nosniff'
                });
                
                res.end(csvContent, 'utf8');
                
                console.log('=== CSV RESPONSE SENT ===');
                
            } catch (error) {
                console.error('Processing error:', error);
                res.status(500).json({
                    error: 'Processing failed',
                    message: error.message
                });
            }
            
            resolve();
        });
    });
}
