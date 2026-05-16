const { transformSync } = require('esbuild');

module.exports = {
  process(sourceText, sourcePath) {
    const { code } = transformSync(sourceText, {
      format: 'cjs',
      loader: 'js',
      sourcefile: sourcePath,
    });
    return { code };
  },
};
