import { useState } from "react";
import type { FormEvent } from "react";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/LocaleProvider";
import { hasErrors, validateDetails } from "@/lib/bookingValidation";
import type { DetailsErrors, DetailsInput } from "@/lib/bookingValidation";

export function DetailsStep({
  value,
  maxPeople,
  onChange,
  onBack,
  onContinue,
}: {
  value: DetailsInput;
  maxPeople: number;
  onChange: (value: DetailsInput) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const { t } = useI18n();
  const [errors, setErrors] = useState<DetailsErrors>({});

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const nextErrors = validateDetails(value, maxPeople, t);
    setErrors(nextErrors);
    if (!hasErrors(nextErrors)) onContinue();
  }

  return (
    <form className="flex flex-col gap-6" onSubmit={handleSubmit} noValidate>
      <h2 className="text-xl font-semibold text-foreground">{t("booking.details.title")}</h2>

      <Field label={t("booking.details.nameLabel")} required error={errors.name}>
        {(fieldProps) => (
          <Input
            {...fieldProps}
            value={value.name}
            placeholder={t("booking.details.namePlaceholder")}
            autoComplete="name"
            onChange={(e) => onChange({ ...value, name: e.target.value })}
          />
        )}
      </Field>

      <Field label={t("booking.details.phoneLabel")} required error={errors.phone}>
        {(fieldProps) => (
          <Input
            {...fieldProps}
            type="tel"
            value={value.phone}
            placeholder={t("booking.details.phonePlaceholder")}
            autoComplete="tel"
            onChange={(e) => onChange({ ...value, phone: e.target.value })}
          />
        )}
      </Field>

      <Field label={t("booking.details.emailLabel")} required help={t("booking.details.emailHelp")} error={errors.email}>
        {(fieldProps) => (
          <Input
            {...fieldProps}
            type="email"
            value={value.email}
            placeholder={t("booking.details.emailPlaceholder")}
            autoComplete="email"
            onChange={(e) => onChange({ ...value, email: e.target.value })}
          />
        )}
      </Field>

      <Field
        label={t("booking.details.peopleLabel")}
        required
        help={t("booking.details.peopleHelp", { max: maxPeople })}
        error={errors.peopleCount}
      >
        {(fieldProps) => (
          <Input
            {...fieldProps}
            type="number"
            inputMode="numeric"
            min={1}
            max={maxPeople}
            value={value.peopleCount ?? ""}
            onChange={(e) => onChange({ ...value, peopleCount: e.target.value === "" ? null : Number(e.target.value) })}
          />
        )}
      </Field>

      <div className="flex justify-between">
        <Button type="button" variant="ghost" onClick={onBack}>
          {t("common.back")}
        </Button>
        <Button type="submit" size="lg">
          {t("common.continue")}
        </Button>
      </div>
    </form>
  );
}
