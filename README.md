# Cash Flow Statement Generator

A Go web application that processes NetSuite CSV exports and generates GAAP-compliant Statement of Cash Flows in Excel format.

## Features

- **CSV Processing**: Parses NetSuite CSV exports with flexible column mapping
- **GAAP Compliance**: Generates cash flow statements following Generally Accepted Accounting Principles
- **Three Activity Categories**: Automatically categorizes transactions into Operating, Investing, and Financing activities
- **Excel Export**: Creates professionally formatted Excel files with proper styling
- **Web Interface**: User-friendly drag-and-drop file upload interface
- **Vercel Ready**: Configured for serverless deployment on Vercel

## Prerequisites

- Go 1.19 or later
- Git
- Vercel CLI (for deployment)

## Local Development

### 1. Clone the Repository

```bash
git clone https://github.com/ddecoen/stmt_cash_flow.git
cd stmt_cash_flow
```

### 2. Install Dependencies

```bash
go mod tidy
```

### 3. Run the Application

```bash
go run .
```

The application will start on `http://localhost:8080`

### 4. Test the Application

1. Open your browser and navigate to `http://localhost:8080`
2. Upload a NetSuite CSV file using the web interface
3. Download the generated Excel cash flow statement

## NetSuite CSV Format

Your NetSuite CSV export should include the following columns (column names are flexible):

| Required Column | Alternative Names | Description |
|----------------|-------------------|-------------|
| Account | Account Name, account_name | Account name from chart of accounts |
| Account Type | account_type, Type | Account classification (Asset, Liability, etc.) |
| Amount | Debit, Credit, Net Amount | Transaction amount |
| Date | Transaction Date, Posting Date | Transaction date |
| Description | Memo, Transaction Description | Transaction description |
| Reference | Document Number, Transaction Number | Reference number (optional) |

### Example CSV Structure

```csv
Account,Account Type,Amount,Date,Description,Reference
"Cash - Operating","Bank","10000.00","2024-01-15","Customer Payment","INV-001"
"Equipment","Fixed Asset","-25000.00","2024-02-01","Equipment Purchase","PO-123"
"Bank Loan","Long Term Liability","50000.00","2024-01-01","Loan Proceeds","LOAN-001"
```

## Account Categorization

The application automatically categorizes accounts into cash flow activities:

### Operating Activities
- Revenue and income accounts
- Operating expenses
- Changes in working capital (A/R, A/P, Inventory)
- Tax payments
- Interest expense

### Investing Activities
- Purchase/sale of fixed assets
- Equipment and property transactions
- Investment securities
- Capital expenditures

### Financing Activities
- Loan proceeds and repayments
- Equity transactions
- Dividend payments
- Stock issuance/repurchase
- Owner contributions/distributions

## Deployment to Vercel

### 1. Install Vercel CLI

```bash
npm i -g vercel
```

### 2. Login to Vercel

```bash
vercel login
```

### 3. Deploy the Application

From the project root directory:

```bash
vercel
```

Follow the prompts:
- Set up and deploy? **Y**
- Which scope? Select your account
- Link to existing project? **N** (for first deployment)
- What's your project's name? **stmt-cash-flow** (or your preferred name)
- In which directory is your code located? **./**

### 4. Configure Environment (if needed)

If you need to set environment variables:

```bash
vercel env add
```

### 5. Subsequent Deployments

For future deployments, simply run:

```bash
vercel --prod
```

## Project Structure

```
stmt_cash_flow/
├── main.go                 # Main application entry point
├── csv_parser.go          # CSV parsing logic
├── cashflow_generator.go  # Cash flow statement generation
├── excel_generator.go     # Excel file creation
├── api/
│   └── index.go          # Vercel serverless function
├── templates/
│   └── index.html        # Web interface template
├── static/               # Static assets (if any)
├── temp/                 # Temporary file storage (local only)
├── go.mod                # Go module dependencies
├── go.sum                # Dependency checksums
├── vercel.json           # Vercel deployment configuration
└── README.md             # This file
```

## API Endpoints

### `GET /`
Serves the main web interface

### `POST /upload`
Processes uploaded CSV files
- **Content-Type**: `multipart/form-data`
- **Parameter**: `csvfile` (file)
- **Response**: JSON with download filename

### `GET /download/:filename`
Downloads generated Excel files
- **Parameter**: `filename` (string)
- **Response**: Excel file download

## Dependencies

- **[Gin](https://github.com/gin-gonic/gin)**: Web framework
- **[Excelize](https://github.com/xuri/excelize)**: Excel file generation

## Troubleshooting

### Common Issues

1. **CSV parsing errors**: Ensure your CSV has the required columns with proper headers
2. **File upload fails**: Check file size limits (Vercel has a 4.5MB limit for serverless functions)
3. **Excel generation errors**: Verify that the parsed data contains valid numeric amounts

### Local Testing

```bash
# Run tests (if implemented)
go test ./...

# Check for syntax errors
go build .

# Verify dependencies
go mod verify
```

### Vercel Debugging

```bash
# View deployment logs
vercel logs

# Check function logs
vercel logs --follow
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For issues and questions:
1. Check the troubleshooting section above
2. Review existing GitHub issues
3. Create a new issue with detailed information about your problem

## Roadmap

- [ ] Add support for multiple CSV formats
- [ ] Implement data validation and error reporting
- [ ] Add PDF export option
- [ ] Include comparative period analysis
- [ ] Add user authentication for multi-tenant usage
- [ ] Implement data persistence for audit trails