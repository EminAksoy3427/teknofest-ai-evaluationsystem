import { useId, useState } from "react";

export function PasswordField({
  autoComplete,
  describedBy,
  id,
  invalid,
  label,
  name,
  onChange,
  value,
}: {
  autoComplete: string;
  describedBy?: string | undefined;
  id?: string | undefined;
  invalid?: boolean | undefined;
  label: string;
  name: string;
  onChange: (value: string) => void;
  value: string;
}) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const [visible, setVisible] = useState(false);

  return (
    <div>
      <label className="field-label" htmlFor={fieldId}>
        {label}
      </label>
      <div className="password-field">
        <input
          aria-describedby={describedBy}
          aria-invalid={invalid ? true : undefined}
          autoComplete={autoComplete}
          className="field-input pr-12"
          id={fieldId}
          name={name}
          onChange={(event) => onChange(event.target.value)}
          required
          type={visible ? "text" : "password"}
          value={value}
        />
        <button
          aria-label={visible ? "Şifreyi gizle" : "Şifreyi göster"}
          aria-pressed={visible}
          className="password-field-toggle"
          onClick={() => setVisible((open) => !open)}
          type="button"
        >
          {visible ? "Gizle" : "Göster"}
        </button>
      </div>
    </div>
  );
}
