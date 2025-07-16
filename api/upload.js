const csv = require('csv-parser');
const ExcelJS = require('exceljs');
const multer = require('multer');
const { Readable } = require('stream');

// Configure multer for memory storage
const upload = multer({ storage: multer.memoryStorage() });

// Parse amount from string
function parseAmount(amountStr) {
    if (!amountStr) return 0;
    
    // Convert to string first, then trim
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

// Detect if CSV is an income statement format
function isIncomeStatementFormat(records) {
    if (!records || records.length === 0) return false;
    
    // Check for income statement indicators
    const hasIncomeStatementHeaders = records.some(record => {
        const firstKey = Object.keys(record)[0];
        const value = record[firstKey] || '';
        const valueLower = value.toLowerCase();
        return valueLower.includes('income statement') ||
               valueLower.includes('net income') ||
               valueLower.includes('gross profit') ||
               valueLower.includes('total - income') ||
               valueLower.includes('interest income') ||
               valueLower.includes('dividend income');
    });
    
    // Check if it has the two-column format (Financial Row, Amount)
    const hasTwoColumnFormat = records.length > 0 && 
        Object.keys(records[0]).length === 2;
    
    return hasIncomeStatementHeaders || hasTwoColumnFormat;
}

// Parse income statement CSV format
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
        
        // Extract net income
        if (descLower.includes('net income')) {
            netIncome = parsedAmount;
        }
        
        // Extract interest income
        if (descLower.includes('interest income')) {
            interestIncome = parsedAmount;
        }
        
        // Extract dividend income
        if (descLower.includes('dividend income')) {
            dividendIncome = parsedAmount;
        }
    }
    
    return { netIncome, interestIncome, dividendIncome };
}

// Parse CSV file buffer into records
function parseCSVFile(fileBuffer, fileType) {
    return new Promise((resolve, reject) => {
        try {
            if (!fileBuffer || fileBuffer.length === 0) {
                throw new Error(`Empty file buffer for ${fileType}`);
            }
            
            const records = [];
            const csvContent = fileBuffer.toString('utf8');
            
            if (!csvContent || csvContent.trim().length === 0) {
                throw new Error(`Empty CSV content for ${fileType}`);
            }
            
            console.log(`Parsing ${fileType} - Content preview:`, csvContent.substring(0, 200));
            
            const csvStream = Readable.from(csvContent);
            
            csvStream
                .pipe(csv({ headers: false }))
                .on('data', (data) => {
                    try {
                        const row = Object.values(data);
                        
                        if (fileType === 'balanceSheet') {
                            // Balance sheet parsing logic
                            if (row.length >= 4 && row[0]) {
                                const isTotal = row[0].toLowerCase().includes('total');
                                const isTotalBank = row[0].toLowerCase().includes('total bank');
                                const variance = parseAmount(row[3]);
                                
                                if (isTotalBank || (!isTotal && variance !== 0)) {
                                    records.push({
                                        account: row[0],
                                        currentAmount: parseAmount(row[1]),
                                        priorAmount: parseAmount(row[2]),
                                        variance: variance,
                                        accountType: 'Balance Sheet'
                                    });
                                }
                            }
                        } else if (fileType === 'incomeStatement') {
                            // Income statement parsing logic
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
                    } catch (rowError) {
                        console.warn(`Error parsing row in ${fileType}:`, rowError.message);
                        // Continue processing other rows
                    }
                })
                .on('end', () => {
                    console.log(`${fileType} parsing completed. Records found:`, records.length);
                    if (records.length === 0) {
                        console.warn(`No records found in ${fileType}`);
                    }
                    resolve(records);
                })
                .on('error', (error) => {
                    console.error(`CSV parsing error for ${fileType}:`, error);
                    reject(new Error(`CSV parsing failed for ${fileType}: ${error.message}`));
                });
        } catch (error) {
            console.error(`parseCSVFile error for ${fileType}:`, error);
            reject(error);
        }
    });
}

// Categorize account for cash flow with specific line items based on NetSuite account names
function categorizeAccount(accountName, accountType) {
    const name = accountName.toLowerCase();
    const type = (accountType || '').toLowerCase();
    
    // Cash accounts
    if (name.includes('cash') || name.includes('bank') || name.includes('money market') || name.includes('jpm')) {
        return 'cash';
    }
    
    // Depreciation and amortization (from AD accounts)
    if (name.includes('ad -') || name.includes('accumulated depreciation')) {
        return { category: 'operating', lineItem: 'Depreciation and amortization expense' };
    }
    
    // Prepaid expenses and unbilled (check unbilled first before accounts receivable)
    if (name.includes('prepaid') || name.includes('unbilled')) {
        return { category: 'operating', lineItem: 'Prepaid expenses and other assets' };
    }
    
    // Operating activities - specific NetSuite account mapping (after unbilled check)
    if (name.includes('accounts receivable') || name.includes('receivables')) {
        return { category: 'operating', lineItem: 'Accounts receivable' };
    }
    
    // Other assets (security deposits, etc.)
    if (name.includes('security deposits') || name.includes('note receivable') || name.includes('interest on note')) {
        return { category: 'operating', lineItem: 'Other assets' };
    }
    
    // Accounts payable
    if (name.includes('accounts payable') || name.includes('credit card')) {
        return { category: 'operating', lineItem: 'Accounts payable' };
    }
    
    // Accrued expenses and other liabilities (includes payroll, wages, benefits, etc.)
    if (name.includes('payroll') || name.includes('wages') || name.includes('benefits') || 
        name.includes('accrued') || name.includes('employee') || name.includes('contributions') ||
        name.includes('other payables') || name.includes('operating lease liabilities')) {
        return { category: 'operating', lineItem: 'Accrued expenses and other liabilities' };
    }
    
    // Deferred revenue
    if (name.includes('deferred revenue')) {
        return { category: 'operating', lineItem: 'Deferred revenue' };
    }
    
    // Investing activities - Property and Equipment
    if (name.includes('furniture') || name.includes('computer equipment') || name.includes('equipment')) {
        return { category: 'investing', lineItem: 'Purchases of property and equipment' };
    }
    
    // Financing activities - Stock issuances (Additional paid-in capital)
    if (name.includes('additional paid-in capital')) {
        return { category: 'financing', lineItem: 'Proceeds from stock issuance' };
    }
    
    // Other equity transactions (Opening Balance, etc.)
    if (name.includes('opening balance') || name.includes('z_opening')) {
        return { category: 'financing', lineItem: 'Other equity transactions' };
    }
    
    // Skip these accounts for cash flow purposes
    if (name.includes('retained earnings') || name.includes('net income') || name.includes('total') ||
        name.includes('preferred stock') || name.includes('common stock') || 
        name.includes('capitalized software') || name.includes('domain') || name.includes('leasehold')) {
        return 'skip';
    }
    
    // Default to skip if not specifically categorized
    return 'skip';
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

// Generate cash flow statement from both balance sheet and income statement data
function generateCashFlowStatementFromBothFiles(balanceSheetRecords, incomeStatementRecords) {
    // Extract income statement data
    const incomeData = parseIncomeStatementData(incomeStatementRecords);
    const netIncome = incomeData.netIncome;
    const interestIncome = incomeData.interestIncome;
    const dividendIncome = incomeData.dividendIncome;
    
    console.log('Extracted Income Data:', { netIncome, interestIncome, dividendIncome });
    
    // Use balance sheet records for working capital changes and other cash flow items
    return generateCashFlowStatement(balanceSheetRecords, { netIncome, interestIncome, dividendIncome });
}

// Generate cash flow statement with exact format matching the provided template
function generateCashFlowStatement(records, incomeData = null) {
    // Initialize line item aggregators
    const lineItems = {
        operating: {},
        investing: {},
        financing: {}
    };
    
    // Use provided income data if available, otherwise detect format and parse
    let netIncome = 0;
    let beginningCash = 0;
    let dividendIncome = 0;
    let interestIncome = 0;
    
    if (incomeData) {
        // Use provided income data from separate income statement file
        netIncome = incomeData.netIncome || 0;
        interestIncome = incomeData.interestIncome || 0;
        dividendIncome = incomeData.dividendIncome || 0;
        
        console.log('Using provided income data:', {
            netIncome,
            interestIncome,
            dividendIncome
        });
    } else {
        // Check if this is an income statement format
        const isIncomeStatement = isIncomeStatementFormat(records);
        
        if (isIncomeStatement) {
            // Parse income statement format
            const parsedIncomeData = parseIncomeStatementData(records);
            netIncome = parsedIncomeData.netIncome;
            interestIncome = parsedIncomeData.interestIncome;
            dividendIncome = parsedIncomeData.dividendIncome;
            
            console.log('Parsed Income Statement Data:', {
                netIncome,
                interestIncome,
                dividendIncome
            });
        } else {
        // Original balance sheet format parsing
        for (const record of records) {
            // Calculate net income from income statement components
            if (record.account && record.accountType) {
                const amount = parseAmount(record.currentAmount) || parseAmount(record.variance) || 0;
                const accountType = record.accountType.toLowerCase();
                const accountName = record.account.toLowerCase();
                
                // Income items (positive contribution to net income)
                if (accountType.includes('income') || accountName.includes('revenue') || accountName.includes('sales')) {
                    netIncome += amount;
                }
                // Expense items (negative contribution to net income)
                else if (accountType.includes('expense') || accountType.includes('cost of goods sold')) {
                    netIncome += amount; // Amount is already negative in the data
                }
                
                // Track dividend and interest income for adjustments
                if (accountName.includes('dividend') && accountType.includes('income')) {
                    dividendIncome += amount;
                }
                if (accountName.includes('interest') && accountType.includes('income')) {
                    interestIncome += amount;
                }
            }
            
            // Extract net income from existing net income accounts if present
            if (record.account && record.account.toLowerCase().includes('net income')) {
                const currentAmount = parseAmount(record.currentAmount) || 0;
                const priorAmount = parseAmount(record.priorAmount) || 0;
                const variance = parseAmount(record.variance) || 0;
                
                // For first quarter (prior amount is 0), use current amount
                // For subsequent quarters, use variance
                if (priorAmount === 0) {
                    netIncome = currentAmount;
                } else {
                    netIncome = variance;
                }
            }
            
            // Extract beginning cash from Total Bank - Comparison Amount column
            if (record.account && record.account.toLowerCase().includes('total bank')) {
                beginningCash = parseAmount(record.priorAmount) || 0;
                console.log('Found Total Bank:', record.account, 'Prior Amount:', record.priorAmount, 'Parsed:', beginningCash);
            }
        }
    }
    
    // Process other accounts
    for (const record of records) {
        if (!record.variance || parseAmount(record.variance) === 0) continue;
        
        const categorization = categorizeAccount(record.account, record.accountType);
        if (categorization === 'cash' || categorization === 'skip') continue;
        
        const variance = parseAmount(record.variance);
        
        if (typeof categorization === 'object') {
            const { category, lineItem } = categorization;
            
            if (!lineItems[category][lineItem]) {
                lineItems[category][lineItem] = 0;
            }
            
            // For balance sheet items, the variance represents the change
            // For assets: increase = use of cash (negative), decrease = source of cash (positive)
            // For liabilities/equity: increase = source of cash (positive), decrease = use of cash (negative)
            let adjustedAmount = variance;
            
            // Reverse sign for asset accounts (AR, prepaid, etc.)
            if (lineItem === 'Accounts receivable' || lineItem === 'Prepaid expenses and other assets' || 
                lineItem === 'Other assets' || lineItem === 'Purchases of property and equipment') {
                adjustedAmount = -variance;
            }
            
            // For depreciation, we want the absolute increase in accumulated depreciation
            if (lineItem === 'Depreciation and amortization expense') {
                adjustedAmount = Math.abs(variance);
            }
            
            lineItems[category][lineItem] += adjustedAmount;
        }
    }
    
    // Build operating activities with exact format
    const operatingActivities = [];
    
    // Start with net loss (use actual amounts)
    operatingActivities.push({ 
        description: netIncome < 0 ? 'Net loss' : 'Net income', 
        amount: netIncome, 
        isMainItem: true 
    });
    
    // Add adjustments section header
    operatingActivities.push({ 
        description: 'Adjustments to reconcile net loss to cash from operating activities:', 
        amount: null, 
        isHeader: true 
    });
    
    // Add depreciation and amortization from actual data
    if (lineItems.operating['Depreciation and amortization expense']) {
        operatingActivities.push({ 
            description: 'Depreciation and amortization expense', 
            amount: lineItems.operating['Depreciation and amortization expense'], 
            isAdjustment: true 
        });
    }
    
    // Add dividend and interest income adjustments (non-cash items to be deducted)
    if (dividendIncome > 0) {
        operatingActivities.push({ 
            description: 'Dividend income received', 
            amount: -dividendIncome, // Negative because it's a deduction from net income
            isAdjustment: true 
        });
    }
    
    if (interestIncome > 0) {
        operatingActivities.push({ 
            description: 'Interest income received', 
            amount: -interestIncome, // Negative because it's a deduction from net income
            isAdjustment: true 
        });
    }
    
    // Add working capital changes header
    operatingActivities.push({ 
        description: 'Changes in operating assets and liabilities:', 
        amount: null, 
        isHeader: true 
    });
    
    // Add line items from actual extracted data
    const operatingLineItemOrder = [
        'Accounts receivable',
        'Prepaid expenses and other assets', 
        'Other assets',
        'Accounts payable',
        'Accrued expenses and other liabilities',
        'Deferred revenue'
    ];
    
    operatingLineItemOrder.forEach(lineItem => {
        if (lineItems.operating[lineItem] && lineItems.operating[lineItem] !== 0) {
            operatingActivities.push({ 
                description: lineItem, 
                amount: lineItems.operating[lineItem], 
                isWorkingCapital: true 
            });
        }
    });
    
    // Calculate operating total
    const operatingTotal = operatingActivities
        .filter(item => item.amount !== null)
        .reduce((sum, item) => sum + item.amount, 0);
    
    operatingActivities.push({ 
        description: operatingTotal < 0 ? 'Net cash used in operating activities' : 'Net cash provided by operating activities', 
        amount: operatingTotal, 
        isTotal: true 
    });
    
    // Build investing activities
    const investingActivities = [];
    
    // Add investing items from actual extracted data
    if (lineItems.investing['Purchases of property and equipment'] && lineItems.investing['Purchases of property and equipment'] !== 0) {
        investingActivities.push({ 
            description: 'Purchases of property and equipment', 
            amount: lineItems.investing['Purchases of property and equipment'], 
            isMainItem: true 
        });
    }
    
    const investingTotal = investingActivities.reduce((sum, item) => sum + item.amount, 0);
    if (investingActivities.length > 0) {
        investingActivities.push({ 
            description: investingTotal < 0 ? 'Net cash used in investing activities' : 'Net cash provided by investing activities', 
            amount: investingTotal, 
            isTotal: true 
        });
    }
    
    // Build financing activities
    const financingActivities = [];
    
    // Add financing items from actual extracted data
    if (lineItems.financing['Proceeds from stock issuance'] && lineItems.financing['Proceeds from stock issuance'] !== 0) {
        financingActivities.push({ 
            description: 'Proceeds from stock issuance', 
            amount: lineItems.financing['Proceeds from stock issuance'], 
            isMainItem: true 
        });
    }
    
    if (lineItems.financing['Other equity transactions'] && lineItems.financing['Other equity transactions'] !== 0) {
        financingActivities.push({ 
            description: 'Other equity transactions', 
            amount: lineItems.financing['Other equity transactions'], 
            isMainItem: true 
        });
    }
    
    const financingTotal = financingActivities.reduce((sum, item) => sum + item.amount, 0);
    if (financingActivities.length > 0) {
        financingActivities.push({ 
            description: financingTotal < 0 ? 'Net cash used in financing activities' : 'Net cash provided by financing activities', 
            amount: financingTotal, 
            isTotal: true 
        });
    }
    
    // Calculate net change in cash
    const netCashChange = operatingTotal + investingTotal + financingTotal;
    
    // Calculate ending cash as beginning cash + net cash change (formula)
    const endingCash = beginningCash + netCashChange;
    
    return {
        operatingActivities: operatingActivities,
        investingActivities: investingActivities,
        financingActivities: financingActivities,
        netCashChange: netCashChange,
        beginningCash: beginningCash,
        endingCash: endingCash,
        companyName: 'Coder Technologies, Inc.',
        periodDescription: 'Three Months Ended June 30, 2025'
    };
}

// Create Excel file with exact format matching the template
async function createExcelFile(cashFlow) {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Cash Flow Statement');
    
    // Set column widths
    worksheet.getColumn(1).width = 50;
    worksheet.getColumn(2).width = 20;
    
    let row = 1;
    
    // Company Name
    worksheet.getCell(`A${row}`).value = cashFlow.companyName;
    worksheet.getCell(`A${row}`).font = { bold: true, size: 14 };
    worksheet.getCell(`A${row}`).alignment = { horizontal: 'center' };
    worksheet.mergeCells(`A${row}:B${row}`);
    row++;
    
    // Title
    worksheet.getCell(`A${row}`).value = 'CONDENSED CONSOLIDATED STATEMENTS OF CASH FLOWS';
    worksheet.getCell(`A${row}`).font = { bold: true, size: 12 };
    worksheet.getCell(`A${row}`).alignment = { horizontal: 'center' };
    worksheet.mergeCells(`A${row}:B${row}`);
    row++;
    
    // Subtitle 1
    worksheet.getCell(`A${row}`).value = '(amounts in thousands)';
    worksheet.getCell(`A${row}`).alignment = { horizontal: 'center' };
    worksheet.mergeCells(`A${row}:B${row}`);
    row++;
    
    // Subtitle 2
    worksheet.getCell(`A${row}`).value = '(unaudited)';
    worksheet.getCell(`A${row}`).alignment = { horizontal: 'center' };
    worksheet.mergeCells(`A${row}:B${row}`);
    row++;
    
    // Period
    worksheet.getCell(`A${row}`).value = cashFlow.periodDescription;
    worksheet.getCell(`A${row}`).font = { bold: true };
    worksheet.getCell(`A${row}`).alignment = { horizontal: 'center' };
    worksheet.mergeCells(`A${row}:B${row}`);
    row += 2;
    
    // Column headers
    worksheet.getCell(`A${row}`).value = 'Description';
    worksheet.getCell(`B${row}`).value = 'Amount (thousands)';
    worksheet.getCell(`A${row}`).font = { bold: true };
    worksheet.getCell(`B${row}`).font = { bold: true };
    row++;
    
    // Operating Activities Header
    worksheet.getCell(`A${row}`).value = 'Cash flows from operating activities';
    worksheet.getCell(`A${row}`).font = { bold: true };
    row++;
    
    // Operating Activities Items
    for (const item of cashFlow.operatingActivities) {
        if (item.amount === null && item.isHeader) {
            worksheet.getCell(`A${row}`).value = item.description;
            worksheet.getCell(`A${row}`).font = { italic: true };
        } else {
            worksheet.getCell(`A${row}`).value = item.description;
            
            if (item.amount !== null) {
                const numericAmount = Number(item.amount);
                worksheet.getCell(`B${row}`).value = numericAmount;
                worksheet.getCell(`B${row}`).numFmt = '#,##0_);(#,##0)';
            }
            
            // Apply styling based on item type
            if (item.isTotal) {
                worksheet.getCell(`A${row}`).font = { bold: true };
                worksheet.getCell(`B${row}`).font = { bold: true };
            }
        }
        row++;
    }
    
    // Investing Activities Header
    worksheet.getCell(`A${row}`).value = 'Cash flows from investing activities';
    worksheet.getCell(`A${row}`).font = { bold: true };
    row++;
    
    for (const item of cashFlow.investingActivities) {
        worksheet.getCell(`A${row}`).value = item.description;
        const numericAmount = Number(item.amount);
        worksheet.getCell(`B${row}`).value = numericAmount;
        worksheet.getCell(`B${row}`).numFmt = '#,##0_);(#,##0)';
        
        if (item.isTotal) {
            worksheet.getCell(`A${row}`).font = { bold: true };
            worksheet.getCell(`B${row}`).font = { bold: true };
        }
        row++;
    }
    
    // Financing Activities Header
    worksheet.getCell(`A${row}`).value = 'Cash flows from financing activities';
    worksheet.getCell(`A${row}`).font = { bold: true };
    row++;
    
    for (const item of cashFlow.financingActivities) {
        worksheet.getCell(`A${row}`).value = item.description;
        const numericAmount = Number(item.amount);
        worksheet.getCell(`B${row}`).value = numericAmount;
        worksheet.getCell(`B${row}`).numFmt = '#,##0_);(#,##0)';
        
        if (item.isTotal) {
            worksheet.getCell(`A${row}`).font = { bold: true };
            worksheet.getCell(`B${row}`).font = { bold: true };
        }
        row++;
    }
    
    // Net change in cash
    const netCashChangeAmount = Number(cashFlow.netCashChange);
    worksheet.getCell(`A${row}`).value = netCashChangeAmount < 0 ? 'Net decrease in cash and cash equivalents' : 'Net increase in cash and cash equivalents';
    worksheet.getCell(`B${row}`).value = netCashChangeAmount;
    worksheet.getCell(`A${row}`).font = { bold: true };
    worksheet.getCell(`B${row}`).font = { bold: true };
    worksheet.getCell(`B${row}`).numFmt = '#,##0_);(#,##0)';
    row++;
    
    // Beginning cash
    const beginningCashAmount = Number(cashFlow.beginningCash);
    worksheet.getCell(`A${row}`).value = 'Cash and cash equivalents at beginning of period';
    worksheet.getCell(`B${row}`).value = beginningCashAmount;
    worksheet.getCell(`B${row}`).numFmt = '#,##0_);(#,##0)';
    row++;
    
    // Ending cash
    const endingCashAmount = Number(cashFlow.endingCash);
    worksheet.getCell(`A${row}`).value = 'Cash and cash equivalents at end of period';
    worksheet.getCell(`B${row}`).value = endingCashAmount;
    worksheet.getCell(`A${row}`).font = { bold: true };
    worksheet.getCell(`B${row}`).font = { bold: true };
    worksheet.getCell(`B${row}`).numFmt = '#,##0_);(#,##0)';
    
    return await workbook.xlsx.writeBuffer();
}

// Upload handler
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).send('Method not allowed');
    }
    
    return new Promise((resolve) => {
        upload.fields([{ name: 'balanceSheetFile', maxCount: 1 }, { name: 'incomeStatementFile', maxCount: 1 }])(req, res, async (err) => {
            if (err) {
                res.status(400).send('Error uploading files');
                return resolve();
            }
            
            if (!req.files || !req.files.balanceSheetFile || !req.files.incomeStatementFile) {
                res.status(400).send('Both balance sheet and income statement files are required');
                return resolve();
            }
            
            try {
                console.log('Starting file processing...');
                
                // Parse both CSV files
                const balanceSheetFile = req.files.balanceSheetFile[0];
                const incomeStatementFile = req.files.incomeStatementFile[0];
                
                console.log('Files received:', {
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
                
                console.log('Parsing CSV files...');
                const [balanceSheetRecords, incomeStatementRecords] = await Promise.all([
                    parseCSVFile(balanceSheetFile.buffer, 'balanceSheet').catch(err => {
                        console.error('Balance sheet parsing error:', err);
                        throw new Error(`Balance sheet parsing failed: ${err.message}`);
                    }),
                    parseCSVFile(incomeStatementFile.buffer, 'incomeStatement').catch(err => {
                        console.error('Income statement parsing error:', err);
                        throw new Error(`Income statement parsing failed: ${err.message}`);
                    })
                ]);
                
                console.log('Parsing completed:', {
                    balanceSheetRecords: balanceSheetRecords.length,
                    incomeStatementRecords: incomeStatementRecords.length
                });
                
                console.log('Generating cash flow statement...');
                // Generate cash flow statement using both datasets
                const cashFlow = generateCashFlowStatementFromBothFiles(balanceSheetRecords, incomeStatementRecords);
                
                // Create Excel file
                const excelBuffer = await createExcelFile(cashFlow);
                
                // Send Excel file
                res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
                res.setHeader('Content-Disposition', 'attachment; filename="cash_flow_statement.xlsx"');
                res.send(excelBuffer);
                
            } catch (error) {
                console.error('Error processing files:', {
                    message: error.message,
                    stack: error.stack,
                    name: error.name
                });
                
                // Send detailed error response
                const errorMessage = `Error processing files: ${error.message}`;
                console.error('Sending error response:', errorMessage);
                
                res.status(500).json({
                    error: 'Processing failed',
                    message: errorMessage,
                    details: error.name
                });
            }
            
            resolve();
        });
    });
}