/** Small status icons. Status always pairs an icon with words, never colour alone. */
const PATHS = {
  check: 'M3.5 8.5l3 3 6-7',
  alert: 'M8 3v6M8 12.5v.5',
  circle: 'M8 2.5a5.5 5.5 0 1 0 0 11a5.5 5.5 0 1 0 0-11',
  half: 'M8 2.5a5.5 5.5 0 1 0 0 11a5.5 5.5 0 1 0 0-11M8 2.5v11',
};

export type IconName = keyof typeof PATHS;

export function Icon({ name }: { name: IconName }) {
  return (
    <svg className="icon" viewBox="0 0 16 16" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}
