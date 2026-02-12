package finault

import (
	"bytes"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"sync"
	"time"
)

// RetryStrategy defines the retry strategy for failed requests
type RetryStrategy string

const (
	ExponentialRetry RetryStrategy = "exponential"
	LinearRetry      RetryStrategy = "linear"
	NoRetry          RetryStrategy = "none"
)

// BudgetEnforcementMode defines how budget limits are enforced
type BudgetEnforcementMode string

const (
	WarnMode      BudgetEnforcementMode = "warn"
	SoftLimit     BudgetEnforcementMode = "soft_limit"
	HardLimit     BudgetEnforcementMode = "hard_limit"
)

// CostMetadata tracks cost information for API calls
type CostMetadata struct {
	Model              string    `json:"model"`
	PromptTokens       int       `json:"prompt_tokens"`
	CompletionTokens   int       `json:"completion_tokens"`
	TotalTokens        int       `json:"total_tokens"`
	CostUSD            float64   `json:"cost_usd"`
	Timestamp          time.Time `json:"timestamp"`
	RequestID          string    `json:"request_id,omitempty"`
	CostCenter         string    `json:"cost_center"`
	Project            string    `json:"project"`
	UserID             string    `json:"user_id,omitempty"`
}

// BudgetConfig defines budget limits and enforcement
type BudgetConfig struct {
	MonthlyLimitUSD        float64
	EnforcementMode        BudgetEnforcementMode
	WarningThresholdPercent float64
	HardLimitPercent        float64
	ResetDay               int
}

// ChatCompletionMessage represents a message in a conversation
type ChatCompletionMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
	Name    string `json:"name,omitempty"`
}

// ChatCompletionChoice represents a single choice in a completion response
type ChatCompletionChoice struct {
	Index       int                       `json:"index"`
	Message     *ChatCompletionMessage    `json:"message,omitempty"`
	Delta       *ChatCompletionMessage    `json:"delta,omitempty"`
	FinishReason string                   `json:"finish_reason"`
}

// ChatCompletionUsage tracks token usage
type ChatCompletionUsage struct {
	PromptTokens     int `json:"prompt_tokens"`
	CompletionTokens int `json:"completion_tokens"`
	TotalTokens      int `json:"total_tokens"`
}

// ChatCompletion represents a chat completion response
type ChatCompletion struct {
	ID       string                  `json:"id"`
	Object   string                  `json:"object"`
	Created  int64                   `json:"created"`
	Model    string                  `json:"model"`
	Choices  []ChatCompletionChoice  `json:"choices"`
	Usage    *ChatCompletionUsage    `json:"usage,omitempty"`
}

// ChatCompletionChunk represents a streaming chunk
type ChatCompletionChunk struct {
	ID       string                  `json:"id"`
	Object   string                  `json:"object"`
	Created  int64                   `json:"created"`
	Model    string                  `json:"model"`
	Choices  []ChatCompletionChoice  `json:"choices"`
	Usage    *ChatCompletionUsage    `json:"usage,omitempty"`
}

// ChatCompletionRequest represents a chat completion request
type ChatCompletionRequest struct {
	Model       string                    `json:"model"`
	Messages    []ChatCompletionMessage   `json:"messages"`
	Temperature *float64                  `json:"temperature,omitempty"`
	MaxTokens   *int                      `json:"max_tokens,omitempty"`
	Stream      bool                      `json:"stream,omitempty"`
	User        string                    `json:"user,omitempty"`
}

// AnomalyDetectionResult represents anomaly detection results
type AnomalyDetectionResult struct {
	Anomalies []map[string]interface{} `json:"anomalies"`
	Score     float64                  `json:"score"`
}

// OptimizationResult represents optimization recommendations
type OptimizationResult struct {
	Optimizations []map[string]interface{} `json:"optimizations"`
	PotentialSavings float64                `json:"potential_savings"`
}

// ForecastResult represents forecast data
type ForecastResult struct {
	Forecast  []map[string]interface{} `json:"forecast"`
	Confidence float64                 `json:"confidence"`
}

// ComplianceResult represents compliance check results
type ComplianceResult struct {
	Violations []map[string]interface{} `json:"violations"`
	Status     string                   `json:"status"`
}

// EmissionResult represents carbon emissions data
type EmissionResult struct {
	Emissions float64 `json:"emissions"`
	Score     float64 `json:"score"`
}

// ContractAnalysisResult represents contract analysis output
type ContractAnalysisResult struct {
	Analysis map[string]interface{} `json:"analysis"`
	Savings  float64               `json:"savings"`
}

// DisputeDetectionResult represents dispute detection output
type DisputeDetectionResult struct {
	Disputes []map[string]interface{} `json:"disputes"`
	Evidence map[string]interface{}   `json:"evidence"`
}

// MonteCarloResult represents Monte Carlo simulation results
type MonteCarloResult struct {
	Scenarios []map[string]interface{} `json:"scenarios"`
	Mean      float64                  `json:"mean"`
	StdDev    float64                  `json:"std_dev"`
}

// RegulatoryResult represents regulatory compliance data
type RegulatoryResult struct {
	Regulations []map[string]interface{} `json:"regulations"`
	Gap         float64                  `json:"gap"`
}

// EventLog represents an audit event
type EventLog struct {
	Timestamp time.Time              `json:"timestamp"`
	Action    string                 `json:"action"`
	Details   map[string]interface{} `json:"details"`
}

// Client is the main Finault SDK client
type Client struct {
	apiKey        string
	baseURL       string
	httpClient    *http.Client
	costCenter    string
	project       string
	costTracker   *CostTracker
	budgetManager *BudgetManager
	retryManager  *RetryManager
	logger        *Logger

	mu sync.RWMutex
}

// Option is a functional option for configuring a Client
type Option func(*Client)

// NewClient creates a new Finault client with the given API key
func NewClient(apiKey string, opts ...Option) (*Client, error) {
	if apiKey == "" {
		return nil, fmt.Errorf("API key is required")
	}

	c := &Client{
		apiKey:     apiKey,
		baseURL:    "https://api.finault.io/v1",
		httpClient: &http.Client{Timeout: 30 * time.Second},
		costCenter: "default",
		project:    "default",
		logger:     NewLogger(),
	}

	c.costTracker = NewCostTracker(c.costCenter, c.project)
	c.retryManager = NewRetryManager()

	for _, opt := range opts {
		opt(c)
	}

	return c, nil
}

// WithBaseURL sets the base API URL
func WithBaseURL(url string) Option {
	return func(c *Client) {
		c.baseURL = url
	}
}

// WithCostCenter sets the cost center for cost tracking
func WithCostCenter(costCenter string) Option {
	return func(c *Client) {
		c.costCenter = costCenter
		if c.costTracker != nil {
			c.costTracker.SetCostTags(costCenter, c.project)
		}
	}
}

// WithProject sets the project for cost tracking
func WithProject(project string) Option {
	return func(c *Client) {
		c.project = project
		if c.costTracker != nil {
			c.costTracker.SetCostTags(c.costCenter, project)
		}
	}
}

// WithBudgetConfig sets the budget configuration
func WithBudgetConfig(cfg BudgetConfig) Option {
	return func(c *Client) {
		c.budgetManager = NewBudgetManager(cfg)
	}
}

// WithHTTPClient sets a custom HTTP client
func WithHTTPClient(client *http.Client) Option {
	return func(c *Client) {
		c.httpClient = client
	}
}

// WithLogLevel sets the logging level
func WithLogLevel(level string) Option {
	return func(c *Client) {
		c.logger = NewLogger()
		c.logger.SetLevel(level)
	}
}

// Chat sends a chat completion request and returns the response
func (c *Client) Chat(messages []ChatCompletionMessage, opts map[string]interface{}) (*ChatCompletion, error) {
	model, ok := opts["model"].(string)
	if !ok {
		return nil, fmt.Errorf("model is required in options")
	}

	req := ChatCompletionRequest{
		Model:    model,
		Messages: messages,
		Stream:   false,
	}

	if temp, ok := opts["temperature"].(float64); ok {
		req.Temperature = &temp
	}
	if maxTokens, ok := opts["max_tokens"].(int); ok {
		req.MaxTokens = &maxTokens
	}
	if user, ok := opts["user"].(string); ok {
		req.User = user
	}

	return c.executeChat(&req)
}

// ChatStream sends a chat completion request with streaming enabled
func (c *Client) ChatStream(messages []ChatCompletionMessage, opts map[string]interface{}) (<-chan ChatCompletionChunk, error) {
	model, ok := opts["model"].(string)
	if !ok {
		return nil, fmt.Errorf("model is required in options")
	}

	req := ChatCompletionRequest{
		Model:    model,
		Messages: messages,
		Stream:   true,
	}

	if temp, ok := opts["temperature"].(float64); ok {
		req.Temperature = &temp
	}
	if maxTokens, ok := opts["max_tokens"].(int); ok {
		req.MaxTokens = &maxTokens
	}
	if user, ok := opts["user"].(string); ok {
		req.User = user
	}

	return c.executeStreamChat(&req)
}

// executeChat executes a non-streaming chat completion request with retry logic
func (c *Client) executeChat(req *ChatCompletionRequest) (*ChatCompletion, error) {
	var lastErr error

	for attempt := 0; attempt <= c.retryManager.maxRetries; attempt++ {
		if attempt > 0 {
			delay := c.retryManager.getDelay(attempt)
			c.logger.Infof("Retrying after %dms", delay)
			time.Sleep(time.Duration(delay) * time.Millisecond)
		}

		resp, err := c.makeRequest("POST", "/chat/completions", req)
		if err != nil {
			lastErr = err
			if !c.retryManager.shouldRetry(attempt, err) {
				return nil, err
			}
			continue
		}

		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			if isRetryableStatus(resp.StatusCode) {
				lastErr = fmt.Errorf("retryable status code: %d", resp.StatusCode)
				continue
			}
			body, _ := io.ReadAll(resp.Body)
			return nil, fmt.Errorf("API error: %d - %s", resp.StatusCode, string(body))
		}

		var completion ChatCompletion
		if err := json.NewDecoder(resp.Body).Decode(&completion); err != nil {
			return nil, fmt.Errorf("failed to decode response: %w", err)
		}

		// Track costs
		if completion.Usage != nil {
			metadata := c.costTracker.TrackCost(
				req.Model,
				completion.Usage.PromptTokens,
				completion.Usage.CompletionTokens,
				generateRequestID(req.Model, req.Messages),
				req.User,
			)

			if c.budgetManager != nil {
				c.budgetManager.AddCost(metadata.CostUSD)
			}

			c.logger.Infof("Request cost: %d prompt + %d completion tokens ($%.6f)",
				completion.Usage.PromptTokens, completion.Usage.CompletionTokens, metadata.CostUSD)
		}

		return &completion, nil
	}

	return nil, fmt.Errorf("all retry attempts failed: %w", lastErr)
}

// executeStreamChat executes a streaming chat completion request
func (c *Client) executeStreamChat(req *ChatCompletionRequest) (<-chan ChatCompletionChunk, error) {
	chunks := make(chan ChatCompletionChunk, 10)

	go func() {
		defer close(chunks)

		var lastErr error
		for attempt := 0; attempt <= c.retryManager.maxRetries; attempt++ {
			if attempt > 0 {
				delay := c.retryManager.getDelay(attempt)
				c.logger.Infof("Retrying stream after %dms", delay)
				time.Sleep(time.Duration(delay) * time.Millisecond)
			}

			resp, err := c.makeRequest("POST", "/chat/completions", req)
			if err != nil {
				lastErr = err
				if !c.retryManager.shouldRetry(attempt, err) {
					c.logger.Errorf("Stream request failed: %v", err)
					return
				}
				continue
			}

			defer resp.Body.Close()

			if resp.StatusCode != http.StatusOK {
				if isRetryableStatus(resp.StatusCode) {
					lastErr = fmt.Errorf("retryable status code: %d", resp.StatusCode)
					continue
				}
				c.logger.Errorf("Stream API error: %d", resp.StatusCode)
				return
			}

			// Read streaming response line by line
			scanner := NewLineScanner(resp.Body)
			totalPromptTokens := 0
			totalCompletionTokens := 0

			for scanner.Scan() {
				line := scanner.Text()
				if line == "" || line == ":" {
					continue
				}

				if bytes.HasPrefix([]byte(line), []byte("data: ")) {
					dataStr := string(bytes.TrimPrefix([]byte(line), []byte("data: ")))
					if dataStr == "[DONE]" {
						break
					}

					var chunk ChatCompletionChunk
					if err := json.Unmarshal([]byte(dataStr), &chunk); err != nil {
						c.logger.Debugf("Failed to decode chunk: %v", err)
						continue
					}

					if chunk.Usage != nil {
						totalPromptTokens = chunk.Usage.PromptTokens
						totalCompletionTokens = chunk.Usage.CompletionTokens
					}

					chunks <- chunk
				}
			}

			// Track costs after streaming completes
			if totalCompletionTokens > 0 || totalPromptTokens > 0 {
				metadata := c.costTracker.TrackCost(
					req.Model,
					totalPromptTokens,
					totalCompletionTokens,
					generateRequestID(req.Model, req.Messages),
					req.User,
				)

				if c.budgetManager != nil {
					c.budgetManager.AddCost(metadata.CostUSD)
				}

				c.logger.Infof("Stream cost: %d prompt + %d completion tokens ($%.6f)",
					totalPromptTokens, totalCompletionTokens, metadata.CostUSD)
			}

			return
		}

		c.logger.Errorf("All stream retry attempts failed: %v", lastErr)
	}()

	return chunks, nil
}

// DetectAnomalies detects anomalies in cost data
func (c *Client) DetectAnomalies(data map[string]interface{}) (*AnomalyDetectionResult, error) {
	return c.apiCall("POST", "/anomalies/detect", data, &AnomalyDetectionResult{})
}

// LearnPatterns learns patterns from historical data
func (c *Client) LearnPatterns(data map[string]interface{}) (map[string]interface{}, error) {
	var result map[string]interface{}
	_, err := c.apiCall("POST", "/patterns/learn", data, &result)
	return result, err
}

// AnalyzeDrivers analyzes cost drivers
func (c *Client) AnalyzeDrivers(data map[string]interface{}) (map[string]interface{}, error) {
	var result map[string]interface{}
	_, err := c.apiCall("POST", "/drivers/analyze", data, &result)
	return result, err
}

// FindOptimizations finds optimization opportunities
func (c *Client) FindOptimizations(data map[string]interface{}) (*OptimizationResult, error) {
	return c.apiCall("POST", "/optimizations/find", data, &OptimizationResult{})
}

// ApplyOptimization applies an optimization
func (c *Client) ApplyOptimization(optID string, data map[string]interface{}) (map[string]interface{}, error) {
	var result map[string]interface{}
	_, err := c.apiCall("POST", fmt.Sprintf("/optimizations/%s/apply", optID), data, &result)
	return result, err
}

// Forecast generates cost forecasts
func (c *Client) Forecast(data map[string]interface{}) (*ForecastResult, error) {
	return c.apiCall("POST", "/forecast", data, &ForecastResult{})
}

// BudgetAnalysis performs budget analysis
func (c *Client) BudgetAnalysis(data map[string]interface{}) (map[string]interface{}, error) {
	var result map[string]interface{}
	_, err := c.apiCall("POST", "/budget/analysis", data, &result)
	return result, err
}

// CheckCompliance checks compliance status
func (c *Client) CheckCompliance(data map[string]interface{}) (*ComplianceResult, error) {
	return c.apiCall("POST", "/compliance/check", data, &ComplianceResult{})
}

// GetViolations gets compliance violations
func (c *Client) GetViolations() ([]map[string]interface{}, error) {
	var result []map[string]interface{}
	_, err := c.apiCall("GET", "/compliance/violations", nil, &result)
	return result, err
}

// EstimateEmissions estimates carbon emissions
func (c *Client) EstimateEmissions(data map[string]interface{}) (*EmissionResult, error) {
	return c.apiCall("POST", "/carbon/emissions", data, &EmissionResult{})
}

// GetSustainabilityScorecard gets sustainability scorecard
func (c *Client) GetSustainabilityScorecard() (map[string]interface{}, error) {
	var result map[string]interface{}
	_, err := c.apiCall("GET", "/carbon/scorecard", nil, &result)
	return result, err
}

// AnalyzeContract analyzes a contract for cost implications
func (c *Client) AnalyzeContract(contractData map[string]interface{}) (*ContractAnalysisResult, error) {
	return c.apiCall("POST", "/procurement/analyze", contractData, &ContractAnalysisResult{})
}

// IdentifySavings identifies potential savings in contracts
func (c *Client) IdentifySavings(contractData map[string]interface{}) (map[string]interface{}, error) {
	var result map[string]interface{}
	_, err := c.apiCall("POST", "/procurement/savings", contractData, &result)
	return result, err
}

// DetectDisputes detects disputes in transactions
func (c *Client) DetectDisputes(transactionData map[string]interface{}) (*DisputeDetectionResult, error) {
	return c.apiCall("POST", "/disputes/detect", transactionData, &DisputeDetectionResult{})
}

// BuildEvidence builds evidence for a dispute
func (c *Client) BuildEvidence(disputeID string, evidence map[string]interface{}) (map[string]interface{}, error) {
	var result map[string]interface{}
	_, err := c.apiCall("POST", fmt.Sprintf("/disputes/%s/evidence", disputeID), evidence, &result)
	return result, err
}

// RunMonteCarlo runs Monte Carlo simulations
func (c *Client) RunMonteCarlo(data map[string]interface{}) (*MonteCarloResult, error) {
	return c.apiCall("POST", "/forecast/monte-carlo", data, &MonteCarloResult{})
}

// GenerateScenarios generates forecast scenarios
func (c *Client) GenerateScenarios(data map[string]interface{}) ([]map[string]interface{}, error) {
	var result []map[string]interface{}
	_, err := c.apiCall("POST", "/forecast/scenarios", data, &result)
	return result, err
}

// ScanRegulations scans for regulatory requirements
func (c *Client) ScanRegulations(data map[string]interface{}) (*RegulatoryResult, error) {
	return c.apiCall("POST", "/regulatory/scan", data, &RegulatoryResult{})
}

// AssessComplianceGap assesses compliance gaps
func (c *Client) AssessComplianceGap(data map[string]interface{}) (map[string]interface{}, error) {
	var result map[string]interface{}
	_, err := c.apiCall("POST", "/regulatory/gap", data, &result)
	return result, err
}

// LogEvent logs an audit event
func (c *Client) LogEvent(action string, details map[string]interface{}) (*EventLog, error) {
	data := map[string]interface{}{
		"action":  action,
		"details": details,
	}
	return c.apiCall("POST", "/audit/log", data, &EventLog{})
}

// GetTotalCost returns the total cost tracked
func (c *Client) GetTotalCost() float64 {
	return c.costTracker.GetTotalCost()
}

// GetCostsByModel returns costs broken down by model
func (c *Client) GetCostsByModel() map[string]float64 {
	return c.costTracker.GetCostsByModel()
}

// GetCostsByProject returns costs broken down by project
func (c *Client) GetCostsByProject() map[string]float64 {
	return c.costTracker.GetCostsByProject()
}

// GetCostHistory returns cost history with optional limit
func (c *Client) GetCostHistory(limit int) []CostMetadata {
	return c.costTracker.GetCostHistory(limit)
}

// GetRemainingBudget returns the remaining budget
func (c *Client) GetRemainingBudget() float64 {
	if c.budgetManager == nil {
		return math.Inf(1)
	}
	return c.budgetManager.GetRemainingBudget()
}

// GetBudgetUsagePercent returns the budget usage percentage
func (c *Client) GetBudgetUsagePercent() float64 {
	if c.budgetManager == nil {
		return 0
	}
	return c.budgetManager.GetUsagePercent()
}

// SetCostTags updates cost center and project tags
func (c *Client) SetCostTags(costCenter, project string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.costCenter = costCenter
	c.project = project
	c.costTracker.SetCostTags(costCenter, project)
}

// OnBudgetWarning registers a callback for budget warnings
func (c *Client) OnBudgetWarning(callback func(current, limit float64)) {
	if c.budgetManager != nil {
		c.budgetManager.OnWarning(callback)
	}
}

// OnBudgetExceeded registers a callback for budget exceeded events
func (c *Client) OnBudgetExceeded(callback func(current, limit float64)) {
	if c.budgetManager != nil {
		c.budgetManager.OnHardLimit(callback)
	}
}

// OnBudgetSoftLimit registers a callback for soft limit events
func (c *Client) OnBudgetSoftLimit(callback func(current, limit float64)) {
	if c.budgetManager != nil {
		c.budgetManager.OnSoftLimit(callback)
	}
}

// makeRequest makes an HTTP request to the API
func (c *Client) makeRequest(method, endpoint string, data interface{}) (*http.Response, error) {
	url := c.baseURL + endpoint

	var body io.Reader
	if data != nil {
		jsonData, err := json.Marshal(data)
		if err != nil {
			return nil, fmt.Errorf("failed to marshal request: %w", err)
		}
		body = bytes.NewReader(jsonData)
	}

	req, err := http.NewRequest(method, url, body)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", c.apiKey))
	req.Header.Set("Content-Type", "application/json")

	return c.httpClient.Do(req)
}

// apiCall is a generic method for making API calls
func (c *Client) apiCall(method, endpoint string, data interface{}, result interface{}) (interface{}, error) {
	resp, err := c.makeRequest(method, endpoint, data)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("API error: %d - %s", resp.StatusCode, string(body))
	}

	if err := json.NewDecoder(resp.Body).Decode(result); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return result, nil
}

// CostTracker tracks costs and provides analytics
type CostTracker struct {
	mu            sync.RWMutex
	costCenter    string
	project       string
	costs         []CostMetadata
	modelPricing  map[string][2]float64
}

// NewCostTracker creates a new cost tracker
func NewCostTracker(costCenter, project string) *CostTracker {
	return &CostTracker{
		costCenter:   costCenter,
		project:      project,
		costs:        []CostMetadata{},
		modelPricing: initializeModelPricing(),
	}
}

// TrackCost tracks a cost event
func (ct *CostTracker) TrackCost(model string, promptTokens, completionTokens int, requestID, userID string) CostMetadata {
	ct.mu.Lock()
	defer ct.mu.Unlock()

	costUSD := ct.calculateCost(model, promptTokens, completionTokens)
	totalTokens := promptTokens + completionTokens

	metadata := CostMetadata{
		Model:            model,
		PromptTokens:     promptTokens,
		CompletionTokens: completionTokens,
		TotalTokens:      totalTokens,
		CostUSD:          costUSD,
		Timestamp:        time.Now(),
		RequestID:        requestID,
		CostCenter:       ct.costCenter,
		Project:          ct.project,
		UserID:           userID,
	}

	ct.costs = append(ct.costs, metadata)
	return metadata
}

// calculateCost calculates the cost for a given model and token counts
func (ct *CostTracker) calculateCost(model string, promptTokens, completionTokens int) float64 {
	pricing, ok := ct.modelPricing[model]
	if !ok {
		pricing = [2]float64{0.001, 0.002}
	}

	promptCost := pricing[0]
	completionCost := pricing[1]

	cost := (float64(promptTokens)*promptCost)/1000 + (float64(completionTokens)*completionCost)/1000
	return math.Round(cost*1000000) / 1000000
}

// GetTotalCost returns total cost
func (ct *CostTracker) GetTotalCost() float64 {
	ct.mu.RLock()
	defer ct.mu.RUnlock()

	total := 0.0
	for _, c := range ct.costs {
		total += c.CostUSD
	}
	return total
}

// GetCostsByModel returns costs grouped by model
func (ct *CostTracker) GetCostsByModel() map[string]float64 {
	ct.mu.RLock()
	defer ct.mu.RUnlock()

	result := make(map[string]float64)
	for _, c := range ct.costs {
		result[c.Model] += c.CostUSD
	}
	return result
}

// GetCostsByProject returns costs grouped by project
func (ct *CostTracker) GetCostsByProject() map[string]float64 {
	ct.mu.RLock()
	defer ct.mu.RUnlock()

	result := make(map[string]float64)
	for _, c := range ct.costs {
		result[c.Project] += c.CostUSD
	}
	return result
}

// GetCostHistory returns cost history with optional limit
func (ct *CostTracker) GetCostHistory(limit int) []CostMetadata {
	ct.mu.RLock()
	defer ct.mu.RUnlock()

	if limit <= 0 || limit > len(ct.costs) {
		return append([]CostMetadata{}, ct.costs...)
	}
	return append([]CostMetadata{}, ct.costs[len(ct.costs)-limit:]...)
}

// SetCostTags updates the cost center and project
func (ct *CostTracker) SetCostTags(costCenter, project string) {
	ct.mu.Lock()
	defer ct.mu.Unlock()
	ct.costCenter = costCenter
	ct.project = project
}

// BudgetManager manages budget limits and enforcement
type BudgetManager struct {
	mu                      sync.RWMutex
	monthlyLimitUSD         float64
	enforcementMode         BudgetEnforcementMode
	warningThresholdPercent float64
	hardLimitPercent        float64
	currentSpend            float64
	periodStart             time.Time

	warningCallbacks   []func(current, limit float64)
	hardLimitCallbacks []func(current, limit float64)
	softLimitCallbacks []func(current, limit float64)
}

// NewBudgetManager creates a new budget manager
func NewBudgetManager(config BudgetConfig) *BudgetManager {
	enforcementMode := config.EnforcementMode
	if enforcementMode == "" {
		enforcementMode = WarnMode
	}

	warningThreshold := config.WarningThresholdPercent
	if warningThreshold == 0 {
		warningThreshold = 80
	}

	hardLimit := config.HardLimitPercent
	if hardLimit == 0 {
		hardLimit = 100
	}

	return &BudgetManager{
		monthlyLimitUSD:         config.MonthlyLimitUSD,
		enforcementMode:         enforcementMode,
		warningThresholdPercent: warningThreshold,
		hardLimitPercent:        hardLimit,
		currentSpend:            0,
		periodStart:             time.Now(),
		warningCallbacks:        []func(current, limit float64){},
		hardLimitCallbacks:      []func(current, limit float64){},
		softLimitCallbacks:      []func(current, limit float64){},
	}
}

// CheckBudget checks if a cost can be incurred
func (bm *BudgetManager) CheckBudget(additionalCost float64) (bool, string) {
	bm.mu.RLock()
	projectedSpend := bm.currentSpend + additionalCost
	bm.mu.RUnlock()

	if bm.enforcementMode == HardLimit {
		if projectedSpend > bm.monthlyLimitUSD {
			msg := fmt.Sprintf("Hard budget limit exceeded: $%.2f > $%.2f",
				projectedSpend, bm.monthlyLimitUSD)
			bm.triggerHardLimit(projectedSpend)
			return false, msg
		}
	}

	percentUsed := 0.0
	if bm.monthlyLimitUSD > 0 {
		percentUsed = (projectedSpend / bm.monthlyLimitUSD) * 100
	}

	if percentUsed >= bm.hardLimitPercent {
		bm.triggerHardLimit(projectedSpend)
	}

	if percentUsed >= 100 && bm.enforcementMode == WarnMode {
		bm.triggerWarning(projectedSpend)
	}

	if percentUsed >= bm.warningThresholdPercent {
		bm.triggerWarning(projectedSpend)
	}

	return true, ""
}

// AddCost adds a cost to the current spend
func (bm *BudgetManager) AddCost(cost float64) {
	bm.mu.Lock()
	defer bm.mu.Unlock()
	bm.currentSpend += cost
}

// GetRemainingBudget returns the remaining budget
func (bm *BudgetManager) GetRemainingBudget() float64 {
	bm.mu.RLock()
	defer bm.mu.RUnlock()
	remaining := bm.monthlyLimitUSD - bm.currentSpend
	if remaining < 0 {
		return 0
	}
	return remaining
}

// GetUsagePercent returns the budget usage percentage
func (bm *BudgetManager) GetUsagePercent() float64 {
	bm.mu.RLock()
	defer bm.mu.RUnlock()
	if bm.monthlyLimitUSD <= 0 {
		return 0
	}
	percent := (bm.currentSpend / bm.monthlyLimitUSD) * 100
	if percent > 100 {
		return 100
	}
	return percent
}

// OnWarning registers a warning callback
func (bm *BudgetManager) OnWarning(callback func(current, limit float64)) {
	bm.mu.Lock()
	defer bm.mu.Unlock()
	bm.warningCallbacks = append(bm.warningCallbacks, callback)
}

// OnHardLimit registers a hard limit callback
func (bm *BudgetManager) OnHardLimit(callback func(current, limit float64)) {
	bm.mu.Lock()
	defer bm.mu.Unlock()
	bm.hardLimitCallbacks = append(bm.hardLimitCallbacks, callback)
}

// OnSoftLimit registers a soft limit callback
func (bm *BudgetManager) OnSoftLimit(callback func(current, limit float64)) {
	bm.mu.Lock()
	defer bm.mu.Unlock()
	bm.softLimitCallbacks = append(bm.softLimitCallbacks, callback)
}

func (bm *BudgetManager) triggerWarning(currentSpend float64) {
	bm.mu.RLock()
	callbacks := bm.warningCallbacks
	limit := bm.monthlyLimitUSD
	bm.mu.RUnlock()

	for _, cb := range callbacks {
		cb(currentSpend, limit)
	}
}

func (bm *BudgetManager) triggerHardLimit(currentSpend float64) {
	bm.mu.RLock()
	callbacks := bm.hardLimitCallbacks
	limit := bm.monthlyLimitUSD
	bm.mu.RUnlock()

	for _, cb := range callbacks {
		cb(currentSpend, limit)
	}
}

func (bm *BudgetManager) triggerSoftLimit(currentSpend float64) {
	bm.mu.RLock()
	callbacks := bm.softLimitCallbacks
	limit := bm.monthlyLimitUSD
	bm.mu.RUnlock()

	for _, cb := range callbacks {
		cb(currentSpend, limit)
	}
}

// RetryManager manages retry logic with exponential backoff
type RetryManager struct {
	strategy   RetryStrategy
	maxRetries int
	baseDelay  int
	maxDelay   int
	jitter     bool
}

// NewRetryManager creates a new retry manager
func NewRetryManager() *RetryManager {
	return &RetryManager{
		strategy:   ExponentialRetry,
		maxRetries: 3,
		baseDelay:  1000,
		maxDelay:   60000,
		jitter:     true,
	}
}

// getDelay calculates the delay for a retry attempt
func (rm *RetryManager) getDelay(attempt int) int {
	if rm.strategy == NoRetry {
		return 0
	}

	var delay int
	if rm.strategy == ExponentialRetry {
		delay = rm.baseDelay * int(math.Pow(2, float64(attempt)))
	} else {
		delay = rm.baseDelay * (attempt + 1)
	}

	if delay > rm.maxDelay {
		delay = rm.maxDelay
	}

	if rm.jitter {
		jitterAmount := int(float64(delay) * 0.5)
		delay = jitterAmount + rand.Intn(jitterAmount)
	}

	return delay
}

// shouldRetry determines if a request should be retried
func (rm *RetryManager) shouldRetry(attempt int, err error) bool {
	if attempt >= rm.maxRetries {
		return false
	}

	errStr := err.Error()
	retryableErrors := []string{
		"connection refused",
		"connection reset",
		"timeout",
		"host unreachable",
		"stream error",
	}

	for _, retryable := range retryableErrors {
		if bytes.Contains([]byte(errStr), []byte(retryable)) {
			return true
		}
	}

	return false
}

// Logger provides simple logging functionality
type Logger struct {
	mu    sync.Mutex
	level string
}

// NewLogger creates a new logger
func NewLogger() *Logger {
	return &Logger{level: "INFO"}
}

// SetLevel sets the logging level
func (l *Logger) SetLevel(level string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.level = level
}

// Debugf logs a debug message
func (l *Logger) Debugf(format string, args ...interface{}) {
	if l.level == "DEBUG" {
		fmt.Printf("[DEBUG] "+format+"\n", args...)
	}
}

// Infof logs an info message
func (l *Logger) Infof(format string, args ...interface{}) {
	fmt.Printf("[INFO] "+format+"\n", args...)
}

// Warnf logs a warning message
func (l *Logger) Warnf(format string, args ...interface{}) {
	fmt.Printf("[WARN] "+format+"\n", args...)
}

// Errorf logs an error message
func (l *Logger) Errorf(format string, args ...interface{}) {
	fmt.Printf("[ERROR] "+format+"\n", args...)
}

// Helper functions

// initializeModelPricing returns the model pricing map
func initializeModelPricing() map[string][2]float64 {
	return map[string][2]float64{
		"gpt-4":               {0.03, 0.06},
		"gpt-4-turbo":         {0.01, 0.03},
		"gpt-4o":              {0.005, 0.015},
		"gpt-3.5-turbo":       {0.0005, 0.0015},
		"claude-3-opus":       {0.015, 0.075},
		"claude-3-sonnet":     {0.003, 0.015},
		"claude-3-haiku":      {0.00025, 0.00125},
		"llama-2-7b":          {0.0008, 0.001},
		"llama-2-13b":         {0.0015, 0.002},
		"llama-2-70b":         {0.0075, 0.01},
	}
}

// generateRequestID generates a unique request ID
func generateRequestID(model string, messages []ChatCompletionMessage) string {
	content := fmt.Sprintf("%s:%v", model, messages)
	hash := sha256.Sum256([]byte(content))
	return "req_" + hex.EncodeToString(hash[:8])
}

// isRetryableStatus checks if an HTTP status code is retryable
func isRetryableStatus(statusCode int) bool {
	retryable := []int{429, 500, 502, 503}
	for _, code := range retryable {
		if statusCode == code {
			return true
		}
	}
	return false
}

// ═══════════════════════════════════════════════════════════════════
// INVOICE RECONCILIATION
// ═══════════════════════════════════════════════════════════════════

// ReconcileInvoice reconciles a single invoice
func (c *Client) ReconcileInvoice(invoice map[string]interface{}) (map[string]interface{}, error) {
	var result map[string]interface{}
	_, err := c.apiCall("POST", "/api/v1/invoices/reconcile", invoice, &result)
	return result, err
}

// BatchReconcileInvoices batch reconciles up to 100 invoices
func (c *Client) BatchReconcileInvoices(invoices []map[string]interface{}) (map[string]interface{}, error) {
	data := map[string]interface{}{"invoices": invoices}
	var result map[string]interface{}
	_, err := c.apiCall("POST", "/api/v1/invoices/reconcile/batch", data, &result)
	return result, err
}

// ParseInvoice parses invoice content
func (c *Client) ParseInvoice(invoice map[string]interface{}) (map[string]interface{}, error) {
	var result map[string]interface{}
	_, err := c.apiCall("POST", "/api/v1/invoices/parse", invoice, &result)
	return result, err
}

// ═══════════════════════════════════════════════════════════════════
// CLOSE PACKS
// ═══════════════════════════════════════════════════════════════════

// GenerateClosePack generates a close pack
func (c *Client) GenerateClosePack(data map[string]interface{}) (map[string]interface{}, error) {
	var result map[string]interface{}
	_, err := c.apiCall("POST", "/api/v1/close-packs/generate", data, &result)
	return result, err
}

// GetClosePackHistory retrieves close pack history
func (c *Client) GetClosePackHistory(limit int) (map[string]interface{}, error) {
	var result map[string]interface{}
	_, err := c.apiCall("GET", fmt.Sprintf("/api/v1/close-packs/history?limit=%d", limit), nil, &result)
	return result, err
}

// ExportClosePack exports a close pack in specified format
func (c *Client) ExportClosePack(packID, format string) (map[string]interface{}, error) {
	var result map[string]interface{}
	_, err := c.apiCall("GET", fmt.Sprintf("/api/v1/close-packs/%s/export?format=%s", packID, format), nil, &result)
	return result, err
}

// ═══════════════════════════════════════════════════════════════════
// BUDGET ENFORCEMENT
// ═══════════════════════════════════════════════════════════════════

// CheckBudget checks budget compliance
func (c *Client) CheckBudget(budgetData map[string]interface{}) (map[string]interface{}, error) {
	var result map[string]interface{}
	_, err := c.apiCall("POST", "/api/v1/budgets/check", budgetData, &result)
	return result, err
}

// ConfigureBudget configures budget settings
func (c *Client) ConfigureBudget(budgetConfig map[string]interface{}) (map[string]interface{}, error) {
	var result map[string]interface{}
	_, err := c.apiCall("POST", "/api/v1/budgets/configure", budgetConfig, &result)
	return result, err
}

// GetBudgetStatus retrieves budget status for a team
func (c *Client) GetBudgetStatus(team string) (map[string]interface{}, error) {
	var result map[string]interface{}
	_, err := c.apiCall("GET", fmt.Sprintf("/api/v1/budgets/status?team=%s", team), nil, &result)
	return result, err
}

// ═══════════════════════════════════════════════════════════════════
// COST ALLOCATION
// ═══════════════════════════════════════════════════════════════════

// AllocateCosts allocates costs across departments
func (c *Client) AllocateCosts(allocationData map[string]interface{}) (map[string]interface{}, error) {
	var result map[string]interface{}
	_, err := c.apiCall("POST", "/api/v1/cost-allocation/allocate", allocationData, &result)
	return result, err
}

// CreateAllocationRules creates cost allocation rules
func (c *Client) CreateAllocationRules(rules map[string]interface{}) (map[string]interface{}, error) {
	var result map[string]interface{}
	_, err := c.apiCall("POST", "/api/v1/cost-allocation/rules", rules, &result)
	return result, err
}

// GetCostAllocationDashboard retrieves cost allocation dashboard
func (c *Client) GetCostAllocationDashboard(costCenter, period string) (map[string]interface{}, error) {
	var result map[string]interface{}
	_, err := c.apiCall("GET", fmt.Sprintf("/api/v1/cost-allocation/dashboard/%s?period=%s", costCenter, period), nil, &result)
	return result, err
}

// ChargebackInvoice generates chargeback invoice
func (c *Client) ChargebackInvoice(invoiceData map[string]interface{}) (map[string]interface{}, error) {
	var result map[string]interface{}
	_, err := c.apiCall("POST", "/api/v1/cost-allocation/chargeback-invoice", invoiceData, &result)
	return result, err
}

// GenerateShowback generates showback report
func (c *Client) GenerateShowback(showbackData map[string]interface{}) (map[string]interface{}, error) {
	var result map[string]interface{}
	_, err := c.apiCall("POST", "/api/v1/cost-allocation/showback", showbackData, &result)
	return result, err
}

// ═══════════════════════════════════════════════════════════════════
// DATA RESIDENCY
// ═══════════════════════════════════════════════════════════════════

// GetDataResidencyRegion retrieves current data residency region
func (c *Client) GetDataResidencyRegion() (map[string]interface{}, error) {
	var result map[string]interface{}
	_, err := c.apiCall("GET", "/api/v1/data-residency/region", nil, &result)
	return result, err
}

// SetDataResidencyRegion sets data residency region
func (c *Client) SetDataResidencyRegion(regionData map[string]interface{}) (map[string]interface{}, error) {
	var result map[string]interface{}
	_, err := c.apiCall("POST", "/api/v1/data-residency/region", regionData, &result)
	return result, err
}

// ValidateDataTransfer validates data transfer compliance
func (c *Client) ValidateDataTransfer(transferData map[string]interface{}) (map[string]interface{}, error) {
	var result map[string]interface{}
	_, err := c.apiCall("POST", "/api/v1/data-residency/validate-transfer", transferData, &result)
	return result, err
}

// GetDataResidencyReport retrieves data residency compliance report
func (c *Client) GetDataResidencyReport() (map[string]interface{}, error) {
	var result map[string]interface{}
	_, err := c.apiCall("GET", "/api/v1/data-residency/report", nil, &result)
	return result, err
}

// ═══════════════════════════════════════════════════════════════════
// INFRASTRUCTURE
// ═══════════════════════════════════════════════════════════════════

// GetInfraHealth retrieves infrastructure health status
func (c *Client) GetInfraHealth() (map[string]interface{}, error) {
	var result map[string]interface{}
	_, err := c.apiCall("GET", "/api/v1/infra/health", nil, &result)
	return result, err
}

// ═══════════════════════════════════════════════════════════════════
// OBSERVABILITY
// ═══════════════════════════════════════════════════════════════════

// RecordObservability records observability data
func (c *Client) RecordObservability(data map[string]interface{}) (map[string]interface{}, error) {
	var result map[string]interface{}
	_, err := c.apiCall("POST", "/api/v1/observability/record", data, &result)
	return result, err
}

// GetObservabilityMetrics retrieves observability metrics
func (c *Client) GetObservabilityMetrics(period string) (map[string]interface{}, error) {
	var result map[string]interface{}
	_, err := c.apiCall("GET", fmt.Sprintf("/api/v1/observability/metrics?period=%s", period), nil, &result)
	return result, err
}

// GetObservabilityTraces retrieves observability traces
func (c *Client) GetObservabilityTraces(format string) (map[string]interface{}, error) {
	var result map[string]interface{}
	_, err := c.apiCall("GET", fmt.Sprintf("/api/v1/observability/traces?format=%s", format), nil, &result)
	return result, err
}

// ═══════════════════════════════════════════════════════════════════
// ROI MEASUREMENT
// ═══════════════════════════════════════════════════════════════════

// TrackOutcome tracks ROI outcome
func (c *Client) TrackOutcome(outcomeData map[string]interface{}) (map[string]interface{}, error) {
	var result map[string]interface{}
	_, err := c.apiCall("POST", "/api/v1/roi/track-outcome", outcomeData, &result)
	return result, err
}

// GetRoiDashboard retrieves ROI dashboard
func (c *Client) GetRoiDashboard(period string) (map[string]interface{}, error) {
	var result map[string]interface{}
	_, err := c.apiCall("GET", fmt.Sprintf("/api/v1/roi/dashboard?period=%s", period), nil, &result)
	return result, err
}

// GetRoiByProject retrieves ROI by project
func (c *Client) GetRoiByProject(months int) (map[string]interface{}, error) {
	var result map[string]interface{}
	_, err := c.apiCall("GET", fmt.Sprintf("/api/v1/roi/project?months=%d", months), nil, &result)
	return result, err
}

// BenchmarkRoi benchmarks ROI performance
func (c *Client) BenchmarkRoi(benchmarkData map[string]interface{}) (map[string]interface{}, error) {
	var result map[string]interface{}
	_, err := c.apiCall("POST", "/api/v1/roi/benchmark", benchmarkData, &result)
	return result, err
}

// ═══════════════════════════════════════════════════════════════════
// BENCHMARK PLATFORM
// ═══════════════════════════════════════════════════════════════════

// GetBenchmarkReport retrieves benchmark report
func (c *Client) GetBenchmarkReport() (map[string]interface{}, error) {
	var result map[string]interface{}
	_, err := c.apiCall("GET", "/api/v1/benchmarks/report", nil, &result)
	return result, err
}

// GetBenchmarkLeaderboard retrieves benchmark leaderboard
func (c *Client) GetBenchmarkLeaderboard(industry, metric string) (map[string]interface{}, error) {
	var result map[string]interface{}
	_, err := c.apiCall("GET", fmt.Sprintf("/api/v1/benchmarks/leaderboard/%s?metric=%s", industry, metric), nil, &result)
	return result, err
}

// SubmitBenchmark submits benchmark data
func (c *Client) SubmitBenchmark(benchmarkData map[string]interface{}) (map[string]interface{}, error) {
	var result map[string]interface{}
	_, err := c.apiCall("POST", "/api/v1/benchmarks/submit", benchmarkData, &result)
	return result, err
}

// GetBenchmarkInsights retrieves benchmark insights
func (c *Client) GetBenchmarkInsights(industry string) (map[string]interface{}, error) {
	var result map[string]interface{}
	_, err := c.apiCall("GET", fmt.Sprintf("/api/v1/benchmarks/insights/%s", industry), nil, &result)
	return result, err
}

// GetBenchmarkMaturity retrieves benchmark maturity assessment
func (c *Client) GetBenchmarkMaturity() (map[string]interface{}, error) {
	var result map[string]interface{}
	_, err := c.apiCall("GET", "/api/v1/benchmarks/maturity", nil, &result)
	return result, err
}

// LineScanner reads lines from a stream
type LineScanner struct {
	reader *io.Reader
	buf    *bytes.Buffer
	eof    bool
}

// NewLineScanner creates a new line scanner
func NewLineScanner(r io.Reader) *LineScanner {
	return &LineScanner{reader: &r, buf: &bytes.Buffer{}}
}

// Scan reads the next line
func (ls *LineScanner) Scan() bool {
	if ls.eof {
		return false
	}

	var line []byte
	for {
		chunk := make([]byte, 1)
		_, err := (*ls.reader).Read(chunk)
		if err == io.EOF {
			ls.eof = true
			if ls.buf.Len() > 0 {
				return true
			}
			return false
		}
		if err != nil {
			return false
		}

		if chunk[0] == '\n' {
			return true
		}
		ls.buf.WriteByte(chunk[0])
	}
}

// Text returns the current line
func (ls *LineScanner) Text() string {
	line := ls.buf.String()
	ls.buf.Reset()
	return line
}
