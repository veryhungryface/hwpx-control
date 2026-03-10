/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/src/**/*.{ts,tsx}', './src/renderer/index.html'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: '#ffffff',
          dark: '#1e1e2e'
        },
        sidebar: {
          DEFAULT: '#f5f5f5',
          dark: '#181825'
        },
        primary: {
          DEFAULT: '#6366f1',
          hover: '#4f46e5'
        }
      }
    }
  },
  plugins: []
}
