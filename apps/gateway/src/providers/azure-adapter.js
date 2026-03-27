/**
 * Azure OpenAI Provider Adapter
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { OpenAIAdapter } from './openai-adapter.js';

export class AzureAdapter extends OpenAIAdapter {
  constructor(env) {
    super(env);
    this.name = 'azure';
    this.resourceName = env.AZURE_OPENAI_RESOURCE_NAME || '';
    this.deploymentName = env.AZURE_OPENAI_DEPLOYMENT_NAME || '';
    this.baseUrl = `https://${this.resourceName}.openai.azure.com/openai/deployments/${this.deploymentName}`;
  }

  formatAuth(apiKey) {
    return {
      'api-key': apiKey
    };
  }

  transformRequest(request) {
    // Azure uses slightly different format
    const transformed = super.transformRequest(request);

    return {
      ...transformed,
      api_version: '2023-05-15'
    };
  }

  validate(config) {
    const errors = super.validate(config);

    if (!this.resourceName) {
      errors.push('Azure resource name is required');
    }

    if (!this.deploymentName) {
      errors.push('Azure deployment name is required');
    }

    return errors;
  }

  getRateLimits() {
    return {
      requestsPerMinute: 3500,
      tokensPerMinute: 90000,
      region: this.resourceName
    };
  }
}

export default AzureAdapter;
