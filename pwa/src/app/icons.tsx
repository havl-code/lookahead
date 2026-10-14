// Small inline icons, so the app needs no icon library. All are decorative: the text beside them
// carries the meaning for screen readers.

import type { ReactNode } from 'react';

interface IconProps {
  readonly className?: string;
}

function Svg({ className = 'size-6', children }: IconProps & { readonly children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {children}
    </svg>
  );
}

export function TimerIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="14" r="7" />
      <path d="M12 14V10.5M10 3h4M18.5 6.5 17 8" />
    </Svg>
  );
}

export function ListIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
    </Svg>
  );
}

export function ChartIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 20V4M4 20h16M8 16l3.5-4.5 3 2.5L19 8" />
    </Svg>
  );
}

export function MoreIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </Svg>
  );
}

export function ShareIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3v12M8 7l4-4 4 4M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7" />
    </Svg>
  );
}
