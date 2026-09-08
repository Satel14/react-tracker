// Calls sendBugReport with a stub response and prints what it answered, so a
// test can assert on the status and body without a server or a real send.
//
// STUB_REPLY, when set, is the JSON upstream reply to fake: `{ status, body }`.
// Installed on global fetch before the SDK is loaded, so nothing touches the
// network. Left unset, the controller runs against whatever the environment
// really has -- which is how the unconfigured case is exercised.
if (process.env.STUB_REPLY) {
  const reply = JSON.parse(process.env.STUB_REPLY);
  globalThis.fetch = async () =>
    new Response(JSON.stringify(reply.body), {
      status: reply.status,
      headers: { "content-type": "application/json" },
    });
}

const controller = require("../../controllers/email.js");

const res = {
  code: null,
  body: null,
  status(code) {
    this.code = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
};

controller
  .sendBugReport({ body: { description: "the map does not load" } }, res)
  .then(() => console.log(JSON.stringify({ code: res.code, body: res.body })));
