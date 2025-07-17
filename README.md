# Cash Flow Statement Generator

A Go web application that processes NetSuite CSV exports and generates GAAP-compliant Statement of Cash Flows in Excel format.

## Features

- **Balance Sheet Analysis**: Parses NetSuite comparative balance sheet CSV exports
- **Indirect Method**: Generates cash flow statements using the indirect method from balance sheet changes
- **GAAP Compliance**: Follows Generally Accepted Accounting Principles for cash flow statement presentation
- **Three Activity Categories**: Automatically categorizes balance sheet changes into Operating, Investing, and Financing activities
- **Excel Export**: Creates professionally formatted Excel files with proper styling
- **Web Interface**: User-friendly drag-and-drop file upload interface
- **Firestore Integration**: Automatically saves generated cash flow statements to Firebase Firestore for persistence and history tracking
- **Statement History**: View previously generated cash flow statements with metadata
- **Vercel Ready**: Configured for serverless deployment on Vercel

## Prerequisites

- Node.js 18.0 or later
- Git
- Firebase project with Firestore enabled
- Vercel CLI (for deployment)

## Local Development

### 1. Clone the Repository

```bash
git clone https://github.com/ddecoen/stmt_cash_flow.git
cd stmt_cash_flow
```

### 2. Firebase Setup

1. Create a Firebase project at [Firebase Console](https://console.firebase.google.com/)
2. Enable Firestore Database in your Firebase project
3. Create a service account key:
   - Go to Project Settings > Service Accounts
   - Click "Generate new private key"
   - Download the JSON file
4. Set up environment variables (see step 4 below)

### 3. Install Dependencies

```bash
npm install
```

### 4. Environment Variables Setup

1. Copy the example environment file:
```bash
cp .env.example .env
```

2. Edit `.env` and add your Firebase configuration:
```bash
FIREBASE_API_KEY=your_api_key_here
FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
FIREBASE_MESSAGING_SENDER_ID=your_sender_id
FIREBASE_APP_ID=your_app_id
FIREBASE_SERVICE_ACCOUNT_KEY='{"type":"service_account","project_id":"your_project_id",...}'
```

### 5. Run the Application

```bash
npm run dev
```

The application will start on `http://localhost:3000`

### 4. Test the Application

1. Open your browser and navigate to `http://localhost:3000`
2. Upload a NetSuite CSV file using the web interface
3. Download the generated Excel cash flow statement

## NetSuite Balance Sheet CSV Format

Your NetSuite CSV export should be a **Comparative Balance Sheet** with the following structure:

| Required Column | Description |
|----------------|-------------|
| Financial Row | Account name from chart of accounts |
| Amount (Current Period) | Current period balance |
| Comparison Amount (Prior Period) | Prior period balance for comparison |
| Variance | Change between periods |
| % Variance | Percentage change (optional) |

### Export Instructions

1. In NetSuite, go to **Reports > Financial > Balance Sheet**
2. Select **Comparative** format
3. Choose your current and prior periods (e.g., Jun 2025 vs Mar 2025)
4. Export as CSV
5. The data should start around row 12 (after headers and company info)

### Example CSV Structure

```csv
"Company Name",,,,
"Comparative Balance Sheet",,,,
"End of Jun 2025",,,,
,,,,
Financial Row,Amount (As of Jun 2025),Comparison Amount (As of Mar 2025),Variance,% Variance
ASSETS,,,,
Current Assets,,,,
11001 - JPM operating,"$857,547.53","$849,488.16","$8,059.37",0.95%
12001 - Accounts receivable,"$3,134,835.66","$2,551,017.30","$583,818.36",22.89%
```

## Cash Flow Categorization (Indirect Method)

The application automatically categorizes balance sheet changes into cash flow activities:

### Operating Activities (Working Capital Changes)
- Accounts Receivable changes
- Prepaid expenses changes
- Accounts Payable changes
- Accrued expenses changes
- Deferred revenue changes
- Other current asset/liability changes
- **Note**: Increases in current assets decrease cash; increases in current liabilities increase cash

### Investing Activities
- Fixed asset purchases/sales (Equipment, Furniture, Computer Equipment)
- Capitalized software development
- Leasehold improvements
- Security deposits
- Note receivable changes
- Long-term investment changes

### Financing Activities
- Equity transactions (Stock issuances, Additional paid-in capital)
- Retained earnings changes
- Long-term debt changes
- Operating lease liabilities
- Owner/shareholder transactions

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