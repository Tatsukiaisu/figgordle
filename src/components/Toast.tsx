interface Props {
  message: string | null;
}

export default function Toast({ message }: Props) {
  return (
    <div id="toast" className={message ? "visible" : ""}>
      {message}
    </div>
  );
}
