// Registers the whole route graph on a bare express app -- the line server.js
// runs -- and exits 0 if every module on it loaded. Spawned by
// test/optionalCredentials.test.js with one credential stripped from the
// environment.
//
// A fixture rather than a `node -e` string because requireResolution.test.js
// scans every .js file for require() literals: a probe embedded in a test as
// source text reads to it as a broken require. .cjs is not scanned, and here
// the requires are real ones that resolve from this file.
const express = require("express");
const routes = require("../../routes.js");

routes(express());
