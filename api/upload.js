const csv = require('csv-parser');
const ExcelJS = require('exceljs');
const multer = require('multer');
const { Readable } = require('stream');

// Configure multer for memory storage
const upload = multer({ storage: multer.memoryStorage() });

// Parse amount from string
function parseAmount(amountStr) {
    if (!amountStr || amountStr.trim() === '') return 0;
    
    let cleaned = amountStr.toString().trim()
        .replace(/,/g, '')
        .replace(/\$/g, '')
        .replace(/\(/g, '-')
        .replace(/\)/g, '');
    
    if (cleaned === '' || cleaned === '-') return 0;
    
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
}

// Categorize account for cash flow
function categorizeAccount(accountName, accountType) {
    const name = accountName.toLowerCase();
    const type = (accountType || '').toLowerCase();
    
    // Cash accounts
    if (name.includes('cash') || name.includes('bank') || name.includes('money market') || name.includes('investment')) {
        return 'cash';
    }
    
    // Operating activities (working capital)
    if (name.includes('receivable') || name.includes('prepaid') || name.includes('unbilled') ||
        name.includes('payable') || name.includes('accrued') || name.includes('wages') ||
        name.includes('payroll') || name.includes('deferred') || name.includes('credit card') ||
        name.includes('benefits') || name.includes('contributions')) {
        return 'operating';
    }
    
    // Investing activities
    if (name.includes('equipment') || name.includes('furniture') || name.includes('computer') ||
        name.includes('leasehold') || name.includes('software development') || name.includes('domain') ||
        name.includes('capitalized') || name.includes('note receivable') || name.includes('security deposits') ||
        name.includes('software rights')) {
        return 'investing';
    }
    
    // Financing activities
    if (type.includes('equity') || name.includes('stock') || name.includes('capital') ||
        name.includes('earnings') || name.includes('income') || name.includes('opening balance') ||
        name.includes('lease liabilities')) {
        return 'financing';
    }
    
    return 'operating'; // Default
}

// Adjust amount for cash flow impact
function adjustAmountForCashFlow(amount, accountType) {
    const type = (accountType || '').toLowerCase();
    // Increases in assets decrease cash, increases in liabilities/equity increase cash
    if (type.includes('asset')) {
        return -amount;
    }
    return amount;
}

// Generate cash flow statement
function generateCashFlowStatement(records) {
    const operatingItems = [];
    const investingItems = [];
    const financingItems = [];
    
    // Find net income
    let netIncome = 0;
    for (const record of records) {
        if (record.account && record.account.toLowerCase().includes('net income')) {
            netIncome = record.variance || 0;
            break;
        }
    }
    
    // Add net income to operating activities
    if (netIncome !== 0) {
        operatingItems.push({ description: 'Net Income', amount: netIncome });
    }
    
    // Process other accounts
    for (const record of records) {
        if (!record.variance || record.variance === 0) continue;
        if (record.account.toLowerCase().includes('total')) continue;
        if (record.account.toLowerCase().includes('net income')) continue;
        
        const category = categorizeAccount(record.account, record.accountType);
        const cleanName = record.account.split(' - ').slice(1).join(' - ') || record.account;
        const adjustedAmount = adjustAmountForCashFlow(record.variance, record.accountType);
        
        const item = {
            description: cleanName,
            amount: adjustedAmount
        };
        
        switch (category) {
            case 'operating':
                operatingItems.push(item);
                break;
            case 'investing':
                investingItems.push(item);
                break;
            case 'financing':
                financingItems.push(item);
                break;
            // Skip cash items as they're the result, not the cause
        }
    }
    
    // Calculate totals
    const operatingTotal = operatingItems.reduce((sum, item) => sum + item.amount, 0);
    const investingTotal = investingItems.reduce((sum, item) => sum + item.amount, 0);
    const financingTotal = financingItems.reduce((sum, item) => sum + item.amount, 0);
    
    // Add subtotals
    operatingItems.push({ description: 'Net Cash from Operating Activities', amount: operatingTotal });
    investingItems.push({ description: 'Net Cash from Investing Activities', amount: investingTotal });
    financingItems.push({ description: 'Net Cash from Financing Activities', amount: financingTotal });
    
    return {
        operatingActivities: operatingItems,
        investingActivities: investingItems,
        financingActivities: financingItems,
        netCashFlow: operatingTotal + investingTotal + financingTotal,
        periodStart: 'Mar 2025',
        periodEnd: 'Jun 2025'
    };
}

// Create Excel file
async function createExcelFile(cashFlow) {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Cash Flow Statement');
    
    // Set column widths
    worksheet.getColumn(1).width = 50;
    worksheet.getColumn(2).width = 20;
    
    let row = 1;
    
    // Title
    worksheet.getCell(`A${row}`).value = 'STATEMENT OF CASH FLOWS';
    worksheet.getCell(`A${row}`).font = { bold: true, size: 16 };
    worksheet.getCell(`A${row}`).alignment = { horizontal: 'center' };
    worksheet.mergeCells(`A${row}:B${row}`);
    row += 2;
    
    // Period
    worksheet.getCell(`A${row}`).value = `For the period from ${cashFlow.periodStart} to ${cashFlow.periodEnd}`;
    worksheet.getCell(`A${row}`).alignment = { horizontal: 'center' };
    worksheet.mergeCells(`A${row}:B${row}`);
    row += 2;
    
    // Operating Activities
    worksheet.getCell(`A${row}`).value = 'CASH FLOWS FROM OPERATING ACTIVITIES';
    worksheet.getCell(`A${row}`).font = { bold: true, size: 12 };
    worksheet.getCell(`A${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6E6FA' } };
    worksheet.mergeCells(`A${row}:B${row}`);
    row++;
    
    for (const item of cashFlow.operatingActivities) {
        worksheet.getCell(`A${row}`).value = item.description;
        worksheet.getCell(`B${row}`).value = item.amount;
        worksheet.getCell(`B${row}`).numFmt = '$#,##0.00';
        
        if (item.description.includes('Net Cash from')) {
            worksheet.getCell(`A${row}`).font = { bold: true };
            worksheet.getCell(`B${row}`).font = { bold: true };
            worksheet.getCell(`A${row}`).border = { top: { style: 'thin' } };
            worksheet.getCell(`B${row}`).border = { top: { style: 'thin' } };
        }
        row++;
    }
    row++;
    
    // Investing Activities
    worksheet.getCell(`A${row}`).value = 'CASH FLOWS FROM INVESTING ACTIVITIES';
    worksheet.getCell(`A${row}`).font = { bold: true, size: 12 };
    worksheet.getCell(`A${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6E6FA' } };
    worksheet.mergeCells(`A${row}:B${row}`);
    row++;
    
    for (const item of cashFlow.investingActivities) {
        worksheet.getCell(`A${row}`).value = item.description;
        worksheet.getCell(`B${row}`).value = item.amount;
        worksheet.getCell(`B${row}`).numFmt = '$#,##0.00';
        
        if (item.description.includes('Net Cash from')) {
            worksheet.getCell(`A${row}`).font = { bold: true };
            worksheet.getCell(`B${row}`).font = { bold: true };
            worksheet.getCell(`A${row}`).border = { top: { style: 'thin' } };
            worksheet.getCell(`B${row}`).border = { top: { style: 'thin' } };
        }
        row++;
    }
    row++;
    
    // Financing Activities
    worksheet.getCell(`A${row}`).value = 'CASH FLOWS FROM FINANCING ACTIVITIES';
    worksheet.getCell(`A${row}`).font = { bold: true, size: 12 };
    worksheet.getCell(`A${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6E6FA' } };
    worksheet.mergeCells(`A${row}:B${row}`);
    row++;
    
    for (const item of cashFlow.financingActivities) {
        worksheet.getCell(`A${row}`).value = item.description;
        worksheet.getCell(`B${row}`).value = item.amount;
        worksheet.getCell(`B${row}`).numFmt = '$#,##0.00';
        
        if (item.description.includes('Net Cash from')) {
            worksheet.getCell(`A${row}`).font = { bold: true };
            worksheet.getCell(`B${row}`).font = { bold: true };
            worksheet.getCell(`A${row}`).border = { top: { style: 'thin' } };
            worksheet.getCell(`B${row}`).border = { top: { style: 'thin' } };
        }
        row++;
    }
    row++;
    
    // Net change in cash
    worksheet.getCell(`A${row}`).value = 'NET INCREASE (DECREASE) IN CASH';
    worksheet.getCell(`B${row}`).value = cashFlow.netCashFlow;
    worksheet.getCell(`A${row}`).font = { bold: true };
    worksheet.getCell(`B${row}`).font = { bold: true };
    worksheet.getCell(`B${row}`).numFmt = '$#,##0.00';
    worksheet.getCell(`A${row}`).border = { top: { style: 'thin' } };
    worksheet.getCell(`B${row}`).border = { top: { style: 'thin' } };
    
    return await workbook.xlsx.writeBuffer();
}

// Upload handler
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).send('Method not allowed');
    }
    
    return new Promise((resolve) => {
        upload.single('csvfile')(req, res, async (err) => {
            if (err) {
                res.status(400).send('Error uploading file');
                return resolve();
            }
            
            if (!req.file) {
                res.status(400).send('No file uploaded');
                return resolve();
            }
            
            try {
                const records = [];
                const csvStream = Readable.from(req.file.buffer.toString());
                
                // Parse CSV
                await new Promise((resolve, reject) => {
                    csvStream
                        .pipe(csv({ headers: false }))
                        .on('data', (data) => {
                            const row = Object.values(data);
                            if (row.length >= 4 && row[0] && !row[0].toLowerCase().includes('total')) {
                                const variance = parseAmount(row[3]);
                                if (variance !== 0) {
                                    records.push({
                                        account: row[0],
                                        currentAmount: parseAmount(row[1]),
                                        priorAmount: parseAmount(row[2]),
                                        variance: variance,
                                        accountType: 'Balance Sheet'
                                    });
                                }
                            }
                        })
                        .on('end', resolve)
                        .on('error', reject);
                });
                
                // Generate cash flow statement
                const cashFlow = generateCashFlowStatement(records);
                
                // Create Excel file
                const excelBuffer = await createExcelFile(cashFlow);
                
                // Send Excel file
                res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
                res.setHeader('Content-Disposition', 'attachment; filename="cash_flow_statement.xlsx"');
                res.send(excelBuffer);
                
            } catch (error) {
                console.error('Error processing file:', error);
                res.status(500).send('Error processing file: ' + error.message);
            }
            
            resolve();
        });
    });
}