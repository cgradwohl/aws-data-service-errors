import { highlight } from "cli-highlight";
const foo = () => {
  const message = {
    foo: "bar",
    baz: {
      bar: {
        boo: "bang!",
      },
    },
  };
  console.log(message);
  console.log(highlight(JSON.stringify(message, null, 2)));
};
foo();
