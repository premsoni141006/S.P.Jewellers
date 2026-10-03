import { Icon } from './Icon';

/** The search box used across the app: magnifier, text, and a clear button once something is typed. */
export function SearchBar({ value, onChange, placeholder, label, testId }: { value: string; onChange: (v: string) => void; placeholder: string; label: string; testId: string }) {
  return (
    <div className="searchbar" role="search">
      <Icon name="search" size={20} />
      <input
        type="search"
        inputMode="search"
        enterKeyHint="search"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        data-testid={testId}
      />
      {value && <button className="search-clear" onClick={() => onChange('')} aria-label="Clear search" data-testid={`${testId}-clear`}>✕</button>}
    </div>
  );
}
