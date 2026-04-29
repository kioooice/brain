"use strict";

const { execFileSync } = require("node:child_process");
const { existsSync, rmSync } = require("node:fs");
const { join } = require("node:path");
const { clearWindowsReadOnlyAttributes } = require("./windows-attribute-utils.js");

function prepareWebpackStart(options = {}) {
  const projectDir = options.projectDir ?? process.cwd();
  const workspaceDir = options.workspaceDir ?? join(projectDir, "..");
  const pathExists = options.existsSync ?? existsSync;
  const removePath = options.rmSync ?? rmSync;
  const runCommand = options.execFileSync ?? execFileSync;
  const artifactDirs = [join(projectDir, ".webpack"), join(projectDir, "out"), join(workspaceDir, ".desktop-out")];
  let removedAny = false;

  for (const artifactDir of artifactDirs) {
    if (!pathExists(artifactDir)) {
      continue;
    }

    removedAny = true;

    try {
      clearWindowsReadOnlyAttributes(artifactDir, { execFileSync: runCommand });
    } catch {
      // Clearing attributes is best-effort; rmSync still handles the common case.
    }

    try {
      removePath(artifactDir, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 200,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Unable to clean ${artifactDir} before start. Close File Explorer previews or other apps using generated build output and retry. ${reason}`
      );
    }
  }

  return removedAny;
}

if (require.main === module) {
  prepareWebpackStart();
}

module.exports = {
  prepareWebpackStart,
};
