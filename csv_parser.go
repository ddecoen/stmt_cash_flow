package main

import (
	"encoding/csv"
	"fmt"
	"io"
	"strconv"
	"strings"
)

func parseNetSuiteCSV(file io.Reader) ([]NetSuiteRecord, error) {
	reader := csv.NewReader(file)
	records, err := reader.ReadAll()
	if err != nil {
		return nil, fmt.Errorf("failed to read CSV: %w", err)
	}

	if len(records) < 2 {
		return nil, fmt.Errorf("CSV file must have at least a header and one data row")
	}

	header := records[0]
	columnMap := make(map[string]int)
	for i, col := range header {
		columnMap[strings.ToLower(strings.TrimSpace(col))] = i
	}

	// Required columns mapping (flexible to handle different NetSuite exports)
	requiredColumns := map[string][]string{
		"account":      {"account", "account name", "account_name"},
		"account_type": {"account type", "account_type", "type"},
		"amount":       {"amount", "debit", "credit", "net amount"},
		"date":         {"date", "transaction date", "posting date"},
		"description":  {"description", "memo", "transaction description"},
		"reference":    {"reference", "document number", "transaction number"},
	}

	columnIndices := make(map[string]int)
	for field, possibleNames := range requiredColumns {
		found := false
		for _, name := range possibleNames {
			if idx, exists := columnMap[name]; exists {
				columnIndices[field] = idx
				found = true
				break
			}
		}
		if !found && field != "reference" { // reference is optional
			return nil, fmt.Errorf("required column not found: %s (looked for: %v)", field, possibleNames)
		}
	}

	var netSuiteRecords []NetSuiteRecord
	for i, record := range records[1:] {
		if len(record) < len(header) {
			continue // Skip incomplete rows
		}

		amount, err := parseAmount(record[columnIndices["amount"]])
		if err != nil {
			return nil, fmt.Errorf("invalid amount in row %d: %w", i+2, err)
		}

		nsRecord := NetSuiteRecord{
			Account:     strings.TrimSpace(record[columnIndices["account"]]),
			AccountType: strings.TrimSpace(record[columnIndices["account_type"]]),
			Amount:      amount,
			Date:        strings.TrimSpace(record[columnIndices["date"]]),
			Description: strings.TrimSpace(record[columnIndices["description"]]),
		}

		if refIdx, exists := columnIndices["reference"]; exists {
			nsRecord.Reference = strings.TrimSpace(record[refIdx])
		}

		netSuiteRecords = append(netSuiteRecords, nsRecord)
	}

	return netSuiteRecords, nil
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