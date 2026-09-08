const { test } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");
const bodyParser = require("body-parser");

// express 4.22.2 declares `qs: ~6.15.1`, so it has never been released against
// the 6.16.0 that closes GHSA-4mjr-xmp4-gh2g and GHSA-x5fp-wj9c-mxmx. An
// `overrides` entry in package.json hands it that version anyway. This is the
// guard that makes the override safe: qs is what parses every query string and
// every urlencoded body this API receives, so a parsing change would land on
// the request path of every endpoint rather than somewhere we would notice.
const request = (app, { path, body }) =>
  new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const req = http.request(
        {
          port: server.address().port,
          path,
          method: body ? "POST" : "GET",
          headers: body ? { "content-type": "application/x-www-form-urlencoded" } : {},
        },
        (res) => {
          let raw = "";
          res.on("data", (c) => { raw += c; });
          res.on("end", () => {
            server.close();
            resolve(JSON.parse(raw));
          });
        }
      );
      req.on("error", (e) => { server.close(); reject(e); });
      if (body) req.write(body);
      req.end();
    });
  });

const echoApp = () => {
  const app = express();
  app.use(bodyParser.urlencoded({ extended: true }));
  app.get("/echo", (req, res) => res.json(req.query));
  app.post("/echo", (req, res) => res.json(req.body));
  return app;
};

test("the extended query parser still reads a flat query string", async () => {
  const got = await request(echoApp(), { path: "/echo?shard=steam&name=Player" });
  assert.deepEqual(got, { shard: "steam", name: "Player" });
});

test("the extended query parser still reads nested and repeated keys", async () => {
  // This is the whole reason the parser is `extended` rather than `simple`:
  // bracket syntax and repeated keys have to keep producing objects and arrays.
  const got = await request(echoApp(), { path: "/echo?a[b]=1&list=x&list=y" });
  assert.deepEqual(got, { a: { b: "1" }, list: ["x", "y"] });
});

test("urlencoded bodies still parse, nesting included", async () => {
  const got = await request(echoApp(), { path: "/echo", body: "p1=steam%3AA&slot[0]=one" });
  assert.deepEqual(got, { p1: "steam:A", slot: ["one"] });
});

test("query parsing does not pollute Object.prototype", async () => {
  // qs has shipped prototype-pollution fixes more than once, and an override
  // that silently reverted one would be worse than the advisory it closed.
  const got = await request(echoApp(), { path: "/echo?__proto__[polluted]=yes" });
  assert.equal({}.polluted, undefined);
  assert.equal(Object.prototype.polluted, undefined);
  assert.equal(got.polluted, undefined);
});
