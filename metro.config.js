const { getDefaultConfig } = require("expo/metro-config");
const { applySecurityHeaders } = require("./src/lib/securityHeaders.cjs");

const config = getDefaultConfig(__dirname);

config.transformer = {
  ...config.transformer,
  asyncRequireModulePath: require.resolve("./metro-async-require.js"),
};

const prev = config.server && config.server.enhanceMiddleware;

config.server = {
  ...config.server,
  enhanceMiddleware(middleware, server) {
    const inner = prev ? prev(middleware, server) : middleware;
    return (req, res, next) => {
      const url = req.url || "";
      const nativeBundle = /platform=(android|ios)/i.test(url) || /\.bundle\b/i.test(url);
      if (!nativeBundle) applySecurityHeaders(res, { dev: true });
      return inner(req, res, next);
    };
  },
};

module.exports = config;
