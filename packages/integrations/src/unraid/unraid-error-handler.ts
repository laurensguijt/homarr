import { ResponseError } from "@homarr/common/server";

import type { IIntegrationErrorHandler } from "../base/errors/handler";
import { integrationFetchHttpErrorHandler } from "../base/errors/http";
import { IntegrationResponseError } from "../base/errors/http/integration-response-error";
import type { IntegrationError, IntegrationErrorData } from "../base/errors/integration-error";

export class UnraidApiErrorHandler implements IIntegrationErrorHandler {
  handleError(error: unknown, integration: IntegrationErrorData): IntegrationError | undefined {
    if (!(error instanceof Error)) return undefined;
    if (error.cause && error.cause instanceof TypeError) {
      return integrationFetchHttpErrorHandler.handleError(error.cause, integration);
    }

    // Handle common HTTP errors from Unraid API
    if (error.message.includes("401") || error.message.includes("Unauthorized"))
      return new IntegrationResponseError(integration, { cause: new ResponseError({ status: 401 }, { cause: error }) });
    if (error.message.includes("403") || error.message.includes("Forbidden"))
      return new IntegrationResponseError(integration, { cause: new ResponseError({ status: 403 }, { cause: error }) });
    if (error.message.includes("404") || error.message.includes("Not Found"))
      return new IntegrationResponseError(integration, { cause: new ResponseError({ status: 404 }, { cause: error }) });
    if (error.message.includes("500") || error.message.includes("Internal Server Error"))
      return new IntegrationResponseError(integration, { cause: new ResponseError({ status: 500 }, { cause: error }) });

    // Try to extract status code from error message
    const statusCodeMatch = /(\d{3})/.exec(error.message);
    if (statusCodeMatch) {
      const statusCode = parseInt(statusCodeMatch[1]!, 10);
      if (statusCode >= 400 && statusCode < 600) {
        return new IntegrationResponseError(integration, {
          cause: new ResponseError({ status: statusCode }, { cause: error }),
        });
      }
    }

    return undefined;
  }
}

