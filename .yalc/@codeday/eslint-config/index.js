/*
 * @rushstack/eslint-patch is used to include plugins as dev
 * dependencies instead of imposing them as peer dependencies
 *
 * https://www.npmjs.com/package/@rushstack/eslint-patch
 */
require('@rushstack/eslint-patch/modern-module-resolution');

// we use nextjs a lot so why not automatically load next configs when possible
let nextJs = false,
  typescript = false;
try {
  require.resolve('next/babel');
  require.resolve('@next/eslint-plugin-next');
  nextJs = true;
} catch (e) {}

try {
  require.resolve('typescript');
  typescript = true;
} catch (e) {}

module.exports = {
  plugins: ['sonarjs', 'no-secrets', 'node', 'prettier', 'react-hooks'],
  extends: [
    'airbnb',
    'plugin:sonarjs/recommended',
    'plugin:prettier/recommended',
    nextJs && 'plugin:@next/next/recommended',
  ].filter(Boolean),

  parser: '@babel/eslint-parser',
  parserOptions: {
    requireConfigFile: false,
    sourceType: 'module',
    allowImportExportEverywhere: true,
    babelOptions: {
      presets: nextJs ? ['next/babel'] : ['@babel/preset-env', '@babel/preset-react'],
      caller: {
        // Eslint supports top level await when a parser for it is included. We enable the parser by default for Babel.
        supportsTopLevelAwait: true,
      },
    },
  },

  overrides: [
    {
      files: ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts'],
      parser: require.resolve('@typescript-eslint/parser'),
      parserOptions: {
        sourceType: 'module',
        project: ['tsconfig.json'],
        ecmaFeatures: {
          jsx: true,
        },
        warnOnUnsupportedTypeScriptVersion: true,
      },
      plugins: ['@typescript-eslint'],
      extends: typescript ? ['plugin:@next/next/recommended'] : [],
      rules: {
        '@typescript-eslint/no-explicit-any': 'warn',
        '@typescript-eslint/no-empty-function': 'warn',
        'import/no-cycle': ['warn', { maxDepth: 2 }],
      },
    },
  ],

  settings: {
    tagNamePreference: {
      augments: 'extends',
    },
    'import/parsers': {
      [require.resolve('@typescript-eslint/parser')]: ['.ts', '.mts', '.cts', '.tsx', '.d.ts'],
    },
    'import/resolver': {
      [require.resolve('eslint-import-resolver-node')]: {
        extensions: ['.js', '.mjs', '.cjs', '.jsx', '.ts', '.mts', '.cts', '.tsx'],
      },
      [require.resolve('eslint-import-resolver-typescript')]: {
        alwaysTryTypes: true,
      },
    },
  },

  env: {
    browser: true,
    node: true,
  },

  rules: {
    'no-nested-ternary': ['off'],
    radix: ['off'],
    'prettier/prettier': [
      'warn',
      {
        trailingComma: 'all',
        printWidth: 120,
        tabWidth: 2,
        semi: true,
        singleQuote: true,
        bracketSpacing: true,
        arrowParens: 'always',
        endOfLine: 'lf',
      },
    ],
    curly: ['error', 'multi-line'],
    'sonarjs/no-duplicate-string': ['warn'],
    'sonarjs/cognitive-complexity': ['warn'],
    'sonarjs/no-nested-template-literals': ['warn'],
    'no-unused-vars': ['warn', { varsIgnorePattern: '^_+$', argsIgnorePattern: '^_+$' }],
    'no-empty': ['warn', { allowEmptyCatch: true }],
    'no-secrets/no-secrets': ['error', { ignoreContent: ['^https://', '^http://'] }],
    quotes: ['error', 'single', { avoidEscape: true, allowTemplateLiterals: true }],
    'max-len': ['warn', 180],
    'jsx-a11y/anchor-is-valid': ['warn'],
    'react/static-property-placement': ['error', 'static public field'],
    'react/jsx-filename-extension': ['error', { extensions: ['.js', '.jsx', '.ts', '.tsx'] }],
    'react/forbid-prop-types': ['off'],
    'react/prefer-stateless-function': ['off'],
    'react/jsx-props-no-spreading': ['off'],
    'react/jsx-one-expression-per-line': ['off'],
    'react/state-in-constructor': ['off'],
    'react/prop-types': ['off'],
    'react/react-in-jsx-scope': ['off'],
    'react/function-component-definition': ['off'],
    'react/jsx-no-useless-fragment': ['off'],
    'react/require-default-props': ['warn'],
    'react-hooks/rules-of-hooks': ['error'],
    'consistent-return': ['off'],
    'class-methods-use-this': ['off'],
    'comma-dangle': [
      'error',
      {
        arrays: 'always-multiline',
        objects: 'always-multiline',
        imports: 'always-multiline',
        exports: 'always-multiline',
        functions: 'always-multiline',
      },
    ],
    'no-restricted-syntax': ['error', 'LabeledStatement', 'WithStatement'],
    'node/no-deprecated-api': ['error'],
    'node/no-extraneous-import': ['error'],
    'node/no-extraneous-require': ['error'],
    'node/no-exports-assign': ['error'],
    'node/no-unpublished-bin': ['error'],
    'node/no-unpublished-import': ['error'],
    'node/no-unpublished-require': ['error'],
    'node/process-exit-as-throw': ['error'],
    'node/shebang': ['error'],
    'node/prefer-promises/fs': ['error'],
    'node/prefer-promises/dns': ['error'],
    'node/no-process-env': ['off'],
    'node/exports-style': ['error', 'module.exports'],
    'import/prefer-default-export': ['off'],
    'import/no-extraneous-dependencies': [
      'error',
      { devDependencies: true, optionalDependencies: false, peerDependencies: false },
    ],
    'import/extensions': [
      'error',
      'ignorePackages',
      {
        js: 'never',
        mjs: 'never',
        jsx: 'never',
        ts: 'never',
        tsx: 'never',
      },
    ],
  },
};
