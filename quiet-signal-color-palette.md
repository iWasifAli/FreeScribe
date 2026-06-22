# Quiet Signal Color Palette

A calm, local-first color system for the **Local Caption Logger** Chrome extension.

This palette is designed for a product that should feel:

- private
- trustworthy
- lightweight
- readable during meetings
- utility-first rather than noisy or flashy

The visual direction is:

```txt
Slate neutrals + clear blue actions + cyan caption accent + soft recording states
```

---

## 1. Brand Colors

| Role | Name | Light | Dark | Usage |
|---|---|---:|---:|---|
| Primary | Signal Blue | `#2563EB` | `#60A5FA` | Main action, links, active states |
| Accent | Caption Cyan | `#0891B2` | `#22D3EE` | Live caption indicator, highlights |
| Neutral | Slate | `#0F172A` | `#F8FAFC` | Main text |
| Success | Save Green | `#15803D` | `#86EFAC` | Saved/exported state |
| Warning | Pause Amber | `#B45309` | `#FCD34D` | Paused state |
| Danger | Record Red | `#DC2626` | `#FCA5A5` | Recording indicator, destructive actions |

---

## 2. Light Mode Palette

| Token | Hex | Usage |
|---|---:|---|
| Background | `#F8FAFC` | App/side panel background |
| Surface | `#FFFFFF` | Cards, transcript container |
| Surface Raised | `#F1F5F9` | Header, control blocks |
| Surface Hover | `#F8FAFC` | Transcript row hover |
| Border Soft | `#E2E8F0` | Light dividers |
| Border Strong | `#CBD5E1` | Inputs, panels, buttons |
| Text Primary | `#0F172A` | Main text |
| Text Secondary | `#475569` | Metadata, speaker labels |
| Text Muted | `#64748B` | Empty states, helper text |
| Primary | `#2563EB` | Start button, links |
| Primary Hover | `#1D4ED8` | Primary button hover |
| Primary Soft | `#DBEAFE` | Selected states, subtle highlight |
| Accent | `#0891B2` | Live caption indicator |
| Accent Soft | `#CFFAFE` | Caption highlight background |
| Recording | `#DC2626` | Recording dot/button |
| Recording Soft | `#FEE2E2` | Recording status pill background |
| Paused | `#B45309` | Pause state |
| Paused Soft | `#FEF3C7` | Paused status pill background |
| Saved | `#15803D` | Save/export state |
| Saved Soft | `#DCFCE7` | Success status pill background |
| Danger | `#B91C1C` | Clear/delete button |
| Focus Ring | `#38BDF8` | Keyboard focus outline |

---

## 3. Dark Mode Palette

| Token | Hex | Usage |
|---|---:|---|
| Background | `#0B1120` | App/side panel background |
| Surface | `#0F172A` | Main panel/card |
| Surface Raised | `#1E293B` | Header, control blocks |
| Surface Hover | `#172033` | Transcript row hover |
| Border Soft | `#1E293B` | Light dividers |
| Border Strong | `#334155` | Inputs, panels, buttons |
| Text Primary | `#F8FAFC` | Main text |
| Text Secondary | `#CBD5E1` | Metadata, speaker labels |
| Text Muted | `#94A3B8` | Empty states, helper text |
| Primary | `#60A5FA` | Start button, links |
| Primary Hover | `#93C5FD` | Primary button hover |
| Primary Soft | `#1E3A8A` | Selected states, subtle highlight |
| Accent | `#22D3EE` | Live caption indicator |
| Accent Soft | `#164E63` | Caption highlight background |
| Recording | `#FCA5A5` | Recording dot/text |
| Recording Soft | `#450A0A` | Recording status pill background |
| Paused | `#FCD34D` | Pause state |
| Paused Soft | `#451A03` | Paused status pill background |
| Saved | `#86EFAC` | Save/export state |
| Saved Soft | `#052E16` | Success status pill background |
| Danger | `#F87171` | Clear/delete button |
| Focus Ring | `#38BDF8` | Keyboard focus outline |

---

## 4. Recommended UI Mapping

### Primary Actions

| Element | Light | Dark |
|---|---|---|
| Start Recording button | bg `#2563EB`, text `#FFFFFF` | bg `#60A5FA`, text `#0B1120` |
| Save TXT button | bg `#15803D`, text `#FFFFFF` | bg `#86EFAC`, text `#0B1120` |
| Pause button | bg `#B45309`, text `#FFFFFF` | bg `#FCD34D`, text `#0B1120` |
| Clear button | bg `transparent`, text `#B91C1C` | bg `transparent`, text `#F87171` |

### Status Pills

#### Recording

```txt
Light: bg #FEE2E2, text #991B1B, dot #DC2626
Dark:  bg #450A0A, text #FCA5A5, dot #EF4444
```

#### Paused

```txt
Light: bg #FEF3C7, text #92400E, dot #D97706
Dark:  bg #451A03, text #FCD34D, dot #F59E0B
```

#### Saved

```txt
Light: bg #DCFCE7, text #166534, dot #15803D
Dark:  bg #052E16, text #86EFAC, dot #22C55E
```

---

## 5. Speaker Chip Colors

Use subtle colors so transcript text stays dominant.

| Speaker Chip | Light Mode | Dark Mode |
|---|---|---|
| Speaker background | `#E0F2FE` | `#0C4A6E` |
| Speaker text | `#075985` | `#BAE6FD` |
| Timestamp text | `#64748B` | `#94A3B8` |
| Caption text | `#0F172A` | `#F8FAFC` |

Example transcript row:

```txt
[10:31:04] Wasif: I pushed the backend changes.
```

Suggested styling:

```txt
Timestamp → muted
Speaker name → blue/cyan chip
Caption text → primary text
```

---

## 6. CSS Variables

### Light Mode

```css
:root {
  color-scheme: light;

  --color-bg: #F8FAFC;
  --color-surface: #FFFFFF;
  --color-surface-raised: #F1F5F9;
  --color-surface-hover: #F8FAFC;

  --color-border-soft: #E2E8F0;
  --color-border-strong: #CBD5E1;

  --color-text-primary: #0F172A;
  --color-text-secondary: #475569;
  --color-text-muted: #64748B;

  --color-primary: #2563EB;
  --color-primary-hover: #1D4ED8;
  --color-primary-soft: #DBEAFE;
  --color-primary-text: #FFFFFF;

  --color-accent: #0891B2;
  --color-accent-soft: #CFFAFE;

  --color-recording: #DC2626;
  --color-recording-soft: #FEE2E2;
  --color-recording-text: #991B1B;

  --color-paused: #B45309;
  --color-paused-soft: #FEF3C7;
  --color-paused-text: #92400E;

  --color-saved: #15803D;
  --color-saved-soft: #DCFCE7;
  --color-saved-text: #166534;

  --color-danger: #B91C1C;
  --color-focus-ring: #38BDF8;

  --color-speaker-bg: #E0F2FE;
  --color-speaker-text: #075985;
}
```

### Dark Mode

```css
[data-theme="dark"] {
  color-scheme: dark;

  --color-bg: #0B1120;
  --color-surface: #0F172A;
  --color-surface-raised: #1E293B;
  --color-surface-hover: #172033;

  --color-border-soft: #1E293B;
  --color-border-strong: #334155;

  --color-text-primary: #F8FAFC;
  --color-text-secondary: #CBD5E1;
  --color-text-muted: #94A3B8;

  --color-primary: #60A5FA;
  --color-primary-hover: #93C5FD;
  --color-primary-soft: #1E3A8A;
  --color-primary-text: #0B1120;

  --color-accent: #22D3EE;
  --color-accent-soft: #164E63;

  --color-recording: #FCA5A5;
  --color-recording-soft: #450A0A;
  --color-recording-text: #FCA5A5;

  --color-paused: #FCD34D;
  --color-paused-soft: #451A03;
  --color-paused-text: #FCD34D;

  --color-saved: #86EFAC;
  --color-saved-soft: #052E16;
  --color-saved-text: #86EFAC;

  --color-danger: #F87171;
  --color-focus-ring: #38BDF8;

  --color-speaker-bg: #0C4A6E;
  --color-speaker-text: #BAE6FD;
}
```

---

## 7. Component Styling Example

```css
body {
  background: var(--color-bg);
  color: var(--color-text-primary);
}

.panel {
  background: var(--color-surface);
  border: 1px solid var(--color-border-soft);
}

.transcript-row {
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border-soft);
}

.transcript-row:hover {
  background: var(--color-surface-hover);
}

.timestamp {
  color: var(--color-text-muted);
}

.speaker-chip {
  background: var(--color-speaker-bg);
  color: var(--color-speaker-text);
}

.primary-button {
  background: var(--color-primary);
  color: var(--color-primary-text);
}

.primary-button:hover {
  background: var(--color-primary-hover);
}

.status-recording {
  background: var(--color-recording-soft);
  color: var(--color-recording-text);
}

.status-paused {
  background: var(--color-paused-soft);
  color: var(--color-paused-text);
}

.status-saved {
  background: var(--color-saved-soft);
  color: var(--color-saved-text);
}
```

---

## 8. Design Principle

The transcript is the hero.

The interface should feel like a quiet instrument, not a noisy dashboard.

Use blue for trustworthy utility actions, cyan for live-caption energy, red/amber/green only for clear recording states, and restrained slate neutrals everywhere else.
