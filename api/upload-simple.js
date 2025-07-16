const csv = require('csv-parser');
const ExcelJS = require('exceljs');
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

// Simple cash flow statement generation for testing
function generateSimpleCashFlow(netIncome, interestIncome, dividendIncome) {
    return {
        companyName: 'Test Company',
        periodDescription: 'For the Quarter Ended',
        operatingActivities: [
            {
                description: netIncome < 0 ? 'Net loss' : 'Net income',
                amount: netIncome,
                isMainItem: true
            },
            {
                description: 'Adjustments to reconcile net income to cash from operating activities:',
                amount: null,
                isHeader: true
            },
            {
                description: 'Interest income received',
                amount: -interestIncome,
                isAdjustment: true
            },
            {
                description: 'Dividend income received',
                amount: -dividendIncome,
                isAdjustment: true
            },
            {
                description: 'Net cash provided by operating activities',
                amount: netIncome - interestIncome - dividendIncome,
                isMainItem: true
            }
        ],
        investingActivities: [],
        financingActivities: [],
        netCashChange: netIncome - interestIncome - dividendIncome,
        beginningCash: 0,
        endingCash: netIncome - interestIncome - dividendIncome
    };
}

// Simple Excel creation
async function createSimpleExcel(cashFlow) {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Cash Flow Statement');
    
    let row = 1;
    
    // Title
    worksheet.getCell(`A${row}`).value = cashFlow.companyName;
    worksheet.getCell(`A${row}`).font = { bold: true, size: 14 };
    row += 2;
    
    worksheet.getCell(`A${row}`).value = 'CASH FLOW STATEMENT';
    worksheet.getCell(`A${row}`).font = { bold: true, size: 12 };
    row += 2;
    
    // Operating activities
    for (const item of cashFlow.operatingActivities) {
        if (item.isHeader) {
            worksheet.getCell(`A${row}`).value = item.description;
            worksheet.getCell(`A${row}`).font = { bold: true };
        } else {
            worksheet.getCell(`A${row}`).value = item.description;
            if (item.amount !== null) {
                worksheet.getCell(`B${row}`).value = item.amount;
                worksheet.getCell(`B${row}`).numFmt = '#,##0_);(#,##0)';
            }
            if (item.isMainItem) {
                worksheet.getCell(`A${row}`).font = { bold: true };
                worksheet.getCell(`B${row}`).font = { bold: true };
            }
        }
        row++;
    }
    
    return await workbook.xlsx.writeBuffer();
}

// Parse income statement data
function parseIncomeStatementData(records) {
    let netIncome = 0;
    let interestIncome = 0;
    let dividendIncome = 0;
    
    for (const record of records) {
        const keys = Object.keys(record);
        if (keys.length < 2) continue;
        
        const description = record[keys[0]] || '';
        const amount = record[keys[1]] || '';
        
        const descLower = description.toLowerCase();
        const parsedAmount = parseAmount(amount);
        
        if (descLower.includes('net income')) {
            netIncome = parsedAmount;
        }
        if (descLower.includes('interest income')) {
            interestIncome = parsedAmount;
        }
        if (descLower.includes('dividend income')) {
            dividendIncome = parsedAmount;
        }
    }
    
    return { netIncome, interestIncome, dividendIncome };
}

// Parse CSV file
function parseCSVFile(fileBuffer, fileType) {
    return new Promise((resolve, reject) => {
        try {
            const records = [];
            const csvContent = fileBuffer.toString('utf8');
            const csvStream = Readable.from(csvContent);
            
            csvStream
                .pipe(csv({ headers: false }))
                .on('data', (data) => {
                    if (fileType === 'incomeStatement') {
                        const row = Object.values(data);
                        if (row.length >= 2 && row[0]) {
                            const record = {};
                            const keys = Object.keys(data);
                            if (keys.length >= 2) {
                                record[keys[0]] = row[0];
                                record[keys[1]] = row[1];
                                records.push(record);
                            }
                        }
                    }
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
    console.log('Simple upload handler called');
    
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    return new Promise((resolve) => {
        const form = new IncomingForm();
        
        form.parse(req, async (err, fields, files) => {
            if (err) {
                console.error('Formidable error:', err);
                res.status(400).json({ error: 'Error uploading files', details: err.message });
                return resolve();
            }
            
            console.log('Files received:', Object.keys(files));
            
            if (!files.balanceSheetFile || !files.incomeStatementFile) {
                res.status(400).json({ error: 'Both balance sheet and income statement files are required' });
                return resolve();
            }
            
            try {
                // Get files
                const incomeStatementFile = Array.isArray(files.incomeStatementFile) ? files.incomeStatementFile[0] : files.incomeStatementFile;
                
                console.log('Processing income statement file:', incomeStatementFile.originalFilename);
                
                // Read and parse income statement
                const incomeStatementBuffer = fs.readFileSync(incomeStatementFile.filepath);
                const incomeStatementRecords = await parseCSVFile(incomeStatementBuffer, 'incomeStatement');
                
                console.log('Income statement records found:', incomeStatementRecords.length);
                
                // Extract income data
                const { netIncome, interestIncome, dividendIncome } = parseIncomeStatementData(incomeStatementRecords);
                
                console.log('Extracted data:', { netIncome, interestIncome, dividendIncome });
                
                // Generate simple cash flow
                const cashFlow = generateSimpleCashFlow(netIncome, interestIncome, dividendIncome);
                
                // Create Excel file
                const excelBuffer = await createSimpleExcel(cashFlow);
                
                // Send Excel file
                res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
                res.setHeader('Content-Disposition', 'attachment; filename="simple_cash_flow_statement.xlsx"');
                res.send(excelBuffer);
                
                // Clean up
                try {
                    fs.unlinkSync(incomeStatementFile.filepath);
                    if (files.balanceSheetFile) {
                        const balanceSheetFile = Array.isArray(files.balanceSheetFile) ? files.balanceSheetFile[0] : files.balanceSheetFile;
                        fs.unlinkSync(balanceSheetFile.filepath);
                    }
                } catch (cleanupError) {
                    console.warn('File cleanup error:', cleanupError.message);
                }
                
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