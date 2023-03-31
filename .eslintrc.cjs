module.exports = {
  root: true,
  env: {
    node: true,
  },
  extends: ['@codeday', 'plugin:require-extensions/recommended'],
  plugins: ['require-extensions'],
  rules: {
    'react-hooks/rules-of-hooks': 'off',
  },
};
