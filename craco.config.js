module.exports = {
  webpack: {
    configure: (webpackConfig) => {
      // Remove source-map-loader for @reown/appkit-ui
      webpackConfig.module.rules = webpackConfig.module.rules.map(rule => {
        if (rule.oneOf) {
          rule.oneOf = rule.oneOf.map(oneOfRule => {
            if (oneOfRule.loader && oneOfRule.loader.includes('source-map-loader')) {
              // Skip source map loading for @reown/appkit-ui
              oneOfRule.exclude = /@reown\/appkit-ui/;
            }
            return oneOfRule;
          });
        }
        return rule;
      });
      return webpackConfig;
    }
  }
}; 