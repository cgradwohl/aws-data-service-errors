import { highlight } from "cli-highlight";
import { DynamoDBErrorFactory } from "./lib/errors";

const foo = () => {
  const error = new DynamoDBErrorFactory().create({
    name: "FailedWriteError",
    error: new Error("foo"),
    context: {
      tenantId: "12345",
      messageId: "12345",
    },
  });

  // error.log();

  throw error;
};
foo();
