import type { AxiosError } from "axios";

const GENERIC_ERROR_MESSAGE = "Something went wrong. Please check your input and try again.";

/** Reads the {success, code, error, fields} shape the backend's global
 * validation handler and most hand-rolled HTTPException(detail=...) checks use.
 * A few endpoints still raise HTTPException(detail="plain string") — treat that
 * string as the error message directly rather than falling back to a generic one. */
function detail(error: unknown): { error?: string; fields?: { field: string; message: string }[] } {
  const data = (error as AxiosError | undefined)?.response?.data as
    | { detail?: string | { error?: string; fields?: { field: string; message: string }[] } }
    | undefined;
  const d = data?.detail;
  if (typeof d === "string") return { error: d };
  return d ?? {};
}

export function getErrorMessage(error: unknown): string {
  return detail(error).error ?? GENERIC_ERROR_MESSAGE;
}

/** Maps the backend's field-level validation errors onto a {field: message}
 * record, for react-hook-form's form.setError(field, {message}). */
export function getFieldErrors(error: unknown): Record<string, string> {
  const fields = detail(error).fields ?? [];
  return fields.reduce<Record<string, string>>((acc, f) => {
    acc[f.field] = f.message;
    return acc;
  }, {});
}
