#!/usr/bin/env ruby
# frozen_string_literal: true

require 'net/http'
require 'json'
require 'digest/sha2'
require 'time'
require 'set'

module Finault
  # API version for user-agent headers
  VERSION = '1.0.0'

  # Retry strategy enum
  module RetryStrategy
    EXPONENTIAL = 'exponential'
    LINEAR = 'linear'
    NONE = 'none'
  end

  # Budget enforcement modes
  module BudgetEnforcementMode
    WARN = 'warn'
    SOFT_LIMIT = 'soft_limit'
    HARD_LIMIT = 'hard_limit'
  end

  # Custom error classes
  class FinaultError < StandardError; end
  class BudgetExceededError < FinaultError; end
  class FailoverError < FinaultError; end
  class RetryableError < FinaultError; end

  # Logger utility for level-based logging
  class Logger
    LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 }.freeze

    # @param level [Symbol] Logging level (:DEBUG, :INFO, :WARN, :ERROR)
    def initialize(level = :INFO)
      @log_level = LEVELS[level] || LEVELS[:INFO]
    end

    # Log debug message
    # @param message [String] Message to log
    # @param data [Object] Optional data to log
    def debug(message, data = nil)
      log(0, "[DEBUG]", message, data)
    end

    # Log info message
    # @param message [String] Message to log
    # @param data [Object] Optional data to log
    def info(message, data = nil)
      log(1, "[INFO]", message, data)
    end

    # Log warning message
    # @param message [String] Message to log
    # @param data [Object] Optional data to log
    def warn(message, data = nil)
      log(2, "[WARN]", message, data)
    end

    # Log error message
    # @param message [String] Message to log
    # @param error [Object] Optional error to log
    def error(message, error = nil)
      log(3, "[ERROR]", message, error)
    end

    private

    def log(level, prefix, message, data)
      return unless level >= @log_level

      if data
        puts "#{prefix} #{message} #{data.inspect}"
      else
        puts "#{prefix} #{message}"
      end
    end
  end

  # Cost tracking with token counting and pricing
  class CostTracker
    # @param cost_center [String] Cost center identifier
    # @param project [String] Project identifier
    def initialize(cost_center: '', project: '')
      @cost_center = cost_center
      @project = project
      @costs = []
      @model_pricing = load_pricing
    end

    # Calculate cost for a request
    # @param model [String] Model name
    # @param prompt_tokens [Integer] Number of prompt tokens
    # @param completion_tokens [Integer] Number of completion tokens
    # @return [Float] Cost in USD
    def calculate_cost(model, prompt_tokens, completion_tokens)
      pricing = @model_pricing[model] || [0.001, 0.002]
      prompt_cost, completion_cost = pricing

      cost = (prompt_tokens * prompt_cost / 1000.0) + (completion_tokens * completion_cost / 1000.0)
      (cost * 1_000_000).round / 1_000_000.0
    end

    # Track a cost event
    # @param model [String] Model name
    # @param prompt_tokens [Integer] Prompt tokens
    # @param completion_tokens [Integer] Completion tokens
    # @param request_id [String, nil] Request ID
    # @param user_id [String, nil] User ID
    # @return [Hash] Cost metadata
    def track_cost(model, prompt_tokens, completion_tokens, request_id: nil, user_id: nil)
      cost_usd = calculate_cost(model, prompt_tokens, completion_tokens)
      total_tokens = prompt_tokens + completion_tokens

      metadata = {
        model: model,
        prompt_tokens: prompt_tokens,
        completion_tokens: completion_tokens,
        total_tokens: total_tokens,
        cost_usd: cost_usd,
        timestamp: Time.now.iso8601,
        request_id: request_id,
        cost_center: @cost_center,
        project: @project,
        user_id: user_id
      }

      @costs << metadata
      metadata
    end

    # Get total accumulated cost
    # @return [Float] Total cost in USD
    def total_cost
      @costs.sum { |c| c[:cost_usd] }
    end

    # Get costs grouped by model
    # @return [Hash] Model => total cost mapping
    def costs_by_model
      @costs.group_by { |c| c[:model] }
        .transform_values { |group| group.sum { |c| c[:cost_usd] } }
    end

    # Get costs grouped by project
    # @return [Hash] Project => total cost mapping
    def costs_by_project
      @costs.group_by { |c| c[:project] }
        .transform_values { |group| group.sum { |c| c[:cost_usd] } }
    end

    # Get cost history
    # @param limit [Integer, nil] Maximum number of entries
    # @return [Array<Hash>] List of cost metadata
    def cost_history(limit: nil)
      limit ? @costs.last(limit) : @costs.dup
    end

    # Update cost center and project tags
    # @param cost_center [String] Cost center
    # @param project [String] Project
    def set_cost_tags(cost_center, project)
      @cost_center = cost_center
      @project = project
    end

    private

    def load_pricing
      {
        'gpt-4' => [0.03, 0.06],
        'gpt-4-turbo' => [0.01, 0.03],
        'gpt-4o' => [0.005, 0.015],
        'gpt-3.5-turbo' => [0.0005, 0.0015],
        'claude-3-opus' => [0.015, 0.075],
        'claude-3-sonnet' => [0.003, 0.015],
        'claude-3-haiku' => [0.00025, 0.00125],
        'llama-2-7b' => [0.0008, 0.001],
        'llama-2-13b' => [0.0015, 0.002],
        'llama-2-70b' => [0.0075, 0.01]
      }
    end
  end

  # Budget management with enforcement modes and callbacks
  class BudgetManager
    # @param config [Hash] Budget configuration
    # @option config [Float] :monthly_limit_usd Monthly budget limit
    # @option config [Symbol] :enforcement_mode Enforcement mode (warn, soft_limit, hard_limit)
    # @option config [Float] :warning_threshold_percent Percentage to warn at
    # @option config [Float] :hard_limit_percent Percentage for hard limit
    # @option config [Integer] :reset_day Day of month to reset
    def initialize(config = {})
      @monthly_limit_usd = config[:monthly_limit_usd] || 0
      @enforcement_mode = config[:enforcement_mode] || BudgetEnforcementMode::WARN
      @warning_threshold_percent = config[:warning_threshold_percent] || 80
      @hard_limit_percent = config[:hard_limit_percent] || 100
      @reset_day = config[:reset_day] || 1
      @current_spend = 0.0
      @period_start = Time.now
      @callbacks = {
        on_warning: [],
        on_hard_limit: [],
        on_soft_limit: []
      }
    end

    # Register warning callback
    # @yield [current, limit] Current spend and limit
    def on_warning(&block)
      @callbacks[:on_warning] << block
    end

    # Register hard limit callback
    # @yield [current, limit] Current spend and limit
    def on_hard_limit(&block)
      @callbacks[:on_hard_limit] << block
    end

    # Register soft limit callback
    # @yield [current, limit] Current spend and limit
    def on_soft_limit(&block)
      @callbacks[:on_soft_limit] << block
    end

    # Check if additional cost would exceed budget
    # @param additional_cost [Float] Cost to check
    # @return [Array<Boolean, String, nil>] [can_proceed, error_message]
    def check_budget(additional_cost)
      projected_spend = @current_spend + additional_cost

      if @enforcement_mode == BudgetEnforcementMode::HARD_LIMIT
        if projected_spend > @monthly_limit_usd
          msg = "Hard budget limit exceeded: $#{projected_spend.round(2)} > $#{@monthly_limit_usd.round(2)}"
          trigger_callback(:on_hard_limit, projected_spend)
          return [false, msg]
        end
      end

      percent_used = @monthly_limit_usd > 0 ? (projected_spend / @monthly_limit_usd * 100) : 0

      trigger_callback(:on_hard_limit, projected_spend) if percent_used >= @hard_limit_percent
      trigger_callback(:on_warning, projected_spend) if percent_used >= @warning_threshold_percent

      [true, nil]
    end

    # Add cost to current spend
    # @param cost [Float] Cost to add
    def add_cost(cost)
      @current_spend += cost
    end

    # Get remaining budget
    # @return [Float] Remaining budget in USD
    def remaining_budget
      [@monthly_limit_usd - @current_spend, 0].max
    end

    # Get usage percentage
    # @return [Float] Percentage of budget used
    def usage_percent
      @monthly_limit_usd > 0 ? [@current_spend / @monthly_limit_usd * 100, 100].min : 0
    end

    private

    def trigger_callback(callback_type, current_spend)
      @callbacks[callback_type].each do |callback|
        callback.call(current_spend, @monthly_limit_usd)
      rescue StandardError => e
        puts "Error in #{callback_type} callback: #{e.message}"
      end
    end
  end

  # Retry logic with exponential/linear backoff
  class RetryManager
    # @param strategy [Symbol] Retry strategy (exponential, linear, none)
    # @param max_retries [Integer] Maximum retry attempts
    # @param base_delay [Integer] Base delay in milliseconds
    # @param max_delay [Integer] Maximum delay in milliseconds
    # @param jitter [Boolean] Add random jitter to delays
    def initialize(strategy: RetryStrategy::EXPONENTIAL, max_retries: 3, base_delay: 1000, max_delay: 60000, jitter: true)
      @strategy = strategy
      @max_retries = max_retries
      @base_delay = base_delay
      @max_delay = max_delay
      @jitter = jitter
    end

    # Get delay for attempt
    # @param attempt [Integer] Attempt number (0-indexed)
    # @return [Integer] Delay in milliseconds
    def get_delay(attempt)
      return 0 if @strategy == RetryStrategy::NONE

      delay = case @strategy
              when RetryStrategy::EXPONENTIAL
                @base_delay * (2 ** attempt)
              when RetryStrategy::LINEAR
                @base_delay * (attempt + 1)
              else
                @base_delay
              end

      delay = [@max_delay, delay].min
      delay = (delay * (0.5 + rand)).to_i if @jitter
      delay
    end

    # Check if should retry after error
    # @param attempt [Integer] Attempt number
    # @param error [StandardError] Error that occurred
    # @return [Boolean] Whether to retry
    def should_retry?(attempt, error)
      return false if attempt >= @max_retries

      retryable_errors = [
        'ECONNREFUSED',
        'ECONNRESET',
        'ETIMEDOUT',
        'EHOSTUNREACH',
        'Timeout::Error'
      ]

      retryable_errors.any? { |e| error.to_s.include?(e) } || error.is_a?(Timeout::Error)
    end

    # Getter for max_retries
    attr_reader :max_retries
  end

  # Failover management for provider fallbacks
  class FailoverManager
    # @param config [Hash] Failover configuration
    # @option config [Array] :fallback_providers List of fallback providers
    # @option config [Integer] :retry_count Retry count
    # @option config [Integer] :timeout_seconds Request timeout
    # @option config [Boolean] :enabled Enable failover
    def initialize(config = {})
      @fallback_providers = config[:fallback_providers] || []
      @retry_count = config[:retry_count] || 3
      @timeout_seconds = config[:timeout_seconds] || 30
      @enabled = config.fetch(:enabled, true)
      @provider_health = {}
    end

    # Get next provider to try
    # @param primary_provider [String] Primary provider name
    # @param attempted_providers [Array, nil] Already tried providers
    # @return [String, nil] Next provider name or nil
    def get_next_provider(primary_provider, attempted_providers = nil)
      return nil unless @enabled && @fallback_providers.any?

      attempted = attempted_providers || [primary_provider]

      @fallback_providers.each do |provider_config|
        provider_name = provider_config[:name] || provider_config['name'] || ''
        next if attempted.include?(provider_name)
        return provider_name if @provider_health[provider_name] != false
      end

      nil
    end

    # Mark provider as unhealthy
    # @param provider_name [String] Provider name
    def mark_unhealthy(provider_name)
      @provider_health[provider_name] = false
    end

    # Mark provider as healthy
    # @param provider_name [String] Provider name
    def mark_healthy(provider_name)
      @provider_health[provider_name] = true
    end
  end

  # HTTP client with retry and streaming support
  class HttpClient
    # @param base_url [String] Base API URL
    # @param api_key [String] API key for authentication
    # @param timeout [Integer] Request timeout in seconds
    # @param logger [Logger] Logger instance
    def initialize(base_url:, api_key:, timeout: 30, logger: nil)
      @base_url = base_url
      @api_key = api_key
      @timeout = timeout
      @logger = logger || Logger.new(:INFO)
    end

    # Make POST request
    # @param path [String] API endpoint path
    # @param body [Hash] Request body
    # @param stream [Boolean] Enable streaming
    # @yield [chunk] Block for streaming chunks
    # @return [Hash] Response body
    def post(path, body: {}, stream: false, &block)
      url = "#{@base_url}#{path}"
      uri = URI.parse(url)

      req = Net::HTTP::Post.new(uri.path)
      req['Authorization'] = "Bearer #{@api_key}"
      req['Content-Type'] = 'application/json'
      req['User-Agent'] = "Finault-Ruby/#{VERSION}"
      req.body = JSON.generate(body)

      http = Net::HTTP.new(uri.host, uri.port)
      http.use_ssl = uri.scheme == 'https'
      http.read_timeout = @timeout

      if stream && block
        http.request(req) do |response|
          parse_streaming_response(response, &block)
        end
      else
        response = http.request(req)
        parse_response(response)
      end
    end

    private

    def parse_response(response)
      case response.code.to_i
      when 200..299
        JSON.parse(response.body) rescue { 'raw' => response.body }
      when 429, 500, 502, 503
        raise RetryableError, "HTTP #{response.code}: #{response.body}"
      else
        raise FinaultError, "HTTP #{response.code}: #{response.body}"
      end
    end

    def parse_streaming_response(response)
      case response.code.to_i
      when 200..299
        buffer = ''
        response.read_body do |chunk|
          buffer += chunk
          lines = buffer.split("\n")
          buffer = lines.pop || ''

          lines.each do |line|
            next if line.empty? || line.start_with?(':')
            if line.start_with?('data: ')
              data = line[6..]
              next if data == '[DONE]'
              parsed = JSON.parse(data) rescue nil
              yield parsed if parsed
            end
          end
        end

        lines = buffer.split("\n")
        lines.each do |line|
          next if line.empty? || line.start_with?(':')
          if line.start_with?('data: ')
            data = line[6..]
            next if data == '[DONE]'
            parsed = JSON.parse(data) rescue nil
            yield parsed if parsed
          end
        end
      when 429, 500, 502, 503
        raise RetryableError, "HTTP #{response.code}"
      else
        raise FinaultError, "HTTP #{response.code}"
      end
    end
  end

  # Main Finault API client
  class Client
    # @param api_key [String] Finault API key
    # @param cost_center [String] Cost center identifier
    # @param project [String] Project identifier
    # @param base_url [String] API base URL
    # @param budget_config [Hash] Budget configuration
    # @param retry_strategy [Symbol] Retry strategy
    # @param max_retries [Integer] Maximum retries
    # @param base_delay [Integer] Base retry delay in ms
    # @param max_delay [Integer] Max retry delay in ms
    # @param timeout [Integer] Request timeout in seconds
    # @param log_level [Symbol] Logging level
    def initialize(api_key:, cost_center: '', project: '', base_url: 'https://api.finault.io',
                   budget_config: nil, retry_strategy: RetryStrategy::EXPONENTIAL,
                   max_retries: 3, base_delay: 1000, max_delay: 60000, timeout: 30, log_level: :INFO)
      @api_key = api_key || ENV['FINAULT_API_KEY']
      raise FinaultError, 'API key required' unless @api_key

      @cost_center = cost_center
      @project = project
      @base_url = base_url
      @timeout = timeout
      @logger = Logger.new(log_level)

      # Initialize managers
      @cost_tracker = CostTracker.new(cost_center: cost_center, project: project)
      @budget_manager = BudgetManager.new(budget_config) if budget_config
      @retry_manager = RetryManager.new(
        strategy: retry_strategy,
        max_retries: max_retries,
        base_delay: base_delay,
        max_delay: max_delay
      )
      @failover_manager = FailoverManager.new
      @http_client = HttpClient.new(
        base_url: base_url,
        api_key: api_key,
        timeout: timeout,
        logger: @logger
      )
    end

    # Chat completion (OpenAI-compatible)
    # @param messages [Array<Hash>] Message array with role and content
    # @param model [String] Model name
    # @param temperature [Float] Sampling temperature
    # @param max_tokens [Integer] Max response tokens
    # @param stream [Boolean] Enable streaming
    # @param user [String] User identifier
    # @yield [chunk] Block for streaming chunks
    # @return [Hash] Chat completion response
    def chat(messages:, model: 'gpt-4o', temperature: nil, max_tokens: nil, stream: false, user: nil, &block)
      request_id = generate_request_id(model, messages)

      # Check budget before request
      if @budget_manager
        estimated_cost = @cost_tracker.calculate_cost(model, 100, 100)
        can_proceed, error_msg = @budget_manager.check_budget(estimated_cost)
        raise BudgetExceededError, error_msg || 'Budget exceeded' unless can_proceed
      end

      # Build request body
      body = {
        model: model,
        messages: messages,
        stream: stream
      }
      body[:temperature] = temperature if temperature
      body[:max_tokens] = max_tokens if max_tokens
      body[:user] = user if user

      # Execute with retry
      execute_with_retry('/chat/completions', body, stream: stream, request_id: request_id, &block)
    end

    # Estimate carbon emissions
    # @param model [String] Model name
    # @param tokens [Integer] Number of tokens
    # @return [Hash] Emissions data
    def estimate_emissions(model:, tokens:)
      body = { model: model, tokens: tokens }
      execute_request('/carbon/estimate-emissions', body)
    end

    # Get sustainability scorecard
    # @param time_period [String] Time period for scorecard
    # @return [Hash] Sustainability metrics
    def get_sustainability_scorecard(time_period: 'monthly')
      body = { time_period: time_period }
      execute_request('/carbon/sustainability-scorecard', body)
    end

    # Analyze contract
    # @param contract_text [String] Contract content
    # @param contract_type [String] Type of contract
    # @return [Hash] Analysis results
    def analyze_contract(contract_text:, contract_type: nil)
      body = { contract_text: contract_text, contract_type: contract_type }
      execute_request('/procurement/analyze-contract', body)
    end

    # Identify savings opportunities
    # @param vendor_data [Hash] Vendor information
    # @return [Hash] Savings recommendations
    def identify_savings(vendor_data:)
      body = { vendor_data: vendor_data }
      execute_request('/procurement/identify-savings', body)
    end

    # Detect disputes
    # @param invoice_id [String] Invoice identifier
    # @return [Hash] Dispute detection results
    def detect_disputes(invoice_id:)
      body = { invoice_id: invoice_id }
      execute_request('/disputes/detect', body)
    end

    # Build evidence for disputes
    # @param dispute_id [String] Dispute identifier
    # @return [Hash] Evidence data
    def build_evidence(dispute_id:)
      body = { dispute_id: dispute_id }
      execute_request('/disputes/build-evidence', body)
    end

    # Run Monte Carlo forecast
    # @param parameters [Hash] Forecast parameters
    # @param simulations [Integer] Number of simulations
    # @return [Hash] Forecast results
    def run_monte_carlo(parameters:, simulations: 1000)
      body = { parameters: parameters, simulations: simulations }
      execute_request('/forecast-engine/monte-carlo', body)
    end

    # Generate forecast scenarios
    # @param variables [Array] Variables to forecast
    # @return [Hash] Scenario data
    def generate_scenarios(variables:)
      body = { variables: variables }
      execute_request('/forecast-engine/scenarios', body)
    end

    # Scan for regulatory requirements
    # @param jurisdiction [String] Geographic jurisdiction
    # @param industry [String] Industry sector
    # @return [Hash] Regulatory requirements
    def scan_regulations(jurisdiction:, industry: nil)
      body = { jurisdiction: jurisdiction, industry: industry }
      execute_request('/regulatory/scan', body)
    end

    # Assess compliance gap
    # @param requirements [Array] Compliance requirements
    # @param current_state [Hash] Current system state
    # @return [Hash] Compliance gap analysis
    def assess_compliance_gap(requirements:, current_state:)
      body = { requirements: requirements, current_state: current_state }
      execute_request('/regulatory/assess-gap', body)
    end

    # Log audit event
    # @param event_type [String] Type of event
    # @param event_data [Hash] Event details
    # @return [Hash] Audit response
    def log_event(event_type:, event_data:)
      body = { event_type: event_type, event_data: event_data }
      execute_request('/audit/log-event', body)
    end

    # Detect anomalies
    # @param data_points [Array] Data to analyze
    # @param threshold [Float] Anomaly threshold
    # @return [Hash] Anomaly detection results
    def detect_anomalies(data_points:, threshold: 0.95)
      body = { data_points: data_points, threshold: threshold }
      execute_request('/analytics/detect-anomalies', body)
    end

    # Learn patterns
    # @param historical_data [Array] Historical data
    # @return [Hash] Pattern analysis
    def learn_patterns(historical_data:)
      body = { historical_data: historical_data }
      execute_request('/analytics/learn-patterns', body)
    end

    # Analyze cost drivers
    # @param cost_data [Hash] Cost information
    # @return [Hash] Driver analysis
    def analyze_drivers(cost_data:)
      body = { cost_data: cost_data }
      execute_request('/analytics/analyze-drivers', body)
    end

    # Find optimization opportunities
    # @param current_spend [Float] Current spending
    # @return [Hash] Optimization recommendations
    def find_optimizations(current_spend:)
      body = { current_spend: current_spend }
      execute_request('/optimization/find', body)
    end

    # Apply optimization
    # @param optimization_id [String] Optimization identifier
    # @return [Hash] Application results
    def apply_optimization(optimization_id:)
      body = { optimization_id: optimization_id }
      execute_request('/optimization/apply', body)
    end

    # Run forecast
    # @param forecast_model [String] Model to use
    # @param input_data [Hash] Input data
    # @return [Hash] Forecast results
    def forecast(forecast_model:, input_data:)
      body = { forecast_model: forecast_model, input_data: input_data }
      execute_request('/forecast/run', body)
    end

    # Budget analysis
    # @param budget_data [Hash] Budget information
    # @return [Hash] Analysis results
    def budget_analysis(budget_data:)
      body = { budget_data: budget_data }
      execute_request('/budget/analyze', body)
    end

    # Check compliance
    # @param policies [Array] Policies to check
    # @return [Hash] Compliance check results
    def check_compliance(policies:)
      body = { policies: policies }
      execute_request('/compliance/check', body)
    end

    # Get compliance violations
    # @param filter [Hash] Filter criteria
    # @return [Hash] Violations list
    def get_violations(filter: {})
      body = { filter: filter }
      execute_request('/compliance/violations', body)
    end

    # Register budget warning callback
    # @yield [current, limit] Current spend and limit
    def on_budget_warning(&block)
      @budget_manager&.on_warning(&block)
    end

    # Register budget exceeded callback
    # @yield [current, limit] Current spend and limit
    def on_budget_exceeded(&block)
      @budget_manager&.on_hard_limit(&block)
    end

    # Register soft limit callback
    # @yield [current, limit] Current spend and limit
    def on_budget_soft_limit(&block)
      @budget_manager&.on_soft_limit(&block)
    end

    # Get total accumulated cost
    # @return [Float] Total cost in USD
    def total_cost
      @cost_tracker.total_cost
    end

    # Get costs by model
    # @return [Hash] Model => cost mapping
    def costs_by_model
      @cost_tracker.costs_by_model
    end

    # Get costs by project
    # @return [Hash] Project => cost mapping
    def costs_by_project
      @cost_tracker.costs_by_project
    end

    # Get cost history
    # @param limit [Integer, nil] Number of entries
    # @return [Array<Hash>] Cost entries
    def cost_history(limit: nil)
      @cost_tracker.cost_history(limit: limit)
    end

    # Get remaining budget
    # @return [Float] Remaining budget in USD
    def remaining_budget
      @budget_manager&.remaining_budget || Float::INFINITY
    end

    # Get budget usage percentage
    # @return [Float] Percentage of budget used
    def budget_usage_percent
      @budget_manager&.usage_percent || 0.0
    end

    # Update cost center and project tags
    # @param cost_center [String] Cost center identifier
    # @param project [String] Project identifier
    def set_cost_tags(cost_center, project)
      @cost_center = cost_center
      @project = project
      @cost_tracker.set_cost_tags(cost_center, project)
      @logger.info("Updated cost tags: #{cost_center}/#{project}")
    end

    # Internal: Get cost tracker
    # @return [CostTracker]
    attr_reader :cost_tracker

    # Internal: Get budget manager
    # @return [BudgetManager, nil]
    attr_reader :budget_manager

    private

    def execute_request(path, body)
      attempt = 0
      last_error = nil

      loop do
        begin
          response = @http_client.post(path, body: body)
          return response
        rescue RetryableError => e
          last_error = e
          @logger.warn("Attempt #{attempt + 1} failed: #{e.message}")

          return false unless @retry_manager.should_retry?(attempt, e)

          delay = @retry_manager.get_delay(attempt)
          @logger.info("Retrying in #{delay}ms...")
          sleep(delay / 1000.0)
          attempt += 1
        rescue FinaultError => e
          raise e
        end
      end
    end

    def execute_with_retry(path, body, stream: false, request_id: nil)
      attempt = 0
      last_error = nil
      prompt_tokens = 0
      completion_tokens = 0

      loop do
        begin
          if stream && block_given?
            @http_client.post(path, body: body, stream: true) do |chunk|
              yield chunk

              if chunk && chunk['usage']
                prompt_tokens = chunk['usage']['prompt_tokens'] || 0
                completion_tokens = chunk['usage']['completion_tokens'] || 0
              end
            end

            # Track cost after streaming
            if completion_tokens > 0 || prompt_tokens > 0
              model = body[:model]
              metadata = @cost_tracker.track_cost(model, prompt_tokens, completion_tokens,
                                                 request_id: request_id)
              @budget_manager&.add_cost(metadata[:cost_usd])
              @logger.info("Streamed request #{request_id}: #{prompt_tokens} prompt + #{completion_tokens} completion tokens ($#{metadata[:cost_usd].round(6)})")
            end
            return
          else
            response = @http_client.post(path, body: body)

            # Track cost
            if response['usage']
              prompt_tokens = response['usage']['prompt_tokens'] || 0
              completion_tokens = response['usage']['completion_tokens'] || 0
              model = response['model'] || body[:model]

              metadata = @cost_tracker.track_cost(model, prompt_tokens, completion_tokens,
                                                 request_id: request_id)
              @budget_manager&.add_cost(metadata[:cost_usd])
              @logger.info("Request #{request_id}: #{prompt_tokens} prompt + #{completion_tokens} completion tokens ($#{metadata[:cost_usd].round(6)})")
            end

            return response
          end
        rescue RetryableError => e
          last_error = e
          @logger.warn("Attempt #{attempt + 1} failed: #{e.message}")

          return false unless @retry_manager.should_retry?(attempt, e)

          delay = @retry_manager.get_delay(attempt)
          @logger.info("Retrying in #{delay}ms...")
          sleep(delay / 1000.0)
          attempt += 1
        rescue FinaultError => e
          raise e
        end
      end
    end

    # ═══════════════════════════════════════════════════════════════════
    # INVOICE RECONCILIATION
    # ═══════════════════════════════════════════════════════════════════

    # Reconcile a single invoice
    # @param invoice [Hash] Invoice data
    # @return [Hash] Reconciliation result
    def reconcile_invoice(invoice)
      execute_request('/api/v1/invoices/reconcile', invoice)
    end

    # Batch reconcile up to 100 invoices
    # @param invoices [Array<Hash>] Array of invoices
    # @return [Hash] Batch reconciliation result
    def batch_reconcile_invoices(invoices)
      execute_request('/api/v1/invoices/reconcile/batch', { invoices: invoices })
    end

    # Parse invoice content
    # @param invoice [Hash] Invoice data
    # @return [Hash] Parsed invoice
    def parse_invoice(invoice)
      execute_request('/api/v1/invoices/parse', invoice)
    end

    # ═══════════════════════════════════════════════════════════════════
    # CLOSE PACKS
    # ═══════════════════════════════════════════════════════════════════

    # Generate a close pack
    # @param data [Hash] Close pack data
    # @return [Hash] Generated close pack
    def generate_close_pack(data)
      execute_request('/api/v1/close-packs/generate', data)
    end

    # Get close pack history
    # @param limit [Integer] Maximum number of records
    # @return [Hash] Close pack history
    def get_close_pack_history(limit = 10)
      execute_request("/api/v1/close-packs/history?limit=#{limit}", nil)
    end

    # Export a close pack
    # @param pack_id [String] Close pack ID
    # @param format [String] Export format
    # @return [Hash] Exported close pack
    def export_close_pack(pack_id, format = 'json')
      execute_request("/api/v1/close-packs/#{pack_id}/export?format=#{format}", nil)
    end

    # ═══════════════════════════════════════════════════════════════════
    # BUDGET ENFORCEMENT
    # ═══════════════════════════════════════════════════════════════════

    # Check budget compliance
    # @param budget_data [Hash] Budget data
    # @return [Hash] Budget check result
    def check_budget(budget_data)
      execute_request('/api/v1/budgets/check', budget_data)
    end

    # Configure budget settings
    # @param budget_config [Hash] Budget configuration
    # @return [Hash] Configuration result
    def configure_budget(budget_config)
      execute_request('/api/v1/budgets/configure', budget_config)
    end

    # Get budget status
    # @param team [String] Team identifier
    # @return [Hash] Budget status
    def get_budget_status(team = 'default')
      execute_request("/api/v1/budgets/status?team=#{team}", nil)
    end

    # ═══════════════════════════════════════════════════════════════════
    # COST ALLOCATION
    # ═══════════════════════════════════════════════════════════════════

    # Allocate costs across departments
    # @param allocation_data [Hash] Allocation data
    # @return [Hash] Allocation result
    def allocate_costs(allocation_data)
      execute_request('/api/v1/cost-allocation/allocate', allocation_data)
    end

    # Create cost allocation rules
    # @param rules [Hash] Allocation rules
    # @return [Hash] Rule creation result
    def create_allocation_rules(rules)
      execute_request('/api/v1/cost-allocation/rules', rules)
    end

    # Get cost allocation dashboard
    # @param cost_center [String] Cost center identifier
    # @param period [String] Time period
    # @return [Hash] Dashboard data
    def get_cost_allocation_dashboard(cost_center = 'default', period = 'current_month')
      execute_request("/api/v1/cost-allocation/dashboard/#{cost_center}?period=#{period}", nil)
    end

    # Generate chargeback invoice
    # @param invoice_data [Hash] Invoice data
    # @return [Hash] Chargeback invoice
    def chargeback_invoice(invoice_data)
      execute_request('/api/v1/cost-allocation/chargeback-invoice', invoice_data)
    end

    # Generate showback report
    # @param showback_data [Hash] Showback data
    # @return [Hash] Showback report
    def generate_showback(showback_data)
      execute_request('/api/v1/cost-allocation/showback', showback_data)
    end

    # ═══════════════════════════════════════════════════════════════════
    # DATA RESIDENCY
    # ═══════════════════════════════════════════════════════════════════

    # Get current data residency region
    # @return [Hash] Current region
    def get_data_residency_region
      execute_request('/api/v1/data-residency/region', nil)
    end

    # Set data residency region
    # @param region_data [Hash] Region data
    # @return [Hash] Update result
    def set_data_residency_region(region_data)
      execute_request('/api/v1/data-residency/region', region_data)
    end

    # Validate data transfer compliance
    # @param transfer_data [Hash] Transfer data
    # @return [Hash] Validation result
    def validate_data_transfer(transfer_data)
      execute_request('/api/v1/data-residency/validate-transfer', transfer_data)
    end

    # Get data residency compliance report
    # @return [Hash] Compliance report
    def get_data_residency_report
      execute_request('/api/v1/data-residency/report', nil)
    end

    # ═══════════════════════════════════════════════════════════════════
    # INFRASTRUCTURE
    # ═══════════════════════════════════════════════════════════════════

    # Get infrastructure health status
    # @return [Hash] Health status
    def get_infra_health
      execute_request('/api/v1/infra/health', nil)
    end

    # ═══════════════════════════════════════════════════════════════════
    # OBSERVABILITY
    # ═══════════════════════════════════════════════════════════════════

    # Record observability data
    # @param data [Hash] Observability data
    # @return [Hash] Record result
    def record_observability(data)
      execute_request('/api/v1/observability/record', data)
    end

    # Get observability metrics
    # @param period [String] Time period
    # @return [Hash] Metrics data
    def get_observability_metrics(period = '24h')
      execute_request("/api/v1/observability/metrics?period=#{period}", nil)
    end

    # Get observability traces
    # @param format [String] Output format
    # @return [Hash] Traces data
    def get_observability_traces(format = 'json')
      execute_request("/api/v1/observability/traces?format=#{format}", nil)
    end

    # ═══════════════════════════════════════════════════════════════════
    # ROI MEASUREMENT
    # ═══════════════════════════════════════════════════════════════════

    # Track ROI outcome
    # @param outcome_data [Hash] Outcome data
    # @return [Hash] Tracking result
    def track_outcome(outcome_data)
      execute_request('/api/v1/roi/track-outcome', outcome_data)
    end

    # Get ROI dashboard
    # @param period [String] Time period
    # @return [Hash] Dashboard data
    def get_roi_dashboard(period = '30d')
      execute_request("/api/v1/roi/dashboard?period=#{period}", nil)
    end

    # Get ROI by project
    # @param months [Integer] Number of months
    # @return [Hash] ROI data
    def get_roi_by_project(months = 6)
      execute_request("/api/v1/roi/project?months=#{months}", nil)
    end

    # Benchmark ROI performance
    # @param benchmark_data [Hash] Benchmark data
    # @return [Hash] Benchmark result
    def benchmark_roi(benchmark_data)
      execute_request('/api/v1/roi/benchmark', benchmark_data)
    end

    # ═══════════════════════════════════════════════════════════════════
    # BENCHMARK PLATFORM
    # ═══════════════════════════════════════════════════════════════════

    # Get benchmark report
    # @return [Hash] Benchmark report
    def get_benchmark_report
      execute_request('/api/v1/benchmarks/report', nil)
    end

    # Get benchmark leaderboard
    # @param industry [String] Industry identifier
    # @param metric [String] Metric to rank by
    # @return [Hash] Leaderboard data
    def get_benchmark_leaderboard(industry, metric = 'costEfficiency')
      execute_request("/api/v1/benchmarks/leaderboard/#{industry}?metric=#{metric}", nil)
    end

    # Submit benchmark data
    # @param benchmark_data [Hash] Benchmark data
    # @return [Hash] Submission result
    def submit_benchmark(benchmark_data)
      execute_request('/api/v1/benchmarks/submit', benchmark_data)
    end

    # Get benchmark insights
    # @param industry [String] Industry identifier
    # @return [Hash] Insights data
    def get_benchmark_insights(industry)
      execute_request("/api/v1/benchmarks/insights/#{industry}", nil)
    end

    # Get benchmark maturity assessment
    # @return [Hash] Maturity assessment
    def get_benchmark_maturity
      execute_request('/api/v1/benchmarks/maturity', nil)
    end

    def generate_request_id(model, messages)
      content = "#{model}:#{JSON.generate(messages)}"
      hash = Digest::SHA256.hexdigest(content)
      "req_#{hash[0..15]}"
    end
  end
end
