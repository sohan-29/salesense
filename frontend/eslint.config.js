import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // Mount-time data fetching (fetch in useEffect, setState in async
      // callback) is the established pattern across this app's pages. The
      // rule flags it as cascading renders, but the state setters here run
      // only after the async resolves — not synchronously in the effect body.
      'react-hooks/set-state-in-effect': 'off',
      // AuthContext exports the useAuth hook alongside the AuthProvider
      // component — the standard React context pattern, not a fast-refresh
      // boundary violation worth a separate file for.
      'react-refresh/only-export-components': 'off',
    },
  },
])
