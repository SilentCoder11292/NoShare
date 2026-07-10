# Design Specification - NoShare

## Theme & Palette

We support Light, Dark, and System mode. We use a high-contrast neutral-tinted palette using CSS variables.

### Color Tokens

```css
:root {
  /* Light Mode Variables */
  --bg-primary: hsl(210, 20%, 98%);
  --bg-secondary: hsl(210, 16%, 93%);
  --bg-card: hsl(0, 0%, 100%);
  --border-color: hsl(210, 14%, 88%);
  
  --color-primary: hsl(215, 90%, 55%);     /* Sleek Royal Blue */
  --color-secondary: hsl(255, 65%, 60%);   /* Soft Purple */
  --color-accent: hsl(190, 85%, 45%);      /* Tech Cyan */
  --color-success: hsl(150, 80%, 38%);     /* Deep Emerald */
  --color-warning: hsl(35, 90%, 50%);      /* Warm Amber */
  --color-error: hsl(0, 85%, 55%);         /* Vivid Red */
  
  --text-primary: hsl(210, 24%, 12%);      /* Dark Slate */
  --text-secondary: hsl(210, 12%, 40%);    /* Medium Grey */
  --text-muted: hsl(210, 8%, 60%);         /* Muted Grey */

  --shadow-premium: 0 10px 30px rgba(0, 0, 0, 0.04), 0 1px 3px rgba(0, 0, 0, 0.02);
}

@media (prefers-color-scheme: dark) {
  :root:not(.light) {
    /* Default Dark Mode */
    --bg-primary: hsl(220, 24%, 7%);
    --bg-secondary: hsl(220, 20%, 11%);
    --bg-card: hsl(220, 20%, 13%);
    --border-color: hsl(220, 15%, 18%);
    
    --color-primary: hsl(210, 95%, 62%);
    --color-secondary: hsl(250, 80%, 72%);
    --color-accent: hsl(185, 90%, 50%);
    --color-success: hsl(155, 75%, 45%);
    --color-warning: hsl(38, 95%, 55%);
    --color-error: hsl(0, 90%, 60%);
    
    --text-primary: hsl(210, 17%, 95%);
    --text-secondary: hsl(210, 10%, 70%);
    --text-muted: hsl(210, 8%, 45%);

    --shadow-premium: 0 20px 40px rgba(0, 0, 0, 0.3);
  }
}

html.dark {
  /* Forced Dark Mode */
  --bg-primary: hsl(220, 24%, 7%);
  --bg-secondary: hsl(220, 20%, 11%);
  --bg-card: hsl(220, 20%, 13%);
  --border-color: hsl(220, 15%, 18%);
  
  --color-primary: hsl(210, 95%, 62%);
  --color-secondary: hsl(250, 80%, 72%);
  --color-accent: hsl(185, 90%, 50%);
  --color-success: hsl(155, 75%, 45%);
  --color-warning: hsl(38, 95%, 55%);
  --color-error: hsl(0, 90%, 60%);
  
  --text-primary: hsl(210, 17%, 95%);
  --text-secondary: hsl(210, 10%, 70%);
  --text-muted: hsl(210, 8%, 45%);

  --shadow-premium: 0 20px 40px rgba(0, 0, 0, 0.3);
}

html.light {
  /* Forced Light Mode */
  --bg-primary: hsl(210, 20%, 98%);
  --bg-secondary: hsl(210, 16%, 93%);
  --bg-card: hsl(0, 0%, 100%);
  --border-color: hsl(210, 14%, 88%);
  
  --color-primary: hsl(215, 90%, 55%);
  --color-secondary: hsl(255, 65%, 60%);
  --color-accent: hsl(190, 85%, 45%);
  --color-success: hsl(150, 80%, 38%);
  --color-warning: hsl(35, 90%, 50%);
  --color-error: hsl(0, 85%, 55%);
  
  --text-primary: hsl(210, 24%, 12%);
  --text-secondary: hsl(210, 12%, 40%);
  --text-muted: hsl(210, 8%, 60%);

  --shadow-premium: 0 10px 30px rgba(0, 0, 0, 0.04), 0 1px 3px rgba(0, 0, 0, 0.02);
}
```

## Typography

- **Headings**: 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif
- **Code & Console**: 'JetBrains Mono', 'Courier New', Courier, monospace
- Heading text balance: `text-wrap: balance` for h1, h2, h3.
- Long text wrapping: `text-wrap: pretty`.

## Components

1. **ThemeToggle**: Pill-shaped background container housing Sun, Moon, and Monitor options, with a sliding rounded active bubble indicator.
2. **ConnectionCard**: Glassmorphic layout card with clean borders, zero AI layout templates.
