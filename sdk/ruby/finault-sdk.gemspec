Gem::Specification.new do |spec|
  spec.name          = "finault-sdk"
  spec.version       = "1.0.0"
  spec.authors       = ["Finault Inc."]
  spec.email         = ["sdk@finault.ai"]

  spec.summary       = "Official Finault AgentOS Ruby SDK"
  spec.description   = "AI cost governance, invoice reconciliation, and FinOps automation for Ruby applications"
  spec.homepage      = "https://docs.finault.ai/sdk/ruby"
  spec.license       = "MIT"
  spec.required_ruby_version = ">= 3.0.0"

  spec.metadata["homepage_uri"]    = spec.homepage
  spec.metadata["source_code_uri"] = "https://github.com/finault/sdk-ruby"
  spec.metadata["bug_tracker_uri"] = "https://github.com/finault/sdk-ruby/issues"
  spec.metadata["documentation_uri"] = "https://docs.finault.ai/sdk/ruby"
  spec.metadata["changelog_uri"]   = "https://github.com/finault/sdk-ruby/blob/main/CHANGELOG.md"

  spec.files = Dir["lib/**/*", "LICENSE", "README.md"]
  spec.require_paths = ["lib"]

  spec.add_dependency "faraday", ">= 2.0", "< 3.0"
  spec.add_dependency "faraday-retry", "~> 2.0"

  spec.add_development_dependency "rspec", "~> 3.12"
  spec.add_development_dependency "webmock", "~> 3.18"
  spec.add_development_dependency "rubocop", "~> 1.50"
  spec.add_development_dependency "yard", "~> 0.9"
end
