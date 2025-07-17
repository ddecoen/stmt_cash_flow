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

// Create CSV content from cash flow data
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
    
    for (const item of cashFlow.operatingActivities) {
        if (item.amount === null && item.isHeader) {
            lines.push(`${item.description},,`);
        } else if (item.amount !== null) {
            const formattedAmount = formatAmountForCSV(item.amount);
            const source = item.source || '';
            lines.push(`${item.description},${formattedAmount},${source}`);
        }
    }
    
    // Investing Activities
    if (cashFlow.investingActivities && cashFlow.investingActivities.length > 0) {
        lines.push('Cash flows from investing activities,,');
        for (const item of cashFlow.investingActivities) {
            const formattedAmount = formatAmountForCSV(item.amount);
            const source = item.source || '';
            lines.push(`${item.description},${formattedAmount},${source}`);
        }
    }
    
    // Financing Activities
    if (cashFlow.financingActivities && cashFlow.financingActivities.length > 0) {
        lines.push('Cash flows from financing activities,,');
        for (const item of cashFlow.financingActivities) {
            const formattedAmount = formatAmountForCSV(item.amount);
            const source = item.source || '';
            lines.push(`${item.description},${formattedAmount},${source}`);
        }
    }
    
    // Net change in cash
    const netCashChangeAmount = Number(cashFlow.netCashChange || 0);
    const netChangeDescription = netCashChangeAmount < 0 ? 'Net decrease in cash and cash equivalents' : 'Net increase in cash and cash equivalents';
    lines.push(`${netChangeDescription},${formatAmountForCSV(netCashChangeAmount)},Formula`);
    
    // Beginning and ending cash
    lines.push(`Cash and cash equivalents at beginning of period,${formatAmountForCSV(cashFlow.beginningCash || 0)},Quarterly Balance Sheet`);
    lines.push(`Cash and cash equivalents at end of period,${formatAmountForCSV(cashFlow.endingCash || 0)},Formula`);
    
    // Validation check
    lines.push(',,');
    lines.push(`,${formatAmountForCSV(cashFlow.actualEndingCash || 0)},Quarterly Balance Sheet`);
    const validationDifference = (cashFlow.endingCash || 0) - (cashFlow.actualEndingCash || 0);
    lines.push(`,${formatAmountForCSV(validationDifference)},Formula (to check)`);
    
    return lines.join('\n');
}

// Parse CSV file
function parseCSVFile(fileBuffer, fileType) {
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

// Categorize account for cash flow statement
function categorizeAccount(account, accountType) {
    if (!account) return 'skip';
    
    const accountLower = account.toLowerCase();
    const typeLower = (accountType || '').toLowerCase();
    
    // Skip cash accounts
    if (accountLower.includes('cash') || accountLower.includes('bank')) {
        return 'cash';
    }
    
    // Operating activities - match NetSuite account names
    if (accountLower.includes('accounts receivable') || accountLower.includes('total accounts receivable') ||
        accountLower.includes('total - 12000 - receivables')) {
        return { category: 'operating', lineItem: 'Accounts receivable' };
    }
    if (accountLower.includes('prepaid') || accountLower.includes('total - 13000 - prepaid') ||
        accountLower.includes('total other current asset')) {
        return { category: 'operating', lineItem: 'Prepaid expenses and other assets' };
    }
    if (accountLower.includes('other current assets') || accountLower.includes('total - 14000 - other current assets') ||
        accountLower.includes('total other assets')) {
        return { category: 'operating', lineItem: 'Other assets' };
    }
    if (accountLower.includes('accounts payable') || accountLower.includes('total accounts payable')) {
        return { category: 'operating', lineItem: 'Accounts payable' };
    }
    if (accountLower.includes('accrued') || accountLower.includes('other current liability') ||
        accountLower.includes('total other current liability') || accountLower.includes('credit card') ||
        accountLower.includes('total credit card') || accountLower.includes('payroll') ||
        accountLower.includes('wages') || accountLower.includes('benefits')) {
        return { category: 'operating', lineItem: 'Accrued expenses and other liabilities' };
    }
    if (accountLower.includes('deferred revenue') || accountLower.includes('21000 - deferred revenue')) {
        return { category: 'operating', lineItem: 'Deferred revenue' };
    }
    if (accountLower.includes('depreciation') || accountLower.includes('amortization') || 
        accountLower.includes('ad -') || accountLower.includes('15210 - ad -') || 
        accountLower.includes('15220 - ad -')) {
        return { category: 'operating', lineItem: 'Depreciation and amortization expense' };
    }
    
    // Investing activities - match NetSuite patterns
    if (accountLower.includes('equipment') || accountLower.includes('property') || 
        accountLower.includes('computer') || accountLower.includes('furniture') ||
        accountLower.includes('fixed assets') || accountLower.includes('total fixed assets')) {
        return { category: 'investing', lineItem: 'Purchases of property and equipment' };
    }
    
    // Financing activities - match NetSuite patterns
    if (accountLower.includes('stock') || accountLower.includes('equity') || 
        accountLower.includes('common stock') || accountLower.includes('paid-in capital') ||
        accountLower.includes('additional paid-in capital') || accountLower.includes('30001 - additional paid-in capital') ||
        accountLower.includes('series') || accountLower.includes('preferred stock') ||
        accountLower.includes('total - equity') || accountLower.includes('3200 - z_opening balance')) {
        if (accountLower.includes('issuance') || accountLower.includes('proceeds') ||
            accountLower.includes('additional paid-in capital')) {
            return { category: 'financing', lineItem: 'Proceeds from stock issuance' };
        } else {
            return { category: 'financing', lineItem: 'Other equity transactions' };
        }
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
    
    // Use provided income data if available
    let netIncome = 0;
    let beginningCash = 0;
    let actualEndingCash = 0;
    let dividendIncome = 0;
    let interestIncome = 0;
    
    if (incomeData) {
        netIncome = incomeData.netIncome || 0;
        interestIncome = incomeData.interestIncome || 0;
        dividendIncome = incomeData.dividendIncome || 0;
        
        console.log('Using provided income data:', {
            netIncome,
            interestIncome,
            dividendIncome
        });
    }
    
    // Process balance sheet records for cash and working capital changes
    console.log('Processing', records.length, 'balance sheet records');
    console.log('Sample record keys:', records.length > 0 ? Object.keys(records[0]) : 'No records');
    
    for (const record of records) {
        // Debug: Log records that might be cash-related
        if (record['Financial Row'] && record['Financial Row'].toLowerCase().includes('cash')) {
            console.log('Cash-related record:', record['Financial Row'], record);
        }
        
        // Extract beginning and ending cash from Total Bank or Total Cash accounts
        if (record['Financial Row'] && 
            (record['Financial Row'].toLowerCase().includes('total - 11000 - cash and cash equivalents') ||
             record['Financial Row'].toLowerCase().includes('total bank'))) {
            beginningCash = parseAmount(record['Comparison Amount (As of Mar 2025)']) || 0;
            actualEndingCash = parseAmount(record['Amount (As of Jun 2025)']) || 0;
            console.log('Found Total Cash:', record['Financial Row'], 'Beginning:', beginningCash, 'Ending:', actualEndingCash);
        }
        
        if (!record['Variance'] || parseAmount(record['Variance']) === 0) continue;
        
        const categorization = categorizeAccount(record['Financial Row'], record['Account Type']);
        console.log('Account:', record['Financial Row'], 'Categorization:', categorization, 'Variance:', record['Variance']);
        
        if (categorization === 'cash' || categorization === 'skip') continue;
        
        const variance = parseAmount(record['Variance']);
        
        if (typeof categorization === 'object') {
            const { category, lineItem } = categorization;
            
            if (!lineItems[category][lineItem]) {
                lineItems[category][lineItem] = 0;
            }
            
            // For balance sheet items, the variance represents the change
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
            console.log('Added to', category, lineItem, ':', adjustedAmount, 'Total now:', lineItems[category][lineItem]);
        }
    }
    
    // Build operating activities
    const operatingActivities = [];
    
    // Start with net loss
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
    
    // Add depreciation and amortization
    if (lineItems.operating['Depreciation and amortization expense']) {
        operatingActivities.push({ 
            description: 'Depreciation and amortization expense', 
            amount: lineItems.operating['Depreciation and amortization expense'], 
            isAdjustment: true,
            source: 'Income Statement'
        });
    }
    
    // Add interest and dividend income adjustments
    const totalInterestDividendIncome = (interestIncome || 0) + (dividendIncome || 0);
    if (totalInterestDividendIncome > 0) {
        operatingActivities.push({ 
            description: 'Interest and dividend income received', 
            amount: -totalInterestDividendIncome,
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
    
    // Calculate ending cash
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
                // Parse both CSV files
                const balanceSheetFile = Array.isArray(files.balanceSheetFile) ? files.balanceSheetFile[0] : files.balanceSheetFile;
                const incomeStatementFile = Array.isArray(files.incomeStatementFile) ? files.incomeStatementFile[0] : files.incomeStatementFile;
                
                if (!balanceSheetFile || !incomeStatementFile) {
                    throw new Error('Both balance sheet and income statement files are required');
                }
                
                console.log('Reading file contents...');
                const balanceSheetBuffer = fs.readFileSync(balanceSheetFile.filepath);
                const incomeStatementBuffer = fs.readFileSync(incomeStatementFile.filepath);
                
                console.log('Parsing CSV files...');
                const [balanceSheetRecords, incomeStatementRecords] = await Promise.all([
                    parseCSVFile(balanceSheetBuffer, 'balanceSheet'),
                    parseCSVFile(incomeStatementBuffer, 'incomeStatement')
                ]);
                
                console.log('Generating cash flow statement...');
                const cashFlow = generateCashFlowStatementFromBothFiles(balanceSheetRecords, incomeStatementRecords);
                
                // Generate CSV content
                const csvContent = createCSVContent(cashFlow);
                
                console.log('=== SENDING CSV RESPONSE ===');
                console.log('CSV Content Length:', csvContent.length);
                console.log('CSV Preview:', csvContent.substring(0, 200));
                
                // Clean up temporary files
                try {
                    fs.unlinkSync(balanceSheetFile.filepath);
                    fs.unlinkSync(incomeStatementFile.filepath);
                } catch (cleanupError) {
                    console.warn('File cleanup error:', cleanupError.message);
                }
                
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
