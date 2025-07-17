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

// Format amount for CSV output with proper parentheses for negatives
function formatAmountForCSV(amount) {
    if (amount === null || amount === undefined) return '';
    const numericAmount = Number(amount);
    if (isNaN(numericAmount)) return '';
    
    const absAmount = Math.abs(numericAmount);
    const formattedAmount = absAmount.toLocaleString('en-US');
    
    return numericAmount < 0 ? `"(${formattedAmount})"` : `"${formattedAmount}"`;
}

// Create CSV file with exact format matching the template
function createCSVFile(cashFlow) {
    const csvLines = [];
    
    // Header rows
    csvLines.push('"Coder Technologies, Inc.",,');
    csvLines.push('CONDENSED CONSOLIDATED STATEMENTS OF CASH FLOWS,,');
    csvLines.push('(amounts in thousands),,');
    csvLines.push('(unaudited),,');
    csvLines.push('"Three Months Ended June 30, 2025",,');
    csvLines.push(',,');
    csvLines.push('Description,Amount (thousands),Source (csv file)');
    
    // Operating Activities
    csvLines.push('Cash flows from operating activities,,');
    
    for (const item of cashFlow.operatingActivities) {
        if (item.amount === null && item.isHeader) {
            csvLines.push(`${item.description},,`);
        } else if (item.amount !== null) {
            const formattedAmount = formatAmountForCSV(item.amount);
            const source = item.source || '';
            csvLines.push(`${item.description},${formattedAmount},${source}`);
        }
    }
    
    // Investing Activities
    if (cashFlow.investingActivities.length > 0) {
        csvLines.push('Cash flows from investing activities,,');
        for (const item of cashFlow.investingActivities) {
            const formattedAmount = formatAmountForCSV(item.amount);
            const source = item.source || '';
            csvLines.push(`${item.description},${formattedAmount},${source}`);
        }
    }
    
    // Financing Activities
    if (cashFlow.financingActivities.length > 0) {
        csvLines.push('Cash flows from financing activities,,');
        for (const item of cashFlow.financingActivities) {
            const formattedAmount = formatAmountForCSV(item.amount);
            const source = item.source || '';
            csvLines.push(`${item.description},${formattedAmount},${source}`);
        }
    }
    
    // Net change in cash
    const netCashChangeAmount = Number(cashFlow.netCashChange);
    const netChangeDescription = netCashChangeAmount < 0 ? 'Net decrease in cash and cash equivalents' : 'Net increase in cash and cash equivalents';
    csvLines.push(`${netChangeDescription},${formatAmountForCSV(netCashChangeAmount)},Formula`);
    
    // Beginning and ending cash
    csvLines.push(`Cash and cash equivalents at beginning of period,${formatAmountForCSV(cashFlow.beginningCash)},Quarterly Balance Sheet`);
    csvLines.push(`Cash and cash equivalents at end of period,${formatAmountForCSV(cashFlow.endingCash)},Formula`);
    
    // Validation check
    csvLines.push(',,');
    csvLines.push(`,${formatAmountForCSV(cashFlow.actualEndingCash)},Quarterly Balance Sheet`);
    const validationDifference = cashFlow.endingCash - cashFlow.actualEndingCash;
    csvLines.push(`,${formatAmountForCSV(validationDifference)},Formula (to check)`);
    
    return csvLines.join('\n');
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
            const csvStream = Readable.from(csvContent);
            
            csvStream
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

// Categorize account for cash flow statement
function categorizeAccount(account, accountType) {
    if (!account) return 'skip';
    
    const accountLower = account.toLowerCase();
    const typeLower = (accountType || '').toLowerCase();
    
    // Skip cash accounts
    if (accountLower.includes('cash') || accountLower.includes('bank')) {
        return 'cash';
    }
    
    // Operating activities
    if (accountLower.includes('receivable')) {
        return { category: 'operating', lineItem: 'Accounts receivable' };
    }
    if (accountLower.includes('prepaid')) {
        return { category: 'operating', lineItem: 'Prepaid expenses and other assets' };
    }
    if (accountLower.includes('payable')) {
        return { category: 'operating', lineItem: 'Accounts payable' };
    }
    if (accountLower.includes('accrued') || accountLower.includes('liability')) {
        return { category: 'operating', lineItem: 'Accrued expenses and other liabilities' };
    }
    if (accountLower.includes('deferred revenue')) {
        return { category: 'operating', lineItem: 'Deferred revenue' };
    }
    if (accountLower.includes('depreciation') || accountLower.includes('amortization')) {
        return { category: 'operating', lineItem: 'Depreciation and amortization expense' };
    }
    
    // Investing activities
    if (accountLower.includes('equipment') || accountLower.includes('property') || 
        accountLower.includes('computer') || accountLower.includes('furniture')) {
        return { category: 'investing', lineItem: 'Purchases of property and equipment' };
    }
    
    // Financing activities
    if (accountLower.includes('stock') || accountLower.includes('equity')) {
        if (accountLower.includes('issuance') || accountLower.includes('proceeds')) {
            return { category: 'financing', lineItem: 'Proceeds from stock issuance' };
        } else {
            return { category: 'financing', lineItem: 'Other equity transactions' };
        }
    }
    
    // Default to other assets for operating
    if (typeLower.includes('asset')) {
        return { category: 'operating', lineItem: 'Other assets' };
    }
    
    return 'skip';
}

// Generate cash flow statement from both files
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
    let actualEndingCash = 0;
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
                actualEndingCash = parseAmount(record.currentAmount) || 0;
                console.log('Found Total Bank:', record.account, 'Prior Amount:', record.priorAmount, 'Current Amount:', record.currentAmount, 'Parsed Beginning:', beginningCash, 'Parsed Ending:', actualEndingCash);
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
        isMainItem: true,
        source: 'Income Statement'
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
            isAdjustment: true,
            source: 'Income Statement'
        });
    }
    
    // Add dividend and interest income adjustments (non-cash items to be deducted)
    const totalInterestDividendIncome = (interestIncome || 0) + (dividendIncome || 0);
    if (totalInterestDividendIncome > 0) {
        operatingActivities.push({ 
            description: 'Interest and dividend income received', 
            amount: -totalInterestDividendIncome, // Negative because it's a deduction from net income
            isAdjustment: true,
            source: ''
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
                isWorkingCapital: true,
                source: 'Quarterly Balance Sheet'
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
        isTotal: true,
        source: 'Formula'
    });
    
    // Build investing activities
    const investingActivities = [];
    
    // Add investing items from actual extracted data
    if (lineItems.investing['Purchases of property and equipment'] && lineItems.investing['Purchases of property and equipment'] !== 0) {
        investingActivities.push({ 
            description: 'Purchases of property and equipment', 
            amount: lineItems.investing['Purchases of property and equipment'], 
            isMainItem: true,
            source: 'Quarterly Balance Sheet'
        });
    }
    
    const investingTotal = investingActivities.reduce((sum, item) => sum + item.amount, 0);
    if (investingActivities.length > 0) {
        investingActivities.push({ 
            description: investingTotal < 0 ? 'Net cash used in investing activities' : 'Net cash provided by investing activities', 
            amount: investingTotal, 
            isTotal: true,
            source: 'Formula'
        });
    }
    
    // Build financing activities
    const financingActivities = [];
    
    // Add financing items from actual extracted data
    if (lineItems.financing['Proceeds from stock issuance'] && lineItems.financing['Proceeds from stock issuance'] !== 0) {
        financingActivities.push({ 
            description: 'Proceeds from stock issuance', 
            amount: lineItems.financing['Proceeds from stock issuance'], 
            isMainItem: true,
            source: 'Quarterly Balance Sheet'
        });
    }
    
    if (lineItems.financing['Other equity transactions'] && lineItems.financing['Other equity transactions'] !== 0) {
        financingActivities.push({ 
            description: 'Other equity transactions', 
            amount: lineItems.financing['Other equity transactions'], 
            isMainItem: true,
            source: 'Quarterly Balance Sheet'
        });
    }
    
    const financingTotal = financingActivities.reduce((sum, item) => sum + item.amount, 0);
    if (financingActivities.length > 0) {
        financingActivities.push({ 
            description: financingTotal < 0 ? 'Net cash used in financing activities' : 'Net cash provided by financing activities', 
            amount: financingTotal, 
            isTotal: true,
            source: 'Formula'
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
        actualEndingCash: actualEndingCash,
        companyName: 'Coder Technologies, Inc.',
        periodDescription: 'Three Months Ended June 30, 2025'
    };
}

// Upload handler
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).send('Method not allowed');
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
                console.log('Starting file processing...');
                
                // Parse both CSV files - formidable returns arrays, so get first element
                const balanceSheetFile = Array.isArray(files.balanceSheetFile) ? files.balanceSheetFile[0] : files.balanceSheetFile;
                const incomeStatementFile = Array.isArray(files.incomeStatementFile) ? files.incomeStatementFile[0] : files.incomeStatementFile;
                
                console.log('Files received:', {
                    balanceSheet: {
                        filename: balanceSheetFile.originalFilename,
                        size: balanceSheetFile.size,
                        mimetype: balanceSheetFile.mimetype
                    },
                    incomeStatement: {
                        filename: incomeStatementFile.originalFilename,
                        size: incomeStatementFile.size,
                        mimetype: incomeStatementFile.mimetype
                    }
                });
                
                console.log('Reading file contents...');
                // Read file contents from disk (formidable saves to temp files)
                const balanceSheetBuffer = fs.readFileSync(balanceSheetFile.filepath);
                const incomeStatementBuffer = fs.readFileSync(incomeStatementFile.filepath);
                
                console.log('Parsing CSV files...');
                const [balanceSheetRecords, incomeStatementRecords] = await Promise.all([
                    parseCSVFile(balanceSheetBuffer, 'balanceSheet').catch(err => {
                        console.error('Balance sheet parsing error:', err);
                        throw new Error(`Balance sheet parsing failed: ${err.message}`);
                    }),
                    parseCSVFile(incomeStatementBuffer, 'incomeStatement').catch(err => {
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
                
                // Create CSV file
                const csvContent = createCSVFile(cashFlow);
                
                // Send CSV file
                res.setHeader('Content-Type', 'text/csv');
                res.setHeader('Content-Disposition', 'attachment; filename="WORKING_cash_flow_statement.csv"');
                res.send(csvContent);
                
                // Clean up temporary files
                try {
                    fs.unlinkSync(balanceSheetFile.filepath);
                    fs.unlinkSync(incomeStatementFile.filepath);
                } catch (cleanupError) {
                    console.warn('File cleanup error:', cleanupError.message);
                }
                
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
