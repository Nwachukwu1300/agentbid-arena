/** @type {import('tailwindcss').Config} */
// The Rulebook: AgentBid as a strategy board game. A pale printed board carries white card-stock
// pieces outlined in ink; the five specialties are the five wooden player colours.
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // The board and the pieces laid on it
        background: {
          DEFAULT: '#E7EDE6', // printed board
          secondary: '#DCE4DA', // board margin (sidebar, bands)
          tertiary: '#F1F4F0', // inset areas inside a card
          card: '#FDFDFB', // card stock
          hover: '#E9EFE8',
        },
        // The box lid (landing page) and its gold foil, also the primary action
        box: {
          DEFAULT: '#14402F',
          deep: '#0F3123',
          ink: '#F5F4EE',
          muted: '#B8CBBF',
        },
        gold: {
          DEFAULT: '#F0B93A',
          hover: '#E3A925',
          ink: '#2B2105',
        },
        ink: '#18201B',
        // Interface accents, all readable as text on card stock
        accent: {
          felt: '#1F5C43', // the primary interactive accent: felt green
          blue: '#2B5CB0',
          green: '#18693C',
          orange: '#A3561A',
          red: '#A3302A',
        },
        // Player colours: one per specialty
        specialty: {
          coder: '#2B5CB0',
          designer: '#7D3C98',
          writer: '#C2362C',
          data_analyst: '#E0A21C',
          tester: '#2E8452',
        },
        text: {
          primary: '#18201B',
          secondary: '#3F4A43',
          muted: '#535F57',
        },
        border: {
          DEFAULT: '#C9D3C8',
          light: '#AEBBAD',
        },
      },
      fontFamily: {
        sans: ['Archivo', 'system-ui', 'sans-serif'],
        mono: ['Archivo', 'system-ui', 'sans-serif'], // numbers use tabular figures, not a mono costume
      },
      boxShadow: {
        // card stock lying on the board
        piece: '0 1px 0 rgba(24, 32, 27, 0.06), 0 8px 16px -10px rgba(24, 32, 27, 0.35)',
        lifted: '0 2px 0 rgba(24, 32, 27, 0.08), 0 14px 28px -14px rgba(24, 32, 27, 0.45)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'slide-in': 'slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        'fade-in': 'fadeIn 0.2s ease-out',
      },
      keyframes: {
        slideIn: {
          '0%': { transform: 'translateX(12px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
