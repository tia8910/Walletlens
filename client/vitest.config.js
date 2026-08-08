import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'happy-dom',
    globals: true,
    include: ['src/**/*.test.{js,jsx}'],
  },
  // The app builds through @vitejs/plugin-react, which uses the automatic JSX
  // runtime, but this config did not — so any .jsx transformed here fell back
  // to classic React.createElement and threw "React is not defined". That made
  // components effectively untestable, which is part of why the crashes in
  // this area were only ever caught in a browser. Matching production here
  // costs nothing and opens the door to rendering tests.
  esbuild: {
    jsx: 'automatic',
  },
})
