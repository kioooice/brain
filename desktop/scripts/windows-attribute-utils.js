"use strict";

const { execFileSync } = require("node:child_process");

function clearWindowsReadOnlyAttributes(targetPath, options = {}) {
  if (process.platform !== "win32") {
    return;
  }

  const runCommand = options.execFileSync ?? execFileSync;
  runCommand("attrib", ["-R", targetPath, "/S", "/D"], { stdio: "ignore" });
}

module.exports = {
  clearWindowsReadOnlyAttributes,
};
