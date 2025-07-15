package main

import (
	"encoding/csv"
	"fmt"
	"io"
	"strconv"
	"strings"
)

type BalanceSheetItem struct {
	Account        string  `json:"account"`
	CurrentAmount  float64 `json:"current_amount"`
	PriorAmount    float64 `json:"prior_amount"`
	Variance       float64 `json:"variance"`
	PercentVariance float64 `json:"percent_variance"`
	AccountType    string  `json:"account_type"`
	IsTotal        bool    `json:"is_total"`
}

func parseNetSuiteCSV(file io.Reader) ([]NetSuiteRecord, error) {
	// Parse as balance sheet and convert to cash flow records
	balanceSheetItems, err := parseBalanceSheet(file)
	if err != nil {
		return nil, err
	}

	// Convert balance sheet changes to cash flow records
	return convertBalanceSheetToCashFlow(balanceSheetItems), nil
}

func parseBalanceSheet(file io.Reader) ([]BalanceSheetItem, error) {
	reader := csv.NewReader(file)
	records, err := reader.ReadAll()
	if err != nil {
		return nil, fmt.Errorf("failed to read CSV: %w", err)
	}

	if len(records) < 12 {
		return nil, fmt.Errorf("CSV file must have at least 12 rows (data starts at row 12)")
	}

	// Find the header row (should be around row 6-7)
	headerRowIndex := -1
	for i := 5; i < 10 && i < len(records); i++ {
		if len(records[i]) >= 4 && strings.Contains(strings.ToLower(records[i][0]), "financial") {
			headerRowIndex = i
			break
		}
	}

	if headerRowIndex == -1 {
		return nil, fmt.Errorf("could not find header row with 'Financial Row' column")
	}

	var balanceSheetItems []BalanceSheetItem
	currentSection := ""

	// Parse data starting from row after header
	for i := headerRowIndex + 1; i < len(records); i++ {
		record := records[i]
		if len(record) < 4 {
			continue
		}

		accountName := strings.TrimSpace(record[0])
		if accountName == "" {
			continue
		}

		// Determine section
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

		// Skip section headers and empty rows
		if isHeaderRow(accountName) {
			continue
		}

		// Parse amounts
		currentAmount, _ := parseAmount(record[1])
		priorAmount, _ := parseAmount(record[2])
		variance, _ := parseAmount(record[3])

		// Only include rows with actual account numbers or meaningful data
		if currentAmount != 0 || priorAmount != 0 || variance != 0 {
			item := BalanceSheetItem{
				Account:         accountName,
				CurrentAmount:   currentAmount,
				PriorAmount:     priorAmount,
				Variance:        variance,
				AccountType:     currentSection,
				IsTotal:         strings.Contains(strings.ToLower(accountName), "total"),
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
			continue // Skip totals and zero changes
		}

		// Create a cash flow record from the balance sheet change
		record := NetSuiteRecord{
			Account:     item.Account,
			AccountType: determineAccountTypeFromName(item.Account, item.AccountType),
			Amount:      item.Variance,
			Date:        "2025-06-30", // End of period
			Description: fmt.Sprintf("Change in %s", item.Account),
			Reference:   "Balance Sheet Analysis",
		}
		records = append(records, record)
	}

	return records
}

func determineAccountTypeFromName(accountName, section string) string {
	accountLower := strings.ToLower(accountName)

	// Cash and cash equivalents
	if strings.Contains(accountLower, "cash") || strings.Contains(accountLower, "bank") {
		return "Cash"
	}

	// Current assets (working capital)
	if strings.Contains(accountLower, "receivable") || strings.Contains(accountLower, "prepaid") ||
		strings.Contains(accountLower, "inventory") || strings.Contains(accountLower, "unbilled") {
		return "Current Asset"
	}

	// Fixed assets
	if strings.Contains(accountLower, "equipment") || strings.Contains(accountLower, "furniture") ||
		strings.Contains(accountLower, "computer") || strings.Contains(accountLower, "leasehold") ||
		strings.Contains(accountLower, "software development") || strings.Contains(accountLower, "domain") {
		return "Fixed Asset"
	}

	// Current liabilities
	if strings.Contains(accountLower, "payable") || strings.Contains(accountLower, "accrued") ||
		strings.Contains(accountLower, "wages") || strings.Contains(accountLower, "payroll") ||
		strings.Contains(accountLower, "deferred") || strings.Contains(accountLower, "credit card") {
		return "Current Liability"
	}

	// Long-term liabilities
	if strings.Contains(accountLower, "lease liabilities") && strings.Contains(accountLower, "non-current") {
		return "Long Term Liability"
	}

	// Equity
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
	// Clean the amount string
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