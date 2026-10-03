import type { SVGProps } from 'react'
import { PATHS, type IconName } from './icon-paths'

export type { IconName }

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name' | 'children'> {
  name: IconName
}

/** Decorative inline SVG (24×24, 1.8 stroke, `currentColor`). Label the control that contains it, not the icon. */
export function Icon({ name, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      width="1.1em"
      height="1.1em"
      {...rest}
    >
      {PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  )
}
