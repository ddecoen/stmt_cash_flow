package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/gin-gonic/gin"
)

type NetSuiteRecord struct {
	Account     string  `json:"account"`
	AccountType string  `json:"account_type"`
	Amount      float64 `json:"amount"`
	Date        string  `json:"date"`
	Description string  `json:"description"`
	Reference   string  `json:"reference"`
}

type CashFlowStatement struct {
	OperatingActivities  []CashFlowItem `json:"operating_activities"`
	InvestingActivities  []CashFlowItem `json:"investing_activities"`
	FinancingActivities  []CashFlowItem `json:"financing_activities"`
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

func main() {
	r := gin.Default()

	// Serve static files
	r.Static("/static", "./static")
	r.LoadHTMLGlob("templates/*")

	// Routes
	r.GET("/", handleHome)
	r.POST("/upload", handleUpload)
	r.GET("/download/:filename", handleDownload)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Server starting on port %s", port)
	r.Run(":" + port)
}

func handleHome(c *gin.Context) {
	c.HTML(http.StatusOK, "index.html", gin.H{
		"title": "Cash Flow Statement Generator",
	})
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
	filePath := filepath.Join("./temp", filename)

	// Ensure temp directory exists
	os.MkdirAll("./temp", 0755)

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
	filePath := filepath.Join("./temp", filename)

	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		c.JSON(http.StatusNotFound, gin.H{"error": "File not found"})
		return
	}

	c.Header("Content-Description", "File Transfer")
	c.Header("Content-Transfer-Encoding", "binary")
	c.Header("Content-Disposition", "attachment; filename="+filename)
	c.Header("Content-Type", "application/octet-stream")
	c.File(filePath)

	// Clean up file after download
	go func() {
		time.Sleep(5 * time.Minute)
		os.Remove(filePath)
	}()
}