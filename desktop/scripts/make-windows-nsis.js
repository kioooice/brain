"use strict";

const { execFileSync } = require("node:child_process");
const { existsSync } = require("node:fs");
const { join } = require("node:path");
const { prepareWebpackStart } = require("./prepare-start.js");

function runNodeScript(scriptPath, args, options) {
  const runCommand = options.execFileSync ?? execFileSync;
  runCommand(process.execPath, [scriptPath, ...args], {
    cwd: options.projectDir,
    stdio: "inherit",
  });
}

function makeWindowsNsis(options = {}) {
  const projectDir = options.projectDir ?? process.cwd();
  const workspaceDir = options.workspaceDir ?? join(projectDir, "..");
  const pathExists = options.existsSync ?? existsSync;
  const logger = options.logger ?? console.log;
  const forgeCli = join(projectDir, "node_modules", "@electron-forge", "cli", "dist", "electron-forge.js");
  const builderCli = join(projectDir, "node_modules", "electron-builder", "cli.js");
  const builderConfig = join(projectDir, "electron-builder.json");
  const packagedAppDir = join(workspaceDir, ".desktop-out", "Brain Desktop-win32-x64");

  if (process.platform !== "win32") {
    throw new Error("NSIS exe installer can only be built on Windows.");
  }

  prepareWebpackStart({
    projectDir,
    workspaceDir,
    logger,
  });

  logger("Packaging Windows app with Electron Forge...");
  runNodeScript(forgeCli, ["package", "--platform=win32", "--arch=x64"], {
    projectDir,
    execFileSync: options.execFileSync,
  });

  if (!pathExists(packagedAppDir)) {
    throw new Error(`Packaged app directory not found: ${packagedAppDir}`);
  }

  logger("Making NSIS exe installer with selectable install directory...");
  runNodeScript(
    builderCli,
    ["--win", "nsis", "--x64", "--prepackaged", packagedAppDir, "--config", builderConfig],
    {
      projectDir,
      execFileSync: options.execFileSync,
    }
  );
}

if (require.main === module) {
  makeWindowsNsis();
}

module.exports = {
  makeWindowsNsis,
};
