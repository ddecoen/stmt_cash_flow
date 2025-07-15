const csv = require('csv-parser');
const ExcelJS = require('exceljs');
const multer = require('multer');
const { Readable } = require('stream');

// Configure multer for memory storage
const upload = multer({ storage: multer.memoryStorage() });

// HTML template
const htmlTemplate = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Cash Flow Statement Generator</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f5f5f5;
        }
        .container {
            background: white;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 {
            color: #333;
            text-align: center;
            margin-bottom: 30px;
        }
        .instructions {
            background-color: #e9ecef;
            padding: 20px;
            border-radius: 5px;
            margin-bottom: 20px;
        }
        .upload-area {
            border: 2px dashed #ccc;
            border-radius: 10px;
            padding: 40px;
            text-align: center;
            margin: 20px 0;
            transition: border-color 0.3s;
        }
        .upload-area:hover {
            border-color: #007bff;
        }
        input[type="file"] {
            margin: 20px 0;
            padding: 10px;
            border: 1px solid #ddd;
            border-radius: 5px;
            width: 100%;
        }
        button {
            background-color: #007bff;
            color: white;
            padding: 12px 30px;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-size: 16px;
            width: 100%;
            margin-top: 10px;
        }
        button:hover {
            background-color: #0056b3;
        }
        button:disabled {
            background-color: #6c757d;
            cursor: not-allowed;
        }
        .result {
            margin-top: 20px;
            padding: 15px;
            border-radius: 5px;
            display: none;
        }
        .success {
            background-color: #d4edda;
            border: 1px solid #c3e6cb;
            color: #155724;
        }
        .error {
            background-color: #f8d7da;
            border: 1px solid #f5c6cb;
            color: #721c24;
        }
        .loading {
            text-align: center;
            margin: 20px 0;
            display: none;
        }
        .spinner {
            border: 4px solid #f3f3f3;
            border-top: 4px solid #007bff;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            animation: spin 1s linear infinite;
            margin: 0 auto;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Cash Flow Statement Generator</h1>
        
        <div class="instructions">
            <h3>Instructions:</h3>
            <ul>
                <li>Export your NetSuite <strong>Comparative Balance Sheet</strong> as a CSV file</li>
                <li>Upload the CSV file using the form below</li>
                <li>Download the generated GAAP-compliant Cash Flow Statement in Excel format</li>
            </ul>
            <p><strong>Note:</strong> This tool analyzes balance sheet changes to create cash flow statements using the indirect method.</p>
        </div>

        <form id="uploadForm" enctype="multipart/form-data">
            <div class="upload-area">
                <p>Drag and drop your NetSuite Balance Sheet CSV file here, or click to select</p>
                <input type="file" id="csvfile" name="csvfile" accept=".csv" required>
            </div>
            <button type="submit" id="submitBtn">Generate Cash Flow Statement</button>
        </form>

        <div class="loading" id="loading">
            <div class="spinner"></div>
            <p>Processing your file...</p>
        </div>

        <div class="result" id="result"></div>
    </div>

    <script>
        const form = document.getElementById('uploadForm');
        const loading = document.getElementById('loading');
        const result = document.getElementById('result');
        const submitBtn = document.getElementById('submitBtn');

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const formData = new FormData();
            const file = document.getElementById('csvfile').files[0];
            
            if (!file) {
                showResult('Please select a CSV file.', 'error');
                return;
            }
            
            if (!file.name.toLowerCase().endsWith('.csv')) {
                showResult('Please select a valid CSV file.', 'error');
                return;
            }
            
            formData.append('csvfile', file);
            
            loading.style.display = 'block';
            result.style.display = 'none';
            submitBtn.disabled = true;
            
            try {
                const response = await fetch('/api/upload', {
                    method: 'POST',
                    body: formData
                });
                
                if (response.ok) {
                    // Handle file download
                    const blob = await response.blob();
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'cash_flow_statement.xlsx';
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    window.URL.revokeObjectURL(url);
                    
                    showResult('Cash flow statement generated and downloaded successfully!', 'success');
                } else {
                    const errorText = await response.text();
                    showResult(errorText || 'An error occurred while processing the file.', 'error');
                }
            } catch (error) {
                showResult('Network error. Please try again.', 'error');
            } finally {
                loading.style.display = 'none';
                submitBtn.disabled = false;
            }
        });

        function showResult(message, type) {
            result.innerHTML = message;
            result.className = \`result \${type}\`;
            result.style.display = 'block';
        }
    </script>
</body>
</html>
`;

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

// Main handler
export default async function handler(req, res) {
    if (req.method === 'GET') {
        res.setHeader('Content-Type', 'text/html');
        return res.send(htmlTemplate);
    }
    
    if (req.method === 'POST') {
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
    
    res.status(405).send('Method not allowed');
}