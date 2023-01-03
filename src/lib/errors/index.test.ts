import { DynamoDBErrorFactory } from ".";
describe("dynamo db base error", () => {
  const factory = new DynamoDBErrorFactory();
  it("should throw error", () => {
    const error = factory.create({
      context: {},
      error: new Error("NOOP"),
      name: "TestNameError",
    });

    error.log();
  });
});
