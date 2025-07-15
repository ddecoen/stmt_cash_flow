package main

import (
	"fmt"
	"strconv"

	"github.com/xuri/excelize/v2"
)

func createExcelFile(cashFlow CashFlowStatement, filePath string) error {
	f := excelize.NewFile()
	defer f.Close()

	// Create a new worksheet
	sheetName := "Cash Flow Statement"
	index, err := f.NewSheet(sheetName)
	if err != nil {
		return fmt.Errorf("failed to create worksheet: %w", err)
	}

	// Set the active sheet
	f.SetActiveSheet(index)

	// Define styles
	headerStyle, _ := f.NewStyle(&excelize.Style{
		Font: &excelize.Font{
			Bold: true,
			Size: 14,
		},
		Alignment: &excelize.Alignment{
			Horizontal: "center",
		},
	})

	sectionHeaderStyle, _ := f.NewStyle(&excelize.Style{
		Font: &excelize.Font{
			Bold: true,
			Size: 12,
		},
		Fill: excelize.Fill{
			Type:    "pattern",
			Color:   []string{"#E6E6FA"},
			Pattern: 1,
		},
	})

	subtotalStyle, _ := f.NewStyle(&excelize.Style{
		Font: &excelize.Font{
			Bold: true,
		},
		Border: []excelize.Border{
			{Type: "top", Color: "000000", Style: 1},
		},
	})

	currencyStyle, _ := f.NewStyle(&excelize.Style{
		NumFmt: 164, // Currency format
	})

	// Set column widths
	f.SetColWidth(sheetName, "A", "A", 40)
	f.SetColWidth(sheetName, "B", "B", 15)

	row := 1

	// Title
	f.SetCellValue(sheetName, fmt.Sprintf("A%d", row), "STATEMENT OF CASH FLOWS")
	f.SetCellStyle(sheetName, fmt.Sprintf("A%d", row), fmt.Sprintf("A%d", row), headerStyle)
	f.MergeCell(sheetName, fmt.Sprintf("A%d", row), fmt.Sprintf("B%d", row))
	row += 2

	// Period
	if cashFlow.PeriodStart != "" && cashFlow.PeriodEnd != "" {
		f.SetCellValue(sheetName, fmt.Sprintf("A%d", row), fmt.Sprintf("For the period from %s to %s", cashFlow.PeriodStart, cashFlow.PeriodEnd))
		f.MergeCell(sheetName, fmt.Sprintf("A%d", row), fmt.Sprintf("B%d", row))
		row += 2
	}

	// Operating Activities
	f.SetCellValue(sheetName, fmt.Sprintf("A%d", row), "CASH FLOWS FROM OPERATING ACTIVITIES")
	f.SetCellStyle(sheetName, fmt.Sprintf("A%d", row), fmt.Sprintf("B%d", row), sectionHeaderStyle)
	f.MergeCell(sheetName, fmt.Sprintf("A%d", row), fmt.Sprintf("B%d", row))
	row++

	row = addCashFlowItems(f, sheetName, cashFlow.OperatingActivities, row, currencyStyle, subtotalStyle)
	row++

	// Investing Activities
	f.SetCellValue(sheetName, fmt.Sprintf("A%d", row), "CASH FLOWS FROM INVESTING ACTIVITIES")
	f.SetCellStyle(sheetName, fmt.Sprintf("A%d", row), fmt.Sprintf("B%d", row), sectionHeaderStyle)
	f.MergeCell(sheetName, fmt.Sprintf("A%d", row), fmt.Sprintf("B%d", row))
	row++

	row = addCashFlowItems(f, sheetName, cashFlow.InvestingActivities, row, currencyStyle, subtotalStyle)
	row++

	// Financing Activities
	f.SetCellValue(sheetName, fmt.Sprintf("A%d", row), "CASH FLOWS FROM FINANCING ACTIVITIES")
	f.SetCellStyle(sheetName, fmt.Sprintf("A%d", row), fmt.Sprintf("B%d", row), sectionHeaderStyle)
	f.MergeCell(sheetName, fmt.Sprintf("A%d", row), fmt.Sprintf("B%d", row))
	row++

	row = addCashFlowItems(f, sheetName, cashFlow.FinancingActivities, row, currencyStyle, subtotalStyle)
	row++

	// Net increase/decrease in cash
	f.SetCellValue(sheetName, fmt.Sprintf("A%d", row), "NET INCREASE (DECREASE) IN CASH")
	f.SetCellValue(sheetName, fmt.Sprintf("B%d", row), cashFlow.NetCashFlow)
	f.SetCellStyle(sheetName, fmt.Sprintf("A%d", row), fmt.Sprintf("B%d", row), subtotalStyle)
	f.SetCellStyle(sheetName, fmt.Sprintf("B%d", row), fmt.Sprintf("B%d", row), currencyStyle)
	row += 2

	// Cash at beginning and end of period (if available)
	if cashFlow.BeginningCash != 0 || cashFlow.EndingCash != 0 {
		f.SetCellValue(sheetName, fmt.Sprintf("A%d", row), "Cash at beginning of period")
		f.SetCellValue(sheetName, fmt.Sprintf("B%d", row), cashFlow.BeginningCash)
		f.SetCellStyle(sheetName, fmt.Sprintf("B%d", row), fmt.Sprintf("B%d", row), currencyStyle)
		row++

		f.SetCellValue(sheetName, fmt.Sprintf("A%d", row), "Cash at end of period")
		f.SetCellValue(sheetName, fmt.Sprintf("B%d", row), cashFlow.EndingCash)
		f.SetCellStyle(sheetName, fmt.Sprintf("A%d", row), fmt.Sprintf("B%d", row), subtotalStyle)
		f.SetCellStyle(sheetName, fmt.Sprintf("B%d", row), fmt.Sprintf("B%d", row), currencyStyle)
	}

	// Delete the default sheet
	f.DeleteSheet("Sheet1")

	// Save the file
	return f.SaveAs(filePath)
}

func addCashFlowItems(f *excelize.File, sheetName string, items []CashFlowItem, startRow int, currencyStyle, subtotalStyle int) int {
	row := startRow
	for _, item := range items {
		f.SetCellValue(sheetName, fmt.Sprintf("A%d", row), item.Description)
		f.SetCellValue(sheetName, fmt.Sprintf("B%d", row), item.Amount)
		f.SetCellStyle(sheetName, fmt.Sprintf("B%d", row), fmt.Sprintf("B%d", row), currencyStyle)

		// Apply subtotal style to net cash flow lines
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

func formatCurrency(amount float64) string {
	return fmt.Sprintf("$%.2f", amount)
}

func formatNumber(num float64) string {
	return strconv.FormatFloat(num, 'f', 2, 64)
}