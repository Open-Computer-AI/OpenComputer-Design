import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { ToolPackConfig } from "@/config/index.js";
import { resolveMacInstallIdentity } from "@/mac/identity.js";
import { resolveMacPaths } from "@/mac/paths.js";

function makeConfig(root: string, namespace: string): ToolPackConfig {
  return {
    containerized: false,
    electronBuilderCliPath: "/x/electron-builder/cli.js",
    electronDistPath: "/x/electron/dist",
    electronVersion: "41.3.0",
    macCompression: "normal",
    namespace,
    platform: "mac",
    portable: true,
    removeData: false,
    removeLogs: false,
    removeProductUserData: false,
    removeSidecars: false,
    requireVelaCli: false,
    roots: {
      output: {
        appBuilderRoot: join(root, ".tmp", "tools-pack", "out", "mac", "namespaces", namespace, "builder"),
        namespaceRoot: join(root, ".tmp", "tools-pack", "out", "mac", "namespaces", namespace),
        platformRoot: join(root, ".tmp", "tools-pack", "out", "mac"),
        root: join(root, ".tmp", "tools-pack", "out"),
      },
      runtime: {
        namespaceBaseRoot: join(root, ".tmp", "tools-pack", "runtime", "mac", "namespaces"),
        namespaceRoot: join(root, ".tmp", "tools-pack", "runtime", "mac", "namespaces", namespace),
      },
      cacheRoot: join(root, ".tmp", "tools-pack", "cache"),
      toolPackRoot: join(root, ".tmp", "tools-pack"),
    },
    signed: false,
    silent: true,
    to: "dmg",
    webOutputMode: "standalone",
    workspaceRoot: root,
  };
}

describe("resolveMacInstallIdentity", () => {
  it("keeps stable builds on the canonical mac identity", () => {
    expect(resolveMacInstallIdentity(makeConfig("/work", "release-stable"))).toMatchObject({
      appId: "io.open-design.desktop",
      installerTitle: "OpenComputer Design",
      productName: "OpenComputer Design",
      publicAppBundleName: "OpenComputer Design.app",
      systemAppBundleName: "OpenComputer Design.app",
    });
  });

  it("uses first-class beta app identity for beta release namespaces", () => {
    const config = makeConfig("/work", "release-beta");

    expect(resolveMacInstallIdentity(config)).toEqual({
      appId: "io.open-design.desktop.beta",
      executableName: "OpenComputer Design Beta",
      installerTitle: "OpenComputer Design Beta",
      productName: "OpenComputer Design Beta",
      publicAppBundleName: "OpenComputer Design Beta.app",
      systemAppBundleName: "OpenComputer Design Beta.app",
    });
    expect(resolveMacPaths(config).appPath).toMatch(/OpenComputer Design Beta\.app$/);
  });

  it("uses first-class preview app identity for preview release namespaces", () => {
    const config = makeConfig("/work", "release-preview");

    expect(resolveMacInstallIdentity(config)).toEqual({
      appId: "io.open-design.desktop.preview",
      executableName: "OpenComputer Design Preview",
      installerTitle: "OpenComputer Design Preview",
      productName: "OpenComputer Design Preview",
      publicAppBundleName: "OpenComputer Design Preview.app",
      systemAppBundleName: "OpenComputer Design Preview.app",
    });
    expect(resolveMacPaths(config).appPath).toMatch(/OpenComputer Design Preview\.app$/);
  });

  it("uses first-class prerelease app identity for prerelease release versions and namespaces", () => {
    const prereleaseVersionConfig = {
      ...makeConfig("/work", "release-stable"),
      appVersion: "0.8.0-prerelease.2",
    };
    const prereleaseNamespaceConfig = makeConfig("/work", "release-prerelease");

    expect(resolveMacInstallIdentity(prereleaseVersionConfig)).toEqual({
      appId: "io.open-design.desktop.prerelease",
      executableName: "OpenComputer Design Prerelease",
      installerTitle: "OpenComputer Design Prerelease",
      productName: "OpenComputer Design Prerelease",
      publicAppBundleName: "OpenComputer Design Prerelease.app",
      systemAppBundleName: "OpenComputer Design Prerelease.app",
    });
    expect(resolveMacPaths(prereleaseVersionConfig).appPath).toMatch(/OpenComputer Design Prerelease\.app$/);
    expect(resolveMacInstallIdentity(prereleaseNamespaceConfig)).toMatchObject({
      productName: "OpenComputer Design Prerelease",
      publicAppBundleName: "OpenComputer Design Prerelease.app",
    });
  });
});
