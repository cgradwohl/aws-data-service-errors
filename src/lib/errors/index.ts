import { DynamoDBServiceException } from "@aws-sdk/client-dynamodb";
import {
  DelayDecider,
  RetryDecider,
} from "@aws-sdk/middleware-retry/dist-types/types";
import makeError from "make-error";

const isErrorWithMessage = (error: unknown): error is Error => {
  return (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as Record<string, unknown>).message === "string"
  );
};

const toErrorWithMessage = (maybeError: unknown): Error => {
  if (isErrorWithMessage(maybeError)) return maybeError;

  try {
    return new Error(JSON.stringify(maybeError));
  } catch {
    // fallback in case there's an error stringifying the maybeError
    // i.e. circular references
    return new Error(String(maybeError));
  }
};

export const getErrorMessage = (error: unknown) => {
  return toErrorWithMessage(error).message;
};

interface CourierBaseErrorConstructorParams extends CourierErrorFactoryParams {
  retryable: boolean;
}
const CourierBaseErrorConstructor = makeError("CourierBaseError");

export class CourierBaseError extends CourierBaseErrorConstructor {
  public context: Record<string, string>;
  public name: string;
  public retryable: boolean;
  public stackTrace: string | undefined;

  constructor(params: CourierBaseErrorConstructorParams) {
    super(getErrorMessage(params.error));

    this.context = params.context;
    this.name = params.name;
    this.retryable = params.retryable;
    this.stackTrace = (params.error as Error).stack ?? undefined;
  }

  public log() {
    console.error(this);
  }
}

export class DynamoDBError extends CourierBaseError {
  constructor(params: CourierBaseErrorConstructorParams) {
    super(params);
  }
}

interface CourierErrorFactoryParams {
  context: Record<any, any>;
  error: unknown;
  name: string;
}

export abstract class CourierErrorFactory<T extends CourierBaseError> {
  protected abstract RetryableErrorSet: Set<string>;
  public abstract delayDecider: DelayDecider;
  public abstract retryDecider: RetryDecider;
  public abstract create(
    params: CourierErrorFactoryParams,
    retryable: boolean
  ): T;
}

interface Foo {
  (bar: string): void;
}

const foo: Foo = (bar: string) => undefined;

export class DynamoDBErrorFactory extends CourierErrorFactory<DynamoDBError> {
  protected RetryableErrorSet: Set<string> = new Set([
    "ItemCollectionSizeLimitExceededException",
    "LimitExceededException",
    "ProvisionedThroughputExceeded",
    "ProvisionedThroughputExceededException",
    "RequestLimitExceeded",
    "ThrottlingException",
    "UnrecognizedClientException",
  ]);

  public delayDecider = (delayBase: number, attempts: number) => {
    return 100;
  };

  public retryDecider = (error: unknown) => {
    if (error instanceof DynamoDBServiceException) {
      const statusCode = error?.$response?.statusCode;

      switch (statusCode) {
        case 400:
          if (this.RetryableErrorSet.has(error.name)) {
            return true;
          } else {
            return false;
          }

        case 500:
          return true;

        case 503:
          return true;

        default:
          return false;
      }
    }

    return false;
  };

  // public retryDecider(error: unknown) {
  //   if (error instanceof DynamoDBServiceException) {
  //     const statusCode = error?.$response?.statusCode;

  //     switch (statusCode) {
  //       case 400:
  //         if (this.RetryableErrorSet.has(error.name)) {
  //           return true;
  //         } else {
  //           return false;
  //         }

  //       case 500:
  //         return true;

  //       case 503:
  //         return true;

  //       default:
  //         return false;
  //     }
  //   } else {
  //     return false;
  //   }
  // }

  public create(params: CourierErrorFactoryParams, retryable: boolean) {
    return new DynamoDBError({ ...params, retryable });
  }
}

export class CourierErrorConsumer<
  T extends CourierBaseError,
  U extends CourierErrorFactory<T>
> {
  public factory: U;

  constructor(factory: U) {
    this.factory = factory;
  }

  public logAndThrow(params: CourierErrorFactoryParams) {
    const { context, error, name } = params;

    // classify error
    const retryable = this.factory.retryDecider(error);

    const factoryError = this.factory.create(
      {
        name,
        error,
        context,
      },
      retryable
    );

    factoryError.log();

    throw factoryError;
  }
}
