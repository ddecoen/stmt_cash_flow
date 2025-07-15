package main

import (
	"sort"
	"strings"
	"time"
)

func generateCashFlowStatement(records []NetSuiteRecord) CashFlowStatement {
	// Initialize cash flow statement
	cashFlow := CashFlowStatement{
		OperatingActivities: []CashFlowItem{},
		InvestingActivities: []CashFlowItem{},
		FinancingActivities: []CashFlowItem{},
	}

	// Determine period
	if len(records) > 0 {
		dates := extractDates(records)
		if len(dates) > 0 {
			cashFlow.PeriodStart = dates[0]
			cashFlow.PeriodEnd = dates[len(dates)-1]
		}
	}

	// Group transactions by account type and calculate totals
	operatingTotals := make(map[string]float64)
	investingTotals := make(map[string]float64)
	financingTotals := make(map[string]float64)

	for _, record := range records {
		category := categorizeAccount(record.AccountType, record.Account)
		switch category {
		case "operating":
			operatingTotals[record.Account] += record.Amount
		case "investing":
			investingTotals[record.Account] += record.Amount
		case "financing":
			financingTotals[record.Account] += record.Amount
		}
	}

	// Convert totals to cash flow items
	cashFlow.OperatingActivities = convertToItems(operatingTotals)
	cashFlow.InvestingActivities = convertToItems(investingTotals)
	cashFlow.FinancingActivities = convertToItems(financingTotals)

	// Calculate net cash flows
	operatingTotal := sumItems(cashFlow.OperatingActivities)
	investingTotal := sumItems(cashFlow.InvestingActivities)
	financingTotal := sumItems(cashFlow.FinancingActivities)

	cashFlow.NetCashFlow = operatingTotal + investingTotal + financingTotal

	// Add subtotals
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

func categorizeAccount(accountType, accountName string) string {
	accountType = strings.ToLower(strings.TrimSpace(accountType))
	accountName = strings.ToLower(strings.TrimSpace(accountName))

	// Operating Activities (GAAP guidelines)
	operatingKeywords := []string{
		"revenue", "sales", "income", "expense", "cost of goods", "payroll",
		"accounts receivable", "accounts payable", "inventory", "prepaid",
		"accrued", "tax", "interest expense", "depreciation", "amortization",
	}

	// Investing Activities
	investingKeywords := []string{
		"equipment", "property", "plant", "asset", "investment", "securities",
		"capital expenditure", "acquisition", "disposal", "sale of assets",
		"purchase of assets", "fixed asset",
	}

	// Financing Activities
	financingKeywords := []string{
		"loan", "debt", "borrowing", "dividend", "equity", "stock", "share",
		"capital", "retained earnings", "owner", "shareholder", "bond",
		"line of credit", "mortgage",
	}

	// Check account type first
	switch {
	case strings.Contains(accountType, "asset") && (strings.Contains(accountName, "cash") || strings.Contains(accountName, "bank")):
		return "operating" // Cash accounts are typically operating
	case strings.Contains(accountType, "asset") && strings.Contains(accountType, "fixed"):
		return "investing"
	case strings.Contains(accountType, "liability") && strings.Contains(accountType, "long"):
		return "financing"
	case strings.Contains(accountType, "equity"):
		return "financing"
	}

	// Check account name for keywords
	for _, keyword := range operatingKeywords {
		if strings.Contains(accountName, keyword) {
			return "operating"
		}
	}

	for _, keyword := range investingKeywords {
		if strings.Contains(accountName, keyword) {
			return "investing"
		}
	}

	for _, keyword := range financingKeywords {
		if strings.Contains(accountName, keyword) {
			return "financing"
		}
	}

	// Default categorization based on account type
	switch {
	case strings.Contains(accountType, "revenue"), strings.Contains(accountType, "income"),
		strings.Contains(accountType, "expense"), strings.Contains(accountType, "cost"):
		return "operating"
	case strings.Contains(accountType, "asset"):
		return "investing"
	case strings.Contains(accountType, "liability"), strings.Contains(accountType, "equity"):
		return "financing"
	default:
		return "operating" // Default to operating
	}
}

func convertToItems(totals map[string]float64) []CashFlowItem {
	var items []CashFlowItem
	for account, amount := range totals {
		if amount != 0 { // Only include non-zero amounts
			items = append(items, CashFlowItem{
				Description: account,
				Amount:      amount,
			})
		}
	}
	return items
}

func sumItems(items []CashFlowItem) float64 {
	var total float64
	for _, item := range items {
		// Skip subtotal lines
		if !strings.Contains(strings.ToLower(item.Description), "net cash from") {
			total += item.Amount
		}
	}
	return total
}

func extractDates(records []NetSuiteRecord) []string {
	var dates []string
	for _, record := range records {
		if record.Date != "" {
			dates = append(dates, record.Date)
		}
	}

	// Sort dates
	sort.Slice(dates, func(i, j int) bool {
		// Try to parse dates for proper sorting
		date1, err1 := time.Parse("2006-01-02", dates[i])
		date2, err2 := time.Parse("2006-01-02", dates[j])
		if err1 == nil && err2 == nil {
			return date1.Before(date2)
		}
		// Fallback to string comparison
		return dates[i] < dates[j]
	})

	return dates
}