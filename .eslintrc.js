module.exports = {
  extends: '@codeday',
  parserOptions:
  {
    ecmaVersion: 2020,
  },
  rules: {
    'import/no-missing-require': ['off'],
    'import/no-unresolved': ['off'],
    'require-jsdoc': ['off'],
    'import/prefer-default-export': ['off'],
  },
};
