module.exports = {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "var(--color-border)",
        input: "var(--color-input)",
        ring: "var(--color-ring)",
        background: "var(--color-background)",
        foreground: "var(--color-foreground)",
        primary: {
          DEFAULT: "var(--color-primary)",
          foreground: "var(--color-primary-foreground)"
        },
        secondary: {
          DEFAULT: "var(--color-secondary)",
          foreground: "var(--color-secondary-foreground)"
        },
        accent: {
          DEFAULT: "var(--color-accent)",
          foreground: "var(--color-accent-foreground)"
        },
        muted: {
          DEFAULT: "var(--color-muted)",
          foreground: "var(--color-muted-foreground)"
        },
        card: {
          DEFAULT: "var(--color-card)",
          foreground: "var(--color-card-foreground)"
        },
        popover: {
          DEFAULT: "var(--color-popover)",
          foreground: "var(--color-popover-foreground)"
        },
        success: {
          DEFAULT: "var(--color-success)",
          foreground: "var(--color-success-foreground)"
        },
        warning: {
          DEFAULT: "var(--color-warning)",
          foreground: "var(--color-warning-foreground)"
        },
        error: {
          DEFAULT: "var(--color-error)",
          foreground: "var(--color-error-foreground)"
        },
        destructive: {
          DEFAULT: "var(--color-destructive)",
          foreground: "var(--color-destructive-foreground)"
        }
      }
    }
  },
  plugins: []
};
