/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        green: { dark: '#1b4332', mid: '#2d6a4f', light: '#b7e4c7' },
        cream: { DEFAULT: '#fffbeb', 2: '#fef3c7' },
        ink: { DEFAULT: '#1a1a1a', 2: '#57534e' },
        danger: '#dc2626',
      },
      fontFamily: {
        sans: ['Rubik', 'Assistant', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
