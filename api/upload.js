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

// Categorize account for cash flow with specific line items
function categorizeAccount(accountName, accountType) {
    const name = accountName.toLowerCase();
    const type = (accountType || '').toLowerCase();
    
    // Cash accounts
    if (name.includes('cash') || name.includes('bank') || name.includes('money market')) {
        return 'cash';
    }
    
    // Operating activities - specific categorization
    if (name.includes('receivable')) {
        return { category: 'operating', lineItem: 'Accounts receivable' };
    }
    if (name.includes('prepaid') || name.includes('other assets')) {
        return { category: 'operating', lineItem: 'Prepaid expenses and other assets' };
    }
    if (name.includes('payable')) {
        return { category: 'operating', lineItem: 'Accounts payable' };
    }
    if (name.includes('accrued') && (name.includes('expense') || name.includes('liabilities'))) {
        return { category: 'operating', lineItem: 'Accrued expenses and other liabilities' };
    }
    if (name.includes('accrued') && name.includes('compensation')) {
        return { category: 'operating', lineItem: 'Accrued compensation and benefits' };
    }
    if (name.includes('deferred') && name.includes('revenue')) {
        return { category: 'operating', lineItem: 'Deferred revenue' };
    }
    if (name.includes('customer') && name.includes('deposit')) {
        return { category: 'operating', lineItem: 'Customer deposits' };
    }
    if (name.includes('deferred') && name.includes('contract')) {
        return { category: 'operating', lineItem: 'Deferred contract acquisition costs' };
    }
    
    // Investing activities
    if (name.includes('equipment') || name.includes('furniture') || name.includes('computer') ||
        name.includes('property')) {
        return { category: 'investing', lineItem: 'Purchases of property and equipment' };
    }
    if (name.includes('capitalized') && name.includes('software')) {
        return { category: 'investing', lineItem: 'Capitalized internal-use software' };
    }
    if (name.includes('business') && name.includes('combination')) {
        return { category: 'investing', lineItem: 'Business combination, net of cash acquired' };
    }
    if (name.includes('short-term') && name.includes('investment')) {
        if (name.includes('purchase')) {
            return { category: 'investing', lineItem: 'Purchases of short-term investments' };
        }
        if (name.includes('proceeds') || name.includes('sale')) {
            return { category: 'investing', lineItem: 'Proceeds from sales of short-term investments' };
        }
        if (name.includes('maturities')) {
            return { category: 'investing', lineItem: 'Proceeds from maturities of short-term investments' };
        }
    }
    
    // Financing activities
    if (name.includes('taxes') && name.includes('equity')) {
        return { category: 'financing', lineItem: 'Taxes paid related to net share settlement of equity awards' };
    }
    if (name.includes('acquisition') && name.includes('holdback')) {
        return { category: 'financing', lineItem: 'Payments related to acquisition holdback' };
    }
    
    // Default to operating with generic description
    return { category: 'operating', lineItem: 'Other' };
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

// Generate cash flow statement with condensed format
function generateCashFlowStatement(records) {
    // Initialize line item aggregators
    const lineItems = {
        operating: {},
        investing: {},
        financing: {}
    };
    
    // Find net income/loss
    let netIncome = 0;
    for (const record of records) {
        if (record.account && (record.account.toLowerCase().includes('net income') || 
                              record.account.toLowerCase().includes('net loss'))) {
            netIncome = record.variance || 0;
            break;
        }
    }
    
    // Process other accounts
    for (const record of records) {
        if (!record.variance || record.variance === 0) continue;
        if (record.account.toLowerCase().includes('total')) continue;
        if (record.account.toLowerCase().includes('net income') || 
            record.account.toLowerCase().includes('net loss')) continue;
        
        const categorization = categorizeAccount(record.account, record.accountType);
        if (categorization === 'cash') continue; // Skip cash items
        
        const adjustedAmount = adjustAmountForCashFlow(record.variance, record.accountType);
        
        if (typeof categorization === 'object') {
            const { category, lineItem } = categorization;
            
            if (!lineItems[category][lineItem]) {
                lineItems[category][lineItem] = 0;
            }
            lineItems[category][lineItem] += adjustedAmount;
        }
    }
    
    // Build operating activities with standard format
    const operatingActivities = [];
    
    // Start with net loss
    if (netIncome < 0) {
        operatingActivities.push({ description: 'Net loss', amount: netIncome, isMainItem: true });
    } else {
        operatingActivities.push({ description: 'Net income', amount: netIncome, isMainItem: true });
    }
    
    // Add adjustments section
    operatingActivities.push({ description: 'Adjustments to reconcile net loss to cash from operating activities:', amount: null, isHeader: true });
    
    // Add standard adjustment items (these would be calculated from actual data)
    operatingActivities.push({ description: 'Stock-based compensation expense, net of amounts capitalized', amount: 0, isAdjustment: true });
    operatingActivities.push({ description: 'Depreciation and amortization expense', amount: 0, isAdjustment: true });
    operatingActivities.push({ description: 'Non-cash operating lease cost', amount: 0, isMainItem: true });
    operatingActivities.push({ description: 'Accretion of discounts on marketable securities', amount: 0, isAdjustment: true });
    operatingActivities.push({ description: 'Deferred income taxes', amount: 0, isMainItem: true });
    operatingActivities.push({ description: 'Other', amount: 0, isAdjustment: true });
    
    // Add working capital changes
    operatingActivities.push({ description: 'Changes in operating assets and liabilities:', amount: null, isHeader: true });
    
    // Add line items from aggregated data
    Object.entries(lineItems.operating).forEach(([lineItem, amount]) => {
        if (amount !== 0) {
            operatingActivities.push({ description: lineItem, amount: amount, isWorkingCapital: true });
        }
    });
    
    // Calculate operating total
    const operatingTotal = operatingActivities
        .filter(item => item.amount !== null)
        .reduce((sum, item) => sum + item.amount, 0);
    
    operatingActivities.push({ description: 'Net cash provided by (used in) operating activities', amount: operatingTotal, isTotal: true });
    
    // Build investing activities
    const investingActivities = [];
    Object.entries(lineItems.investing).forEach(([lineItem, amount]) => {
        if (amount !== 0) {
            investingActivities.push({ description: lineItem, amount: amount, isMainItem: true });
        }
    });
    
    const investingTotal = investingActivities.reduce((sum, item) => sum + item.amount, 0);
    investingActivities.push({ description: 'Net cash provided by (used in) investing activities', amount: investingTotal, isTotal: true });
    
    // Build financing activities
    const financingActivities = [];
    Object.entries(lineItems.financing).forEach(([lineItem, amount]) => {
        if (amount !== 0) {
            financingActivities.push({ description: lineItem, amount: amount, isMainItem: true });
        }
    });
    
    const financingTotal = financingActivities.reduce((sum, item) => sum + item.amount, 0);
    financingActivities.push({ description: 'Net cash provided by (used in) financing activities', amount: financingTotal, isTotal: true });
    
    return {
        operatingActivities: operatingActivities,
        investingActivities: investingActivities,
        financingActivities: financingActivities,
        netCashFlow: operatingTotal + investingTotal + financingTotal,
        periodStart: 'Mar 2025',
        periodEnd: 'Jun 2025'
    };
}

// Create Excel file with condensed format
async function createExcelFile(cashFlow) {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Cash Flow Statement');
    
    // Set column widths
    worksheet.getColumn(1).width = 60;
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
    
    // Operating Activities Header
    worksheet.getCell(`A${row}`).value = 'Cash flows from operating activities';
    worksheet.getCell(`A${row}`).font = { bold: true, size: 12 };
    worksheet.getCell(`A${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB3D9FF' } };
    worksheet.mergeCells(`A${row}:B${row}`);
    row++;
    
    // Operating Activities Items
    for (const item of cashFlow.operatingActivities) {
        if (item.amount === null && item.isHeader) {
            // Header items (like "Adjustments to reconcile...")
            worksheet.getCell(`A${row}`).value = item.description;
            worksheet.getCell(`A${row}`).font = { italic: true };
            worksheet.getCell(`A${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB3D9FF' } };
            worksheet.mergeCells(`A${row}:B${row}`);
        } else {
            worksheet.getCell(`A${row}`).value = item.description;
            
            if (item.amount !== null) {
                worksheet.getCell(`B${row}`).value = item.amount;
                worksheet.getCell(`B${row}`).numFmt = '$#,##0.00';
            }
            
            // Apply styling based on item type
            if (item.isTotal) {
                worksheet.getCell(`A${row}`).font = { bold: true };
                worksheet.getCell(`B${row}`).font = { bold: true };
                worksheet.getCell(`A${row}`).border = { top: { style: 'thin' } };
                worksheet.getCell(`B${row}`).border = { top: { style: 'thin' } };
                worksheet.getCell(`A${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB3D9FF' } };
            } else if (item.isAdjustment || item.isWorkingCapital) {
                // Indent adjustment and working capital items
                worksheet.getCell(`A${row}`).value = '  ' + item.description;
                if (item.isAdjustment) {
                    worksheet.getCell(`A${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB3D9FF' } };
                }
            } else if (item.isMainItem) {
                worksheet.getCell(`A${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB3D9FF' } };
            }
        }
        row++;
    }
    row++;
    
    // Investing Activities Header
    worksheet.getCell(`A${row}`).value = 'Cash flows from investing activities';
    worksheet.getCell(`A${row}`).font = { bold: true, size: 12 };
    worksheet.getCell(`A${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB3D9FF' } };
    worksheet.mergeCells(`A${row}:B${row}`);
    row++;
    
    for (const item of cashFlow.investingActivities) {
        worksheet.getCell(`A${row}`).value = item.description;
        worksheet.getCell(`B${row}`).value = item.amount;
        worksheet.getCell(`B${row}`).numFmt = '$#,##0.00';
        
        if (item.isTotal) {
            worksheet.getCell(`A${row}`).font = { bold: true };
            worksheet.getCell(`B${row}`).font = { bold: true };
            worksheet.getCell(`A${row}`).border = { top: { style: 'thin' } };
            worksheet.getCell(`B${row}`).border = { top: { style: 'thin' } };
            worksheet.getCell(`A${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB3D9FF' } };
        } else {
            worksheet.getCell(`A${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB3D9FF' } };
        }
        row++;
    }
    row++;
    
    // Financing Activities Header
    worksheet.getCell(`A${row}`).value = 'Cash flows from financing activities';
    worksheet.getCell(`A${row}`).font = { bold: true, size: 12 };
    worksheet.getCell(`A${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB3D9FF' } };
    worksheet.mergeCells(`A${row}:B${row}`);
    row++;
    
    for (const item of cashFlow.financingActivities) {
        worksheet.getCell(`A${row}`).value = item.description;
        worksheet.getCell(`B${row}`).value = item.amount;
        worksheet.getCell(`B${row}`).numFmt = '$#,##0.00';
        
        if (item.isTotal) {
            worksheet.getCell(`A${row}`).font = { bold: true };
            worksheet.getCell(`B${row}`).font = { bold: true };
            worksheet.getCell(`A${row}`).border = { top: { style: 'thin' } };
            worksheet.getCell(`B${row}`).border = { top: { style: 'thin' } };
            worksheet.getCell(`A${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB3D9FF' } };
        } else {
            worksheet.getCell(`A${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB3D9FF' } };
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