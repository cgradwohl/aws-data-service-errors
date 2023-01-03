import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  GetCommandInput,
  PutCommand,
  PutCommandInput,
  PutCommandOutput,
} from "@aws-sdk/lib-dynamodb";
import { NativeAttributeValue } from "@aws-sdk/util-dynamodb";
import { StandardRetryStrategy } from "@aws-sdk/middleware-retry";

import {
  DynamoDBErrorFactory,
  CourierErrorConsumer,
  CourierBaseError,
} from "../errors";

export interface CourierDynamoItemKey {
  pk: string;
  sk?: string;
  gsi1pk?: string;
  gsi1sk?: string;
  gsi2pk?: string;
  gsi2sk?: string;
  gsi3pk?: string;
  gsi3sk?: string;
}

export class CourierDynamoClientFactory {
  protected tableName: string;
  protected errorFactory: DynamoDBErrorFactory;
  protected errorConsumer: CourierErrorConsumer<
    CourierBaseError,
    DynamoDBErrorFactory
  >;
  protected client: DynamoDBDocumentClient;

  constructor(tableName: string) {
    this.errorFactory = new DynamoDBErrorFactory();
    this.errorConsumer = new CourierErrorConsumer(this.errorFactory);

    if (!tableName) {
      this.errorConsumer.logAndThrow({
        error: new Error("TableName Not Found."),
        name: "MissingTableNameError",
        context: {},
      });
    }

    // TODO: read maxAttempts from config
    const maxAttempts = async () => 25;

    // pass this config per instance
    this.client = DynamoDBDocumentClient.from(
      new DynamoDBClient({
        logger: console,
        region: "us-east-1",
        maxAttempts: maxAttempts,
        retryStrategy: new StandardRetryStrategy(maxAttempts, {
          retryDecider: this.errorFactory.retryDecider,
          delayDecider: this.errorFactory.delayDecider,
        }),
      })
    );

    this.tableName = tableName;
  }

  public async put<T extends Record<string, NativeAttributeValue> | undefined>(
    args: Omit<PutCommandInput, "Item" | "TableName"> & { Item: T }
  ): Promise<PutCommandOutput | undefined> {
    try {
      const command = new PutCommand({
        ...args,
        TableName: this.tableName,
      });

      const result = await this.client.send(command);

      return result;
    } catch (error) {
      this.errorConsumer.logAndThrow({
        context: {},
        error,
        name: "FailedPutItemError",
      });
    }
  }

  public async get<T>(
    args: Omit<GetCommandInput, "TableName">
  ): Promise<T | undefined> {
    try {
      const command = new GetCommand({
        ...args,
        TableName: this.tableName,
      });
      const result = await this.client.send(command);

      if (!result.Item) {
        throw new Error("Dynamo Item Not Found.");
      }

      return result.Item as T;
    } catch (error) {
      this.errorConsumer.logAndThrow({
        context: {},
        error,
        name: "FailedGetItemError",
      });
    }
  }
}

// messages table service
interface Message {
  messageId: string;
  tenantId: string;
}

interface MessageItemKey extends CourierDynamoItemKey {
  pk: `${string}/${string}`;
  sk: `${string}/${string}`;
}

type MessageItem = Message & MessageItemKey;

// need to be able to specify retry config here?
const MessagesTable = new CourierDynamoClientFactory(
  "process.env.MessagesTable"
);

function primaryKey({ messageId, tenantId }: Message): MessageItemKey {
  return {
    pk: `${tenantId}/${messageId}`,
    sk: `${tenantId}/${messageId}`,
  };
}

// now this table specific method will throw Courier classified error
const getMessage = async (key: MessageItemKey) => {
  const message = await MessagesTable.get<MessageItem>({
    Key: key,
  });

  return message;
};

const putMessage = async (message: Message) => {
  const result = await MessagesTable.put<MessageItem>({
    Item: { ...primaryKey(message), ...message }, // TODO: use item constructor to format key
  });

  return result;
};
