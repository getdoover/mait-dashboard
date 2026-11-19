import {
  createModuleFederationConfig,
  pluginModuleFederation,
} from "@module-federation/rsbuild-plugin";
import { defineConfig } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";

import ConcatenatePlugin from "./ConcatenatePlugin";

const mfConfig = createModuleFederationConfig({
  name: "MaitDashboardWidget",
  remotes: {
    doover_admin: "doover_admin@[window.dooverAdminSite_remoteUrl]",
    customer_site: "customer_site@[window.dooverCustomerSite_remoteUrl]",
  },
  exposes: {
    "./MaitDashboardWidget": "./src/MaitDashboardWidget",
  },
  shared: {
    react: { singleton: true, requiredVersion: "^18.3.1", eager: true },
    // The Doover site always provides these two; using its copies keeps ~335 kB
    // of fallback (portal for the run-time popup, links to device pages) out of the bundle.
    "react-dom": { singleton: true, requiredVersion: "^18.3.1", import: false },
    "react-router": { singleton: true, requiredVersion: false, import: false },
    "doover-js": { singleton: true, requiredVersion: false, eager: true },
    "doover-js/react": {
      singleton: true,
      requiredVersion: false,
      eager: true,
    },
    "@tanstack/react-query": {
      singleton: true,
      requiredVersion: false,
      eager: true,
    },
  },
});

export default defineConfig({
  tools: {
    rspack: {
      plugins: [
        new ConcatenatePlugin({
          source: "./dist",
          destination: "./assets",
          name: "MaitDashboardWidget.js",
          ignore: ["main.js"],
        }),
      ],
    },
  },
  output: {
    injectStyles: true,
  },
  performance: {
    chunkSplit: {
      strategy: "all-in-one",
    },
  },
  plugins: [pluginReact(), pluginModuleFederation(mfConfig)],
});
