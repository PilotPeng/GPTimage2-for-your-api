type ErrorMessageProps = Readonly<{
  message?: string;
}>;

export function ErrorMessage({ message }: ErrorMessageProps) {
  if (!message) {
    return null;
  }

  return <div className="error-message" role="alert">{message}</div>;
}
