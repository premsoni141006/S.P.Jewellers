import { useEffect, useState, type ReactNode } from 'react';

interface Props {
  label: string;
  value: number;
  onChange: (n: number) => void;
  step?: 'weight' | 'percent' | 'money' | 'int';
  suffix?: string;
  trailing?: ReactNode;
  invalid?: boolean;
  testId?: string;
}

const parse = (s: string): number => {
  const n = parseFloat(s.replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};

/** Number input that keeps what the user is typing ("12." stays "12.") and reports parsed numbers. */
export function NumField({ label, value, onChange, step = 'money', suffix, trailing, invalid, testId }: Props) {
  const [text, setText] = useState(value === 0 ? '' : String(value));
  useEffect(() => {
    if (parse(text) !== value) setText(value === 0 ? '' : String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <label className={`field${invalid ? ' invalid' : ''}`}>
      <span className="field-label">{label}</span>
      <span className="field-box">
        <input
          type="text"
          inputMode={step === 'int' ? 'numeric' : 'decimal'}
          autoComplete="off"
          placeholder="0"
          value={text}
          data-testid={testId}
          onChange={(e) => {
            const v = e.target.value.replace(step === 'int' ? /[^0-9]/g : /[^0-9.]/g, '');
            setText(v);
            onChange(parse(v));
          }}
        />
        {suffix && <span className="field-suffix">{suffix}</span>}
        {trailing}
      </span>
    </label>
  );
}

export function ReadField({ label, value, testId, strong }: { label: string; value: string; testId?: string; strong?: boolean }) {
  return (
    <div className="field readonly">
      <span className="field-label">{label}</span>
      <span className={`field-box${strong ? ' strong' : ''}`} data-testid={testId}>
        {value}
      </span>
    </div>
  );
}
