package handler

import (
	"encoding/csv"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/xuri/excelize/v2"
)

// All structs and types
type NetSuiteRecord struct {
	Account     string  `json:"account"`
	AccountType string  `json:"account_type"`
	Amount      float64 `json:"amount"`
	Date        string  `json:"date"`
	Description string  `json:"description"`
	Reference   string  `json:"reference"`
}

type CashFlowStatement struct {
	OperatingActivities []CashFlowItem `json:"operating_activities"`
	InvestingActivities []CashFlowItem `json:"investing_activities"`
	FinancingActivities []CashFlowItem `json:"financing_activities"`
	NetCashFlow         float64        `json:"net_cash_flow"`
	BeginningCash       float64        `json:"beginning_cash"`
	EndingCash          float64        `json:"ending_cash"`
	PeriodStart         string         `json:"period_start"`
	PeriodEnd           string         `json:"period_end"`
}

type CashFlowItem struct {
	Description string  `json:"description"`
	Amount      float64 `json:"amount"`
}

type BalanceSheetItem struct {
	Account         string  `json:"account"`
	CurrentAmount   float64 `json:"current_amount"`
	PriorAmount     float64 `json:"prior_amount"`
	Variance        float64 `json:"variance"`
	PercentVariance float64 `json:"percent_variance"`
	AccountType     string  `json:"account_type"`
	IsTotal         bool    `json:"is_total"`
}

// HTML template as string (since we can't load files in serverless)
const htmlTemplate = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Cash Flow Statement Generator</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; background-color: #f5f5f5; }
        .container { background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        h1 { color: #333; text-align: center; margin-bottom: 30px; }
        .instructions { background-color: #e9ecef; padding: 20px; border-radius: 5px; margin-bottom: 20px; }
        .upload-area { border: 2px dashed #ccc; border-radius: 10px; padding: 40px; text-align: center; margin: 20px 0; }
        input[type="file"] { margin: 20px 0; padding: 10px; border: 1px solid #ddd; border-radius: 5px; width: 100%; }
        button { background-color: #007bff; color: white; padding: 12px 30px; border: none; border-radius: 5px; cursor: pointer; font-size: 16px; width: 100%; }
        .result { margin-top: 20px; padding: 15px; border-radius: 5px; display: none; }
        .success { background-color: #d4edda; border: 1px solid #c3e6cb; color: #155724; }
        .error { background-color: #f8d7da; border: 1px solid #f5c6cb; color: #721c24; }
        .download-link { display: inline-block; background-color: #28a745; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin-top: 10px; }
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
        </div>
        <form id="uploadForm" enctype="multipart/form-data">
            <div class="upload-area">
                <p>Drag and drop your NetSuite Balance Sheet CSV file here, or click to select</p>
                <input type="file" id="csvfile" name="csvfile" accept=".csv" required>
            </div>
            <button type="submit">Generate Cash Flow Statement</button>
        </form>
        <div class="result" id="result"></div>
    </div>
    <script>
        document.getElementById('uploadForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData();
            const file = document.getElementById('csvfile').files[0];
            if (!file) { alert('Please select a file'); return; }
            formData.append('csvfile', file);
            try {
                const response = await fetch('/upload', { method: 'POST', body: formData });
                const data = await response.json();
                const result = document.getElementById('result');
                if (response.ok) {
                    result.innerHTML = 'File processed! <a href="/download/' + data.filename + '" class="download-link">Download Excel</a>';
                    result.className = 'result success';
                } else {
                    result.innerHTML = data.error || 'Error processing file';
                    result.className = 'result error';
                }
                result.style.display = 'block';
            } catch (error) {
                document.getElementById('result').innerHTML = 'Network error';
                document.getElementById('result').className = 'result error';
                document.getElementById('result').style.display = 'block';
            }
        });
    </script>
</body>
</html>`

// Handler is the main entry point for Vercel
func Handler(w http.ResponseWriter, r *http.Request) {
	gin.SetMode(gin.ReleaseMode)
	
	router := gin.New()
	router.Use(gin.Logger(), gin.Recovery())

	setupRoutes(router)
	router.ServeHTTP(w, r)
}

func setupRoutes(r *gin.Engine) {
	r.GET("/", handleHome)
	r.POST("/upload", handleUpload)
	r.GET("/download/:filename", handleDownload)
}

func handleHome(c *gin.Context) {
	c.Header("Content-Type", "text/html")
	c.String(http.StatusOK, htmlTemplate)
}

func handleUpload(c *gin.Context) {
	file, header, err := c.Request.FormFile("csvfile")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Failed to get file"})
		return
	}
	defer file.Close()

	// Parse CSV
	records, err := parseNetSuiteCSV(file)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Failed to parse CSV: %v", err)})
		return
	}

	// Generate cash flow statement
	cashFlow := generateCashFlowStatement(records)

	// Create Excel file
	filename := fmt.Sprintf("cash_flow_%d.xlsx", time.Now().Unix())
	filePath := filepath.Join("/tmp", filename)

	err = createExcelFile(cashFlow, filePath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Failed to create Excel file: %v", err)})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":  "File processed successfully",
		"filename": filename,
		"original": header.Filename,
	})
}

func handleDownload(c *gin.Context) {
	filename := c.Param("filename")
	filePath := filepath.Join("/tmp", filename)

	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		c.JSON(http.StatusNotFound, gin.H{"error": "File not found"})
		return
	}

	c.Header("Content-Description", "File Transfer")
	c.Header("Content-Transfer-Encoding", "binary")
	c.Header("Content-Disposition", "attachment; filename="+filename)
	c.Header("Content-Type", "application/octet-stream")
	c.File(filePath)
}

// All the implementation functions from the main package
func parseNetSuiteCSV(file io.Reader) ([]NetSuiteRecord, error) {
	balanceSheetItems, err := parseBalanceSheet(file)
	if err != nil {
		return nil, err
	}
	return convertBalanceSheetToCashFlow(balanceSheetItems), nil
}

func parseBalanceSheet(file io.Reader) ([]BalanceSheetItem, error) {
	reader := csv.NewReader(file)
	records, err := reader.ReadAll()
	if err != nil {
		return nil, fmt.Errorf("failed to read CSV: %w", err)
	}

	if len(records) < 12 {
		return nil, fmt.Errorf("CSV file must have at least 12 rows")
	}

	headerRowIndex := -1
	for i := 5; i < 10 && i < len(records); i++ {
		if len(records[i]) >= 4 && strings.Contains(strings.ToLower(records[i][0]), "financial") {
			headerRowIndex = i
			break
		}
	}

	if headerRowIndex == -1 {
		return nil, fmt.Errorf("could not find header row")
	}

	var balanceSheetItems []BalanceSheetItem
	currentSection := ""

	for i := headerRowIndex + 1; i < len(records); i++ {
		record := records[i]
		if len(record) < 4 {
			continue
		}

		accountName := strings.TrimSpace(record[0])
		if accountName == "" {
			continue
		}

		if strings.Contains(strings.ToUpper(accountName), "ASSETS") {
			currentSection = "ASSETS"
			continue
		} else if strings.Contains(strings.ToUpper(accountName), "LIABILITIES") {
			currentSection = "LIABILITIES"
			continue
		} else if strings.Contains(strings.ToUpper(accountName), "EQUITY") {
			currentSection = "EQUITY"
			continue
		}

		if isHeaderRow(accountName) {
			continue
		}

		currentAmount, _ := parseAmount(record[1])
		priorAmount, _ := parseAmount(record[2])
		variance, _ := parseAmount(record[3])

		if currentAmount != 0 || priorAmount != 0 || variance != 0 {
			item := BalanceSheetItem{
				Account:     accountName,
				CurrentAmount: currentAmount,
				PriorAmount: priorAmount,
				Variance:    variance,
				AccountType: currentSection,
				IsTotal:     strings.Contains(strings.ToLower(accountName), "total"),
			}
			balanceSheetItems = append(balanceSheetItems, item)
		}
	}

	return balanceSheetItems, nil
}

func convertBalanceSheetToCashFlow(items []BalanceSheetItem) []NetSuiteRecord {
	var records []NetSuiteRecord

	for _, item := range items {
		if item.IsTotal || item.Variance == 0 {
			continue
		}

		record := NetSuiteRecord{
			Account:     item.Account,
			AccountType: determineAccountTypeFromName(item.Account, item.AccountType),
			Amount:      item.Variance,
			Date:        "2025-06-30",
			Description: fmt.Sprintf("Change in %s", item.Account),
			Reference:   "Balance Sheet Analysis",
		}
		records = append(records, record)
	}

	return records
}

func determineAccountTypeFromName(accountName, section string) string {
	accountLower := strings.ToLower(accountName)

	if strings.Contains(accountLower, "cash") || strings.Contains(accountLower, "bank") {
		return "Cash"
	}

	if strings.Contains(accountLower, "receivable") || strings.Contains(accountLower, "prepaid") ||
		strings.Contains(accountLower, "inventory") || strings.Contains(accountLower, "unbilled") {
		return "Current Asset"
	}

	if strings.Contains(accountLower, "equipment") || strings.Contains(accountLower, "furniture") ||
		strings.Contains(accountLower, "computer") || strings.Contains(accountLower, "leasehold") ||
		strings.Contains(accountLower, "software development") || strings.Contains(accountLower, "domain") {
		return "Fixed Asset"
	}

	if strings.Contains(accountLower, "payable") || strings.Contains(accountLower, "accrued") ||
		strings.Contains(accountLower, "wages") || strings.Contains(accountLower, "payroll") ||
		strings.Contains(accountLower, "deferred") || strings.Contains(accountLower, "credit card") {
		return "Current Liability"
	}

	if strings.Contains(accountLower, "lease liabilities") && strings.Contains(accountLower, "non-current") {
		return "Long Term Liability"
	}

	if section == "EQUITY" || strings.Contains(accountLower, "stock") ||
		strings.Contains(accountLower, "capital") || strings.Contains(accountLower, "earnings") ||
		strings.Contains(accountLower, "income") {
		return "Equity"
	}

	return section
}

func isHeaderRow(accountName string) bool {
	headerKeywords := []string{
		"current assets", "fixed assets", "other assets", "current liabilities",
		"long term liabilities", "equity", "bank", "accounts receivable",
		"other current asset", "accounts payable", "credit card", "other current liability",
	}

	accountLower := strings.ToLower(accountName)
	for _, keyword := range headerKeywords {
		if accountLower == keyword {
			return true
		}
	}
	return false
}

func parseAmount(amountStr string) (float64, error) {
	amountStr = strings.TrimSpace(amountStr)
	amountStr = strings.ReplaceAll(amountStr, ",", "")
	amountStr = strings.ReplaceAll(amountStr, "$", "")
	amountStr = strings.ReplaceAll(amountStr, "(", "-")
	amountStr = strings.ReplaceAll(amountStr, ")", "")

	if amountStr == "" || amountStr == "-" {
		return 0, nil
	}

	return strconv.ParseFloat(amountStr, 64)
}

func generateCashFlowStatement(records []NetSuiteRecord) CashFlowStatement {
	cashFlow := CashFlowStatement{
		OperatingActivities: []CashFlowItem{},
		InvestingActivities: []CashFlowItem{},
		FinancingActivities: []CashFlowItem{},
		PeriodStart:         "Mar 2025",
		PeriodEnd:           "Jun 2025",
	}

	var netIncome float64
	for _, record := range records {
		if strings.Contains(strings.ToLower(record.Account), "net income") {
			netIncome = record.Amount
			break
		}
	}

	if netIncome != 0 {
		cashFlow.OperatingActivities = append(cashFlow.OperatingActivities, CashFlowItem{
			Description: "Net Income",
			Amount:      netIncome,
		})
	}

	operatingAdjustments := []CashFlowItem{}
	investingActivities := []CashFlowItem{}
	financingActivities := []CashFlowItem{}
	cashChanges := []CashFlowItem{}

	for _, record := range records {
		if record.Amount == 0 {
			continue
		}

		category := categorizeBalanceSheetAccount(record.AccountType, record.Account)
		item := CashFlowItem{
			Description: cleanAccountName(record.Account),
			Amount:      adjustAmountForCashFlow(record.Amount, record.AccountType),
		}

		switch category {
		case "operating":
			operatingAdjustments = append(operatingAdjustments, item)
		case "investing":
			investingActivities = append(investingActivities, item)
		case "financing":
			financingActivities = append(financingActivities, item)
		case "cash":
			cashChanges = append(cashChanges, item)
		}
	}

	cashFlow.OperatingActivities = append(cashFlow.OperatingActivities, operatingAdjustments...)
	cashFlow.InvestingActivities = investingActivities
	cashFlow.FinancingActivities = financingActivities

	operatingTotal := sumItems(cashFlow.OperatingActivities)
	investingTotal := sumItems(cashFlow.InvestingActivities)
	financingTotal := sumItems(cashFlow.FinancingActivities)

	cashFlow.NetCashFlow = operatingTotal + investingTotal + financingTotal

	cashFlow.OperatingActivities = append(cashFlow.OperatingActivities, CashFlowItem{
		Description: "Net Cash from Operating Activities",
		Amount:      operatingTotal,
	})

	cashFlow.InvestingActivities = append(cashFlow.InvestingActivities, CashFlowItem{
		Description: "Net Cash from Investing Activities",
		Amount:      investingTotal,
	})

	cashFlow.FinancingActivities = append(cashFlow.FinancingActivities, CashFlowItem{
		Description: "Net Cash from Financing Activities",
		Amount:      financingTotal,
	})

	return cashFlow
}

func categorizeBalanceSheetAccount(accountType, accountName string) string {
	accountType = strings.ToLower(strings.TrimSpace(accountType))
	accountName = strings.ToLower(strings.TrimSpace(accountName))

	if strings.Contains(accountName, "cash") || strings.Contains(accountName, "bank") ||
		strings.Contains(accountName, "money market") || strings.Contains(accountName, "investment") {
		return "cash"
	}

	if strings.Contains(accountName, "receivable") || strings.Contains(accountName, "prepaid") ||
		strings.Contains(accountName, "unbilled") || strings.Contains(accountName, "payable") ||
		strings.Contains(accountName, "accrued") || strings.Contains(accountName, "wages") ||
		strings.Contains(accountName, "payroll") || strings.Contains(accountName, "deferred") ||
		strings.Contains(accountName, "credit card") || strings.Contains(accountName, "benefits") ||
		strings.Contains(accountName, "contributions") {
		return "operating"
	}

	if strings.Contains(accountName, "equipment") || strings.Contains(accountName, "furniture") ||
		strings.Contains(accountName, "computer") || strings.Contains(accountName, "leasehold") ||
		strings.Contains(accountName, "software development") || strings.Contains(accountName, "domain") ||
		strings.Contains(accountName, "capitalized") || strings.Contains(accountName, "note receivable") ||
		strings.Contains(accountName, "security deposits") || strings.Contains(accountName, "software rights") {
		return "investing"
	}

	if accountType == "EQUITY" || strings.Contains(accountName, "stock") ||
		strings.Contains(accountName, "capital") || strings.Contains(accountName, "earnings") ||
		strings.Contains(accountName, "income") || strings.Contains(accountName, "opening balance") ||
		strings.Contains(accountName, "lease liabilities") {
		return "financing"
	}

	return "operating"
}

func adjustAmountForCashFlow(amount float64, accountType string) float64 {
	accountType = strings.ToLower(accountType)
	if strings.Contains(accountType, "asset") {
		return -amount
	}
	return amount
}

func cleanAccountName(accountName string) string {
	parts := strings.Split(accountName, " - ")
	if len(parts) > 1 {
		return strings.TrimSpace(parts[1])
	}
	return strings.TrimSpace(accountName)
}

func sumItems(items []CashFlowItem) float64 {
	var total float64
	for _, item := range items {
		if !strings.Contains(strings.ToLower(item.Description), "net cash from") {
			total += item.Amount
		}
	}
	return total
}

func createExcelFile(cashFlow CashFlowStatement, filePath string) error {
	f := excelize.NewFile()
	defer f.Close()

	sheetName := "Cash Flow Statement"
	index, err := f.NewSheet(sheetName)
	if err != nil {
		return fmt.Errorf("failed to create worksheet: %w", err)
	}

	f.SetActiveSheet(index)

	headerStyle, _ := f.NewStyle(&excelize.Style{
		Font: &excelize.Font{Bold: true, Size: 14},
		Alignment: &excelize.Alignment{Horizontal: "center"},
	})

	sectionHeaderStyle, _ := f.NewStyle(&excelize.Style{
		Font: &excelize.Font{Bold: true, Size: 12},
		Fill: excelize.Fill{Type: "pattern", Color: []string{"#E6E6FA"}, Pattern: 1},
	})

	subtotalStyle, _ := f.NewStyle(&excelize.Style{
		Font: &excelize.Font{Bold: true},
		Border: []excelize.Border{{Type: "top", Color: "000000", Style: 1}},
	})

	currencyStyle, _ := f.NewStyle(&excelize.Style{NumFmt: 164})

	f.SetColWidth(sheetName, "A", "A", 40)
	f.SetColWidth(sheetName, "B", "B", 15)

	row := 1

	f.SetCellValue(sheetName, fmt.Sprintf("A%d", row), "STATEMENT OF CASH FLOWS")
	f.SetCellStyle(sheetName, fmt.Sprintf("A%d", row), fmt.Sprintf("A%d", row), headerStyle)
	f.MergeCell(sheetName, fmt.Sprintf("A%d", row), fmt.Sprintf("B%d", row))
	row += 2

	if cashFlow.PeriodStart != "" && cashFlow.PeriodEnd != "" {
		f.SetCellValue(sheetName, fmt.Sprintf("A%d", row), fmt.Sprintf("For the period from %s to %s", cashFlow.PeriodStart, cashFlow.PeriodEnd))
		f.MergeCell(sheetName, fmt.Sprintf("A%d", row), fmt.Sprintf("B%d", row))
		row += 2
	}

	f.SetCellValue(sheetName, fmt.Sprintf("A%d", row), "CASH FLOWS FROM OPERATING ACTIVITIES")
	f.SetCellStyle(sheetName, fmt.Sprintf("A%d", row), fmt.Sprintf("B%d", row), sectionHeaderStyle)
	f.MergeCell(sheetName, fmt.Sprintf("A%d", row), fmt.Sprintf("B%d", row))
	row++

	row = addCashFlowItems(f, sheetName, cashFlow.OperatingActivities, row, currencyStyle, subtotalStyle)
	row++

	f.SetCellValue(sheetName, fmt.Sprintf("A%d", row), "CASH FLOWS FROM INVESTING ACTIVITIES")
	f.SetCellStyle(sheetName, fmt.Sprintf("A%d", row), fmt.Sprintf("B%d", row), sectionHeaderStyle)
	f.MergeCell(sheetName, fmt.Sprintf("A%d", row), fmt.Sprintf("B%d", row))
	row++

	row = addCashFlowItems(f, sheetName, cashFlow.InvestingActivities, row, currencyStyle, subtotalStyle)
	row++

	f.SetCellValue(sheetName, fmt.Sprintf("A%d", row), "CASH FLOWS FROM FINANCING ACTIVITIES")
	f.SetCellStyle(sheetName, fmt.Sprintf("A%d", row), fmt.Sprintf("B%d", row), sectionHeaderStyle)
	f.MergeCell(sheetName, fmt.Sprintf("A%d", row), fmt.Sprintf("B%d", row))
	row++

	row = addCashFlowItems(f, sheetName, cashFlow.FinancingActivities, row, currencyStyle, subtotalStyle)
	row++

	f.SetCellValue(sheetName, fmt.Sprintf("A%d", row), "NET INCREASE (DECREASE) IN CASH")
	f.SetCellValue(sheetName, fmt.Sprintf("B%d", row), cashFlow.NetCashFlow)
	f.SetCellStyle(sheetName, fmt.Sprintf("A%d", row), fmt.Sprintf("B%d", row), subtotalStyle)
	f.SetCellStyle(sheetName, fmt.Sprintf("B%d", row), fmt.Sprintf("B%d", row), currencyStyle)

	f.DeleteSheet("Sheet1")

	return f.SaveAs(filePath)
}

func addCashFlowItems(f *excelize.File, sheetName string, items []CashFlowItem, startRow int, currencyStyle, subtotalStyle int) int {
	row := startRow
	for _, item := range items {
		f.SetCellValue(sheetName, fmt.Sprintf("A%d", row), item.Description)
		f.SetCellValue(sheetName, fmt.Sprintf("B%d", row), item.Amount)
		f.SetCellStyle(sheetName, fmt.Sprintf("B%d", row), fmt.Sprintf("B%d", row), currencyStyle)

		if isSubtotalLine(item.Description) {
			f.SetCellStyle(sheetName, fmt.Sprintf("A%d", row), fmt.Sprintf("B%d", row), subtotalStyle)
		}

		row++
	}
	return row
}

func isSubtotalLine(description string) bool {
	return description == "Net Cash from Operating Activities" ||
		description == "Net Cash from Investing Activities" ||
		description == "Net Cash from Financing Activities"
}