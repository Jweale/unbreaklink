import type { Config } from 'tailwindcss';
import daisyui from 'daisyui';

const config: Config = {
  content: ['options.html', './src/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        surface: '#ECDFF2',
        charcoal: '#1F261C',
        mist: '#D0D9C7',
        moss: '#6D7356',
        sage: '#D4D9B0'
      }
    }
  },
  plugins: [daisyui],
  daisyui: {
    themes: [
      {
        noise: {
          primary: '#6D7356',
          'primary-content': '#ECDFF2',
          secondary: '#D4D9B0',
          'secondary-content': '#1F261C',
          accent: '#D0D9C7',
          'accent-content': '#1F261C',
          neutral: '#1F261C',
          'neutral-content': '#ECDFF2',
          'base-100': '#ECDFF2',
          'base-200': '#D0D9C7',
          'base-300': '#D4D9B0',
          'base-content': '#1F261C'
        }
      }
    ]
  }
};

export default config;
