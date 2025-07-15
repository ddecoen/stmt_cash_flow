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
		PeriodStart:         "Mar 2025",
		PeriodEnd:           "Jun 2025",
	}

	// Find net income from the records
	var netIncome float64
	for _, record := range records {
		if strings.Contains(strings.ToLower(record.Account), "net income") {
			netIncome = record.Amount
			break
		}
	}

	// Start with net income for indirect method
	if netIncome != 0 {
		cashFlow.OperatingActivities = append(cashFlow.OperatingActivities, CashFlowItem{
			Description: "Net Income",
			Amount:      netIncome,
		})
	}

	// Group balance sheet changes by cash flow category
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

	// Add operating adjustments
	cashFlow.OperatingActivities = append(cashFlow.OperatingActivities, operatingAdjustments...)
	cashFlow.InvestingActivities = investingActivities
	cashFlow.FinancingActivities = financingActivities

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

	// Calculate beginning and ending cash from cash changes
	for _, cashChange := range cashChanges {
		if strings.Contains(strings.ToLower(cashChange.Description), "cash") {
			cashFlow.BeginningCash += cashChange.Amount // This would be prior period
			cashFlow.EndingCash = cashFlow.BeginningCash + cashFlow.NetCashFlow
		}
	}

	return cashFlow
}

func categorizeBalanceSheetAccount(accountType, accountName string) string {
	accountType = strings.ToLower(strings.TrimSpace(accountType))
	accountName = strings.ToLower(strings.TrimSpace(accountName))

	// Cash and cash equivalents - track separately
	if strings.Contains(accountName, "cash") || strings.Contains(accountName, "bank") ||
		strings.Contains(accountName, "money market") || strings.Contains(accountName, "investment") {
		return "cash"
	}

	// Operating Activities (Working Capital Changes)
	if strings.Contains(accountName, "receivable") || strings.Contains(accountName, "prepaid") ||
		strings.Contains(accountName, "unbilled") || strings.Contains(accountName, "payable") ||
		strings.Contains(accountName, "accrued") || strings.Contains(accountName, "wages") ||
		strings.Contains(accountName, "payroll") || strings.Contains(accountName, "deferred") ||
		strings.Contains(accountName, "credit card") || strings.Contains(accountName, "benefits") ||
		strings.Contains(accountName, "contributions") {
		return "operating"
	}

	// Investing Activities (Fixed Assets and Long-term Investments)
	if strings.Contains(accountName, "equipment") || strings.Contains(accountName, "furniture") ||
		strings.Contains(accountName, "computer") || strings.Contains(accountName, "leasehold") ||
		strings.Contains(accountName, "software development") || strings.Contains(accountName, "domain") ||
		strings.Contains(accountName, "capitalized") || strings.Contains(accountName, "note receivable") ||
		strings.Contains(accountName, "security deposits") || strings.Contains(accountName, "software rights") {
		return "investing"
	}

	// Financing Activities (Equity and Long-term Debt)
	if accountType == "EQUITY" || strings.Contains(accountName, "stock") ||
		strings.Contains(accountName, "capital") || strings.Contains(accountName, "earnings") ||
		strings.Contains(accountName, "income") || strings.Contains(accountName, "opening balance") ||
		strings.Contains(accountName, "lease liabilities") {
		return "financing"
	}

	// Default to operating for current items
	return "operating"
}

func adjustAmountForCashFlow(amount float64, accountType string) float64 {
	// For indirect method, we need to adjust for the impact on cash
	// Increases in assets decrease cash (negative)
	// Increases in liabilities increase cash (positive)
	// Increases in equity increase cash (positive)

	accountType = strings.ToLower(accountType)
	if strings.Contains(accountType, "asset") {
		return -amount // Increase in assets decreases cash
	}
	return amount // Increase in liabilities/equity increases cash
}

func cleanAccountName(accountName string) string {
	// Remove account numbers and clean up the description
	parts := strings.Split(accountName, " - ")
	if len(parts) > 1 {
		return strings.TrimSpace(parts[1])
	}
	return strings.TrimSpace(accountName)
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