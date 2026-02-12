/**
 * Request Validation Middleware for Finault Gateway
 *
 * Provides comprehensive validation schemas and validation functions for all API endpoints.
 * Supports field type validation, array length constraints, enum validation, and format validation.
 */

/**
 * Validation schemas for all POST endpoints
 */
const validationSchemas = {
  '/v1/parse': {
    fields: {
      file: {
        type: 'object',
        required: true,
        description: 'File object to parse'
      },
      provider: {
        type: 'string',
        required: false,
        description: 'Optional provider identifier'
      }
    }
  },

  '/v1/allocate': {
    fields: {
      lineItems: {
        type: 'array',
        required: true,
        itemType: 'object',
        description: 'Array of line items to allocate'
      },
      rules: {
        type: 'array',
        required: false,
        itemType: 'object',
        description: 'Optional allocation rules'
      }
    }
  },

  '/v1/close-pack/generate': {
    fields: {
      invoiceData: {
        type: 'object',
        required: true,
        requiredFields: ['invoiceNumber', 'amount', 'date', 'vendor'],
        description: 'Invoice data with required fields'
      },
      allocations: {
        type: 'object',
        required: true,
        description: 'Allocation mapping object'
      }
    }
  },

  '/v1/erp/connect': {
    fields: {
      type: {
        type: 'enum',
        required: true,
        allowedValues: ['SAP', 'Oracle', 'NetSuite', 'Dynamics365', 'QuickBooks', 'Xero'],
        description: 'ERP system type'
      },
      credentials: {
        type: 'object',
        required: true,
        requiredFields: ['username', 'password'],
        description: 'ERP connection credentials'
      }
    }
  },

  '/v1/erp/push': {
    fields: {
      journalEntry: {
        type: 'object',
        required: true,
        requiredFields: ['companyCode', 'documentDate', 'postingDate', 'accounts', 'amount'],
        description: 'Journal entry object with required fields'
      }
    }
  },

  '/v1/invoices': {
    fields: {
      content: {
        type: 'string',
        required: true,
        minLength: 1,
        description: 'Invoice content/data'
      },
      provider: {
        type: 'string',
        required: true,
        minLength: 1,
        description: 'Invoice provider identifier'
      },
      organization_id: {
        type: 'uuid',
        required: true,
        description: 'Organization UUID identifier'
      }
    }
  },

  '/v1/invoices/bulk': {
    fields: {
      invoices: {
        type: 'array',
        required: true,
        itemType: 'object',
        maxItems: 100,
        minItems: 1,
        description: 'Array of invoices (max 100)'
      }
    }
  },

  '/v1/rules': {
    fields: {
      name: {
        type: 'string',
        required: true,
        minLength: 1,
        maxLength: 255,
        description: 'Rule name'
      },
      conditions: {
        type: 'array',
        required: true,
        itemType: 'object',
        minItems: 1,
        description: 'Array of conditions'
      },
      actions: {
        type: 'array',
        required: true,
        itemType: 'object',
        minItems: 1,
        description: 'Array of actions'
      }
    }
  },

  '/v1/budgets': {
    fields: {
      name: {
        type: 'string',
        required: true,
        minLength: 1,
        maxLength: 255,
        description: 'Budget name'
      },
      amount: {
        type: 'number',
        required: true,
        min: 0,
        description: 'Budget amount'
      },
      period: {
        type: 'enum',
        required: true,
        allowedValues: ['monthly', 'quarterly', 'annual'],
        description: 'Budget period'
      },
      cost_center: {
        type: 'string',
        required: true,
        minLength: 1,
        description: 'Cost center identifier'
      }
    }
  }
};

/**
 * Validation utility functions
 */
const validators = {
  /**
   * Check if value is a valid UUID v4
   */
  isValidUUID: (value) => {
    const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return typeof value === 'string' && uuidV4Regex.test(value);
  },

  /**
   * Check if value is a valid email
   */
  isValidEmail: (value) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return typeof value === 'string' && emailRegex.test(value);
  },

  /**
   * Check if value is a valid date in yyyy-MM-dd format
   */
  isValidDate: (value) => {
    if (typeof value !== 'string') return false;
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(value)) return false;
    const date = new Date(value);
    return date instanceof Date && !isNaN(date);
  },

  /**
   * Check if value is a valid ISO 8601 datetime
   */
  isValidDateTime: (value) => {
    if (typeof value !== 'string') return false;
    const date = new Date(value);
    return date instanceof Date && !isNaN(date) && value === date.toISOString();
  },

  /**
   * Check if value is of expected type
   */
  isOfType: (value, type) => {
    switch (type) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number' && !isNaN(value);
      case 'boolean':
        return typeof value === 'boolean';
      case 'array':
        return Array.isArray(value);
      case 'object':
        return value !== null && typeof value === 'object' && !Array.isArray(value);
      case 'uuid':
        return validators.isValidUUID(value);
      case 'email':
        return validators.isValidEmail(value);
      case 'date':
        return validators.isValidDate(value);
      case 'datetime':
        return validators.isValidDateTime(value);
      default:
        return false;
    }
  },

  /**
   * Validate an enum value
   */
  isValidEnum: (value, allowedValues) => {
    return allowedValues.includes(value);
  }
};

/**
 * Validates a single field against its schema
 */
function validateField(fieldName, fieldValue, fieldSchema) {
  const errors = [];

  // Check if required field is missing
  if (fieldSchema.required && (fieldValue === undefined || fieldValue === null)) {
    errors.push(`Field '${fieldName}' is required`);
    return errors;
  }

  // If field is optional and not provided, skip further validation
  if (!fieldSchema.required && (fieldValue === undefined || fieldValue === null)) {
    return errors;
  }

  // Type validation
  if (!validators.isOfType(fieldValue, fieldSchema.type)) {
    errors.push(`Field '${fieldName}' must be of type ${fieldSchema.type}, received ${typeof fieldValue}`);
    return errors;
  }

  // Enum validation
  if (fieldSchema.type === 'enum') {
    if (!validators.isValidEnum(fieldValue, fieldSchema.allowedValues)) {
      errors.push(`Field '${fieldName}' must be one of: ${fieldSchema.allowedValues.join(', ')}, received '${fieldValue}'`);
    }
    return errors;
  }

  // String length validation
  if (fieldSchema.type === 'string') {
    if (fieldSchema.minLength && fieldValue.length < fieldSchema.minLength) {
      errors.push(`Field '${fieldName}' must have minimum length of ${fieldSchema.minLength}`);
    }
    if (fieldSchema.maxLength && fieldValue.length > fieldSchema.maxLength) {
      errors.push(`Field '${fieldName}' must have maximum length of ${fieldSchema.maxLength}`);
    }
  }

  // Number validation
  if (fieldSchema.type === 'number') {
    if (fieldSchema.min !== undefined && fieldValue < fieldSchema.min) {
      errors.push(`Field '${fieldName}' must be greater than or equal to ${fieldSchema.min}`);
    }
    if (fieldSchema.max !== undefined && fieldValue > fieldSchema.max) {
      errors.push(`Field '${fieldName}' must be less than or equal to ${fieldSchema.max}`);
    }
  }

  // Array validation
  if (fieldSchema.type === 'array') {
    if (fieldSchema.minItems && fieldValue.length < fieldSchema.minItems) {
      errors.push(`Field '${fieldName}' must have at least ${fieldSchema.minItems} item(s)`);
    }
    if (fieldSchema.maxItems && fieldValue.length > fieldSchema.maxItems) {
      errors.push(`Field '${fieldName}' must have at most ${fieldSchema.maxItems} item(s)`);
    }

    // Validate array item types
    if (fieldSchema.itemType) {
      fieldValue.forEach((item, index) => {
        if (!validators.isOfType(item, fieldSchema.itemType)) {
          errors.push(`Field '${fieldName}[${index}]' must be of type ${fieldSchema.itemType}`);
        }
      });
    }
  }

  // Object required fields validation
  if (fieldSchema.type === 'object' && fieldSchema.requiredFields) {
    if (typeof fieldValue !== 'object' || fieldValue === null) {
      errors.push(`Field '${fieldName}' must be an object`);
    } else {
      fieldSchema.requiredFields.forEach((requiredField) => {
        if (fieldValue[requiredField] === undefined || fieldValue[requiredField] === null) {
          errors.push(`Field '${fieldName}.${requiredField}' is required`);
        }
      });
    }
  }

  return errors;
}

/**
 * Main validation function for request bodies
 *
 * @param {string} schemaName - The endpoint path (e.g., '/v1/parse')
 * @param {object} requestBody - The request body to validate
 * @returns {object} { valid: boolean, errors: string[] }
 */
function validateRequest(schemaName, requestBody) {
  const errors = [];

  // Check if schema exists
  if (!validationSchemas[schemaName]) {
    return {
      valid: false,
      errors: [`Unknown schema: ${schemaName}`]
    };
  }

  // Ensure request body is an object
  if (!requestBody || typeof requestBody !== 'object' || Array.isArray(requestBody)) {
    return {
      valid: false,
      errors: ['Request body must be a valid JSON object']
    };
  }

  const schema = validationSchemas[schemaName];

  // Validate each field defined in schema
  Object.keys(schema.fields).forEach((fieldName) => {
    const fieldSchema = schema.fields[fieldName];
    const fieldValue = requestBody[fieldName];
    const fieldErrors = validateField(fieldName, fieldValue, fieldSchema);
    errors.push(...fieldErrors);
  });

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validates query parameters for GET endpoints
 *
 * @param {string} paramName - Name of the parameter
 * @param {string} paramValue - Value to validate
 * @param {string} paramType - Expected type: 'uuid', 'date', 'enum', etc.
 * @param {object} options - Additional validation options (allowedValues for enum)
 * @returns {object} { valid: boolean, errors: string[] }
 */
function validateQueryParams(paramName, paramValue, paramType, options = {}) {
  const errors = [];

  // Check if value is empty
  if (paramValue === undefined || paramValue === null || paramValue === '') {
    return {
      valid: false,
      errors: [`Query parameter '${paramName}' is required`]
    };
  }

  switch (paramType) {
    case 'uuid':
      if (!validators.isValidUUID(paramValue)) {
        errors.push(`Query parameter '${paramName}' must be a valid UUID`);
      }
      break;

    case 'date':
      if (!validators.isValidDate(paramValue)) {
        errors.push(`Query parameter '${paramName}' must be in yyyy-MM-dd format`);
      }
      break;

    case 'datetime':
      if (!validators.isValidDateTime(paramValue)) {
        errors.push(`Query parameter '${paramName}' must be a valid ISO 8601 datetime`);
      }
      break;

    case 'enum':
      if (!options.allowedValues || !Array.isArray(options.allowedValues)) {
        errors.push(`Enum validation misconfigured for '${paramName}'`);
      } else if (!validators.isValidEnum(paramValue, options.allowedValues)) {
        errors.push(`Query parameter '${paramName}' must be one of: ${options.allowedValues.join(', ')}`);
      }
      break;

    case 'string':
      if (typeof paramValue !== 'string') {
        errors.push(`Query parameter '${paramName}' must be a string`);
      }
      if (options.minLength && paramValue.length < options.minLength) {
        errors.push(`Query parameter '${paramName}' must have minimum length of ${options.minLength}`);
      }
      if (options.maxLength && paramValue.length > options.maxLength) {
        errors.push(`Query parameter '${paramName}' must have maximum length of ${options.maxLength}`);
      }
      break;

    case 'number':
      const num = Number(paramValue);
      if (isNaN(num)) {
        errors.push(`Query parameter '${paramName}' must be a valid number`);
      } else {
        if (options.min !== undefined && num < options.min) {
          errors.push(`Query parameter '${paramName}' must be greater than or equal to ${options.min}`);
        }
        if (options.max !== undefined && num > options.max) {
          errors.push(`Query parameter '${paramName}' must be less than or equal to ${options.max}`);
        }
      }
      break;

    case 'email':
      if (!validators.isValidEmail(paramValue)) {
        errors.push(`Query parameter '${paramName}' must be a valid email address`);
      }
      break;

    default:
      errors.push(`Unknown parameter type: ${paramType}`);
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Batch validation for multiple query parameters
 *
 * @param {object} queryParams - Query parameters object
 * @param {object} paramDefinitions - Parameter definitions with type and options
 * @returns {object} { valid: boolean, errors: string[] }
 */
function validateQueryParamsBatch(queryParams, paramDefinitions) {
  const errors = [];

  Object.keys(paramDefinitions).forEach((paramName) => {
    const definition = paramDefinitions[paramName];
    const paramValue = queryParams[paramName];

    if (definition.required && (paramValue === undefined || paramValue === null || paramValue === '')) {
      errors.push(`Query parameter '${paramName}' is required`);
      return;
    }

    if (!definition.required && (paramValue === undefined || paramValue === null || paramValue === '')) {
      return;
    }

    const validation = validateQueryParams(paramName, paramValue, definition.type, definition.options || {});
    errors.push(...validation.errors);
  });

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Express middleware for automatic request validation
 *
 * @param {string} schemaName - The endpoint schema name
 * @returns {function} Express middleware function
 */
function createValidationMiddleware(schemaName) {
  return (req, res, next) => {
    const validation = validateRequest(schemaName, req.body);

    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: 'Request validation failed',
        errors: validation.errors
      });
    }

    next();
  };
}

// Export public API
module.exports = {
  // Validation schemas
  validationSchemas,

  // Core validation functions
  validateRequest,
  validateQueryParams,
  validateQueryParamsBatch,

  // Utility functions
  createValidationMiddleware,
  validators,

  // Helper function to get schema
  getSchema: (schemaName) => {
    return validationSchemas[schemaName] || null;
  },

  // Helper function to list all available schemas
  listSchemas: () => {
    return Object.keys(validationSchemas);
  },

  // Helper function to validate and get detailed schema info
  getSchemaInfo: (schemaName) => {
    const schema = validationSchemas[schemaName];
    if (!schema) {
      return null;
    }

    return {
      endpoint: schemaName,
      fields: Object.keys(schema.fields).map((fieldName) => {
        const field = schema.fields[fieldName];
        return {
          name: fieldName,
          type: field.type,
          required: field.required,
          description: field.description,
          constraints: {
            minLength: field.minLength,
            maxLength: field.maxLength,
            min: field.min,
            max: field.max,
            minItems: field.minItems,
            maxItems: field.maxItems,
            allowedValues: field.allowedValues,
            itemType: field.itemType,
            requiredFields: field.requiredFields
          }
        };
      })
    };
  }
};
